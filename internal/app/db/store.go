package db

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaDDL string

// Profile represents a singbox configuration profile record.
type Profile struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Url       string    `json:"url"`
	Version   string    `json:"version"`
	IsActive  int64     `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DBStore manages SQLite connection pool and operations with standard database/sql.
type DBStore struct {
	db      *sql.DB
	writeMu sync.Mutex
}

// InitDB initializes SQLite database with WAL mode and anti-lock pragmas, embedding schema.sql.
func InitDB(dbPath string) (*DBStore, error) {
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}

	// Single connection pool ensures serialized operations, completely avoiding SQLITE_BUSY.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite db: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA cache_size = -2000;",
	}
	for _, pragma := range pragmas {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("exec %s: %w", pragma, err)
		}
	}

	if _, err := db.ExecContext(ctx, schemaDDL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}

	return &DBStore{
		db: db,
	}, nil
}

// Close closes the database connection.
func (s *DBStore) Close() error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.db.Close()
}

// DB returns the underlying sql.DB instance.
func (s *DBStore) DB() *sql.DB {
	return s.db
}

// GetSetting retrieves a setting value by key.
func (s *DBStore) GetSetting(key string) (string, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var val string
	err := s.db.QueryRowContext(ctx, "SELECT value FROM app_settings WHERE key = ? LIMIT 1", key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return val, true, nil
}

// SetSetting writes a setting key-value pair.
func (s *DBStore) SetSetting(key, value string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query, key, value)
	return err
}

// GetAllSettings returns all settings as a map.
func (s *DBStore) GetAllSettings() (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, "SELECT key, value FROM app_settings ORDER BY key ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		res[k] = v
	}
	return res, rows.Err()
}

// GetProfiles retrieves all profiles.
func (s *DBStore) GetProfiles() ([]Profile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := "SELECT id, name, url, version, is_active, created_at, updated_at FROM profiles ORDER BY id ASC"
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Url, &p.Version, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// SaveProfile creates or updates a profile record.
func (s *DBStore) SaveProfile(name, url, version string, isActive bool) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	activeInt := int64(0)
	if isActive {
		activeInt = 1
	}

	query := `
INSERT INTO profiles (name, url, version, is_active, updated_at)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(name) DO UPDATE SET
    url = excluded.url,
    version = excluded.version,
    is_active = excluded.is_active,
    updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query, name, url, version, activeInt)
	return err
}

// SetActiveProfile sets the active profile in a transaction.
func (s *DBStore) SetActiveProfile(name string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "UPDATE profiles SET is_active = 0"); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE name = ?", name); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteProfile removes a profile and its associated configs in a transaction.
func (s *DBStore) DeleteProfile(name string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "DELETE FROM profiles WHERE name = ?", name); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM profile_configs WHERE profile_name = ?", name); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM selector_selections WHERE profile_name = ?", name); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM selector_collapsed WHERE profile_name = ?", name); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM profile_subscriptions WHERE profile_name = ?", name); err != nil {
		return err
	}
	return tx.Commit()
}

// GetProfileConfig reads the JSON configuration for a profile.
func (s *DBStore) GetProfileConfig(profileName string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var cfg string
	err := s.db.QueryRowContext(ctx, "SELECT config_json FROM profile_configs WHERE profile_name = ? LIMIT 1", profileName).Scan(&cfg)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return cfg, nil
}

// SaveProfileConfig writes the JSON configuration for a profile.
func (s *DBStore) SaveProfileConfig(profileName, configJSON string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
INSERT INTO profile_configs (profile_name, config_json, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name) DO UPDATE SET
    config_json = excluded.config_json,
    updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query, profileName, configJSON)
	return err
}

// GetSelectorSelections returns saved selector selections for a profile.
func (s *DBStore) GetSelectorSelections(profileName string) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := "SELECT selector_tag, selected_tag FROM selector_selections WHERE profile_name = ? ORDER BY selector_tag ASC"
	rows, err := s.db.QueryContext(ctx, query, profileName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]string)
	for rows.Next() {
		var sel, opt string
		if err := rows.Scan(&sel, &opt); err != nil {
			return nil, err
		}
		res[sel] = opt
	}
	return res, rows.Err()
}

// SaveSelectorSelection saves a single selector selection.
func (s *DBStore) SaveSelectorSelection(profileName, selectorTag, selectedTag string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
INSERT INTO selector_selections (profile_name, selector_tag, selected_tag, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name, selector_tag) DO UPDATE SET
    selected_tag = excluded.selected_tag,
    updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query, profileName, selectorTag, selectedTag)
	return err
}

