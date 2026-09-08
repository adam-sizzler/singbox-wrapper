import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { AppState, TrafficState, LogEntry, StatePatch, Language, ThemeMode } from './types';
import { api } from './api';
import i18n, { t, I18nextProvider } from './i18n';
import { ToastProvider, useToast, Button, Burger } from './shared/ui';
import { SidebarProvider, useSidebar } from './shared/context/SidebarContext';
import { Sidebar } from './widgets/sidebar/Sidebar';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { OutboundsPage } from './pages/outbounds/OutboundsPage';
import { ProfilesPage } from './pages/profiles/ProfilesPage';
import { ConfigEditorPage } from './pages/config-editor/ConfigEditorPage';
import { LogsPage } from './pages/logs/LogsPage';
import { SettingsPage } from './pages/settings/SettingsPage';

interface ErrorBoundaryProps {
  children: ReactNode;
  tabName: string;
  lang?: Language;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Error in tab ${this.props.tabName}:`, error, errorInfo);
  }

  render() {
    const lang = this.props.lang || 'ru';
    if (this.state.hasError) {
      return (
        <div className="main-view" style={{ padding: '32px', color: 'var(--text-main)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--danger)', marginBottom: '12px' }}>
            {t(lang, 'app.errorTitle')}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            {this.state.error?.message || t(lang, 'app.errorDefault')}
          </p>
          <Button
            variant="secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {t(lang, 'app.errorRetry')}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const toast = useToast();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [state, setState] = useState<AppState | null>(null);
  const [traffic, setTraffic] = useState<TrafficState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastLogId, setLastLogId] = useState(0);

  // Fetch full state
  const refreshState = async () => {
    try {
      const s = await api.getState();
      setState(s);
    } catch (e) {
      console.error('Failed to fetch state:', e);
    }
  };

  // Poll state and traffic regularly ONLY when window is active/visible
  useEffect(() => {
    refreshState();

    const poll = async () => {
      if (document.hidden || document.visibilityState === 'hidden') return;
      try {
        const [s, tr] = await Promise.all([
          api.getState(),
          api.getTraffic().catch(() => null),
        ]);
        setState(s);
        if (tr) setTraffic(tr);
      } catch (e) {
        // ignore network hiccups
      }
    };

    const timer = setInterval(poll, 1000);

    const handleVisibility = () => {
      if (!document.hidden && document.visibilityState === 'visible') {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Auto-refresh subscription info on initial load if URL exists and subscription is not fetched yet
  const autoRefreshedRef = useRef(false);
  useEffect(() => {
    if (state?.url && !state?.subscription && !autoRefreshedRef.current && !state?.busy) {
      autoRefreshedRef.current = true;
      api.refreshConfig().then((next) => {
        if (next) setState(next);
      }).catch(() => {});
    }
  }, [state?.url, state?.subscription, state?.busy]);

  // Poll logs periodically ONLY when window is active AND user is on logs tab
  useEffect(() => {
    if (currentTab !== 'logs') return;

    const pollLogs = async () => {
      if (document.hidden || document.visibilityState === 'hidden') return;
      try {
        const res = await api.getLogs(lastLogId);
        if (res?.entries?.length) {
          setLogs((prev) => [...prev, ...res.entries].slice(-2000));
          setLastLogId(res.last_id);
        }
      } catch (e) {
        // ignore
      }
    };

    pollLogs();
    const logsTimer = setInterval(pollLogs, 1500);

    const handleVisibility = () => {
      if (!document.hidden && document.visibilityState === 'visible') {
        pollLogs();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(logsTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [lastLogId, currentTab]);

  // Apply Theme and Accent Color to document
  useEffect(() => {
    if (!state) return;

    // Theme mode
    const isDark = state.theme_dark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Accent color
    if (state.accent_color) {
      document.documentElement.style.setProperty('--accent', state.accent_color);
      document.documentElement.style.setProperty('--accent-glow', `${state.accent_color}40`);
    }
  }, [state?.theme_dark, state?.accent_color]);

  // Synchronize i18next language with app state
  useEffect(() => {
    if (state?.language && i18n.language !== state.language) {
      i18n.changeLanguage(state.language);
    }
  }, [state?.language]);

  // Handlers
  const handleToggleStartStop = async () => {
    try {
      const next = await api.toggleStartStop();
      setState(next);
      if (next.running) {
        toast.success(t(state?.language || 'ru', 'app.coreConnected'));
      } else {
        toast.info(t(state?.language || 'ru', 'app.coreDisconnected'));
      }
    } catch (e: any) {
      toast.error(e.message || String(e), 'Start/Stop Error');
    }
  };

  const handleRefreshConfig = async () => {
    try {
      const next = await api.refreshConfig();
      setState(next);
      toast.success(t(state?.language || 'ru', 'app.configUpdated'));
    } catch (e: any) {
      toast.error(e.message || String(e), 'Update Error');
    }
  };

  const handleSelectProfile = async (name: string) => {
    try {
      const next = await api.patchState({ current_profile: name });
      setState(next);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleCreateProfile = async (name: string) => {
    try {
      const next = await api.createProfile(name);
      setState(next);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleDeleteProfile = async (name: string) => {
    try {
      const next = await api.deleteProfile(name);
      setState(next);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleSaveProfileDetails = async (url: string, version: string) => {
    try {
      const next = await api.patchState({ url, version });
      setState(next);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleSelectOutbound = async (selector: string, outbound: string) => {
    try {
      const next = await api.selectOutbound(selector, outbound);
      setState(next);
      toast.info(t(state?.language || 'ru', 'app.outboundSelected', { selector, outbound }));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || String(e));
    }
  };

  const handleCheckAllDelays = async (selector: string) => {
    try {
      await api.checkAllDelays(selector);
      await refreshState();
      toast.success(t(state?.language || 'ru', 'app.pingTested', { selector }));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || String(e));
    }
  };

  const handleCheckSingleDelay = async (selector: string, outbound: string) => {
    try {
      await api.checkDelay(selector, outbound);
      await refreshState();
    } catch (e: any) {
      console.error(e);
    }
  };

  const handlePatchState = async (patch: StatePatch) => {
    try {
      const next = await api.patchState(patch);
      setState(next);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleCopyLogs = async () => {
    try {
      await api.copyLogs();
    } catch {
      const text = logs.map((l) => `[${l.time}] [${l.level}] ${l.text}`).join('\n');
      navigator.clipboard.writeText(text);
    }
  };

  const handleUpdateApp = async () => {
    try {
      await api.updateApp();
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleRestartCore = async () => {
    try {
      await api.restartCore();
      toast.info(t(state?.language || 'ru', 'dashboard.restartingCore'));
      refreshState();
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  };

  const handleToggleTheme = () => {
    if (!state) return;
    const current = state.theme_mode || 'auto';
    let nextMode: ThemeMode = 'auto';
    if (current === 'auto') nextMode = 'light';
    else if (current === 'light') nextMode = 'dark';
    else nextMode = 'auto';
    handlePatchState({ theme_mode: nextMode });
  };

  const handleSelectAccent = (color: string) => {
    handlePatchState({ accent_color: color });
  };

  const handleToggleLang = () => {
    if (!state) return;
    const nextLang: Language = state.language === 'ru' ? 'en' : 'ru';
    handlePatchState({ language: nextLang });
  };

  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <div className={`app-container ${isCollapsed ? 'app-container--collapsed' : ''}`}>
      {/* Floating Burger Toggle Button */}
      <Burger
        opened={!isCollapsed}
        onClick={toggleSidebar}
        className="app-floating-burger"
      />

      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        state={state}
        onToggleTheme={handleToggleTheme}
        onToggleLang={handleToggleLang}
        onSelectAccent={handleSelectAccent}
      />

      {currentTab === 'dashboard' && (
        <ErrorBoundary tabName="dashboard" lang={state?.language}>
          <DashboardPage
            state={state}
            traffic={traffic}
            onToggleStartStop={handleToggleStartStop}
            onRefreshProfile={handleRefreshConfig}
            onRestartCore={handleRestartCore}
            onTabChange={setCurrentTab}
          />
        </ErrorBoundary>
      )}

      {currentTab === 'outbounds' && (
        <ErrorBoundary tabName="outbounds" lang={state?.language}>
          <OutboundsPage
            state={state}
            onSelectOutbound={handleSelectOutbound}
            onCheckAllDelays={handleCheckAllDelays}
            onCheckSingleDelay={handleCheckSingleDelay}
          />
        </ErrorBoundary>
      )}

      {currentTab === 'profiles' && (
        <ErrorBoundary tabName="profiles" lang={state?.language}>
          <ProfilesPage
            state={state}
            onSelectProfile={handleSelectProfile}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
            onSaveProfileDetails={handleSaveProfileDetails}
            onRefreshProfile={handleRefreshConfig}
          />
        </ErrorBoundary>
      )}

      {currentTab === 'config' && (
        <ErrorBoundary tabName="config" lang={state?.language}>
          <ConfigEditorPage state={state} onSelectProfile={handleSelectProfile} />
        </ErrorBoundary>
      )}

      {currentTab === 'logs' && (
        <ErrorBoundary tabName="logs" lang={state?.language}>
          <LogsPage
            logs={logs}
            lang={state?.language || 'ru'}
            onClearLogs={handleClearLogs}
            onCopyLogs={handleCopyLogs}
          />
        </ErrorBoundary>
      )}

      {currentTab === 'settings' && (
        <ErrorBoundary tabName="settings" lang={state?.language}>
          <SettingsPage
            state={state}
            onPatchState={handlePatchState}
            onUpdateApp={handleUpdateApp}
          />
        </ErrorBoundary>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <SidebarProvider>
          <AppContent />
        </SidebarProvider>
      </ToastProvider>
    </I18nextProvider>
  );
};

export default App;
