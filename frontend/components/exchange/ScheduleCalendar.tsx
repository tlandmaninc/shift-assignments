'use client';

import { motion } from 'framer-motion';
import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MonthSchedule, ScheduleDateCell, CellAssignment } from '@/lib/types/exchange';
import { buildShiftCalendarUrl } from '@/lib/utils/googleCalendar';
import { SHIFT_TYPES, getShiftTypeConfig } from '@/lib/constants/shiftTypes';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ScheduleCalendarProps {
  schedule: MonthSchedule;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  currentUserName?: string;
}

function truncateName(name: string, maxLen = 8): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '\u2026';
}

function getCellClasses(cell: ScheduleDateCell, isSelected: boolean): string {
  const hasCurrentUserShift = cell.assignments?.some((a) => a.isCurrentUser) ?? cell.isCurrentUserShift;

  if (cell.isWeekend) {
    return 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-600 cursor-not-allowed';
  }

  if (hasCurrentUserShift) {
    if (isSelected) {
      return 'bg-primary-500 dark:bg-primary-600 text-white ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 cursor-pointer';
    }
    if (cell.isPast) {
      return 'bg-primary-100 dark:bg-primary-900/30 text-primary-400 dark:text-primary-600 opacity-50 cursor-not-allowed border-2 border-primary-300 dark:border-primary-700';
    }
    return 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border-2 border-primary-500 dark:border-primary-400 cursor-pointer hover:shadow-md';
  }

  if (cell.hasPendingExchange) {
    return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-600';
  }

  if (cell.assignments?.length > 0 || cell.assignedEmployee) {
    return 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
  }

  return 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-600';
}

function ShiftBadge({ assignment }: { assignment: CellAssignment }) {
  const cfg = getShiftTypeConfig(assignment.shift_type);
  const displayName = assignment.isCurrentUser
    ? 'You'
    : truncateName(assignment.employee_name.split(' ')[0]);

  return (
    <div
      className="text-[9px] sm:text-[10px] rounded-full px-1.5 py-0.5 leading-none truncate max-w-full shift-badge-name"
      style={{
        backgroundColor: cfg.color + '20',
        color: cfg.color,
      }}
    >
      <span className="font-bold">{cfg.label}</span>
      {' '}
      <span className={assignment.isCurrentUser ? 'font-bold' : 'font-normal'}>
        {displayName}
      </span>
    </div>
  );
}

export function ScheduleCalendar({
  schedule,
  selectedDate,
  onSelectDate,
  currentUserName,
}: ScheduleCalendarProps) {
  const blanks = Array.from({ length: schedule.firstDayOffset }, (_, i) => i);

  // Collect active shift types for legend
  const activeTypes = new Set<string>();
  for (const cell of schedule.dates) {
    for (const a of cell.assignments || []) {
      activeTypes.add(a.shift_type);
    }
  }

  return (
    <div>
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {DAYS.map((day) => (
          <div
            key={day}
            className={cn(
              'text-center text-xs sm:text-sm font-medium py-2',
              day === 'Fri' || day === 'Sat'
                ? 'text-slate-400 dark:text-slate-600'
                : 'text-slate-500 dark:text-slate-400'
            )}
          >
            {day}
          </div>
        ))}

        {/* Blank cells for offset */}
        {blanks.map((i) => (
          <div key={`blank-${i}`} className="h-20 sm:h-24" />
        ))}

        {/* Date cells */}
        {schedule.dates.map((cell) => {
          const isSelected = selectedDate === cell.date;
          const hasCurrentUserShift = cell.assignments?.some((a) => a.isCurrentUser) ?? cell.isCurrentUserShift;
          const isClickable = hasCurrentUserShift && !cell.isPast && !cell.isWeekend;

          // Pick the first current-user assignment's shift_type for the Google Calendar link
          const currentUserAssignment = cell.assignments?.find((a) => a.isCurrentUser);

          return (
            <motion.button
              key={cell.date}
              whileHover={isClickable ? { scale: 1.05 } : undefined}
              whileTap={isClickable ? { scale: 0.95 } : undefined}
              onClick={() => isClickable && onSelectDate(cell.date)}
              disabled={!isClickable}
              className={cn(
                'h-20 sm:h-24 rounded-lg flex flex-col items-center justify-start pt-1.5 text-xs sm:text-sm transition-all relative gap-0.5',
                getCellClasses(cell, isSelected)
              )}
            >
              <span className="font-semibold leading-none">{cell.dayNumber}</span>

              {/* Multi-type shift badges */}
              {cell.assignments?.map((a) => (
                <ShiftBadge
                  key={`${a.shift_type}-${a.employee_name}`}
                  assignment={a}
                />
              ))}

              {/* Fallback: show old single-assignment if no typed assignments */}
              {(!cell.assignments || cell.assignments.length === 0) && cell.assignedEmployee && (
                <span className="text-[10px] sm:text-xs leading-none mt-0.5 max-w-full px-0.5 truncate">
                  {cell.isCurrentUserShift
                    ? 'You'
                    : truncateName(cell.assignedEmployee.split(' ')[0])}
                </span>
              )}

              {/* Google Calendar link */}
              {hasCurrentUserShift && !cell.isPast && !cell.isWeekend && currentUserName && (
                <a
                  href={buildShiftCalendarUrl(
                    cell.date,
                    currentUserName,
                    currentUserAssignment?.shift_type
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded hover:bg-emerald-200/60 dark:hover:bg-emerald-800/60 text-emerald-600 dark:text-emerald-400"
                  title="Add to Google Calendar"
                >
                  <CalendarPlus className="w-3 h-3" />
                </a>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 sm:gap-4 mt-4 text-xs sm:text-sm">
        {/* Shift type legend */}
        {Array.from(activeTypes).map((type) => {
          const cfg = SHIFT_TYPES[type];
          if (!cfg) return null;
          return (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="text-slate-600 dark:text-slate-400">{cfg.label}</span>
            </div>
          );
        })}

        {/* Status legend */}
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-primary-100 dark:bg-primary-900/40 border-2 border-primary-500" />
          <span className="text-slate-600 dark:text-slate-400">Your shift</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600" />
          <span className="text-slate-600 dark:text-slate-400">Pending swap</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded bg-slate-100 dark:bg-slate-800/60" />
          <span className="text-slate-600 dark:text-slate-400">Weekend</span>
        </div>
      </div>
    </div>
  );
}
