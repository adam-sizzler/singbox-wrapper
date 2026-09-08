import React from 'react';

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <span className={`ui-badge ui-badge--${variant} ui-badge--${size} ${className}`.trim()} {...props}>
      {dot && <span className="ui-badge__dot" />}
      {children}
    </span>
  );
};

export interface PingBadgeProps {
  delayMs: number;
  isError?: boolean;
  className?: string;
}

export const PingBadge: React.FC<PingBadgeProps> = ({ delayMs, isError, className = '' }) => {
  if (isError || delayMs < 0) {
    return (
      <span className={`ui-ping-badge ui-ping-badge--bad ${className}`.trim()}>
        ERR
      </span>
    );
  }
  if (!delayMs || delayMs === 0) {
    return (
      <span className={`ui-ping-badge ui-ping-badge--none ${className}`.trim()}>
        —
      </span>
    );
  }

  let status = 'good';
  if (delayMs > 350) status = 'bad';
  else if (delayMs > 150) status = 'medium';

  return (
    <span className={`ui-ping-badge ui-ping-badge--${status} ${className}`.trim()}>
      {delayMs} ms
    </span>
  );
};

export interface ProtocolBadgeProps {
  protocol: string;
  className?: string;
}

export const ProtocolBadge: React.FC<ProtocolBadgeProps> = ({ protocol, className = '' }) => {
  const norm = protocol.toUpperCase();
  let colorClass = 'ui-proto-badge--default';

  if (norm.includes('VLESS')) colorClass = 'ui-proto-badge--vless';
  else if (norm.includes('VMESS')) colorClass = 'ui-proto-badge--vmess';
  else if (norm.includes('TROJAN')) colorClass = 'ui-proto-badge--trojan';
  else if (norm.includes('HY2') || norm.includes('HYSTERIA')) colorClass = 'ui-proto-badge--hy2';
  else if (norm.includes('TUIC')) colorClass = 'ui-proto-badge--tuic';
  else if (norm.includes('SS') || norm.includes('SHADOWSOCKS')) colorClass = 'ui-proto-badge--ss';
  else if (norm.includes('WG') || norm.includes('WIREGUARD')) colorClass = 'ui-proto-badge--wg';

  return <span className={`ui-proto-badge ${colorClass} ${className}`.trim()}>{norm}</span>;
};
