'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MonthSchedule, EnhancedSwapCandidate, EmployeeAvailability, CellAssignment } from '@/lib/types/exchange';
import { DEFAULT_SHIFT_TYPE } from '@/lib/constants/shiftTypes';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { exchangeApi } from '@/lib/api';
import {
  generateMonthSchedule,
  generateMockCandidates,
  generateFormResponses,
} from '@/lib/mockData/exchangeMockData';

interface UseScheduleDataReturn {
  schedule: MonthSchedule | null;
  candidates: EnhancedSwapCandidate[];
  candidatesLoading: boolean;
  fetchCandidates: (shiftDate: string) => void;
  availability: EmployeeAvailability[];
}

export function useScheduleData(monthYear: string): UseScheduleDataReturn {
  const { refreshTrigger, useMockData } = useExchangeStore();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [candidates, setCandidates] = useState<EnhancedSwapCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [availability, setAvailability] = useState<EmployeeAvailability[]>([]);

  const [year, month] = useMemo(() => {
    const parts = monthYear.split('-');
    return [parseInt(parts[0]), parseInt(parts[1])];
  }, [monthYear]);

  // Load schedule data
  useEffect(() => {
    if (useMockData) {
      const s = generateMonthSchedule(year, month);
      setSchedule(s);
      const avail = generateFormResponses(year, month);
      setAvailability(avail);
    } else {
      // Real API: fetch full month schedule for all employees
      const fetchReal = async () => {
        try {
          const data = await exchangeApi.getSchedule(monthYear);
          const daysInMonth = new Date(year, month, 0).getDate();
          const firstDayOffset = new Date(year, month - 1, 1).getDay();
          const today = new Date().toISOString().split('T')[0];
          const currentUserShiftDates: string[] = [];

          const dates = Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
            const entries = data.assignments[dateStr] || [];

            const cellAssignments: CellAssignment[] = entries.map(
              (e: { employee_name: string; shift_type: string; is_current_user: boolean }) => ({
                employee_name: e.employee_name,
                employee_id: null,
                shift_type: e.shift_type || DEFAULT_SHIFT_TYPE,
                isCurrentUser: e.is_current_user,
              })
            );

            const isMyShift = cellAssignments.some((a) => a.isCurrentUser);
            if (isMyShift) currentUserShiftDates.push(dateStr);

            const firstEntry = entries[0] || null;
            return {
              date: dateStr,
              dayNumber: d,
              assignments: cellAssignments,
              assignedEmployee: firstEntry?.employee_name || null,
              assignedEmployeeId: null,
              isCurrentUserShift: isMyShift,
              isPast: dateStr < today,
              isWeekend: dayOfWeek === 5 || dayOfWeek === 6,
              hasPendingExchange: false,
            };
          });

          setSchedule({
            year,
            month,
            firstDayOffset,
            daysInMonth,
            dates,
            currentUserShiftDates,
          });
        } catch {
          setSchedule(null);
        }
      };
      fetchReal();
    }
  }, [monthYear, year, month, refreshTrigger, useMockData]);

  // Fetch candidates for a specific shift date
  const fetchCandidates = useCallback(
    (shiftDate: string) => {
      setCandidatesLoading(true);
      if (useMockData) {
        // Small delay to feel realistic
        setTimeout(() => {
          const c = generateMockCandidates(shiftDate, year, month);
          setCandidates(c);
          setCandidatesLoading(false);
        }, 400);
      } else {
        exchangeApi
          .getCandidates(shiftDate)
          .then((data) => {
            setCandidates(
              data.partners.map((p: { employee_id: number; employee_name: string; eligible_dates: string[] }) => ({
                ...p,
                is_new: false,
                all_shift_dates: [] as string[],
              }))
            );
          })
          .catch(() => setCandidates([]))
          .finally(() => setCandidatesLoading(false));
      }
    },
    [useMockData, year, month]
  );

  return { schedule, candidates, candidatesLoading, fetchCandidates, availability };
}
