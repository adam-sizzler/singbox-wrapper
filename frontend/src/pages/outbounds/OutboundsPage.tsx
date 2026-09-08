import React, { useState, useEffect } from 'react';
import {
  Share2,
  Zap,
  Check,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { AppState, Language } from '../../types';
import { t } from '../../i18n';
import { api } from '../../api';
import { PageHeader, Card, Button, Badge, PingBadge, ProtocolBadge } from '../../shared/ui';
import { detectNodeFlag, NodeFlag } from '../../shared/utils/emoji-flags';

interface OutboundsPageProps {
  state: AppState | null;
  onSelectOutbound: (selector: string, outbound: string) => void;
  onCheckAllDelays: (selector: string) => void;
  onCheckSingleDelay: (selector: string, outbound: string) => void;
}

type SortMode = 'default' | 'delay' | 'name';

function detectProtocolBadge(name: string): string | null {
  const upper = name.toUpperCase();
  if (upper.includes('VLESS')) return 'VLESS';
  if (upper.includes('VMESS')) return 'VMESS';
  if (upper.includes('TROJAN')) return 'TROJAN';
  if (upper.includes('HYSTERIA') || upper.includes('HY2')) return 'HY2';
  if (upper.includes('TUIC')) return 'TUIC';
  if (upper.includes('SHADOWSOCKS') || upper.includes('SS')) return 'SS';
  if (upper.includes('WIREGUARD') || upper.includes('WG')) return 'WG';
  if (upper.includes('DIRECT') || upper.includes('ПРЯМО')) return 'DIRECT';
  if (upper.includes('WARP')) return 'WARP';
  return null;
}

const OutboundsPageComponent: React.FC<OutboundsPageProps> = ({
  state,
  onSelectOutbound,
  onCheckAllDelays,
  onCheckSingleDelay,
}) => {
  const lang: Language = state?.language || 'ru';
  const selectorGroups = state?.selector_groups || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [testingGroup, setTestingGroup] = useState<string | null>(null);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (state?.selector_collapsed_groups) {
      setCollapsedGroups(state.selector_collapsed_groups);
    }
  }, [state?.selector_collapsed_groups]);

  const toggleGroupCollapse = (groupName: string) => {
    const key = groupName.trim().toLowerCase();
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      api.patchState({ selector_collapsed_groups: next }).catch(console.error);
      return next;
    });
  };

  const handleTestGroup = async (groupName: string) => {
    setTestingGroup(groupName);
    try {
      await onCheckAllDelays(groupName);
    } finally {
      setTestingGroup(null);
    }
  };

  const handleTestSingle = async (e: React.MouseEvent, groupName: string, optionName: string) => {
    e.stopPropagation();
    setTestingSingle(`${groupName}:${optionName}`);
    try {
      await onCheckSingleDelay(groupName, optionName);
    } finally {
      setTestingSingle(null);
    }
  };

  if (selectorGroups.length === 0) {
    return (
      <div className="main-view">
        <PageHeader
          icon={<Radio size={22} />}
          title={t(lang, 'outbounds.title')}
          description={t(lang, 'outbounds.noSelectors')}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          <Share2 size={48} style={{ opacity: 0.25, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
            {t(lang, 'outbounds.noSelectors')}
          </h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', maxWidth: '380px' }}>
            {t(lang, 'outbounds.noSelectorsHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-view">
      <PageHeader
        icon={<Radio size={22} />}
        title={t(lang, 'outbounds.title')}
        description={t(lang, 'outbounds.subtitle')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="ui-search-box">
              <Search size={14} className="ui-search-icon" />
              <input
                type="text"
                placeholder={t(lang, 'outbounds.searchNodes')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ui-search-input"
                style={{ width: '170px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <Button
                size="sm"
                variant={sortMode === 'default' ? 'primary' : 'secondary'}
                onClick={() => setSortMode('default')}
              >
                {t(lang, 'outbounds.sortDefault')}
              </Button>
              <Button
                size="sm"
                variant={sortMode === 'delay' ? 'primary' : 'secondary'}
                onClick={() => setSortMode('delay')}
              >
                {t(lang, 'outbounds.sortDelay')}
              </Button>
              <Button
                size="sm"
                variant={sortMode === 'name' ? 'primary' : 'secondary'}
                onClick={() => setSortMode('name')}
              >
                {t(lang, 'outbounds.sortName')}
              </Button>
            </div>
          </div>
        }
      />

      {/* Selector Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {selectorGroups.map((grp) => {
          const groupName = grp.name || grp.tag || 'Unknown Group';
          const activeOutbound = grp.current || grp.selected || '';
          const groupKey = groupName.trim().toLowerCase();
          const isCollapsed = !!collapsedGroups[groupKey];
          const isTestingAll = testingGroup === groupName;
          const activeFlag = detectNodeFlag(activeOutbound);

          // Parse and filter options
          const rawOptions = grp.options || [];
          let parsedOptions = rawOptions.map((opt) => {
            if (typeof opt === 'string') {
              const delayObj = grp.option_delays?.[opt];
              return {
                name: opt,
                delay_ms: delayObj ? delayObj.delay : 0,
                is_error: !!delayObj?.error,
              };
            }
            return {
              name: opt.name,
              delay_ms: opt.delay_ms || 0,
              is_error: opt.delay_ms < 0,
            };
          });

          // Filter by search
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            parsedOptions = parsedOptions.filter((o) => o.name.toLowerCase().includes(q));
          }

          // Sort options
          if (sortMode === 'delay') {
            parsedOptions.sort((a, b) => {
              if (a.delay_ms <= 0) return 1;
              if (b.delay_ms <= 0) return -1;
              return a.delay_ms - b.delay_ms;
            });
          } else if (sortMode === 'name') {
            parsedOptions.sort((a, b) => a.name.localeCompare(b.name));
          }

          return (
            <Card key={groupName} padding="none" style={{ overflow: 'hidden' }}>
              {/* Group Header */}
              <div
                className="ui-selector-header"
                onClick={() => toggleGroupCollapse(groupName)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="ui-collapse-btn"
                    aria-label="Toggle group collapse"
                    style={{ pointerEvents: 'none' }}
                  >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: 700 }}>{groupName}</span>
                      {grp.type && <Badge size="xs" variant="outline">{grp.type}</Badge>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{t(lang, 'outbounds.activeLabel')}:</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <NodeFlag flagInfo={activeFlag} />
                        <span>{activeFlag.cleanName}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<Zap size={13} className={isTestingAll ? 'spin' : ''} />}
                    loading={isTestingAll}
                    onClick={() => handleTestGroup(groupName)}
                    title={t(lang, 'outbounds.pingAll')}
                  >
                    {t(lang, 'outbounds.pingAll')}
                  </Button>
                </div>
              </div>

              {/* Group Node Grid */}
              {!isCollapsed && (
                <div className="ui-node-grid">
                  {parsedOptions.length === 0 ? (
                    <div style={{ padding: '20px', color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', gridColumn: '1 / -1' }}>
                      {t(lang, 'outbounds.noMatchingNodes')}
                    </div>
                  ) : (
                    parsedOptions.map((opt) => {
                      const isSelected = opt.name === activeOutbound;
                      const isTestingThis = testingSingle === `${groupName}:${opt.name}`;
                      const proto = detectProtocolBadge(opt.name);
                      const flagInfo = detectNodeFlag(opt.name);
                      const outboundMeta = state?.outbounds?.[opt.name];

                      return (
                        <div
                          key={opt.name}
                          className={`ui-node-card ${isSelected ? 'ui-node-card--selected' : ''}`}
                          onClick={() => onSelectOutbound(groupName, opt.name)}
                          title={outboundMeta?.server ? `${opt.name}\n${outboundMeta.server}:${outboundMeta.server_port || ''}` : opt.name}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            {isSelected ? (
                              <div className="ui-node-selected-check" style={{ flexShrink: 0 }}>
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="ui-node-bullet" style={{ flexShrink: 0 }} />
                            )}
                            <div className="ui-node-info" style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <NodeFlag flagInfo={flagInfo} />
                                <span className="ui-node-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {flagInfo.cleanName}
                                </span>
                              </div>
                              {proto && <ProtocolBadge protocol={proto} />}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="ui-node-ping-btn"
                              onClick={(e) => handleTestSingle(e, groupName, opt.name)}
                              title={t(lang, 'outbounds.testDelay')}
                              disabled={isTestingThis}
                            >
                              {isTestingThis ? (
                                <RefreshCw size={11} className="spin" />
                              ) : (
                                <PingBadge delayMs={opt.delay_ms} isError={opt.is_error} />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export const OutboundsPage = React.memo<OutboundsPageProps>(OutboundsPageComponent, (prev, next) => {
  return (
    prev.state?.language === next.state?.language &&
    prev.state?.selector_groups === next.state?.selector_groups &&
    prev.state?.selector_collapsed_groups === next.state?.selector_collapsed_groups &&
    prev.state?.outbounds === next.state?.outbounds &&
    prev.onSelectOutbound === next.onSelectOutbound &&
    prev.onCheckAllDelays === next.onCheckAllDelays &&
    prev.onCheckSingleDelay === next.onCheckSingleDelay
  );
});
OutboundsPage.displayName = 'OutboundsPage';
