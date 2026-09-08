//go:build windows

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lxn/walk"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"

	"singbox-gui-client/internal/app/db"
)

const (
	configFileName        = "config.yaml"
	singboxExeName        = "sing-box.exe"
	legacyRuntimeCfgName  = "config.json"
	createNoWindow        = 0x08000000
	createNewProcessGroup = 0x00000200
	ctrlBreakEvent        = 1

	dwmwaUseImmersiveDarkMode               = 20
	dwmwaUseImmersiveDarkModeBefore         = 19
	dwmwaWindowCornerPreference             = 33
	dwmwaBorderColor                        = 34
	dwmwaCaptionColor                       = 35
	dwmwaTextColor                          = 36
	wcaUseDarkModeColors                    = 26
	dwmwcpRound                     int32   = 2
	dwmColorDefault                         = 0xFFFFFFFF
	dwmColorNone                            = 0xFFFFFFFE
	preferredAppModeDefault         uintptr = 0
	preferredAppModeForceDark       uintptr = 2

	gracefulStopTimeout = 4 * time.Second
	forceStopTimeout    = 2 * time.Second
	maxLogLines         = 2000
)

var semverRegex = regexp.MustCompile(`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`)

type App struct {
	workDir       string
	configPath    string
	singBoxPath   string
	startupImport string
	protoRegWarn  string
	store         *db.DBStore

	cfgMu  sync.Mutex
	config AppConfig

	procMu            sync.Mutex
	proc              *exec.Cmd
	procStopRequested bool
	procWaitDone      chan struct{}
	procStartedAt     time.Time
	runtimeCfgMu      sync.Mutex
	clashMu           sync.Mutex
	clashController   string
	clashSecret       string
	clashRuntimeCfg   string
	clashRuntimeTmp   string

	selectorCacheProfile   string
	selectorCacheLive      bool
	selectorCacheExpiresAt time.Time
	selectorCacheGroups    []SelectorGroupState
	selectorCacheOutbounds map[string]OutboundInfo
	selectorDelayCache     map[string]SelectorOptionDelayState

	trafficMu            sync.Mutex
	trafficUploadTotal   int64
	trafficDownloadTotal int64
	trafficSampleAt      time.Time
	trafficSampleValid   bool

	runMu         sync.Mutex
	runningAction bool

	logMu      sync.RWMutex
	logEntries []logEntry
	logStart   int
	nextLogID  int64

	instanceIPCMu sync.Mutex
	instanceMutex windows.Handle
	instanceEvent windows.Handle
	instanceStop  chan struct{}
	instanceDone  chan struct{}

	trayOwner           *walk.MainWindow
	web                 *webViewHost
	webHwnd             win.HWND
	webWidget           win.HWND
	windowRectMu        sync.Mutex
	lastWindowRect      win.RECT
	lastWindowRectOk    bool
	lastWindowMaximized bool
	lastLiveResizeSync  time.Time
	embedSyncMu         sync.Mutex
	embedSyncTimer      *time.Timer
	embedSyncTag        string
	ni                  *walk.NotifyIcon

	autoUpdateMu   sync.Mutex
	autoUpdateStop chan struct{}
	autoUpdateWake chan struct{}

	appUpdateMu          sync.Mutex
	appUpdateChecking    bool
	appUpdateCheckedAt   time.Time
	appUpdateNextCheckAt time.Time
	appUpdateAvailable   bool
	appLatestReleaseTag  string
	appLatestReleaseURL  string
	appUpdateProgressVal int32 // atomic: -1=idle 0-100=downloading

	themeWatchStop chan struct{}
	powerWatchStop chan struct{}
	systemDark     bool

	uiCloseMu        sync.Mutex
	uiCloseRequested bool

	coreDesiredMu      sync.Mutex
	coreDesiredRunning bool
}

type logEntry struct {
	ID   int64  `json:"id"`
	Text string `json:"text"`
}