// SaveSelectorSelections bulk updates selector selections for a profile.
func (s *DBStore) SaveSelectorSelections(profileName string, selections map[string]string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
INSERT INTO selector_selections (profile_name, selector_tag, selected_tag, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name, selector_tag) DO UPDATE SET
    selected_tag = excluded.selected_tag,
    updated_at = CURRENT_TIMESTAMP;`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for sel, opt := range selections {
		selTrimmed := strings.TrimSpace(sel)
		optTrimmed := strings.TrimSpace(opt)
		if selTrimmed == "" || optTrimmed == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, profileName, selTrimmed, optTrimmed); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetSelectorCollapsed returns collapsed groups map for a profile.
func (s *DBStore) GetSelectorCollapsed(profileName string) (map[string]bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, "SELECT selector_tag, is_collapsed FROM selector_collapsed WHERE profile_name = ?", profileName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]bool)
	for rows.Next() {
		var sel string
		var isCol int64
		if err := rows.Scan(&sel, &isCol); err != nil {
			return nil, err
		}
		res[sel] = isCol == 1
	}
	return res, rows.Err()
}

// SaveSelectorCollapsed saves collapsed groups map for a profile.
func (s *DBStore) SaveSelectorCollapsed(profileName string, collapsed map[string]bool) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, "DELETE FROM selector_collapsed WHERE profile_name = ?", profileName); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
INSERT INTO selector_collapsed (profile_name, selector_tag, is_collapsed, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name, selector_tag) DO UPDATE SET
    is_collapsed = excluded.is_collapsed,
    updated_at = CURRENT_TIMESTAMP;`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for sel, isCol := range collapsed {
		if !isCol {
			continue
		}
		if _, err := stmt.ExecContext(ctx, profileName, sel, 1); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetOutboundDelays returns saved outbound ping delays for a profile.
func (s *DBStore) GetOutboundDelays(profileName string) (map[string]int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, "SELECT outbound_tag, delay_ms FROM outbound_delays WHERE profile_name = ?", profileName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]int)
	for rows.Next() {
		var tag string
		var delay int
		if err := rows.Scan(&tag, &delay); err != nil {
			return nil, err
		}
		res[tag] = delay
	}
	return res, rows.Err()
}

// SaveOutboundDelay saves ping delay for an outbound.
func (s *DBStore) SaveOutboundDelay(profileName, outboundTag string, delayMs int) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
INSERT INTO outbound_delays (profile_name, outbound_tag, delay_ms, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name, outbound_tag) DO UPDATE SET
    delay_ms = excluded.delay_ms,
    updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query, profileName, outboundTag, delayMs)
	return err
}

// SubscriptionRecord holds cached subscription metadata for a profile.
type SubscriptionRecord struct {
	ProfileName    string `json:"profile_name"`
	Title          string `json:"title"`
	Announce       string `json:"announce"`
	WebPageURL     string `json:"web_page_url"`
	SupportURL     string `json:"support_url"`
	UpdateInterval int    `json:"update_interval"`
	Upload         int64  `json:"upload"`
	Download       int64  `json:"download"`
	Total          int64  `json:"total"`
	Expire         int64  `json:"expire"`
	RefillDate     int64  `json:"refill_date"`
	LastUpdated    int64  `json:"last_updated"`
	FileName       string `json:"filename"`
}

// GetProfileSubscription loads cached subscription info for a profile.
func (s *DBStore) GetProfileSubscription(profileName string) (*SubscriptionRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
SELECT profile_name, title, announce, web_page_url, support_url, update_interval,
       upload, download, total, expire, refill_date, last_updated, filename
FROM profile_subscriptions WHERE profile_name = ? LIMIT 1`
	var r SubscriptionRecord
	err := s.db.QueryRowContext(ctx, query, profileName).Scan(
		&r.ProfileName, &r.Title, &r.Announce, &r.WebPageURL, &r.SupportURL, &r.UpdateInterval,
		&r.Upload, &r.Download, &r.Total, &r.Expire, &r.RefillDate, &r.LastUpdated, &r.FileName,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// SaveProfileSubscription saves or updates subscription metadata for a profile.
func (s *DBStore) SaveProfileSubscription(profileName string, r SubscriptionRecord) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	query := `
INSERT INTO profile_subscriptions (
    profile_name, title, announce, web_page_url, support_url, update_interval,
    upload, download, total, expire, refill_date, last_updated, filename, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(profile_name) DO UPDATE SET
    title = excluded.title,
    announce = excluded.announce,
    web_page_url = excluded.web_page_url,
    support_url = excluded.support_url,
    update_interval = excluded.update_interval,
    upload = excluded.upload,
    download = excluded.download,
    total = excluded.total,
    expire = excluded.expire,
    refill_date = excluded.refill_date,
    last_updated = excluded.last_updated,
    filename = excluded.filename,
    updated_at = CURRENT_TIMESTAMP;`
	_, err := s.db.ExecContext(ctx, query,
		profileName, r.Title, r.Announce, r.WebPageURL, r.SupportURL, r.UpdateInterval,
		r.Upload, r.Download, r.Total, r.Expire, r.RefillDate, r.LastUpdated, r.FileName,
	)
	return err
}
