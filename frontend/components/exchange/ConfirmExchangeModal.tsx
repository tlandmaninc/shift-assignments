'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeftRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exchangeApi } from '@/lib/api';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { mockCreateExchange } from '@/lib/mockData/exchangeMockData';
import toast from 'react-hot-toast';

interface ConfirmExchangeModalProps {
  requesterDate: string;
  targetEmployeeId: number;
  targetEmployeeName: string;
  targetDate: string;
  onClose: () => void;
  onCancel: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ConfirmExchangeModal({
  requesterDate,
  targetEmployeeId,
  targetEmployeeName,
  targetDate,
  onClose,
  onCancel,
}: ConfirmExchangeModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { selectedMonth, triggerRefresh, useMockData } = useExchangeStore();

  const handleSubmit = async () => {
    setLoading(true);
    if (useMockData) {
      await new Promise((r) => setTimeout(r, 800));
      mockCreateExchange(selectedMonth, {
        requesterDate,
        targetEmployeeId: targetEmployeeId,
        targetEmployeeName: targetEmployeeName,
        targetDate,
        reason: reason.trim() || undefined,
      });
      toast.success('Swap request sent! (Mock)');
      triggerRefresh();
      onClose();
      setLoading(false);
      return;
    }
    try {
      await exchangeApi.create({
        requester_date: requesterDate,
        target_employee_id: targetEmployeeId,
        target_date: targetDate,
        reason: reason.trim() || undefined,
      });
      toast.success('Swap request sent!');
      triggerRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create swap request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50"
          onClick={onCancel}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Confirm Swap Request
            </h3>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Swap visualization */}
            <div className="flex items-center gap-3">
              <div className="flex-1 p-3 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">You give</p>
                <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                  {formatDate(requesterDate)}
                </p>
              </div>
              <ArrowLeftRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 p-3 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {targetEmployeeName} gives
                </p>
                <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                  {formatDate(targetDate)}
                </p>
              </div>
            </div>

            {/* Reason input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you want to swap?"
                rows={2}
                className={cn(
                  'w-full px-3 py-2 rounded-xl border text-sm',
                  'border-slate-200 dark:border-slate-600',
                  'bg-white dark:bg-slate-900',
                  'text-slate-900 dark:text-white',
                  'placeholder-slate-400 dark:placeholder-slate-500',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onCancel}
              disabled={loading}
              className={cn(
                'flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-slate-600'
              )}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  Send Request
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
