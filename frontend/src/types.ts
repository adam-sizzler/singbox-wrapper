export type Language = 'ru' | 'en';
export type ThemeMode = 'dark' | 'light' | 'auto';

export interface SubscriptionInfo {
  title?: string;
  announce?: string;
  web_page_url?: string;
  support_url?: string;
  update_interval?: number;
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
  refill_date?: number;
  last_updated?: number;
  filename?: string;
}

export interface ConfigProfile {
  name: string;
  url: string;
  version: string;
  selector_selections?: Record<string, string>;
  selector_collapsed_groups?: Record<string, boolean>;
  subscription?: SubscriptionInfo;
}

export interface SelectorOptionDelay {
  delay: number;
  error?: string;
  checked_at?: number;
}

export interface SelectorOptionState {
  name: string;
  type?: string;
  delay_ms: number; // 0 = untested, negative = error/timeout
  active?: boolean;
}

export interface SelectorGroupState {
  name: string;
  type?: string;
  current: string;
  options: (string | SelectorOptionState)[];
  can_switch?: boolean;
  option_delays?: Record<string, SelectorOptionDelay>;
  // Fallbacks for compatibility:
  tag?: string;
  selected?: string;
}

export interface OutboundInfo {
  tag: string;
  type: string;
  server?: string;
  server_port?: number;
}

export interface AppState {
  current_profile: string;
  profiles: ConfigProfile[];
  language: Language;
  theme_mode: ThemeMode;
  theme_dark: boolean;
  accent_color: string;
  hwid: string;
  url: string;
  version: string;
  selector_groups: SelectorGroupState[];
  selector_collapsed_groups: Record<string, boolean>;
  outbounds?: Record<string, OutboundInfo>;
  auto_update_hours: number;
  auto_start_core: boolean;
  start_minimized_to_tray: boolean;
  ui_scale: number;
  uptime_seconds: number;
  running: boolean;
  busy: boolean;
  allow_insecure: boolean;
  proto_reg_warn: string;
  app_release_tag: string;
  app_release_url: string;
  app_update_available: boolean;
  app_latest_release_tag: string;
  app_latest_release_url: string;
  app_update_progress: number;
  subscription?: SubscriptionInfo;
}

export interface StatePatch {
  current_profile?: string;
  language?: Language;
  theme_mode?: ThemeMode;
  accent_color?: string;
  url?: string;
  version?: string;
  auto_update_hours?: number;
  auto_start_core?: boolean;
  start_minimized_to_tray?: boolean;
  allow_insecure?: boolean;
  selector_collapsed_groups?: Record<string, boolean>;
}

export interface TrafficState {
  available: boolean;
  upload_speed: number;
  download_speed: number;
  upload_total: number;
  download_total: number;
  updated_at: number;
  error?: string;
}

export interface LogEntry {
  id: number;
  text: string;
  time?: string;
  level?: string;
}

export interface LogsResponse {
  entries: LogEntry[];
  last_id: number;
}
