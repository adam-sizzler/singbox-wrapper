//go:build windows

package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const webViewBridgeAPICallBinding = "__sbApiCall"

type logsResponse struct {
	Entries []logEntry `json:"entries"`
	LastID  int64      `json:"last_id"`
}

type profileRequest struct {
	Name string `json:"name"`
}

type configResponse struct {
	Content string `json:"content"`
	Path    string `json:"path"`
	Profile string `json:"profile"`
}

type configSaveRequest struct {
	Content string `json:"content"`
}

type uiBridgeRequest struct {
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Body   json.RawMessage `json:"body"`
}

func (a *App) bindUIBridge() error {
	if a.web == nil {
		return fmt.Errorf("webview is not initialized")
	}
	return a.web.Bind(webViewBridgeAPICallBinding, func(req uiBridgeRequest) (any, error) {
		return a.handleUIBridgeCall(req)
	})
}

func (a *App) handleUIBridgeCall(req uiBridgeRequest) (any, error) {
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		return nil, fmt.Errorf("пустой метод")
	}

	rawPath := strings.TrimSpace(req.Path)
	if rawPath == "" {
		return nil, fmt.Errorf("пустой путь")
	}

	parsedPath, err := url.Parse(rawPath)
	if err != nil {
		return nil, fmt.Errorf("некорректный путь: %w", err)
	}
	routePath := strings.TrimSpace(parsedPath.Path)
	if routePath == "" {
		routePath = "/"
	}
	switch method {
	case "GET":
		switch routePath {
		case "/api/state":
			return a.snapshotState(), nil
		case "/api/traffic":
			return a.trafficSnapshot(), nil
		case "/api/config":
			cfg := a.getConfigSnapshot()
			profileName := cfg.CurrentProfile
			if profileName == "" && len(cfg.Profiles) > 0 {
				profileName = cfg.Profiles[0].Name
			}
			cfgPath := a.runtimeConfigPathForProfile(profileName)
			var content string
			if a.store != nil {
				content, _ = a.store.GetProfileConfig(profileName)
			}
			if content == "" {
				data, err := os.ReadFile(cfgPath)
				if err != nil {
					if os.IsNotExist(err) {
						content = "{\n  \"log\": {\n    \"level\": \"info\"\n  }\n}\n"
					} else {
						return nil, fmt.Errorf("read config file: %w", err)
					}
				} else {
					content = string(data)
					if a.store != nil {
						_ = a.store.SaveProfileConfig(profileName, content)
					}
				}
			}
			return configResponse{
				Content: content,
				Path:    cfgPath,
				Profile: profileName,
			}, nil
		case "/api/logs":
			fromID := int64(0)
			if s := strings.TrimSpace(parsedPath.Query().Get("from")); s != "" {
				if parsed, err := strconv.ParseInt(s, 10, 64); err == nil && parsed >= 0 {
					fromID = parsed
				}
			}
			entries, lastID := a.logsSince(fromID)
			return logsResponse{Entries: entries, LastID: lastID}, nil
		}
	case "POST":
		switch routePath {
		case "/api/state":
			var patch StatePatch
			if err := decodeBridgeBody(req.Body, &patch); err != nil {
				return nil, err
			}
			if err := a.applyStatePatch(patch); err != nil {
				return nil, err
			}
			return a.snapshotState(), nil
		case "/api/profile/new":
			var profileReq profileRequest
			if err := decodeBridgeBody(req.Body, &profileReq); err != nil {
				return nil, err
			}
			if err := a.createProfile(profileReq.Name); err != nil {
				return nil, err
			}
			return a.snapshotState(), nil
		case "/api/profile/delete":
			var profileReq profileRequest
			if err := decodeBridgeBody(req.Body, &profileReq); err != nil {
				return nil, err
			}
			if err := a.deleteProfile(profileReq.Name); err != nil {
				return nil, err
			}
			return a.snapshotState(), nil
		case "/api/profile/rename":
			var profileReq profileRequest
			if err := decodeBridgeBody(req.Body, &profileReq); err != nil {
				return nil, err
			}
			if err := a.renameProfile(profileReq.Name); err != nil {
				return nil, err
			}
			return a.snapshotState(), nil
		case "/api/selector/select":
			var selectorReq selectorRequest
			if err := decodeBridgeBody(req.Body, &selectorReq); err != nil {
				return nil, err
			}
			if err := a.setSelectorOutbound(selectorReq.Selector, selectorReq.Outbound); err != nil {
				return nil, err
			}
			return a.snapshotState(), nil
		case "/api/selector/delay":
			var selectorReq selectorDelayRequest
			if err := decodeBridgeBody(req.Body, &selectorReq); err != nil {
				return nil, err
			}
			go func() {
				if _, err := a.checkSelectorDelay(selectorReq.Selector, selectorReq.Outbound); err != nil {
					a.log("Ошибка проверки задержки: %v", err)
				}
			}()
			return map[string]any{"ok": true, "started": true}, nil
		case "/api/selector/delay-all":
			var selectorReq selectorDelayAllRequest
			if err := decodeBridgeBody(req.Body, &selectorReq); err != nil {
				return nil, err
			}
			go func() {
				if _, err := a.checkSelectorDelays(selectorReq.Selector); err != nil {
					a.log("Ошибка проверки задержек: %v", err)
				}
			}()
			return map[string]any{"ok": true, "started": true}, nil
		case "/api/action/start-stop":
			go func() {
				if err := a.toggleStartStop(); err != nil {
					a.log("Ошибка переключения ядра: %v", err)
				}
			}()
			return a.snapshotState(), nil

		case "/api/action/refresh-config":
			go func() {
				if err := a.refreshConfigAction(); err != nil {
					a.log("Ошибка обновления конфигурации: %v", err)
				}
			}()
			return a.snapshotState(), nil
		case "/api/action/restart-core":
			go func() {
				if err := a.restartCoreAction(); err != nil {
					a.log("Ошибка перезапуска ядра: %v", err)
				}
			}()
			return a.snapshotState(), nil
		case "/api/action/copy-logs":
			go func() {
				if err := a.copyLogsToClipboard(); err != nil {
					a.log("Ошибка копирования логов: %v", err)
				}
			}()
			return map[string]bool{"ok": true}, nil
		case "/api/action/update-app":
			go func() {
				if err := a.updateApplicationAction(); err != nil {
					a.log("Ошибка обновления приложения: %v", err)
				}
			}()
			return map[string]bool{"ok": true}, nil
		case "/api/config":
			var saveReq configSaveRequest
			if err := decodeBridgeBody(req.Body, &saveReq); err != nil {
				return nil, err
			}
			cfg := a.getConfigSnapshot()
			profileName := cfg.CurrentProfile
			if profileName == "" && len(cfg.Profiles) > 0 {
				profileName = cfg.Profiles[0].Name
			}
			cfgPath := a.runtimeConfigPathForProfile(profileName)
			if a.store != nil {
				if err := a.store.SaveProfileConfig(profileName, saveReq.Content); err != nil {
					return nil, fmt.Errorf("save config to db: %w", err)
				}
			}
			if err := os.WriteFile(cfgPath, []byte(saveReq.Content), 0644); err != nil {
				return nil, fmt.Errorf("write config file: %w", err)
			}
			return map[string]any{"ok": true, "path": cfgPath}, nil
		}
	}

	return nil, fmt.Errorf("неподдерживаемый API вызов: %s %s", method, routePath)
}

func decodeBridgeBody(raw json.RawMessage, v any) error {
	body := bytes.TrimSpace(raw)
	if len(body) == 0 || bytes.Equal(body, []byte("null")) {
		body = []byte("{}")
	}
	// DisallowUnknownFields не используем: фронтенд может слать новые поля
	// в будущих версиях — не хотим ломать forward compatibility.
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(v); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}
	return nil
}
