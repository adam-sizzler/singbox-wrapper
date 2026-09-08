import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Terminal, Copy, Trash2, Search } from 'lucide-react';
import { LogEntry, Language } from '../../types';
import { t } from '../../i18n';
import { PageHeader, Card, Button, useToast } from '../../shared/ui';

import { parseAnsiLine } from '../../shared/utils/ansi-parser';

interface LogsPageProps {
  logs: LogEntry[];
  lang: Language;
  onClearLogs: () => void;
  onCopyLogs: () => void;
}

interface LogLineItemProps {
  entry: LogEntry;
}

const LogLineItem = React.memo<LogLineItemProps>(({ entry }) => {
  const level = (entry.level || 'info').toLowerCase();
  const segments = useMemo(() => parseAnsiLine(entry.text), [entry.text]);

  return (
    <div className="ui-log-line">
      {entry.time && <span className="ui-log-time">{entry.time}</span>}
      <span className={`ui-log-level ui-log-level--${level}`}>
        {level.toUpperCase()}
      </span>
      <span className="ui-log-text">
        {segments.map((seg, sIdx) => (
          <span
            key={sIdx}
            style={{
              color: seg.color || undefined,
              fontWeight: seg.bold ? 700 : undefined,
            }}
          >
            {seg.text}
          </span>
        ))}
      </span>
    </div>
  );
});
LogLineItem.displayName = 'LogLineItem';

export const LogsPage: React.FC<LogsPageProps> = ({
  logs,
  lang,
  onClearLogs,
  onCopyLogs,
}) => {
  const toast = useToast();
  const [filterText, setFilterText] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const q = filterText.toLowerCase();
    return logs.filter(
      (l) =>
        l.text.toLowerCase().includes(q) ||
        (l.level && l.level.toLowerCase().includes(q))
    );
  }, [logs, filterText]);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // Auto-scroll stays active if user is within 35px of the bottom
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight <= 35;
  };

  useEffect(() => {
    if (isNearBottomRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  const handleCopy = () => {
    onCopyLogs();
    toast.success(t(lang, 'logs.logsCopied'));
  };

  const handleClear = () => {
    onClearLogs();
    toast.info(t(lang, 'logs.logsCleared'));
  };

  return (
    <div className="main-view" style={{ paddingBottom: '16px' }}>
      <PageHeader
        icon={<Terminal size={22} />}
        title={t(lang, 'logs.title')}
        description={t(lang, 'logs.subtitle')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="ui-search-box">
              <Search size={14} className="ui-search-icon" />
              <input
                type="text"
                placeholder={t(lang, 'logs.filterPlaceholder')}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="ui-search-input"
                style={{ width: '180px' }}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<Copy size={14} />}
              onClick={handleCopy}
              disabled={logs.length === 0}
            >
              {t(lang, 'logs.copyLogs')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              iconLeft={<Trash2 size={14} />}
              onClick={handleClear}
              disabled={logs.length === 0}
            >
              {t(lang, 'logs.clearLogs')}
            </Button>
          </div>
        }
      />

      <Card
        padding="none"
        style={{
          flex: 1,
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="ui-logs-terminal" ref={terminalRef} onScroll={handleScroll}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
              {t(lang, 'logs.noLogs')}
            </div>
          ) : (
            filteredLogs.map((l) => <LogLineItem key={l.id} entry={l} />)
          )}
        </div>
      </Card>
    </div>
  );
};
