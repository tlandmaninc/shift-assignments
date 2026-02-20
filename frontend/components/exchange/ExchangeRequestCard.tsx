'use client';

import { motion } from 'framer-motion';
import { ArrowRight, X, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExchangeRequest } from '@/lib/types/exchange';
import { ExchangeStatusBadge } from './ExchangeStatusBadge';
import { getShiftTypeConfig } from '@/lib/constants/shiftTypes';

interface ExchangeRequestCardProps {
  exchange: ExchangeRequest;
  perspective: 'incoming' | 'outgoing' | 'history';
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ShiftTypeBadge({ shiftType }: { shiftType?: string }) {
  if (!shiftType) return null;
  const config = getShiftTypeConfig(shiftType);
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
      style={{ backgroundColor: config.color + '20', color: config.color }}
    >
      {config.label}
    </span>
  );
}

export function ExchangeRequestCard({
  exchange,
  perspective,
  onAccept,
  onDecline,
  onCancel,
  isLoading,
}: ExchangeRequestCardProps) {
  const isPending = exchange.status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ExchangeStatusBadge status={exchange.status} />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatTimestamp(exchange.created_at)}
          </span>
        </div>
        {exchange.reason && (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate max-w-[200px]">
            &quot;{exchange.reason}&quot;
          </p>
        )}
      </div>

      {/* Swap visualization */}
      <div className="flex items-center gap-3 mb-3">
        {/* Requester side */}
        <div className="flex-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {perspective === 'incoming' ? 'They give' : 'You give'}
          </p>
          <p className="font-semibold text-slate-900 dark:text-white text-sm">
            {exchange.requester_employee_name}
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
              {formatDate(exchange.requester_date)}
            </p>
            <ShiftTypeBadge shiftType={exchange.requester_shift_type} />
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />

        {/* Target side */}
        <div className="flex-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {perspective === 'incoming' ? 'You give' : 'They give'}
          </p>
          <p className="font-semibold text-slate-900 dark:text-white text-sm">
            {exchange.target_employee_name}
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
              {formatDate(exchange.target_date)}
            </p>
            <ShiftTypeBadge shiftType={exchange.target_shift_type} />
          </div>
        </div>
      </div>

      {/* Validation errors */}
      {exchange.validation_errors && exchange.validation_errors.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-xs text-orange-700 dark:text-orange-400">
          {exchange.validation_errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {/* Decline reason */}
      {exchange.decline_reason && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-400">
          Reason: {exchange.decline_reason}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-2">
          {perspective === 'incoming' && (
            <>
              <button
                onClick={onAccept}
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  'bg-green-500 text-white hover:bg-green-600 disabled:opacity-50'
                )}
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={onDecline}
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
                  'hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50'
                )}
              >
                <X className="w-4 h-4" />
                Decline
              </button>
            </>
          )}
          {perspective === 'outgoing' && (
            <button
              onClick={onCancel}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50'
              )}
            >
              <X className="w-4 h-4" />
              Cancel Request
            </button>
          )}
          {isPending && perspective !== 'incoming' && perspective !== 'outgoing' && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="w-3 h-3" />
              Awaiting response
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
