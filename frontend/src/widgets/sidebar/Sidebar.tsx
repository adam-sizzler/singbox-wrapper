import React, { useRef } from 'react';
import {
  Activity,
  Radio,
  Layers,
  FileCode2,
  Terminal,
  Settings,
  Sun,
  Moon,
  Monitor,
  Palette,
  Box,
} from 'lucide-react';
import { AppState, Language } from '../../types';
import { t } from '../../i18n';
import { formatUptime } from '../../api';
import { useSidebar } from '../../shared/context/SidebarContext';

export interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  state: AppState | null;
  onToggleTheme: () => void;
  onToggleLang: () => void;
  onSelectAccent?: (color: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  state,
  onToggleTheme,
  onToggleLang,
  onSelectAccent,
}) => {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const lang: Language = state?.language || 'ru';
  const isRunning = state?.running || false;
  const isBusy = state?.busy || false;
  const colorInputRef = useRef<HTMLInputElement>(null);

  const themeMode = state?.theme_mode || 'auto';

  const themeTitle =
    themeMode === 'auto'
      ? t(lang, 'sidebar.themeAuto')
      : themeMode === 'light'
      ? t(lang, 'sidebar.themeLight')
      : t(lang, 'sidebar.themeDark');

  const hasUpdate = Boolean(state?.app_update_available);

  const navItems = [
    { id: 'dashboard', label: t(lang, 'sidebar.dashboard'), icon: <Activity size={16} /> },
    { id: 'outbounds', label: t(lang, 'sidebar.outbounds'), icon: <Radio size={16} /> },
    { id: 'profiles', label: t(lang, 'sidebar.profiles'), icon: <Layers size={16} /> },
    { id: 'config', label: t(lang, 'sidebar.config'), icon: <FileCode2 size={16} /> },
    { id: 'logs', label: t(lang, 'sidebar.logs'), icon: <Terminal size={16} /> },
    {
      id: 'settings',
      label: t(lang, 'sidebar.settings'),
      icon: <Settings size={16} />,
      hasBadge: hasUpdate,
    },
  ];

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Box size={18} />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-title">singbox</span>
          <span className="sidebar-brand-sub">wrapper</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {item.hasBadge && (
                <span
                  className="status-dot active"
                  title={t(lang, 'settings.updateAvailable')}
                  style={{
                    width: '7px',
                    height: '7px',
                    marginRight: '6px',
                    flexShrink: 0,
                  }}
                />
              )}
              {isActive && <span className="nav-item-indicator" />}
            </button>
          );
        })}
      </nav>

      {/* Footer Area with Core Status and Controls */}
      <div className="sidebar-footer">
        <div className="core-status-card">
          <div className="core-status-header">
            <div className="core-status-label">
              <span
                className={`status-dot ${isBusy ? 'busy' : isRunning ? 'active' : ''}`}
              />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>sing-box</span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isRunning ? 'var(--accent)' : 'var(--text-dim)',
                letterSpacing: '0.3px',
              }}
            >
              {isBusy ? 'BUSY' : isRunning ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          {isRunning && (
            <div className="core-uptime">
              {formatUptime(state?.uptime_seconds || 0)}
            </div>
          )}
        </div>

        <div className="sidebar-controls">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={themeTitle}
            aria-label="Toggle Theme"
          >
            {themeMode === 'auto' ? (
              <Monitor size={14} />
            ) : themeMode === 'light' ? (
              <Sun size={14} />
            ) : (
              <Moon size={14} />
            )}
          </button>

          {/* Custom Accent Color Picker */}
          <button
            className="icon-btn"
            onClick={() => colorInputRef.current?.click()}
            title={t(lang, 'sidebar.accentColorPicker')}
            aria-label="Choose Accent Color"
            style={{ position: 'relative' }}
          >
            <Palette size={14} style={{ color: state?.accent_color || 'var(--accent)' }} />
            <input
              ref={colorInputRef}
              type="color"
              value={state?.accent_color || '#fdd75a'}
              onChange={(e) => onSelectAccent && onSelectAccent(e.target.value)}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            />
          </button>

          <button
            className="icon-btn lang-btn"
            onClick={onToggleLang}
            title="Switch Language"
            aria-label="Toggle Language"
          >
            {lang.toUpperCase()}
          </button>
        </div>
      </div>
    </aside>
  );
};
