'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exchangeApi } from '@/lib/api';
import { SwapCandidate } from '@/lib/types/exchange';
import { ConfirmExchangeModal } from './ConfirmExchangeModal';

interface SwapCandidatesModalProps {
  shiftDate: string;
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

export function SwapCandidatesModal({ shiftDate, onClose }: SwapCandidatesModalProps) {
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<{
    employeeId: number;
    employeeName: string;
    targetDate: string;
  } | null>(null);

  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const data = await exchangeApi.getCandidates(shiftDate);
        setCandidates(data.partners);
      } catch {
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCandidates();
  }, [shiftDate]);

  if (selectedCandidate) {
    return (
      <ConfirmExchangeModal
        requesterDate={shiftDate}
        targetEmployeeId={selectedCandidate.employeeId}
        targetEmployeeName={selectedCandidate.employeeName}
        targetDate={selectedCandidate.targetDate}
        onClose={() => {
          setSelectedCandidate(null);
          onClose();
        }}
        onCancel={() => setSelectedCandidate(null)}
      />
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Find Swap Partner
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your shift: {formatDate(shiftDate)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-12">
                <ArrowLeftRight className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  No eligible swap partners
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  No valid swaps are available for this shift that satisfy all scheduling constraints.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.employee_id}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl p-3"
                  >
                    <p className="font-medium text-slate-900 dark:text-white mb-2">
                      {candidate.employee_name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {candidate.eligible_dates.map((targetDate) => (
                        <button
                          key={targetDate}
                          onClick={() =>
                            setSelectedCandidate({
                              employeeId: candidate.employee_id,
                              employeeName: candidate.employee_name,
                              targetDate,
                            })
                          }
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                            'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
                            'hover:bg-primary-100 dark:hover:bg-primary-900/50'
                          )}
                        >
                          {formatDate(targetDate)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
