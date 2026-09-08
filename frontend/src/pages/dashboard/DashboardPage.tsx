import React from 'react';
import {
  Power,
  ArrowDown,
  ArrowUp,
  Activity,
  Zap,
  RefreshCw,
  Globe,
  ChevronRight,
} from 'lucide-react';
import { AppState, TrafficState, Language } from '../../types';
import { t } from '../../i18n';
import { formatBytes, formatSpeed, formatUptime } from '../../api';
import { PageHeader, Card, MetricCard } from '../../shared/ui';
import { detectNodeFlag, NodeFlag } from '../../shared/utils/emoji-flags';

interface DashboardPageProps {
  state: AppState | null;
  traffic: TrafficState | null;
  onToggleStartStop: () => void;
  onRefreshProfile?: () => void;
  onRestartCore?: () => void;
  onTabChange?: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  state,
  traffic,
  onToggleStartStop,
  onRefreshProfile,
  onTabChange,
}) => {
  const lang: Language = state?.language || 'ru';
  const isRunning = state?.running || false;
  const isBusy = state?.busy || false;

  // Find active selector group and determine active node
  const groups = state?.selector_groups || [];
  const primarySelector = groups.find((g) => g.type === 'Selector' || g.can_switch) || groups[0];
  const primaryCurrent = primarySelector?.current || (isRunning ? 'Auto' : '—');

  // Check if current selection is an Auto / URLTest group
  const autoGroup = groups.find(
    (g) =>
      g.name.toLowerCase() === primaryCurrent.toLowerCase() ||
      g.type?.toLowerCase() === 'urltest' ||
      g.name.toLowerCase().includes('auto')
  );

  const isAutoMode =
    primaryCurrent.toLowerCase().includes('auto') ||
    (autoGroup && primaryCurrent.toLowerCase() === autoGroup.name.toLowerCase());

  const resolvedTargetNode =
    isAutoMode && autoGroup?.current ? autoGroup.current : primaryCurrent;

  const nodeFlag = detectNodeFlag(resolvedTargetNode);

  const downloadSpeed = traffic?.download_speed || 0;
  const uploadSpeed = traffic?.upload_speed || 0;

  // Subscription metadata
  const sub =
    state?.subscription ||
    state?.profiles?.find((p) => p.name === state?.current_profile)?.subscription;
  const hasSub = Boolean(sub && (sub.total || sub.expire || sub.title || sub.announce));

  const totalBytes = sub?.total || 0;
  const usedBytes = (sub?.download || 0) + (sub?.upload || 0);
  const remainingBytes = Math.max(0, totalBytes - usedBytes);
  const usedPercent =
    totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;

  const daysRemaining = sub?.expire
    ? Math.max(0, Math.ceil((sub.expire * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const expireDateStr = sub?.expire
    ? new Date(sub.expire * 1000).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    : null;

  const refillDateStr = sub?.refill_date
    ? new Date(sub.refill_date * 1000).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    : null;

  const supportUrl = sub?.support_url || sub?.web_page_url;

  return (
    <div className="main-view">
      <PageHeader
        icon={<Activity size={22} />}
        title={t(lang, 'dashboard.title')}
        description={
          isRunning
            ? `${t(lang, 'dashboard.uptime')}: ${formatUptime(state?.uptime_seconds || 0)}`
            : t(lang, 'dashboard.disconnected')
        }
        actions={
          (sub?.title || state?.current_profile || sub?.announce) ? (
            <div className="dashboard-header-sub">
              <div className="dashboard-header-sub__title-row">
                <span className="dashboard-header-sub__title">
                  {sub?.title || state?.current_profile}
                </span>
                {onRefreshProfile && (
                  <button
                    type="button"
                    className={`dashboard-header-sub__refresh ${isBusy ? 'spin' : ''}`}
                    onClick={onRefreshProfile}
                    disabled={isBusy}
                    title={t(lang, 'profiles.updateProfile')}
                  >
                    <RefreshCw size={13} />
                  </button>
                )}
              </div>
              {sub?.announce && (
                <div className="dashboard-header-sub__announce" title={sub.announce}>
                  {sub.announce}
                </div>
              )}
            </div>
          ) : null
        }
      />

      {/* Hero Connect Card */}
      <Card className="hero-connect-card">
        <div className="power-btn-wrapper">
          {isRunning && (
            <svg className="power-btn-ring-svg" viewBox="0 0 132 132" aria-hidden="true">
              <circle cx="66" cy="66" r="62" fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          )}
          <button
            className={`power-btn ${isRunning ? 'active' : ''} ${isBusy ? 'busy' : ''}`}
            onClick={onToggleStartStop}
            disabled={isBusy}
            title={isRunning ? t(lang, 'dashboard.stop') : t(lang, 'dashboard.start')}
          >
            <Power size={46} strokeWidth={2.4} />
          </button>
        </div>

        {/* Clickable Active Node Pill */}
        <button
          type="button"
          className="dashboard-node-pill"
          onClick={() => onTabChange?.('outbounds')}
          title={t(lang, 'outbounds.title')}
        >
          <Zap size={14} fill="currentColor" style={{ color: isAutoMode ? 'var(--warning)' : 'var(--accent)' }} />
          {isAutoMode && <span className="dashboard-node-pill__auto">Auto →</span>}
          <NodeFlag flagInfo={nodeFlag} style={{ marginRight: '4px' }} />
          <span className="dashboard-node-pill__name">{nodeFlag.cleanName}</span>
          <ChevronRight size={14} style={{ opacity: 0.6, marginLeft: '2px' }} />
        </button>
      </Card>

      {/* Compact Traffic Metrics */}
      <div className="traffic-grid traffic-grid--compact">
        <MetricCard
          icon={<ArrowDown size={16} />}
          label={t(lang, 'dashboard.downloadSpeed')}
          value={formatSpeed(downloadSpeed)}
          subValue={`${t(lang, 'dashboard.downloadTotal')}: ${formatBytes(traffic?.download_total || 0)}`}
          accentColor="var(--success)"
        />
        <MetricCard
          icon={<ArrowUp size={16} />}
          label={t(lang, 'dashboard.uploadSpeed')}
          value={formatSpeed(uploadSpeed)}
          subValue={`${t(lang, 'dashboard.uploadTotal')}: ${formatBytes(traffic?.upload_total || 0)}`}
          accentColor="var(--info)"
        />
      </div>

      {/* Exodus Subscription Stats Card (Moved BELOW traffic, ABOVE support) */}
      {hasSub && (
        <Card className="dashboard-exodus-card">
          <div className="dashboard-exodus-stats-grid">
            <div className="dashboard-exodus-stat-item">
              <span className="dashboard-exodus-stat-label">{t(lang, 'dashboard.trafficRemaining')}</span>
              <span className="dashboard-exodus-stat-value">
                {totalBytes > 0 ? formatBytes(remainingBytes) : '—'}
              </span>
            </div>
            <div className="dashboard-exodus-stat-divider" />
            <div className="dashboard-exodus-stat-item">
              <span className="dashboard-exodus-stat-label">{t(lang, 'dashboard.daysRemaining')}</span>
              <span className="dashboard-exodus-stat-value">
                {daysRemaining !== null ? daysRemaining : '—'}
              </span>
            </div>
            <div className="dashboard-exodus-stat-divider" />
            <div className="dashboard-exodus-stat-item">
              <span className="dashboard-exodus-stat-label">{t(lang, 'dashboard.expires')}</span>
              <span className="dashboard-exodus-stat-value">
                {expireDateStr || '—'}
              </span>
            </div>
          </div>

          {totalBytes > 0 && (
            <div className="dashboard-sub-progress-wrap">
              <div className="dashboard-sub-progress-labels">
                <span className="dashboard-sub-progress-used">
                  {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
                </span>
                <span className="dashboard-sub-progress-percent">{usedPercent}%</span>
              </div>
              <div className="dashboard-progress-bar-bg">
                <div
                  className="dashboard-progress-bar-fill"
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <div className="dashboard-card-meta">
                {refillDateStr && (
                  <span>
                    {t(lang, 'dashboard.nextRefill')}: {refillDateStr}
                  </span>
                )}
                <span>
                  {t(lang, 'dashboard.updateInterval')}:{' '}
                  {sub?.update_interval
                    ? `${sub.update_interval}${t(lang, 'dashboard.hoursShort')}`
                    : `12${t(lang, 'dashboard.hoursShort')}`}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Footer Support Link */}
      <div className="dashboard-support-wrap">
        <a
          href={supportUrl || state?.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-support-link"
          onClick={(e) => {
            const url = supportUrl || state?.url;
            if (!url) {
              e.preventDefault();
            }
          }}
        >
          <Globe size={14} />
          <span>{t(lang, 'dashboard.support')}</span>
        </a>
      </div>
    </div>
  );
};
