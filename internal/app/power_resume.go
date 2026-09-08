//go:build windows

package app

import "time"

const (
	powerWatchTick       = 1 * time.Second
	powerResumeThreshold = 3 * time.Second
)

func (a *App) startPowerResumeWatcher() {
	if a.powerWatchStop != nil {
		return
	}
	stop := make(chan struct{})
	a.powerWatchStop = stop

	go func() {
		ticker := time.NewTicker(powerWatchTick)
		defer ticker.Stop()

		prev := time.Now()
		for {
			select {
			case <-stop:
				return
			case now := <-ticker.C:
				gap := now.Sub(prev)
				prev = now
				if gap < powerWatchTick+powerResumeThreshold {
					continue
				}
				a.recoverCoreAfterResume(gap)
			}
		}
	}()
}

func (a *App) stopPowerResumeWatcher() {
	if a.powerWatchStop == nil {
		return
	}
	close(a.powerWatchStop)
	a.powerWatchStop = nil
}

func (a *App) recoverCoreAfterResume(gap time.Duration) {
	if !a.coreDesiredRunningSnapshot() {
		return
	}
	a.log("Обнаружен выход системы из сна (пауза %v), проверка и восстановление ядра...", gap.Round(time.Second))

	go func() {
		// Даем сетевому стеку Windows и драйверам TUN 2 секунды на инициализацию
		time.Sleep(2 * time.Second)

		for attempt := 1; attempt <= 5; attempt++ {
			if !a.coreDesiredRunningSnapshot() {
				return
			}
			if a.isProcessRunning() {
				a.log("sing-box активен и продолжает работу после сна")
				return
			}

			a.log("Восстановление sing-box после сна (попытка %d/5)...", attempt)
			err := a.withRunningAction(func() error {
				if !a.coreDesiredRunningSnapshot() || a.isProcessRunning() {
					return nil
				}
				return a.startPipeline()
			})
			if err == nil && a.isProcessRunning() {
				a.log("sing-box успешно запущен и работает в фоне после сна")
				return
			}
			a.log("WARN: попытка %d восстановления sing-box не удалась: %v", attempt, err)
			time.Sleep(time.Duration(attempt*2) * time.Second)
		}
	}()
}