type AppState struct {
	CurrentProfile      string               `json:"current_profile"`
	Profiles            []ConfigProfile      `json:"profiles"`
	Language            string               `json:"language"`
	ThemeMode           string               `json:"theme_mode"`
	ThemeDark           bool                 `json:"theme_dark"`
	AccentColor         string               `json:"accent_color"`
	HWID                string               `json:"hwid"`
	URL                 string               `json:"url"`
	Version             string                  `json:"version"`
	SelectorGroups      []SelectorGroupState    `json:"selector_groups,omitempty"`
	SelectorCollapsed   map[string]bool         `json:"selector_collapsed_groups,omitempty"`
	Outbounds           map[string]OutboundInfo `json:"outbounds,omitempty"`
	AutoUpdateHours     int                     `json:"auto_update_hours"`
	AutoStartCore       bool                    `json:"auto_start_core"`
	StartMinimizedTray  bool                    `json:"start_minimized_to_tray"`
	UIScale             float64                 `json:"ui_scale"`
	UptimeSeconds       int64                   `json:"uptime_seconds"`
	Running             bool                    `json:"running"`
	Busy                bool                    `json:"busy"`
	AllowInsecure       bool                    `json:"allow_insecure"`
	ProtoRegWarn        string                  `json:"proto_reg_warn,omitempty"`
	AppReleaseTag       string                  `json:"app_release_tag,omitempty"`
	AppReleaseURL       string                  `json:"app_release_url,omitempty"`
	AppUpdateAvailable  bool                    `json:"app_update_available"`
	AppLatestReleaseTag string                  `json:"app_latest_release_tag,omitempty"`
	AppLatestReleaseURL string                  `json:"app_latest_release_url,omitempty"`
	// AppUpdateProgress: -1 = не активно, 0–100 = процент скачивания
	AppUpdateProgress   int                  `json:"app_update_progress"`
	Subscription        *SubscriptionInfo    `json:"subscription,omitempty"`
}

type OutboundInfo struct {
	Tag        string `json:"tag"`
	Type       string `json:"type"`
	Server     string `json:"server,omitempty"`
	ServerPort int    `json:"server_port,omitempty"`
}

func (a *App) setConfig(cfg AppConfig) {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	normalizeConfigProfiles(&cfg)
	cfg.Profiles = cloneConfigProfiles(cfg.Profiles)
	cfg.SingboxEnv = cloneEnvMap(cfg.SingboxEnv)
	a.config = cfg
}

func (a *App) getConfigSnapshot() AppConfig {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	cfg := a.config
	normalizeConfigProfiles(&cfg)
	cfg.Profiles = cloneConfigProfiles(cfg.Profiles)
	cfg.SingboxEnv = cloneEnvMap(cfg.SingboxEnv)
	return cfg
}

func (a *App) persistConfig(cfg AppConfig) error {
	normalizeConfigProfiles(&cfg)
	if err := saveConfig(a.configPath, cfg); err != nil {
		return err
	}
	a.syncConfigToStore(cfg)
	a.setConfig(cfg)
	a.invalidateSelectorCache()
	a.triggerAutoUpdateReconfigure()
	return nil
}

