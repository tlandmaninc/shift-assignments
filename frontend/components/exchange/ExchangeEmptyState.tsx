'use client';

import { CalendarX, Inbox, Send, Clock } from 'lucide-react';

const emptyStates: Record<string, { icon: typeof CalendarX; title: string; description: string }> = {
  shifts: {
    icon: CalendarX,
    title: 'No shifts found',
    description: 'You have no assigned shifts for this month.',
  },
  incoming: {
    icon: Inbox,
    title: 'No incoming requests',
    description: 'No one has requested to swap shifts with you.',
  },
  outgoing: {
    icon: Send,
    title: 'No outgoing requests',
    description: "You haven't sent any swap requests.",
  },
  history: {
    icon: Clock,
    title: 'No exchange history',
    description: 'Completed exchanges will appear here.',
  },
};

interface ExchangeEmptyStateProps {
  tab: string;
}

export function ExchangeEmptyState({ tab }: ExchangeEmptyStateProps) {
  const config = emptyStates[tab] || emptyStates.shifts;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
        {config.title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        {config.description}
      </p>
    </div>
  );
}
