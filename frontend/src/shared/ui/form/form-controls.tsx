import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, iconLeft, iconRight, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="ui-form-group">
        {label && (
          <label htmlFor={inputId} className="ui-form-label">
            {label}
          </label>
        )}
        <div className={`ui-input-wrapper ${error ? 'ui-input-wrapper--error' : ''}`}>
          {iconLeft && <span className="ui-input-icon ui-input-icon--left">{iconLeft}</span>}
          <input
            id={inputId}
            ref={ref}
            className={`ui-input ${iconLeft ? 'ui-input--has-left' : ''} ${iconRight ? 'ui-input--has-right' : ''} ${className}`.trim()}
            {...props}
          />
          {iconRight && <span className="ui-input-icon ui-input-icon--right">{iconRight}</span>}
        </div>
        {error ? (
          <p className="ui-form-error">{error}</p>
        ) : helperText ? (
          <p className="ui-form-helper">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className={`ui-switch-container ${disabled ? 'ui-switch-container--disabled' : ''}`}
    >
      <div className="ui-switch-text">
        {label && <span className="ui-switch-label">{label}</span>}
        {description && <span className="ui-switch-desc">{description}</span>}
      </div>
      <div className="ui-switch-toggle-wrap">
        <div className={`ui-switch-track ${checked ? 'ui-switch-track--checked' : ''}`}>
          <div className="ui-switch-thumb" />
        </div>
      </div>
    </div>
  );
};
