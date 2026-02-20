'use client';

import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  className?: string;
}

export function NotificationBadge({ count, className }: NotificationBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 flex items-center justify-center',
        'min-w-[18px] h-[18px] px-1 rounded-full',
        'bg-red-500 text-white text-[10px] font-bold',
        'animate-scaleIn',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
