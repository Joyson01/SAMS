import React from 'react';
import { Badge } from './Badge';

export type StatusCategory = 'session' | 'attendance' | 'camera' | 'recognition' | 'enrollment';

export interface StatusBadgeProps {
  status: string;
  category?: StatusCategory;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  category = 'attendance',
  className = '',
  size = 'md',
}) => {
  const norm = (status || '').toUpperCase().trim();

  // Determine variant, display label, and dot pulse
  let variant: 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple' = 'gray';
  let label = status;
  let pulse = false;

  switch (category) {
    case 'session':
      if (norm === 'ACTIVE' || norm === 'LIVE') {
        variant = 'green';
        label = 'Active';
        pulse = true;
      } else if (norm === 'PAUSED') {
        variant = 'amber';
        label = 'Paused';
      } else if (norm === 'COMPLETED' || norm === 'CLOSED') {
        variant = 'gray';
        label = 'Completed';
      } else if (norm === 'SCHEDULED' || norm === 'UPCOMING') {
        variant = 'blue';
        label = 'Scheduled';
      } else if (norm === 'CANCELLED') {
        variant = 'red';
        label = 'Cancelled';
      }
      break;

    case 'attendance':
      if (norm === 'PRESENT' || norm === 'MANUAL_PRESENT') {
        variant = 'green';
        label = 'Present';
      } else if (norm === 'LATE' || norm === 'MANUAL_LATE') {
        variant = 'amber';
        label = 'Late';
      } else if (norm === 'ABSENT' || norm === 'MANUAL_ABSENT') {
        variant = 'red';
        label = 'Absent';
      } else if (norm === 'EXCUSED' || norm === 'MANUAL_EXCUSED') {
        variant = 'purple';
        label = 'Excused';
      } else if (norm === 'VERIFYING') {
        variant = 'blue';
        label = 'Verifying';
        pulse = true;
      } else if (norm === 'UNKNOWN') {
        variant = 'red';
        label = 'Unknown';
      } else {
        variant = 'gray';
        label = 'Not Marked';
      }
      break;

    case 'camera':
      if (norm === 'ONLINE' || norm === 'CONNECTED' || norm === 'STREAMING') {
        variant = 'green';
        label = norm === 'STREAMING' ? 'Streaming' : 'Online';
        pulse = norm === 'STREAMING';
      } else if (norm === 'CONNECTING' || norm === 'STARTING') {
        variant = 'blue';
        label = 'Connecting';
        pulse = true;
      } else if (norm === 'NO_FRAME' || norm === 'WARNING') {
        variant = 'amber';
        label = 'No Frame';
      } else {
        variant = 'red';
        label = 'Offline';
      }
      break;

    case 'enrollment':
      if (norm === 'ENROLLED') {
        variant = 'green';
        label = 'Enrolled';
      } else if (norm === 'PARTIAL') {
        variant = 'amber';
        label = 'Incomplete';
      } else {
        variant = 'gray';
        label = 'Pending';
      }
      break;

    case 'recognition':
      if (norm === 'PRESENT' || norm === 'RECOGNIZED') {
        variant = 'green';
        label = 'Recognized';
      } else if (norm === 'VERIFYING') {
        variant = 'blue';
        label = 'Verifying';
        pulse = true;
      } else {
        variant = 'amber';
        label = 'Review';
      }
      break;
  }

  return (
    <Badge variant={variant} size={size} dot className={className}>
      <span className="flex items-center gap-1.5">
        {pulse && (
          <span className="relative flex h-1.5 w-1.5 -ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
          </span>
        )}
        <span>{label}</span>
      </span>
    </Badge>
  );
};

