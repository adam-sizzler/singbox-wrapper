package db

// EnsureInitialData seeds clean default values when starting fresh.
func (s *DBStore) EnsureInitialData() error {
	profiles, err := s.GetProfiles()
	if err != nil {
		return err
	}
	if len(profiles) > 0 {
		return nil
	}

	defaultName := "default"
	_ = s.SaveProfile(defaultName, "", "latest", true)
	_ = s.SetSetting("language", "ru")
	_ = s.SetSetting("theme_mode", "auto")
	_ = s.SetSetting("accent_color", "#fdd75a")
	_ = s.SetSetting("auto_update_hours", "0")
	_ = s.SetSetting("auto_start_core", "false")
	_ = s.SetSetting("start_minimized_to_tray", "false")
	_ = s.SetSetting("allow_insecure", "false")

	defaultConfig := `{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "127.0.0.1",
      "listen_port": 2080
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ]
}`
	_ = s.SaveProfileConfig(defaultName, defaultConfig)
	return nil
}

// MigrateFromLegacy is an alias to EnsureInitialData without legacy YAML/JSON logic.
func (s *DBStore) MigrateFromLegacy(_ string) error {
	return s.EnsureInitialData()
}
