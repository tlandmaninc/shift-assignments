'use client';

import { motion } from 'framer-motion';
import { ArrowLeftRight, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShiftAssignment } from '@/lib/types/exchange';
import { buildShiftCalendarUrl } from '@/lib/utils/googleCalendar';
import { getShiftTypeConfig } from '@/lib/constants/shiftTypes';

interface ShiftCardProps {
  shift: ShiftAssignment;
  onRequestSwap?: () => void;
  isPast?: boolean;
}

export function ShiftCard({ shift, onRequestSwap, isPast }: ShiftCardProps) {
  const dateObj = new Date(shift.date + 'T00:00:00');
  const dayNum = dateObj.getDate();
  const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' });
  const typeCfg = getShiftTypeConfig(shift.shift_type || 'ect');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center justify-between p-4 rounded-2xl border transition-colors',
        isPast
          ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700'
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
            {monthShort}
          </span>
          <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
            {dayNum}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 dark:text-white">
              {shift.day_of_week}
            </p>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: typeCfg.color }}
            >
              {typeCfg.label}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{shift.date}</p>
        </div>
      </div>

      {!isPast && (
        <div className="flex items-center gap-2">
          <a
            href={buildShiftCalendarUrl(shift.date, shift.employee_name, shift.shift_type)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
              'hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
            )}
          >
            <CalendarPlus className="w-4 h-4" />
            Add to Calendar
          </a>
          {onRequestSwap && (
            <button
              onClick={onRequestSwap}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
                'hover:bg-primary-100 dark:hover:bg-primary-900/50'
              )}
            >
              <ArrowLeftRight className="w-4 h-4" />
              Request Swap
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
