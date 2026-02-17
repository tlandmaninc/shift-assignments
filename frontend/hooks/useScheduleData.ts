'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MonthSchedule, EnhancedSwapCandidate, EmployeeAvailability } from '@/lib/types/exchange';
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
      // Real API: build schedule from my shifts endpoint
      const fetchReal = async () => {
        try {
          const data = await exchangeApi.getMyShifts(monthYear);
          // When using real data, we build a minimal schedule
          // (the calendar still needs assignment data from a full endpoint)
          const daysInMonth = new Date(year, month, 0).getDate();
          const firstDayOffset = new Date(year, month - 1, 1).getDay();
          const today = new Date().toISOString().split('T')[0];
          const myDates = data.shifts.map((s: { date: string }) => s.date);

          setSchedule({
            year,
            month,
            firstDayOffset,
            daysInMonth,
            dates: Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
              const shift = data.shifts.find((s: { date: string }) => s.date === dateStr);
              return {
                date: dateStr,
                dayNumber: d,
                assignedEmployee: shift?.employee_name || null,
                assignedEmployeeId: null,
                isCurrentUserShift: myDates.includes(dateStr),
                isPast: dateStr < today,
                isWeekend: dayOfWeek === 5 || dayOfWeek === 6,
                hasPendingExchange: false,
              };
            }),
            currentUserShiftDates: myDates,
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
