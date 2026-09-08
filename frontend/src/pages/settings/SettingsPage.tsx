import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Clock,
  Sparkles,
  Check,
  Download,
  AlertTriangle,
  Palette,
  ExternalLink,
} from 'lucide-react';
import { AppState, StatePatch, Language, ThemeMode } from '../../types';
import { t } from '../../i18n';
import {
  PageHeader,
  SectionCard,
  Button,
  Input,
  Switch,
  ConfirmModal,
  Badge,
  useToast,
} from '../../shared/ui';

interface SettingsPageProps {
  state: AppState | null;
  onPatchState: (patch: StatePatch) => void;
  onUpdateApp: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  state,
  onPatchState,
  onUpdateApp,
}) => {
  const lang: Language = state?.language || 'ru';
  const toast = useToast();

  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);

  const colors = [
    { name: 'Gold', value: '#fdd75a' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Cyan', value: '#06b6d4' },
  ];

  return (
    <div className="main-view">
      <PageHeader
        icon={<Settings size={22} />}
        title={t(lang, 'settings.title')}
        description={t(lang, 'settings.subtitle')}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Automation */}
        <SectionCard
          icon={<Clock size={16} />}
          title={t(lang, 'settings.automationTitle')}
          subtitle={t(lang, 'settings.automationSubtitle')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Switch
              label={t(lang, 'settings.autoStartCore')}
              description={t(lang, 'settings.automationAutoStartDesc')}
              checked={state?.auto_start_core || false}
              onChange={(checked) => onPatchState({ auto_start_core: checked })}
            />

            <Switch
              label={t(lang, 'settings.startMinimized')}
              description={t(lang, 'settings.automationStartMinimizedDesc')}
              checked={state?.start_minimized_to_tray || false}
              onChange={(checked) => onPatchState({ start_minimized_to_tray: checked })}
            />

            <div style={{ maxWidth: '280px', marginTop: '4px' }}>
              <Input
                label={t(lang, 'settings.autoUpdateHours')}
                type="number"
                min={0}
                max={168}
                value={state?.auto_update_hours ?? 12}
                onChange={(e) => onPatchState({ auto_update_hours: parseInt(e.target.value) || 0 })}
                helperText={t(lang, 'settings.autoUpdateZeroHint')}
              />
            </div>
          </div>
        </SectionCard>

        {/* Security & Core */}
        <SectionCard
          icon={<Shield size={16} />}
          title={t(lang, 'settings.coreTitle')}
          subtitle={t(lang, 'settings.coreSubtitle')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Switch
              label={t(lang, 'settings.allowInsecure')}
              description={state?.allow_insecure ? t(lang, 'settings.allowInsecureWarn') : undefined}
              checked={state?.allow_insecure || false}
              onChange={(checked) => onPatchState({ allow_insecure: checked })}
            />

            {state?.allow_insecure && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: 'var(--danger)',
                  fontSize: '12px',
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{t(lang, 'settings.allowInsecureWarn')}</span>
              </div>
            )}

            {state?.proto_reg_warn && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  color: 'var(--warning)',
                  fontSize: '12px',
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{state.proto_reg_warn}</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Appearance & Accent Color */}
        <SectionCard
          icon={<Palette size={16} />}
          title={t(lang, 'settings.theme')}
          subtitle={t(lang, 'settings.appearanceSubtitle')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label className="ui-form-label">{t(lang, 'settings.theme')}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['dark', 'light', 'auto'] as ThemeMode[]).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={state?.theme_mode === mode ? 'primary' : 'secondary'}
                    onClick={() => onPatchState({ theme_mode: mode })}
                  >
                    {mode === 'dark'
                      ? t(lang, 'settings.themeDark')
                      : mode === 'light'
                      ? t(lang, 'settings.themeLight')
                      : t(lang, 'settings.themeAuto')}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="ui-form-label">{t(lang, 'settings.accentColor')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {colors.map((c) => {
                  const isSelected = (state?.accent_color || '#fdd75a').toLowerCase() === c.value.toLowerCase();
                  return (
                    <button
                      key={c.value}
                      className={`ui-color-swatch ${isSelected ? 'ui-color-swatch--selected' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => onPatchState({ accent_color: c.value })}
                      title={c.name}
                    >
                      {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                    </button>
                  );
                })}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card-subtle)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-main)',
                  }}
                  title={t(lang, 'settings.customColorTitle')}
                >
                  <input
                    type="color"
                    value={state?.accent_color || '#fdd75a'}
                    onChange={(e) => onPatchState({ accent_color: e.target.value })}
                    style={{
                      width: '20px',
                      height: '20px',
                      border: 'none',
                      padding: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                  <span>{t(lang, 'settings.customColor')}</span>
                </label>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onPatchState({ accent_color: '#fdd75a' })}
                >
                  {t(lang, 'settings.accentColorReset')}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* App Info and Update */}
        <SectionCard
          icon={<Sparkles size={16} />}
          title={t(lang, 'settings.appTitle')}
          subtitle={t(lang, 'settings.appSubtitle')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 700 }}>
                  singbox-wrapper {state?.app_release_tag || 'v26.9.1'}
                </span>
                {state?.app_update_available ? (
                  <Badge variant="warning" dot>
                    {t(lang, 'settings.updateAvailable')}
                  </Badge>
                ) : (
                  <Badge variant="outline" size="xs">
                    {t(lang, 'settings.upToDate')}
                  </Badge>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {state?.app_update_available ? (
                  <>
                    <span>{t(lang, 'settings.latestVersion')}:</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {state?.app_latest_release_tag}
                    </span>
                    <a
                      href={state?.app_latest_release_url || 'https://github.com/Adam-Sizzler/singbox-gui/releases'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        textDecoration: 'none',
                        marginLeft: '4px',
                        fontSize: '11.5px',
                      }}
                      title="GitHub Releases"
                    >
                      <span>GitHub</span>
                      <ExternalLink size={11} />
                    </a>
                  </>
                ) : (
                  <a
                    href="https://github.com/Adam-Sizzler/singbox-gui/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      textDecoration: 'none',
                    }}
                    title="GitHub Releases"
                  >
                    <span>GitHub Releases</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {state?.app_update_available && (
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Download size={14} />}
                disabled={state?.busy}
                onClick={() => setShowUpdateConfirm(true)}
              >
                {t(lang, 'settings.updateApp')}
              </Button>
            )}
          </div>
        </SectionCard>
      </div>

      <ConfirmModal
        isOpen={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        onConfirm={() => {
          setShowUpdateConfirm(false);
          onUpdateApp();
          toast.info(t(lang, 'settings.updateStarted'));
        }}
        title={t(lang, 'settings.updateApp')}
        message={t(lang, 'settings.updateConfirmMessage')}
        confirmLabel={t(lang, 'settings.updateApp')}
        cancelLabel={t(lang, 'common.cancel')}
        variant="primary"
      />
    </div>
  );
};
