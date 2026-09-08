import React from 'react';

export interface PageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  description,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header__main">
        {icon && <div className="ui-page-header__icon-box">{icon}</div>}
        <div className="ui-page-header__text">
          <div className="ui-page-header__title-row">
            <h1 className="ui-page-header__title">{title}</h1>
            {badge && <div className="ui-page-header__badge">{badge}</div>}
          </div>
          {description && <div className="ui-page-header__description">{description}</div>}
        </div>
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
};


