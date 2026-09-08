//go:build windows

package app

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const defaultDownloadTimeout = 60 * time.Second

var (
	rxTagTraffic = regexp.MustCompile(`(?i)\s*\|\s*[\d.,]+\s*(?:[KMGTPE]i?B|[КМГТПE]б|B|Б)(?:\s*/\s*[\d.,]+\s*(?:[KMGTPE]i?B|[КМГТПE]б|B|Б))?\s*трафика`)
	rxTagDays    = regexp.MustCompile(`(?i)\s*\|\s*\d+\s*(?:дн\.|дней|дня|days?)\s*(?:осталось|left)?`)
)

func normalizeConfigForHash(b []byte) [32]byte {
	s := string(b)
	s = rxTagTraffic.ReplaceAllString(s, "")
	s = rxTagDays.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.TrimSpace(s)
	return sha256.Sum256([]byte(s))
}

func resolveVersion(version string) (string, error) {
	v := strings.TrimSpace(strings.TrimPrefix(version, "v"))
	if strings.EqualFold(v, "latest") || v == "" {
		latest, err := fetchLatestVersion()
		if err != nil {
			return "", err
		}
		return latest, nil
	}
	if !semverRegex.MatchString(v) {
		return "", fmt.Errorf("версия %q имеет неверный формат", version)
	}
	return v, nil
}

func fetchLatestVersion() (string, error) {
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/SagerNet/sing-box/releases/latest", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", appUserAgent())

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("github недоступен: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("github вернул HTTP %d", resp.StatusCode)
	}

	var body struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("не удалось распарсить ответ GitHub: %w", err)
	}
	version := strings.TrimSpace(strings.TrimPrefix(body.TagName, "v"))
	if !semverRegex.MatchString(version) {
		return "", fmt.Errorf("получен некорректный tag_name: %q", body.TagName)
	}
	return version, nil
}

func detectSingBoxVersion(singboxPath string) (string, error) {
	if _, err := os.Stat(singboxPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}

	out, err := commandWithTimeout(singboxPath, 6*time.Second, "version")
	if err != nil {
		return "", err
	}
	match := semverRegex.FindString(string(out))
	if match == "" {
		return "", fmt.Errorf("не удалось извлечь версию из вывода: %q", string(out))
	}
	return strings.TrimSpace(match), nil
}

func downloadAndInstallSingBox(version, targetExe string) error {
	downloadURL := fmt.Sprintf(
		"https://github.com/SagerNet/sing-box/releases/download/v%s/sing-box-%s-windows-amd64.zip",
		version,
		version,
	)

	targetDir := filepath.Dir(targetExe)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}

	zipPath := targetExe + ".zip"
	if err := downloadFile(downloadURL, zipPath, map[string]string{"User-Agent": appUserAgent()}); err != nil {
		return fmt.Errorf("не удалось скачать sing-box %s: %w", version, err)
	}
	defer os.Remove(zipPath)

	if err := extractSingBoxPackage(zipPath, targetExe); err != nil {
		return fmt.Errorf("ошибка распаковки sing-box: %w", err)
	}
	return nil
}

type runtimeConfigDownloadResult struct {
	Updated         bool
	DetectedVersion string
	Subscription    SubscriptionInfo
}

func decodeBase64Header(val string) string {
	val = strings.TrimSpace(val)
	if strings.HasPrefix(strings.ToLower(val), "base64:") {
		encoded := val[7:]
		if dec, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded)); err == nil {
			return strings.TrimSpace(string(dec))
		}
	}
	return val
}

func parseSubscriptionUserInfo(raw string) (upload, download, total, expire int64) {
	for _, part := range strings.Split(raw, ";") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		k := strings.ToLower(strings.TrimSpace(kv[0]))
		v := strings.TrimSpace(kv[1])
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			continue
		}
		switch k {
		case "upload":
			upload = n
		case "download":
			download = n
		case "total":
			total = n
		case "expire":
			expire = n
		}
	}
	return
}

