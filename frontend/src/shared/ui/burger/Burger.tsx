import React from 'react';

export interface BurgerProps {
  opened: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Burger: React.FC<BurgerProps> = ({
  opened,
  onClick,
  title,
  className = '',
  style,
}) => {
  return (
    <button
      type="button"
      className={`ui-burger ${opened ? 'ui-burger--opened' : ''} ${className}`.trim()}
      onClick={onClick}
      title={title || (opened ? 'Свернуть меню' : 'Развернуть меню')}
      aria-label="Toggle navigation"
      style={style}
    >
      <div className="ui-burger__box">
        <span className="ui-burger__line ui-burger__line--top" />
        <span className="ui-burger__line ui-burger__line--middle" />
        <span className="ui-burger__line ui-burger__line--bottom" />
      </div>
    </button>
  );
};
