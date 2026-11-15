import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[width];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div
          className={`w-screen ${widthClasses} bg-white border-l border-slate-200 shadow-2xl flex flex-col`}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
            <div className="min-w-0 pr-3">
              <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
            <IconButton label="Close panel" onClick={onClose} size="sm" variant="ghost">
              <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
            </IconButton>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

