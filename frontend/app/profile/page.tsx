'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CalendarPlus, Shield, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { exchangeApi } from '@/lib/api';
import { ShiftAssignment } from '@/lib/types/exchange';
import { buildShiftCalendarUrl } from '@/lib/utils/googleCalendar';
import { cn } from '@/lib/utils';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { isDemoAllowed } from '@/lib/mockData/demoMode';

/**
 * Generate mock upcoming shifts for the current and next month.
 * Only used in development/demo — throws in production.
 */
function generateMockShifts(employeeName: string): ShiftAssignment[] {
  if (!isDemoAllowed) {
    throw new Error('Mock data must not be used in production');
  }
  const shifts: ShiftAssignment[] = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  for (let offset = 0; offset < 2; offset++) {
    const year = new Date(now.getFullYear(), now.getMonth() + offset).getFullYear();
    const month = new Date(now.getFullYear(), now.getMonth() + offset).getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Pick ~3 weekday dates per month (Sun-Thu in Israel work week)
    const candidates: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dow = dt.getDay();
      // Sunday=0 through Thursday=4 are work days
      if (dow >= 0 && dow <= 4) {
        candidates.push(dt);
      }
    }

    // Pick every ~7th work day to get 3-4 shifts per month
    for (let i = 2; i < candidates.length; i += 7) {
      const dt = candidates[i];
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (dateStr >= today) {
        shifts.push({
          date: dateStr,
          day_of_week: dt.toLocaleDateString('en-US', { weekday: 'long' }),
          employee_name: employeeName,
        });
      }
    }
  }

  return shifts.sort((a, b) => a.date.localeCompare(b.date));
}

export default function ProfilePage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const useMockData = useExchangeStore((s) => s.useMockData);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (useMockData) {
      setShifts(generateMockShifts(user?.name || 'Test User'));
      setLoading(false);
      return;
    }

    if (!user?.employee_id) {
      setLoading(false);
      return;
    }

    const fetchShifts = async () => {
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const nextDate = new Date(now.getFullYear(), now.getMonth() + 1);
        const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

        const [currentData, nextData] = await Promise.all([
          exchangeApi.getMyShifts(currentMonth).catch(() => ({ shifts: [] })),
          exchangeApi.getMyShifts(nextMonth).catch(() => ({ shifts: [] })),
        ]);

        const today = now.toISOString().split('T')[0];
        const allShifts = [...currentData.shifts, ...nextData.shifts]
          .filter((s) => s.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));

        setShifts(allShifts);
      } catch {
        setShifts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [user?.employee_id, user?.name, useMockData, authLoading]);

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // Group shifts by month
  const shiftsByMonth: Record<string, ShiftAssignment[]> = {};
  for (const s of shifts) {
    const monthKey = s.date.slice(0, 7);
    if (!shiftsByMonth[monthKey]) shiftsByMonth[monthKey] = [];
    shiftsByMonth[monthKey].push(s);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl mx-auto"
    >
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        My Profile
      </h1>

      {/* User Info Card */}
      {user && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold">
                {getInitials(user.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                  {user.name}
                </h2>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full text-xs font-medium">
                    <Shield className="w-3 h-3" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Shifts */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-500" />
          Upcoming Shifts
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : !user?.employee_id && !useMockData ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
            Your account is not linked to an employee profile.
          </p>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
            No upcoming shifts found.
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(shiftsByMonth).map(([monthKey, monthShifts]) => {
              const [year, month] = monthKey.split('-');
              const monthLabel = new Date(
                parseInt(year),
                parseInt(month) - 1
              ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

              return (
                <div key={monthKey}>
                  <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                    {monthLabel}
                  </h4>
                  <div className="space-y-2">
                    {monthShifts.map((shift) => {
                      const dateObj = new Date(shift.date + 'T00:00:00');
                      const dayNum = dateObj.getDate();
                      const monthShort = dateObj.toLocaleDateString('en-US', {
                        month: 'short',
                      });

                      return (
                        <div
                          key={shift.date}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex flex-col items-center justify-center">
                              <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400">
                                {monthShort}
                              </span>
                              <span className="text-sm font-bold text-primary-700 dark:text-primary-300 leading-none">
                                {dayNum}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">
                                {shift.day_of_week}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {shift.date}
                              </p>
                            </div>
                          </div>
                          <a
                            href={buildShiftCalendarUrl(
                              shift.date,
                              user?.name || shift.employee_name
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                              'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
                              'hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                            )}
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Add to Calendar
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
