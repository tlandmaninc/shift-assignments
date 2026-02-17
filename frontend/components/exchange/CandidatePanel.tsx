'use client';

import { motion } from 'framer-motion';
import { X, Loader2, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EnhancedSwapCandidate, EmployeeAvailability } from '@/lib/types/exchange';

interface CandidatePanelProps {
  shiftDate: string;
  candidates: EnhancedSwapCandidate[];
  loading: boolean;
  availability: EmployeeAvailability[];
  onSelectSwap: (candidate: EnhancedSwapCandidate, targetDate: string) => void;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
  });
}

function getAvailabilityForDate(
  availability: EmployeeAvailability[],
  employeeId: number,
  date: string
): 'available' | 'unavailable' | 'unknown' {
  const empAvail = availability.find((a) => a.employeeId === employeeId);
  if (!empAvail) return 'unknown';
  if (empAvail.availableDates.includes(date)) return 'available';
  if (empAvail.unavailableDates.includes(date)) return 'unavailable';
  return 'unknown';
}

export function CandidatePanel({
  shiftDate,
  candidates,
  loading,
  availability,
  onSelectSwap,
  onClose,
}: CandidatePanelProps) {
  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden',
        'w-full lg:w-80 flex-shrink-0'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            Candidates
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatDate(shiftDate)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto max-h-[calc(100vh-20rem)]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (() => {
          // Filter to only available dates per candidate, then drop candidates with none
          const filtered = candidates
            .map((candidate) => ({
              ...candidate,
              eligible_dates: candidate.eligible_dates.filter(
                (d) => getAvailabilityForDate(availability, candidate.employee_id, d) !== 'unavailable'
              ),
            }))
            .filter((c) => c.eligible_dates.length > 0);

          if (filtered.length === 0) {
            return (
              <div className="text-center py-8">
                <ArrowLeftRight className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  No available candidates
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  No available swap partners for this date.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-3">
              {filtered.map((candidate) => (
                <div
                  key={candidate.employee_id}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {candidate.employee_name}
                    </p>
                    {candidate.is_new && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                        New
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {candidate.eligible_dates.map((targetDate) => (
                      <button
                        key={targetDate}
                        onClick={() => onSelectSwap(candidate, targetDate)}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                          'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
                          'hover:bg-primary-100 dark:hover:bg-primary-900/50'
                        )}
                      >
                        {formatShortDate(targetDate)}
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </motion.div>
  );
}