func parseSubscriptionHeaders(h http.Header) SubscriptionInfo {
	info := SubscriptionInfo{
		LastUpdated: time.Now().Unix(),
	}

	if val := h.Get("profile-title"); val != "" {
		info.Title = decodeBase64Header(val)
	}
	if val := h.Get("announce"); val != "" {
		info.Announce = decodeBase64Header(val)
	}
	if val := h.Get("profile-web-page-url"); val != "" {
		info.WebPageURL = strings.TrimSpace(val)
	}
	if val := h.Get("support-url"); val != "" {
		info.SupportURL = strings.TrimSpace(val)
	}
	if val := h.Get("profile-update-interval"); val != "" {
		if hrs, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
			info.UpdateInterval = hrs
		}
	}
	if val := h.Get("subscription-refill-date"); val != "" {
		if ts, err := strconv.ParseInt(strings.TrimSpace(val), 10, 64); err == nil {
			info.RefillDate = ts
		}
	}
	if val := h.Get("subscription-userinfo"); val != "" {
		info.Upload, info.Download, info.Total, info.Expire = parseSubscriptionUserInfo(val)
	}
	if cd := h.Get("content-disposition"); cd != "" {
		for _, part := range strings.Split(cd, ";") {
			part = strings.TrimSpace(part)
			if strings.HasPrefix(strings.ToLower(part), "filename=") {
				fn := strings.TrimPrefix(part, "filename=")
				fn = strings.TrimPrefix(fn, "FILENAME=")
				info.FileName = strings.Trim(fn, `"' `)
			}
		}
	}

	return info
}

func buildSFWUserAgent(coreVersion string) string {
	v := strings.TrimSpace(coreVersion)
	if v == "" || strings.EqualFold(v, "latest") {
		v = "1.14.0"
	} else {
		v = strings.TrimPrefix(v, "v")
		v = strings.TrimPrefix(v, "V")
	}
	return fmt.Sprintf("SFW (sing-box %s)", v)
}

func downloadRuntimeConfig(url, target string) (bool, error) {
	res, err := downloadRuntimeConfigWithOptions(url, target, 0, false, "")
	return res.Updated, err
}

func downloadRuntimeConfigWithTimeout(url, target string, timeout time.Duration) (bool, error) {
	res, err := downloadRuntimeConfigWithOptions(url, target, timeout, false, "")
	return res.Updated, err
}

