//go:build windows

package app

import (
	"path/filepath"
	"strings"
	"time"
)

func (a *App) startAutoUpdateScheduler() {
	a.autoUpdateMu.Lock()
	if a.autoUpdateStop != nil {
		a.autoUpdateMu.Unlock()
		return
	}
	stop := make(chan struct{})
	wake := make(chan struct{}, 1)
	a.autoUpdateStop = stop
	a.autoUpdateWake = wake
	a.autoUpdateMu.Unlock()

	go a.autoUpdateLoop(stop, wake)
	go a.refreshAllProfilesOnStartup()
	a.triggerAutoUpdateReconfigure()
}

func (a *App) stopAutoUpdateScheduler() {
	a.autoUpdateMu.Lock()
	stop := a.autoUpdateStop
	a.autoUpdateStop = nil
	a.autoUpdateWake = nil
	a.autoUpdateMu.Unlock()

	if stop != nil {
		close(stop)
	}
}

func (a *App) triggerAutoUpdateReconfigure() {
	a.autoUpdateMu.Lock()
	wake := a.autoUpdateWake
	a.autoUpdateMu.Unlock()

	if wake == nil {
		return
	}
	select {
	case wake <- struct{}{}:
	default:
	}
}

func (a *App) autoUpdateLoop(stop <-chan struct{}, wake <-chan struct{}) {
	var timer *time.Timer
	var timerC <-chan time.Time

	resetTimer := func(delay time.Duration) {
		stopAndDrainTimer(timer)
		timer = nil
		timerC = nil
		if delay <= 0 {
			return
		}
		timer = time.NewTimer(delay)
		timerC = timer.C
	}

	resetTimer(a.autoUpdateDelay())
	for {
		select {
		case <-stop:
			stopAndDrainTimer(timer)
			return
		case <-wake:
			resetTimer(a.autoUpdateDelay())
		case <-timerC:
			a.runAutoUpdateOnce()
			resetTimer(a.autoUpdateDelay())
		}
	}
}

func stopAndDrainTimer(timer *time.Timer) {
	if timer == nil {
		return
	}
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
}

func (a *App) autoUpdateDelay() time.Duration {
	cfg := a.getConfigSnapshot()
	hours := normalizeAutoUpdateHours(cfg.AutoUpdateHours)
	if hours <= 0 {
		return 0
	}
	return time.Duration(hours) * time.Hour
}

func (a *App) runAutoUpdateOnce() {
	cfg := a.getConfigSnapshot()
	hours := normalizeAutoUpdateHours(cfg.AutoUpdateHours)
	if hours <= 0 {
		return
	}

	res, err := a.refreshActiveProfileRuntimeConfigFromURL(0)
	if err != nil {
		a.log("WARN: автообновление профиля %s пропущено: %v", res.ProfileName, err)
		return
	}
	if strings.TrimSpace(res.ResolvedConfigURL) == "" {
		return
	}

	active := activeProfileFromConfig(cfg)
	if res.DetectedVersion != "" && res.DetectedVersion != active.Version {
		a.log("Конфигурация передала версию sing-box %s (у профиля: %s), обновляю профиль", res.DetectedVersion, active.Version)
		_ = a.updateActiveProfileVersion(res.DetectedVersion)
		_ = a.ensureSingBox(res.DetectedVersion)
	}

	if res.Updated {
		a.invalidateSelectorCache()
		a.log("Автообновление: обновлён %s (профиль: %s)", res.RuntimeCfgFile, res.ProfileName)
	}
}

// refreshResult содержит результат обновления конфига активного профиля.
type refreshResult struct {
	ProfileName       string
	RuntimeCfgPath    string
	RuntimeCfgFile    string
	ResolvedConfigURL string
	Updated           bool
	DetectedVersion   string
}

func (a *App) refreshActiveProfileRuntimeConfigFromURL(timeout time.Duration) (res refreshResult, err error) {
	cfg := a.getConfigSnapshot()
	active := activeProfileFromConfig(cfg)

	res.ProfileName = strings.TrimSpace(active.Name)
	if res.ProfileName == "" {
		res.ProfileName = "profile-1"
	}
	res.RuntimeCfgPath = a.runtimeConfigPathForProfile(res.ProfileName)
	res.RuntimeCfgFile = filepath.Base(res.RuntimeCfgPath)

	res.ResolvedConfigURL, _, err = resolveSubscriptionInput(active.URL)
	if err != nil {
		return res, err
	}
	if strings.TrimSpace(res.ResolvedConfigURL) == "" {
		return res, nil
	}

	downloadRes, err := a.refreshRuntimeConfigFromURLWithTimeout(res.ResolvedConfigURL, res.RuntimeCfgPath, timeout)
	res.Updated = downloadRes.Updated
	res.DetectedVersion = downloadRes.DetectedVersion
	return res, err
}

func (a *App) refreshAllProfilesOnStartup() {
	// Give the app 2 seconds to finish UI startup and local initialization
	time.Sleep(2 * time.Second)

	cfg := a.getConfigSnapshot()
	for _, p := range cfg.Profiles {
		url := strings.TrimSpace(p.URL)
		if url == "" {
			continue
		}
		resolvedURL, _, err := resolveSubscriptionInput(url)
		if err != nil || resolvedURL == "" {
			continue
		}
		targetPath := a.runtimeConfigPathForProfile(p.Name)
		res, err := a.refreshRuntimeConfigFromURLWithTimeout(resolvedURL, targetPath, 15*time.Second)
		if err != nil {
			a.log("Запуск: не удалось обновить подписку профиля %s: %v", p.Name, err)
			continue
		}
		if res.Updated {
			a.log("Запуск: конфигурация профиля %s обновлена (хэш изменился)", p.Name)
		} else {
			a.log("Запуск: конфигурация профиля %s уже актуальна (хэш совпадает)", p.Name)
		}
	}
}

