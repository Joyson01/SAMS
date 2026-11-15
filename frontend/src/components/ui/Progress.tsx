import React from 'react';

export interface ProgressProps {
  value: number; // 0 to 100
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'auto';
  showLabel?: boolean;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  size = 'md',
  variant = 'auto',
  showLabel = false,
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2.5',
  }[size];

  let barColor = 'bg-blue-600';
  if (variant === 'green') {
    barColor = 'bg-emerald-500';
  } else if (variant === 'amber') {
    barColor = 'bg-amber-500';
  } else if (variant === 'red') {
    barColor = 'bg-rose-500';
  } else if (variant === 'auto') {
    if (percentage >= 75) {
      barColor = 'bg-emerald-500';
    } else if (percentage >= 60) {
      barColor = 'bg-amber-500';
    } else {
      barColor = 'bg-rose-500';
    }
  }

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
          <span>Progress</span>
          <span className="font-mono">{percentage}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${sizeClasses}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

