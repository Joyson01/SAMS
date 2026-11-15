import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  compact = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg shadow-xs ${
        compact ? 'p-3' : 'p-4 sm:p-5'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex items-center justify-between pb-3 border-b border-slate-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <h3
      className={`text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-snug ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <p className={`text-xs text-slate-500 mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`pt-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex items-center justify-between pt-3 mt-3 border-t border-slate-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

