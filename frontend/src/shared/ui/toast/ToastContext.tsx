import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  exiting?: boolean;
}

interface ToastContextValue {
  show: (message: string, options?: { type?: ToastType; title?: string; duration?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const exitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: string) => {
    // Mark as exiting first to trigger CSS exit animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    // Actually remove after animation duration (220ms)
    exitTimersRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete exitTimersRef.current[id];
    }, 220);
  }, []);

  const show = useCallback(
    (message: string, options?: { type?: ToastType; title?: string; duration?: number }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const type = options?.type || 'info';
      const duration = options?.duration ?? 3500;
      const title = options?.title;

      const item: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), item]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string) => show(message, { type: 'success', title }), [show]);
  const error = useCallback((message: string, title?: string) => show(message, { type: 'error', title, duration: 5000 }), [show]);
  const warning = useCallback((message: string, title?: string) => show(message, { type: 'warning', title }), [show]);
  const info = useCallback((message: string, title?: string) => show(message, { type: 'info', title }), [show]);

  const renderIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} className="ui-toast__icon ui-toast__icon--success" />;
      case 'error':
        return <AlertCircle size={18} className="ui-toast__icon ui-toast__icon--error" />;
      case 'warning':
        return <AlertTriangle size={18} className="ui-toast__icon ui-toast__icon--warning" />;
      case 'info':
      default:
        return <Info size={18} className="ui-toast__icon ui-toast__icon--info" />;
    }
  };

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info }}>
      {children}
      <div className="ui-toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ui-toast ui-toast--${toast.type}${toast.exiting ? ' ui-toast--exiting' : ''}`}
          >
            <div className="ui-toast__indicator" />
            {toast.duration && toast.duration > 0 && (
              <div
                className="ui-toast__progress"
                style={{ animationDuration: `${toast.duration}ms` }}
              />
            )}
            <div className="ui-toast__icon-wrapper">{renderIcon(toast.type)}</div>
            <div className="ui-toast__content">
              {toast.title && <div className="ui-toast__title">{toast.title}</div>}
              <div className="ui-toast__message">{toast.message}</div>
            </div>
            <button
              className="ui-toast__close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
