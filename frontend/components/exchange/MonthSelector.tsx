'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthSelectorProps {
  selectedMonth: string;
  onChange: (month: string) => void;
}

function formatMonthDisplay(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(monthYear: string, delta: number): string {
  const [year, month] = monthYear.split('-').map(Number);
  const date = new Date(year, month - 1 + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthSelector({ selectedMonth, onChange }: MonthSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(shiftMonth(selectedMonth, -1))}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          'text-slate-500 dark:text-slate-400'
        )}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-slate-900 dark:text-white min-w-[140px] text-center">
        {formatMonthDisplay(selectedMonth)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(selectedMonth, 1))}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          'text-slate-500 dark:text-slate-400'
        )}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