func (a *App) syncConfigToStore(cfg AppConfig) {
	if a.store == nil {
		return
	}
	_ = a.store.SetSetting("language", cfg.Language)
	_ = a.store.SetSetting("theme_mode", cfg.ThemeMode)
	_ = a.store.SetSetting("accent_color", cfg.AccentColor)
	_ = a.store.SetSetting("auto_update_hours", fmt.Sprintf("%d", cfg.AutoUpdateHours))
	if cfg.AutoStartCore {
		_ = a.store.SetSetting("auto_start_core", "true")
	} else {
		_ = a.store.SetSetting("auto_start_core", "false")
	}
	if cfg.StartMinimizedToTray {
		_ = a.store.SetSetting("start_minimized_to_tray", "true")
	} else {
		_ = a.store.SetSetting("start_minimized_to_tray", "false")
	}
	if cfg.AllowInsecure {
		_ = a.store.SetSetting("allow_insecure", "true")
	} else {
		_ = a.store.SetSetting("allow_insecure", "false")
	}

	for _, p := range cfg.Profiles {
		isActive := strings.EqualFold(p.Name, cfg.CurrentProfile)
		_ = a.store.SaveProfile(p.Name, p.URL, p.Version, isActive)
		if len(p.SelectorSelections) > 0 {
			_ = a.store.SaveSelectorSelections(p.Name, p.SelectorSelections)
		}
		if len(p.SelectorCollapsedGroups) > 0 {
			_ = a.store.SaveSelectorCollapsed(p.Name, p.SelectorCollapsedGroups)
		}
		if p.Subscription != nil {
			_ = a.store.SaveProfileSubscription(p.Name, db.SubscriptionRecord{
				ProfileName:    p.Name,
				Title:          p.Subscription.Title,
				Announce:       p.Subscription.Announce,
				WebPageURL:     p.Subscription.WebPageURL,
				SupportURL:     p.Subscription.SupportURL,
				UpdateInterval: p.Subscription.UpdateInterval,
				Upload:         p.Subscription.Upload,
				Download:       p.Subscription.Download,
				Total:          p.Subscription.Total,
				Expire:         p.Subscription.Expire,
				RefillDate:     p.Subscription.RefillDate,
				LastUpdated:    p.Subscription.LastUpdated,
				FileName:       p.Subscription.FileName,
			})
		}
	}
}

func (a *App) loadConfigFromStore() (AppConfig, bool) {
	if a.store == nil {
		return AppConfig{}, false
	}
	dbProfiles, err := a.store.GetProfiles()
	if err != nil || len(dbProfiles) == 0 {
		return AppConfig{}, false
	}

	settings, _ := a.store.GetAllSettings()

	cfg := AppConfig{
		Language:             settings["language"],
		ThemeMode:            settings["theme_mode"],
		AccentColor:          settings["accent_color"],
		AutoStartCore:        settings["auto_start_core"] == "true",
		StartMinimizedToTray: settings["start_minimized_to_tray"] == "true",
		AllowInsecure:        settings["allow_insecure"] == "true",
	}
	if hrs, err := strconv.Atoi(settings["auto_update_hours"]); err == nil {
		cfg.AutoUpdateHours = hrs
	}
	if envStr := settings["singbox_env"]; envStr != "" {
		var envMap map[string]string
		if json.Unmarshal([]byte(envStr), &envMap) == nil {
			cfg.SingboxEnv = envMap
		}
	}

	for _, p := range dbProfiles {
		selections, _ := a.store.GetSelectorSelections(p.Name)
		collapsed, _ := a.store.GetSelectorCollapsed(p.Name)
		var sub *SubscriptionInfo
		if dbSub, _ := a.store.GetProfileSubscription(p.Name); dbSub != nil {
			sub = &SubscriptionInfo{
				Title:          dbSub.Title,
				Announce:       dbSub.Announce,
				WebPageURL:     dbSub.WebPageURL,
				SupportURL:     dbSub.SupportURL,
				UpdateInterval: dbSub.UpdateInterval,
				Upload:         dbSub.Upload,
				Download:       dbSub.Download,
				Total:          dbSub.Total,
				Expire:         dbSub.Expire,
				RefillDate:     dbSub.RefillDate,
				LastUpdated:    dbSub.LastUpdated,
				FileName:       dbSub.FileName,
			}
		}
		cfg.Profiles = append(cfg.Profiles, ConfigProfile{
			Name:                    p.Name,
			URL:                     p.Url,
			Version:                 p.Version,
			SelectorSelections:      selections,
			SelectorCollapsedGroups: collapsed,
			Subscription:            sub,
		})
		if p.IsActive == 1 {
			cfg.CurrentProfile = p.Name
		}
	}
	if cfg.CurrentProfile == "" && len(cfg.Profiles) > 0 {
		cfg.CurrentProfile = cfg.Profiles[0].Name
	}
	normalizeConfigProfiles(&cfg)
	return cfg, true
}

// uiScaleForState возвращает масштаб для передачи во фронтенд.
// Возвращаем 1.0: WebView2 сам масштабирует контент через devicePixelRatio,
// дополнительный CSS-скейл через --ui-display-scale не нужен.
func uiScaleForState() float64 {
	return 1.0
}

