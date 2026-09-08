CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT 'latest',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_configs (
    profile_name TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS selector_selections (
    profile_name TEXT NOT NULL,
    selector_tag TEXT NOT NULL,
    selected_tag TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_name, selector_tag)
);

CREATE TABLE IF NOT EXISTS selector_collapsed (
    profile_name TEXT NOT NULL,
    selector_tag TEXT NOT NULL,
    is_collapsed INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_name, selector_tag)
);

CREATE TABLE IF NOT EXISTS outbound_delays (
    profile_name TEXT NOT NULL,
    outbound_tag TEXT NOT NULL,
    delay_ms INTEGER NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_name, outbound_tag)
);

CREATE TABLE IF NOT EXISTS profile_subscriptions (
    profile_name TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    announce TEXT NOT NULL DEFAULT '',
    web_page_url TEXT NOT NULL DEFAULT '',
    support_url TEXT NOT NULL DEFAULT '',
    update_interval INTEGER NOT NULL DEFAULT 12,
    upload INTEGER NOT NULL DEFAULT 0,
    download INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    expire INTEGER NOT NULL DEFAULT 0,
    refill_date INTEGER NOT NULL DEFAULT 0,
    last_updated INTEGER NOT NULL DEFAULT 0,
    filename TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
