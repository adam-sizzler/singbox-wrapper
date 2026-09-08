//go:build windows

package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"singbox-gui-client/internal/app/db"
)

func Run(args []string) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("[%s] panic: %v\n\n%s", time.Now().Format("2006-01-02 15:04:05"), r, debug.Stack())
			fallbackPath := filepath.Join(os.TempDir(), "singbox-wrapper-fatal.log")
			_ = os.WriteFile(fallbackPath, []byte(msg), 0600)
			showError("Fatal panic", msg)
		}
	}()

	hideConsoleWindow()

	workDir, err := executableDir()
	if err != nil {
		showError("Startup error", "Не удалось определить рабочую директорию:\n"+err.Error())
		return
	}

	app := newApp(workDir)

	// Initialize SQLite Database
	dbPath := filepath.Join(workDir, "singbox-wrapper.db")
	store, err := db.InitDB(dbPath)
	if err != nil {
		showError("Database error", "Не удалось инициализировать базу данных SQLite:\n"+err.Error())
		return
	}
	defer store.Close()
	_ = store.EnsureInitialData()
	app.store = store

	startupImport := findImportURIArg(args)
	app.startupImport = startupImport

	if notifyRunningInstance(startupImport) {
		return
	}

	if !isRunningAsAdmin() {
		if err := restartAsAdmin(); err == nil {
			// Elevated process successfully requested/spawned, terminate non-elevated instance
			return
		}
		showError("Admin rights required", "Приложение должно быть запущено с правами администратора для работы сетевого стека и TUN интерфейса.")
		return
	}

	if err := ensureSingBoxProtocolRegistration(); err != nil {
		app.protoRegWarn = err.Error()
	}

	var cfg AppConfig
	if storeCfg, ok := app.loadConfigFromStore(); ok {
		cfg = storeCfg
	} else {
		loadedCfg, err := loadOrCreateConfig(app.configPath)
		if err != nil {
			showError("Config error", "Не удалось прочитать конфигурацию:\n"+err.Error())
			return
		}
		cfg = loadedCfg
		normalizeConfigProfiles(&cfg)
	}
	applyImportURIToConfig(&cfg, app.startupImport)

	_ = saveConfig(app.configPath, cfg)
	app.setConfig(cfg)
	app.syncConfigToStore(cfg)

	if err := app.startInstanceIPC(); err != nil {
		if errors.Is(err, errInstanceAlreadyRunning) {
			notifyRunningInstance(app.startupImport)
			return
		}
		app.log("WARN: не удалось запустить instance IPC: %v", err)
	}
	defer func() {
		app.stopInstanceIPC()
	}()

	go func() {
		time.Sleep(300 * time.Millisecond)
		currentCfg := app.getConfigSnapshot()
		active := activeProfileFromConfig(currentCfg)
		if strings.TrimSpace(active.URL) != "" {
			_ = app.refreshConfigAction()
		}
	}()

	if err := app.runUI(); err != nil {
		showError("UI error", err.Error())
		return
	}
}

func newApp(workDir string) *App {
	singBoxDir := filepath.Join(workDir, "singbox")
	_ = os.MkdirAll(singBoxDir, 0o755)

	targetExe := filepath.Join(singBoxDir, singboxExeName)
	// Migrate legacy sing-box.exe from root workDir to singbox/ folder if present
	legacyExe := filepath.Join(workDir, singboxExeName)
	if _, err := os.Stat(targetExe); errors.Is(err, os.ErrNotExist) {
		if _, legErr := os.Stat(legacyExe); legErr == nil {
			_ = os.Rename(legacyExe, targetExe)
		}
	}

	return &App{
		workDir:     workDir,
		configPath:  filepath.Join(workDir, configFileName),
		singBoxPath: targetExe,
		logEntries:  make([]logEntry, 0, maxLogLines),
	}
}