func (a *App) snapshotState() AppState {
	cfg := a.getConfigSnapshot()
	active := activeProfileFromConfig(cfg)
	running := a.isProcessRunning()
	themeMode := normalizeThemeMode(cfg.ThemeMode)
	themeDark := resolveThemeDark(themeMode, a.systemDark)

	a.runMu.Lock()
	busy := a.runningAction
	a.runMu.Unlock()

	appUpdateAvailable, appLatestTag, appLatestURL := a.appUpdateSnapshot()
	selectorGroups := a.selectorGroupsSnapshot(active, running, busy)

	var activeSub *SubscriptionInfo
	if active.Subscription != nil {
		subCopy := *active.Subscription
		activeSub = &subCopy
	}

	return AppState{
		CurrentProfile:      cfg.CurrentProfile,
		Profiles:            cloneConfigProfiles(cfg.Profiles),
		Language:            cfg.Language,
		ThemeMode:           themeMode,
		ThemeDark:           themeDark,
		AccentColor:         normalizeAccentColor(cfg.AccentColor),
		HWID:                appHWID(),
		URL:                 active.URL,
		Version:             active.Version,
		SelectorGroups:      selectorGroups,
		SelectorCollapsed:   cloneSelectorCollapsedGroups(active.SelectorCollapsedGroups),
		Outbounds:           a.outboundsSnapshotForProfile(active.Name, running),
		AutoUpdateHours:     cfg.AutoUpdateHours,
		AutoStartCore:       cfg.AutoStartCore,
		StartMinimizedTray:  cfg.StartMinimizedToTray,
		UIScale:             uiScaleForState(),
		UptimeSeconds:       a.processUptimeSeconds(),
		Running:             running,
		Busy:                busy,
		AllowInsecure:       cfg.AllowInsecure,
		ProtoRegWarn:        a.protoRegWarn,
		AppReleaseTag:       currentAppReleaseTag(),
		AppReleaseURL:       currentAppReleaseURL(),
		AppUpdateAvailable:  appUpdateAvailable,
		AppLatestReleaseTag: appLatestTag,
		AppLatestReleaseURL: appLatestURL,
		AppUpdateProgress:   int(atomic.LoadInt32(&a.appUpdateProgressVal)),
		Subscription:        activeSub,
	}
}

type StatePatch struct {
	CurrentProfile       *string         `json:"current_profile"`
	Language             *string         `json:"language"`
	ThemeMode            *string         `json:"theme_mode"`
	AccentColor          *string         `json:"accent_color"`
	URL                  *string         `json:"url"`
	Version              *string         `json:"version"`
	AutoUpdateHours      *int            `json:"auto_update_hours"`
	AutoStartCore        *bool           `json:"auto_start_core"`
	StartMinimizedToTray *bool           `json:"start_minimized_to_tray"`
	AllowInsecure        *bool           `json:"allow_insecure"`
	SelectorCollapsed    map[string]bool `json:"selector_collapsed_groups"`
}

