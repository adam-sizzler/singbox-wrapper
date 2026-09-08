import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Globe,
  Layers,
  Save,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { AppState, ConfigProfile, Language } from '../../types';
import { t } from '../../i18n';
import { formatBytes } from '../../api';
import {
  PageHeader,
  Card,
  SectionCard,
  Button,
  Badge,
  Input,
  Modal,
  ConfirmModal,
  useToast,
} from '../../shared/ui';

interface ProfilesPageProps {
  state: AppState | null;
  onSelectProfile: (name: string) => void;
  onCreateProfile: (name: string) => void;
  onDeleteProfile: (name: string) => void;
  onSaveProfileDetails: (url: string, version: string) => void;
  onRefreshProfile?: () => void;
}

function formatLastUpdated(timestamp: number, lang: Language): string {
  if (!timestamp) return '—';
  const diffSec = Math.floor(Date.now() / 1000 - timestamp);
  if (diffSec < 60) {
    return t(lang, 'dashboard.justNow');
  }
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return lang === 'ru' ? `${mins} мин. назад` : `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return lang === 'ru' ? `${hours} ч. назад` : `${hours}h ago`;
  }
  return new Date(timestamp * 1000).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ProfilesPage: React.FC<ProfilesPageProps> = ({
  state,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onSaveProfileDetails,
  onRefreshProfile,
}) => {
  const lang: Language = state?.language || 'ru';
  const toast = useToast();

  const profiles = state?.profiles || [];
  const currentProfile = state?.current_profile || 'default';

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Active profile editor fields
  const activeProf = profiles.find((p) => p.name === currentProfile) || profiles[0];
  const [urlInput, setUrlInput] = useState(activeProf?.url || '');
  const [versionInput, setVersionInput] = useState(activeProf?.version || 'latest');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (activeProf) {
      setUrlInput(activeProf.url || '');
      setVersionInput(activeProf.version || 'latest');
      setIsDirty(false);
    }
  }, [activeProf]);

  const handleSelect = (p: ConfigProfile) => {
    onSelectProfile(p.name);
    setUrlInput(p.url || '');
    setVersionInput(p.version || 'latest');
    setIsDirty(false);
    toast.info(`${t(lang, 'dashboard.switchProfile')}: ${p.name}`);
  };

  const handleSave = () => {
    onSaveProfileDetails(urlInput, versionInput);
    setIsDirty(false);
    toast.success(t(lang, 'common.save'));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      toast.warning(t(lang, 'profiles.enterProfileName'));
      return;
    }
    if (profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(t(lang, 'profiles.profileAlreadyExists'));
      return;
    }

    onCreateProfile(trimmed);
    setNewProfileName('');
    setShowCreateModal(false);
    toast.success(t(lang, 'profiles.profileCreated', { name: trimmed }));
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteProfile(deleteTarget);
    toast.success(t(lang, 'profiles.profileDeleted', { name: deleteTarget }));
    setDeleteTarget(null);
  };

  return (
    <div className="main-view">
      <PageHeader
        icon={<Layers size={22} />}
        title={t(lang, 'profiles.profilesTitle')}
        description={t(lang, 'profiles.profileSubtitle')}
        actions={
          <Button
            size="sm"
            variant="primary"
            iconLeft={<Plus size={14} />}
            onClick={() => setShowCreateModal(true)}
          >
            {t(lang, 'profiles.newProfile')}
          </Button>
        }
      />

      {/* Profiles Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
        {profiles.map((p) => {
          const isSelected = p.name === currentProfile;
          const sub = p.subscription;
          const hasSub = Boolean(sub && (sub.total || sub.expire || sub.title));

          const totalBytes = sub?.total || 0;
          const usedBytes = (sub?.download || 0) + (sub?.upload || 0);
          const remainingBytes = Math.max(0, totalBytes - usedBytes);

          const daysRemaining = sub?.expire
            ? Math.max(0, Math.ceil((sub.expire * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          if (hasSub) {
            return (
              <Card
                key={p.name}
                hoverable
                className={`ui-sub-profile-card ${isSelected ? 'ui-sub-profile-card--active' : ''}`}
                onClick={() => handleSelect(p)}
              >
                <div className="ui-sub-profile-card__top">
                  <div className="ui-sub-profile-card__title-group">
                    <span className="ui-sub-profile-card__title">
                      {sub?.title || p.name}
                    </span>
                    {isSelected && (
                      <Badge size="xs" variant="accent">
                        ACTIVE
                      </Badge>
                    )}
                  </div>

                  <div className="ui-sub-profile-card__actions" onClick={(e) => e.stopPropagation()}>
                    {onRefreshProfile && isSelected && (
                      <button
                        type="button"
                        className={`ui-sub-profile-card__icon-btn ${state?.busy ? 'spin' : ''}`}
                        onClick={onRefreshProfile}
                        disabled={state?.busy}
                        title={t(lang, 'profiles.updateProfile')}
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        className="ui-sub-profile-card__icon-btn ui-sub-profile-card__icon-btn--danger"
                        onClick={() => setDeleteTarget(p.name)}
                        title={t(lang, 'profiles.deleteProfile')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="ui-sub-profile-card__metrics">
                  <div className="ui-sub-profile-card__metric-col">
                    <span className="ui-sub-profile-card__metric-label">
                      {t(lang, 'dashboard.trafficRemaining')}
                    </span>
                    <span className="ui-sub-profile-card__metric-val">
                      {formatBytes(remainingBytes)}
                    </span>
                  </div>
                  <div className="ui-sub-profile-card__metric-divider" />
                  <div className="ui-sub-profile-card__metric-col">
                    <span className="ui-sub-profile-card__metric-label">
                      {t(lang, 'dashboard.daysRemaining')}
                    </span>
                    <span className="ui-sub-profile-card__metric-val">
                      {daysRemaining !== null ? daysRemaining : '—'}
                    </span>
                  </div>
                </div>

                <div className="ui-sub-profile-card__footer">
                  <span className="ui-sub-profile-card__updated">
                    {t(lang, 'dashboard.updated')}: {sub?.last_updated ? formatLastUpdated(sub.last_updated, lang) : '—'}
                  </span>
                  {sub?.update_interval ? (
                    <span className="ui-sub-profile-card__interval-badge">
                      <Clock size={12} />
                      <span>
                        {sub.update_interval}
                        {t(lang, 'dashboard.hoursShort')}
                      </span>
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          }

          return (
            <Card
              key={p.name}
              hoverable
              className={`ui-profile-card ${isSelected ? 'ui-profile-card--active' : ''}`}
              onClick={() => handleSelect(p)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{p.name}</span>
                  {isSelected && (
                    <Badge size="xs" variant="accent">
                      ACTIVE
                    </Badge>
                  )}
                </div>

                {profiles.length > 1 && (
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(p.name);
                    }}
                    title={t(lang, 'profiles.deleteProfile')}
                  >
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                  <Globe size={13} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.url || '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
                  <span>Core: {p.version || 'latest'}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Active Profile Settings Editor */}
      {activeProf && (
        <SectionCard
          title={`${t(lang, 'profiles.profilesEditor')}: ${activeProf.name}`}
          subtitle={t(lang, 'profiles.editorSubtitle')}
          icon={<Edit3 size={16} />}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onRefreshProfile && (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<RefreshCw size={14} className={state?.busy ? 'spin' : ''} />}
                  onClick={onRefreshProfile}
                  disabled={state?.busy || !activeProf?.url}
                  title={!activeProf?.url ? t(lang, 'profiles.noSubscriptionUrl') : ''}
                >
                  {t(lang, 'profiles.updateProfile')}
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Save size={14} />}
                onClick={handleSave}
                disabled={!isDirty}
              >
                {t(lang, 'common.save')}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
            <Input
              label={t(lang, 'profiles.profileUrl')}
              type="url"
              placeholder="https://example.com/sub/..."
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setIsDirty(true);
              }}
              helperText={t(lang, 'profiles.profileUrlHint')}
            />

            <Input
              label={t(lang, 'profiles.profileVersion')}
              type="text"
              placeholder="latest or 1.12.0"
              value={versionInput}
              onChange={(e) => {
                setVersionInput(e.target.value);
                setIsDirty(true);
              }}
              helperText={t(lang, 'profiles.profileVersionHint')}
            />
          </div>
        </SectionCard>
      )}

      {/* New Profile Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t(lang, 'profiles.newProfile')}
        maxWidth="440px"
      >
        <form onSubmit={handleCreateSubmit}>
          <Input
            autoFocus
            label={t(lang, 'profiles.profileName')}
            placeholder="my-profile"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>
              {t(lang, 'common.cancel')}
            </Button>
            <Button variant="primary" type="submit">
              {t(lang, 'profiles.newProfile')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={t(lang, 'common.confirmTitle')}
        message={`${t(lang, 'profiles.confirmDelete')} "${deleteTarget}"?`}
        confirmLabel={t(lang, 'common.delete')}
        cancelLabel={t(lang, 'common.cancel')}
        variant="danger"
      />
    </div>
  );
};