func downloadRuntimeConfigWithOptions(url, target string, timeout time.Duration, allowInsecure bool, coreVersion string) (runtimeConfigDownloadResult, error) {
	targetName := filepath.Base(target)
	tmpPath := target + ".download.tmp"
	headers := subscriptionRequestHeaders(coreVersion)
	respHeaders, err := downloadFileWithResponseHeaders(url, tmpPath, headers, timeout, allowInsecure)
	if err != nil {
		return runtimeConfigDownloadResult{}, fmt.Errorf("не удалось скачать %s: %w", targetName, err)
	}
	defer os.Remove(tmpPath)

	if err := validateRuntimeConfigFile(tmpPath); err != nil {
		return runtimeConfigDownloadResult{}, fmt.Errorf("полученный %s не является валидным JSON: %w", targetName, err)
	}

	newContent, err := os.ReadFile(tmpPath)
	if err != nil {
		return runtimeConfigDownloadResult{}, err
	}

	// Check core version from HTTP header (support singbox-version and sing-box-version)
	var detectedVersion string
	versionHeader := strings.TrimSpace(respHeaders.Get("sing-box-version"))
	if versionHeader == "" {
		versionHeader = strings.TrimSpace(respHeaders.Get("singbox-version"))
	}
	if versionHeader != "" {
		detectedVersion = normalizeImportedCoreVersion(versionHeader)
	}

	subInfo := parseSubscriptionHeaders(respHeaders)

	// Compare SHA-256 hash of configuration body (normalized for CRLF and dynamic tag counters)
	newSum := normalizeConfigForHash(newContent)
	oldContent, err := os.ReadFile(target)
	if err == nil {
		oldSum := normalizeConfigForHash(oldContent)
		if newSum == oldSum {
			return runtimeConfigDownloadResult{Updated: false, DetectedVersion: detectedVersion, Subscription: subInfo}, nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return runtimeConfigDownloadResult{}, err
	}

	if err := os.Rename(tmpPath, target); err != nil {
		return runtimeConfigDownloadResult{}, err
	}
	return runtimeConfigDownloadResult{Updated: true, DetectedVersion: detectedVersion, Subscription: subInfo}, nil
}

func ensureLocalRuntimeConfig(target string) error {
	targetName := filepath.Base(target)
	if _, err := os.Stat(target); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			legacyPath := filepath.Join(filepath.Dir(target), legacyRuntimeCfgName)
			if !strings.EqualFold(legacyPath, target) {
				if _, legacyErr := os.Stat(legacyPath); legacyErr == nil {
					if err := validateRuntimeConfigFile(legacyPath); err != nil {
						return fmt.Errorf("локальный %s не является валидным JSON: %w", filepath.Base(legacyPath), err)
					}
					content, err := os.ReadFile(legacyPath)
					if err != nil {
						return err
					}
					if err := os.WriteFile(target, content, 0o644); err != nil {
						return err
					}
					return nil
				}
			}
			// Starter template configuration for local profile testing
			defaultLocalConfig := []byte("{\n  \"log\": {\n    \"level\": \"info\",\n    \"timestamp\": true\n  },\n  \"inbounds\": [\n    {\n      \"type\": \"mixed\",\n      \"tag\": \"mixed-in\",\n      \"listen\": \"127.0.0.1\",\n      \"listen_port\": 2080\n    }\n  ],\n  \"outbounds\": [\n    {\n      \"type\": \"direct\",\n      \"tag\": \"direct\"\n    }\n  ]\n}\n")
			if err := os.WriteFile(target, defaultLocalConfig, 0o644); err != nil {
				return fmt.Errorf("не удалось создать локальный %s: %w", targetName, err)
			}
			return nil
		}
		return err
	}
	if err := validateRuntimeConfigFile(target); err != nil {
		return fmt.Errorf("локальный %s не является валидным JSON: %w", targetName, err)
	}
	return nil
}

func validateRemoteRuntimeConfig(url string) error {
	return validateRemoteRuntimeConfigWithOptions(url, 0, false)
}

func validateRemoteRuntimeConfigWithTimeout(url string, timeout time.Duration) error {
	return validateRemoteRuntimeConfigWithOptions(url, timeout, false)
}

func validateRemoteRuntimeConfigWithOptions(url string, timeout time.Duration, allowInsecure bool) error {
	tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("singbox-wrapper-config-check-%d.json", time.Now().UnixNano()))
	if err := downloadFileWithOptions(url, tmpPath, subscriptionRequestHeaders(""), timeout, allowInsecure); err != nil {
		return fmt.Errorf("не удалось скачать runtime-конфиг: %w", err)
	}
	defer os.Remove(tmpPath)
	return validateRuntimeConfigFile(tmpPath)
}

func validateRemoteRuntimeConfigWithSingBox(url string, timeout time.Duration, allowInsecure bool, singboxPath string, checkTimeout time.Duration) error {
	tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("singbox-wrapper-config-check-%d.json", time.Now().UnixNano()))
	if err := downloadFileWithOptions(url, tmpPath, subscriptionRequestHeaders(""), timeout, allowInsecure); err != nil {
		return fmt.Errorf("не удалось скачать runtime-конфиг: %w", err)
	}
	defer os.Remove(tmpPath)
	return validateRuntimeConfigWithSingBox(singboxPath, tmpPath, checkTimeout)
}

