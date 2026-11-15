import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'p-1 text-xs',
    md: 'p-1.5 text-sm',
    lg: 'p-2 text-base',
  }[size];

  const variantClasses = {
    primary: 'bg-primary hover:opacity-90 text-primary-foreground shadow-xs',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs',
    outline: 'bg-transparent hover:bg-slate-50 text-slate-700 border border-slate-300',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-800',
  }[variant];

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

