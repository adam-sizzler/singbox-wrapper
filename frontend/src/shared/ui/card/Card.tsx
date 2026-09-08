import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  bordered?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  hoverable = false,
  bordered = true,
  padding = 'md',
  className = '',
  children,
  ...props
}) => {
  const hoverClass = hoverable ? 'ui-card--hover' : '';
  const borderClass = bordered ? 'ui-card--bordered' : '';
  const paddingClass = `ui-card--pad-${padding}`;

  return (
    <div className={`ui-card ${hoverClass} ${borderClass} ${paddingClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
};

export interface SectionCardProps extends CardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  icon,
  actions,
  children,
  className = '',
  ...props
}) => {
  return (
    <Card className={`ui-section-card ${className}`.trim()} {...props}>
      {(title || icon || actions) && (
        <div className="ui-section-card__header">
          <div className="ui-section-card__title-group">
            {icon && <span className="ui-section-card__icon">{icon}</span>}
            <div>
              {title && <h3 className="ui-section-card__title">{title}</h3>}
              {subtitle && <p className="ui-section-card__subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="ui-section-card__actions">{actions}</div>}
        </div>
      )}
      <div className="ui-section-card__content">{children}</div>
    </Card>
  );
};

export interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  accentColor?: string;
  badge?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  subValue,
  accentColor,
  badge,
}) => {
  return (
    <div className="ui-metric-card">
      <div className="ui-metric-card__top">
        <div className="ui-metric-card__icon" style={accentColor ? { color: accentColor } : undefined}>
          {icon}
        </div>
        <div className="ui-metric-card__label-wrap">
          <span className="ui-metric-card__label">{label}</span>
          {badge}
        </div>
      </div>
      <div className="ui-metric-card__value" style={accentColor ? { color: accentColor } : undefined}>
        {value}
      </div>
      {subValue && <div className="ui-metric-card__sub">{subValue}</div>}
    </div>
  );
};
