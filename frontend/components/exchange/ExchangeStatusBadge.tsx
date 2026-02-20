'use client';

import { cn } from '@/lib/utils';
import { ExchangeStatus } from '@/lib/types/exchange';

const statusConfig: Record<ExchangeStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  accepted: {
    label: 'Accepted',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  declined: {
    label: 'Declined',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  invalid: {
    label: 'Invalid',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  expired: {
    label: 'Expired',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  },
};

interface ExchangeStatusBadgeProps {
  status: ExchangeStatus;
  className?: string;
}

export function ExchangeStatusBadge({ status, className }: ExchangeStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
