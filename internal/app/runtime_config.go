//go:build windows

package app

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func runtimeConfigFileNameForProfile(rawProfileName string) string {
	base := sanitizeRuntimeConfigBaseName(rawProfileName)
	if base == "" {
		base = "profile-1"
	}
	return base + ".json"
}

func sanitizeRuntimeConfigBaseName(raw string) string {
	name := sanitizeProfileName(raw)
	if name == "" {
		return ""
	}

	var b strings.Builder
	for _, r := range name {
		switch {
		case r < 32:
			b.WriteRune('-')
		case strings.ContainsRune(`<>:"/\|?*`, r):
			b.WriteRune('-')
		default:
			b.WriteRune(r)
		}
	}

	normalized := strings.TrimSpace(strings.Join(strings.Fields(b.String()), " "))
	normalized = strings.Trim(normalized, ". ")
	if normalized == "" {
		return ""
	}

	if len(normalized) > 96 {
		normalized = strings.TrimSpace(normalized[:96])
		normalized = strings.TrimRight(normalized, ". ")
	}
	if normalized == "" {
		return ""
	}

	if isReservedWindowsFileBaseName(strings.ToLower(normalized)) {
		normalized += "-profile"
	}

	return normalized
}

func isReservedWindowsFileBaseName(lower string) bool {
	switch lower {
	case "con", "prn", "aux", "nul",
		"com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
		"lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9":
		return true
	default:
		return false
	}
}

func (a *App) singBoxDir() string {
	dir := filepath.Join(a.workDir, "singbox")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func (a *App) runtimeConfigPathForProfile(profileName string) string {
	dir := a.singBoxDir()
	name := runtimeConfigFileNameForProfile(profileName)
	target := filepath.Join(dir, name)

	// Migrate if existing profile config is currently in root workDir
	if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
		oldPath := filepath.Join(a.workDir, name)
		if _, oldErr := os.Stat(oldPath); oldErr == nil {
			if b, readErr := os.ReadFile(oldPath); readErr == nil {
				_ = os.WriteFile(target, b, 0o644)
			}
		}
	}
	return target
}