func (a *App) applyStatePatch(p StatePatch) error {
	cfg := a.getConfigSnapshot()
	normalizeConfigProfiles(&cfg)
	themeModeChanged := false

	if p.CurrentProfile != nil {
		name := sanitizeProfileName(*p.CurrentProfile)
		if name != "" {
			if idx := findProfileIndexByName(cfg.Profiles, name); idx >= 0 {
				cfg.CurrentProfile = cfg.Profiles[idx].Name
			} else {
				return fmt.Errorf("профиль %q не найден", name)
			}
		}
	}

	if p.Language != nil {
		cfg.Language = normalizeAppLanguage(*p.Language)
	}
	if p.ThemeMode != nil {
		cfg.ThemeMode = normalizeThemeMode(*p.ThemeMode)
		themeModeChanged = true
	}
	if p.AccentColor != nil {
		cfg.AccentColor = normalizeAccentColor(*p.AccentColor)
	}
	if p.AutoUpdateHours != nil {
		cfg.AutoUpdateHours = normalizeAutoUpdateHours(*p.AutoUpdateHours)
	}
	if p.AutoStartCore != nil {
		cfg.AutoStartCore = *p.AutoStartCore
	}
	if p.StartMinimizedToTray != nil {
		cfg.StartMinimizedToTray = *p.StartMinimizedToTray
	}
	if p.AllowInsecure != nil {
		cfg.AllowInsecure = *p.AllowInsecure
	}

	idx := activeProfileIndex(&cfg)
	if idx < 0 {
		return errors.New("активный профиль не найден")
	}

	if p.URL != nil {
		cfg.Profiles[idx].URL = strings.TrimSpace(*p.URL)
	}
	if p.Version != nil {
		version := strings.TrimSpace(*p.Version)
		if version == "" {
			version = "latest"
		}
		cfg.Profiles[idx].Version = version
	}
	if p.SelectorCollapsed != nil {
		cfg.Profiles[idx].SelectorCollapsedGroups = normalizeSelectorCollapsedGroups(p.SelectorCollapsed)
	}

	syncLegacyFromCurrent(&cfg)
	if err := a.persistConfig(cfg); err != nil {
		return err
	}
	if themeModeChanged {
		a.systemDark = detectSystemDarkTheme()
		a.applyNativeDarkHints(resolveThemeDark(cfg.ThemeMode, a.systemDark))
	}
	return nil
}

func (a *App) createProfile(name string) error {
	cfg := a.getConfigSnapshot()
	normalizeConfigProfiles(&cfg)

	candidate := sanitizeProfileName(name)
	if candidate == "" {
		candidate = generateNextProfileName(cfg.Profiles)
	}
	candidate = makeUniqueProfileName(cfg.Profiles, candidate)

	cfg.Profiles = append(cfg.Profiles, ConfigProfile{
		Name:    candidate,
		URL:     "",
		Version: "latest",
	})
	cfg.CurrentProfile = candidate
	syncLegacyFromCurrent(&cfg)
	return a.persistConfig(cfg)
}

func (a *App) deleteProfile(name string) error {
	cfg := a.getConfigSnapshot()
	normalizeConfigProfiles(&cfg)

	target := sanitizeProfileName(name)
	if target == "" {
		target = cfg.CurrentProfile
	}
	idx := findProfileIndexByName(cfg.Profiles, target)
	if idx < 0 {
		return fmt.Errorf("профиль %q не найден", target)
	}

	// If the last profile is being deleted, reset profile storage to a clean base state.
	if len(cfg.Profiles) <= 1 {
		cfg.Profiles = []ConfigProfile{
			{
				Name:    "default",
				URL:     "",
				Version: "latest",
			},
		}
		cfg.CurrentProfile = "default"
		syncLegacyFromCurrent(&cfg)
		return a.persistConfig(cfg)
	}

	cfg.Profiles = append(cfg.Profiles[:idx], cfg.Profiles[idx+1:]...)
	if findProfileIndexByName(cfg.Profiles, cfg.CurrentProfile) < 0 {
		cfg.CurrentProfile = cfg.Profiles[0].Name
	}
	syncLegacyFromCurrent(&cfg)
	return a.persistConfig(cfg)
}

func (a *App) renameProfile(name string) error {
	cfg := a.getConfigSnapshot()
	normalizeConfigProfiles(&cfg)

	idx := activeProfileIndex(&cfg)
	if idx < 0 {
		return errors.New("активный профиль не найден")
	}

	nextName := sanitizeProfileName(name)
	if nextName == "" {
		return errors.New("имя профиля пустое")
	}

	currentName := cfg.Profiles[idx].Name
	if strings.EqualFold(currentName, nextName) {
		cfg.Profiles[idx].Name = nextName
		cfg.CurrentProfile = nextName
		syncLegacyFromCurrent(&cfg)
		return a.persistConfig(cfg)
	}

	if existingIdx := findProfileIndexByName(cfg.Profiles, nextName); existingIdx >= 0 && existingIdx != idx {
		return fmt.Errorf("профиль %q уже существует", nextName)
	}

	cfg.Profiles[idx].Name = nextName
	cfg.CurrentProfile = nextName
	syncLegacyFromCurrent(&cfg)
	return a.persistConfig(cfg)
}
