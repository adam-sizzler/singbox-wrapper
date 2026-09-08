import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const baseClass = 'ui-btn';
    const variantClass = `ui-btn--${variant}`;
    const sizeClass = `ui-btn--${size}`;
    const widthClass = fullWidth ? 'ui-btn--full' : '';
    const loadingClass = loading ? 'ui-btn--loading' : '';

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${baseClass} ${variantClass} ${sizeClass} ${widthClass} ${loadingClass} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <Loader2 className="ui-btn__spinner" size={size === 'xs' || size === 'sm' ? 13 : 16} />
        ) : (
          iconLeft && <span className="ui-btn__icon-left">{iconLeft}</span>
        )}
        {children && <span className="ui-btn__label">{children}</span>}
        {!loading && iconRight && <span className="ui-btn__icon-right">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
