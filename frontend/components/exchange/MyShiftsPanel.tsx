'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { useScheduleData } from '@/hooks/useScheduleData';
import { EnhancedSwapCandidate } from '@/lib/types/exchange';
import { ScheduleCalendar } from './ScheduleCalendar';
import { CandidatePanel } from './CandidatePanel';
import { SwapCandidatesModal } from './SwapCandidatesModal';
import { ConfirmExchangeModal } from './ConfirmExchangeModal';

export function MyShiftsPanel() {
  const { user } = useAuth();
  const { selectedMonth, selectedShiftDate, setSelectedShiftDate, useMockData } =
    useExchangeStore();
  const { schedule, candidates, candidatesLoading, fetchCandidates, availability } =
    useScheduleData(selectedMonth);

  const [confirmState, setConfirmState] = useState<{
    requesterDate: string;
    targetEmployeeId: number;
    targetEmployeeName: string;
    targetDate: string;
  } | null>(null);

  // For non-mock mode, use the original modal flow
  const [legacyModalDate, setLegacyModalDate] = useState<string | null>(null);

  const handleSelectDate = useCallback(
    (date: string) => {
      if (selectedShiftDate === date) {
        setSelectedShiftDate(null);
      } else {
        setSelectedShiftDate(date);
        fetchCandidates(date);
      }
    },
    [selectedShiftDate, setSelectedShiftDate, fetchCandidates]
  );

  const handleSelectSwap = useCallback(
    (candidate: EnhancedSwapCandidate, targetDate: string) => {
      if (!selectedShiftDate) return;
      setConfirmState({
        requesterDate: selectedShiftDate,
        targetEmployeeId: candidate.employee_id,
        targetEmployeeName: candidate.employee_name,
        targetDate,
      });
    },
    [selectedShiftDate]
  );

  const handleCloseConfirm = useCallback(() => {
    setConfirmState(null);
    setSelectedShiftDate(null);
  }, [setSelectedShiftDate]);

  if (!schedule) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  // Non-mock mode: keep the legacy modal-based flow for real API
  if (!useMockData) {
    return (
      <>
        <ScheduleCalendar
          schedule={schedule}
          selectedDate={null}
          onSelectDate={(date) => setLegacyModalDate(date)}
          currentUserName={user?.name}
        />
        {legacyModalDate && (
          <SwapCandidatesModal
            shiftDate={legacyModalDate}
            onClose={() => setLegacyModalDate(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Calendar */}
        <div
          className={
            selectedShiftDate ? 'w-full lg:flex-1 lg:min-w-0' : 'w-full'
          }
        >
          <ScheduleCalendar
            schedule={schedule}
            selectedDate={selectedShiftDate}
            onSelectDate={handleSelectDate}
            currentUserName={user?.name}
          />
        </div>

        {/* Candidate panel (desktop: side panel, mobile: below) */}
        <AnimatePresence mode="wait">
          {selectedShiftDate && (
            <CandidatePanel
              shiftDate={selectedShiftDate}
              candidates={candidates}
              loading={candidatesLoading}
              availability={availability}
              onSelectSwap={handleSelectSwap}
              onClose={() => setSelectedShiftDate(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <ConfirmExchangeModal
          requesterDate={confirmState.requesterDate}
          targetEmployeeId={confirmState.targetEmployeeId}
          targetEmployeeName={confirmState.targetEmployeeName}
          targetDate={confirmState.targetDate}
          onClose={handleCloseConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
