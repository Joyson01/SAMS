import React from 'react';

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name = 'User',
  src,
  size = 'md',
  className = '',
}) => {
  const getInitials = (n: string): string => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  }[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover border border-slate-200 shrink-0 ${sizeClasses} ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 select-none ${sizeClasses} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};