func subscriptionRequestHeaders(coreVersion string) map[string]string {
	ua := buildSFWUserAgent(coreVersion)
	v := strings.TrimSpace(coreVersion)
	if v == "" || strings.EqualFold(v, "latest") {
		v = "1.14.0"
	} else {
		v = strings.TrimPrefix(v, "v")
		v = strings.TrimPrefix(v, "V")
	}
	return map[string]string{
		"User-Agent":       ua,
		"sing-box-version": v,
	}
}

func validateRuntimeConfigFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if !json.Valid(bytes.TrimSpace(b)) {
		return errors.New("конфиг не является валидным JSON")
	}
	return nil
}

func validateRuntimeConfigWithSingBox(singboxPath, configPath string, timeout time.Duration) error {
	if err := validateRuntimeConfigFile(configPath); err != nil {
		return err
	}
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	output, err := commandWithTimeout(singboxPath, timeout, "check", "-c", configPath)
	if err == nil {
		return nil
	}
	text := strings.TrimSpace(string(output))
	if text == "" {
		return fmt.Errorf("sing-box check завершился с ошибкой: %w", err)
	}
	return fmt.Errorf("sing-box check завершился с ошибкой: %w: %s", err, text)
}

func downloadFile(url, target string, headers map[string]string) error {
	return downloadFileWithOptions(url, target, headers, 0, false)
}

func downloadFileWithTimeout(url, target string, headers map[string]string, timeout time.Duration) error {
	return downloadFileWithOptions(url, target, headers, timeout, false)
}

func downloadFileWithOptions(url, target string, headers map[string]string, timeout time.Duration, allowInsecure bool) error {
	_, err := downloadFileWithResponseHeaders(url, target, headers, timeout, allowInsecure)
	return err
}

func downloadFileWithResponseHeaders(url, target string, headers map[string]string, timeout time.Duration, allowInsecure bool) (http.Header, error) {
	if timeout <= 0 {
		timeout = defaultDownloadTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	dialTimeout := timeout / 2
	if dialTimeout < time.Second {
		dialTimeout = time.Second
	}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   dialTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   dialTimeout,
		ResponseHeaderTimeout: timeout,
		ExpectContinueTimeout: time.Second,
		IdleConnTimeout:       30 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	if allowInsecure {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // User-enabled setting for self-signed subscription endpoints.
	}
	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
	resp, err := client.Do(req)
	if err != nil {
		var netErr net.Error
		if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
			return nil, fmt.Errorf("превышено время ожидания (%s)", timeout.Round(time.Second))
		}
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmpPath := target + ".tmp"
	file, err := os.Create(tmpPath)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(file, resp.Body); err != nil {
		file.Close()
		_ = os.Remove(tmpPath)
		return nil, err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}

	if err := os.Rename(tmpPath, target); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	return resp.Header.Clone(), nil
}

func extractSingBoxPackage(zipPath, targetExe string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	targetDir := filepath.Dir(targetExe)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}

	foundExe := false
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		baseName := filepath.Base(f.Name)
		ext := strings.ToLower(filepath.Ext(baseName))
		// Extract sing-box.exe, libcronet.dll and any DLL or executable files
		if strings.EqualFold(baseName, singboxExeName) || ext == ".dll" || ext == ".exe" {
			rc, err := f.Open()
			if err != nil {
				return err
			}

			destPath := filepath.Join(targetDir, baseName)
			tmpPath := destPath + ".tmp"
			out, err := os.Create(tmpPath)
			if err != nil {
				rc.Close()
				return err
			}
			if _, err := io.Copy(out, rc); err != nil {
				out.Close()
				rc.Close()
				_ = os.Remove(tmpPath)
				return err
			}
			if err := out.Close(); err != nil {
				rc.Close()
				_ = os.Remove(tmpPath)
				return err
			}
			rc.Close()

			if err := os.Rename(tmpPath, destPath); err != nil {
				_ = os.Remove(tmpPath)
				return err
			}
			if strings.EqualFold(baseName, singboxExeName) {
				foundExe = true
			}
		}
	}

	if !foundExe {
		return errors.New("sing-box.exe не найден в архиве")
	}
	return nil
}
