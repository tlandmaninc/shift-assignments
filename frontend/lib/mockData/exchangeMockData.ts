/**
 * Mock data generator for shift exchange UI development.
 * Produces deterministic, realistic simulated data so the UI can be
 * evaluated without a running backend.
 */

import {
  ExchangeRequest,
  MonthSchedule,
  ScheduleDateCell,
  EmployeeAvailability,
  EnhancedSwapCandidate,
} from '../types/exchange';

// ── Employee roster ──────────────────────────────────────────────────
interface MockEmployee {
  id: number;
  name: string;
  is_new: boolean;
}

const EMPLOYEES: MockEmployee[] = [
  { id: 1, name: 'Ahmad Al-Rashid', is_new: false },
  { id: 2, name: 'Fatima Hassan', is_new: false },
  { id: 3, name: 'Omar Khalil', is_new: false },
  { id: 4, name: 'Layla Mansour', is_new: false },
  { id: 5, name: 'Yusuf Nasser', is_new: false },
  { id: 6, name: 'Hana Ibrahim', is_new: false },
  { id: 7, name: 'Karim Saleh', is_new: false },
  { id: 8, name: 'Nadia Farouk', is_new: false },
  { id: 9, name: 'Tariq Bazzi', is_new: false },
  { id: 10, name: 'Sara Jaber', is_new: true },
];

/** The "current user" is always employee 1. */
export const CURRENT_USER_ID = 1;
export const CURRENT_USER_NAME = EMPLOYEES[0].name;

// ── Deterministic seeded random ──────────────────────────────────────
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Caches ───────────────────────────────────────────────────────────
const assignmentCache = new Map<string, Map<string, { name: string; id: number }>>();
const scheduleCache = new Map<string, MonthSchedule>();
const exchangeCache = new Map<string, ExchangeRequest[]>();
const availabilityCache = new Map<string, EmployeeAvailability[]>();

// ── Date helpers ─────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ── Assignment generation ────────────────────────────────────────────
/**
 * Generate 15-18 shift dates for a month (weekdays only, no Fri/Sat),
 * then assign employees round-robin while respecting constraints:
 * - Max 2 per employee per month
 * - Max 1 per ISO week per employee
 * - No consecutive days for same employee
 * - Different weekdays if 2 shifts
 * - New employees only in last 2 ISO weeks
 */
export function generateMonthAssignments(
  year: number,
  month: number
): Map<string, { name: string; id: number }> {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (assignmentCache.has(key)) return assignmentCache.get(key)!;

  const rand = seededRandom(year * 100 + month);
  const totalDays = getDaysInMonth(year, month);

  // Collect eligible dates (Sun-Thu, i.e. not Fri=5 or Sat=6)
  const eligibleDates: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDate(year, month, d);
    const dayOfWeek = parseDate(dateStr).getDay();
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      eligibleDates.push(dateStr);
    }
  }

  // Pick 15-18 shift dates
  const targetCount = Math.min(15 + Math.floor(rand() * 4), eligibleDates.length);
  const shuffled = [...eligibleDates].sort(() => rand() - 0.5);
  const shiftDates = shuffled.slice(0, targetCount).sort();

  // Compute last 2 ISO weeks of the shift dates for new-employee restriction
  const allWeeks = [...new Set(shiftDates.map((ds) => getISOWeek(parseDate(ds))))].sort(
    (a, b) => a - b
  );
  const allowedNewWeeks = new Set(allWeeks.slice(-2));

  // Assign employees
  const assignments = new Map<string, { name: string; id: number }>();

  // Track per-employee: assigned count, weeks, dates, weekdays
  const empCount = new Map<number, number>();
  const empWeeks = new Map<number, Set<number>>();
  const empDates = new Map<number, string[]>();
  const empWeekdays = new Map<number, Set<number>>();

  for (const emp of EMPLOYEES) {
    empCount.set(emp.id, 0);
    empWeeks.set(emp.id, new Set());
    empDates.set(emp.id, []);
    empWeekdays.set(emp.id, new Set());
  }

  // Shuffle employees for variety, but keep deterministic
  const empOrder = [...EMPLOYEES].sort(() => rand() - 0.5);

  for (const dateStr of shiftDates) {
    const d = parseDate(dateStr);
    const week = getISOWeek(d);
    const weekday = d.getDay();

    let assigned = false;
    for (const emp of empOrder) {
      const count = empCount.get(emp.id)!;
      const weeks = empWeeks.get(emp.id)!;
      const dates = empDates.get(emp.id)!;
      const weekdays = empWeekdays.get(emp.id)!;

      // Max 2 per month
      if (count >= 2) continue;
      // Max 1 per ISO week
      if (weeks.has(week)) continue;
      // No consecutive days
      if (dates.length > 0) {
        const lastDate = parseDate(dates[dates.length - 1]);
        const diff = Math.abs(d.getTime() - lastDate.getTime()) / 86400000;
        if (diff === 1) continue;
      }
      // Different weekdays
      if (count === 1 && weekdays.has(weekday)) continue;
      // New employee restriction
      if (emp.is_new && !allowedNewWeeks.has(week)) continue;

      assignments.set(dateStr, { name: emp.name, id: emp.id });
      empCount.set(emp.id, count + 1);
      weeks.add(week);
      dates.push(dateStr);
      weekdays.add(weekday);
      assigned = true;
      break;
    }

    // Fallback: assign to anyone with room (relaxing constraints except max 2)
    if (!assigned) {
      for (const emp of empOrder) {
        if (empCount.get(emp.id)! < 2) {
          assignments.set(dateStr, { name: emp.name, id: emp.id });
          empCount.set(emp.id, empCount.get(emp.id)! + 1);
          empWeeks.get(emp.id)!.add(week);
          empDates.get(emp.id)!.push(dateStr);
          empWeekdays.get(emp.id)!.add(weekday);
          break;
        }
      }
    }
  }

  assignmentCache.set(key, assignments);
  return assignments;
}

// ── Form response simulation ─────────────────────────────────────────
export function generateFormResponses(
  year: number,
  month: number
): EmployeeAvailability[] {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (availabilityCache.has(key)) return availabilityCache.get(key)!;

  const rand = seededRandom(year * 200 + month);
  const assignments = generateMonthAssignments(year, month);
  const totalDays = getDaysInMonth(year, month);

  // All eligible (non-weekend) dates
  const eligibleDates: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDate(year, month, d);
    const dayOfWeek = parseDate(dateStr).getDay();
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      eligibleDates.push(dateStr);
    }
  }

  const result: EmployeeAvailability[] = EMPLOYEES.map((emp) => {
    const available: string[] = [];
    const unavailable: string[] = [];

    for (const dateStr of eligibleDates) {
      const assignee = assignments.get(dateStr);
      if (assignee && assignee.id === emp.id) {
        // Assigned employees are always available on their dates
        available.push(dateStr);
      } else if (rand() < 0.65) {
        available.push(dateStr);
      } else {
        unavailable.push(dateStr);
      }
    }

    return {
      employeeId: emp.id,
      name: emp.name,
      availableDates: available,
      unavailableDates: unavailable,
    };
  });

  availabilityCache.set(key, result);
  return result;
}

// ── Swap validation (port of backend validate_swap) ──────────────────
function validateSwap(
  assignments: Map<string, { name: string; id: number }>,
  requesterName: string,
  requesterDate: string,
  targetName: string,
  targetDate: string
): string[] {
  const errors: string[] = [];

  // 1. Ownership check
  const rAssignee = assignments.get(requesterDate);
  const tAssignee = assignments.get(targetDate);
  if (!rAssignee || rAssignee.name !== requesterName) {
    errors.push(`${requesterName} is not assigned to ${requesterDate}`);
  }
  if (!tAssignee || tAssignee.name !== targetName) {
    errors.push(`${targetName} is not assigned to ${targetDate}`);
  }
  if (errors.length > 0) return errors;

  // Simulate swap
  const simulated = new Map(assignments);
  simulated.set(requesterDate, { name: targetName, id: tAssignee!.id });
  simulated.set(targetDate, { name: requesterName, id: rAssignee!.id });

  // Build per-employee shifts
  const empShifts = new Map<string, Date[]>();
  for (const [dateStr, emp] of simulated) {
    if (!empShifts.has(emp.name)) empShifts.set(emp.name, []);
    empShifts.get(emp.name)!.push(parseDate(dateStr));
  }

  const empLookup = new Map(EMPLOYEES.map((e) => [e.name, e]));

  for (const name of [requesterName, targetName]) {
    const shifts = (empShifts.get(name) || []).sort((a, b) => a.getTime() - b.getTime());
    const emp = empLookup.get(name);

    // 2. Max 2 per month
    if (shifts.length > 2) {
      errors.push(`${name} would have ${shifts.length} shifts (max 2)`);
    }

    // 3. Max 1 per ISO week
    const weekCounts = new Map<number, number>();
    for (const d of shifts) {
      const wk = getISOWeek(d);
      weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);
      if (weekCounts.get(wk)! > 1) {
        errors.push(`${name} would have multiple shifts in ISO week ${wk}`);
      }
    }

    // 4. No consecutive days
    for (let i = 0; i < shifts.length - 1; i++) {
      const diff = (shifts[i + 1].getTime() - shifts[i].getTime()) / 86400000;
      if (diff === 1) {
        errors.push(`${name} would have consecutive shifts`);
      }
    }

    // 5. Different weekdays if 2 shifts
    if (shifts.length === 2 && shifts[0].getDay() === shifts[1].getDay()) {
      errors.push(`${name} would have two shifts on the same weekday`);
    }

    // 6. New employee restriction
    if (emp?.is_new) {
      const allDates = [...simulated.keys()].map((ds) => parseDate(ds));
      const allWeeks = [...new Set(allDates.map((d) => getISOWeek(d)))].sort((a, b) => a - b);
      const allowedWeeks = new Set(allWeeks.slice(-2));
      for (const d of shifts) {
        if (!allowedWeeks.has(getISOWeek(d))) {
          errors.push(`${name} is a new employee and cannot be assigned in that week`);
        }
      }
    }
  }

  return errors;
}

// ── Eligible partner generation ──────────────────────────────────────
export function generateMockCandidates(
  shiftDate: string,
  year: number,
  month: number
): EnhancedSwapCandidate[] {
  const assignments = generateMonthAssignments(year, month);
  const formResponses = generateFormResponses(year, month);

  const requester = assignments.get(shiftDate);
  if (!requester || requester.id !== CURRENT_USER_ID) return [];

  const candidates: EnhancedSwapCandidate[] = [];

  // For each other employee who has shifts this month
  for (const [dateStr, assignee] of assignments) {
    if (assignee.id === CURRENT_USER_ID) continue;

    // Check if this employee already has an entry
    let candidate = candidates.find((c) => c.employee_id === assignee.id);

    // Validate swapping requester's date with this employee's date
    const errors = validateSwap(
      assignments,
      requester.name,
      shiftDate,
      assignee.name,
      dateStr
    );

    if (errors.length === 0) {
      if (!candidate) {
        const emp = EMPLOYEES.find((e) => e.id === assignee.id)!;
        const empDates = [...assignments.entries()]
          .filter(([, a]) => a.id === assignee.id)
          .map(([d]) => d);
        const avail = formResponses.find((a) => a.employeeId === assignee.id);

        candidate = {
          employee_id: assignee.id,
          employee_name: assignee.name,
          eligible_dates: [],
          is_new: emp.is_new,
          all_shift_dates: empDates,
          availability: avail,
        };
        candidates.push(candidate);
      }
      candidate.eligible_dates.push(dateStr);
    }
  }

  return candidates.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

// ── Month schedule builder ───────────────────────────────────────────
export function generateMonthSchedule(year: number, month: number): MonthSchedule {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (scheduleCache.has(key)) return scheduleCache.get(key)!;

  const assignments = generateMonthAssignments(year, month);
  const totalDays = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOffset(year, month);
  const today = new Date().toISOString().split('T')[0];

  const dates: ScheduleDateCell[] = [];
  const currentUserShiftDates: string[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDate(year, month, d);
    const dateObj = parseDate(dateStr);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const assignee = assignments.get(dateStr);
    const isCurrentUser = assignee?.id === CURRENT_USER_ID;

    if (isCurrentUser) currentUserShiftDates.push(dateStr);

    dates.push({
      date: dateStr,
      dayNumber: d,
      assignedEmployee: assignee?.name || null,
      assignedEmployeeId: assignee?.id || null,
      isCurrentUserShift: isCurrentUser,
      isPast: dateStr < today,
      isWeekend,
      hasPendingExchange: false,
    });
  }

  const schedule: MonthSchedule = {
    year,
    month,
    firstDayOffset,
    daysInMonth: totalDays,
    dates,
    currentUserShiftDates,
  };

  scheduleCache.set(key, schedule);
  return schedule;
}

// ── Mock exchanges ───────────────────────────────────────────────────
export function generateMockExchanges(monthYear: string): ExchangeRequest[] {
  if (exchangeCache.has(monthYear)) return exchangeCache.get(monthYear)!;

  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const assignments = generateMonthAssignments(year, month);
  const today = new Date().toISOString().split('T')[0];

  const exchanges: ExchangeRequest[] = [];
  let idCounter = 1;

  // Find current user's shift dates and other employees' dates
  const myDates: string[] = [];
  const otherAssignments: { date: string; name: string; id: number }[] = [];

  for (const [dateStr, assignee] of assignments) {
    if (dateStr < today) continue; // Only future dates for pending
    if (assignee.id === CURRENT_USER_ID) {
      myDates.push(dateStr);
    } else {
      otherAssignments.push({ date: dateStr, ...assignee });
    }
  }

  // 2 pending incoming requests (others want to swap with current user)
  if (myDates.length > 0 && otherAssignments.length >= 2) {
    for (let i = 0; i < Math.min(2, otherAssignments.length); i++) {
      const other = otherAssignments[i];
      exchanges.push({
        id: idCounter++,
        month_year: monthYear,
        requester_employee_id: other.id,
        requester_employee_name: other.name,
        requester_date: other.date,
        target_employee_id: CURRENT_USER_ID,
        target_employee_name: CURRENT_USER_NAME,
        target_date: myDates[0],
        status: 'pending',
        reason: i === 0 ? 'I have a doctor appointment that day' : undefined,
        created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      });
    }
  }

  // 1 pending outgoing request (current user wants to swap with someone)
  if (myDates.length > 0 && otherAssignments.length >= 3) {
    const other = otherAssignments[2];
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: CURRENT_USER_ID,
      requester_employee_name: CURRENT_USER_NAME,
      requester_date: myDates[myDates.length > 1 ? 1 : 0],
      target_employee_id: other.id,
      target_employee_name: other.name,
      target_date: other.date,
      status: 'pending',
      reason: 'Family event',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    });
  }

  // 1 accepted (history)
  if (otherAssignments.length >= 4) {
    const other = otherAssignments[3];
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: CURRENT_USER_ID,
      requester_employee_name: CURRENT_USER_NAME,
      requester_date: myDates.length > 0 ? myDates[0] : formatDate(year, month, 10),
      target_employee_id: other.id,
      target_employee_name: other.name,
      target_date: other.date,
      status: 'accepted',
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      responded_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      completed_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    });
  }

  // 1 declined (history)
  if (otherAssignments.length >= 5) {
    const other = otherAssignments[4];
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: other.id,
      requester_employee_name: other.name,
      requester_date: other.date,
      target_employee_id: CURRENT_USER_ID,
      target_employee_name: CURRENT_USER_NAME,
      target_date: myDates.length > 1 ? myDates[1] : formatDate(year, month, 15),
      status: 'declined',
      decline_reason: 'Cannot swap that week',
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      responded_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    });
  }

  exchangeCache.set(monthYear, exchanges);
  return exchanges;
}

// ── Mutation helpers (update cached exchanges in-place) ──────────────
export function mockAcceptExchange(monthYear: string, exchangeId: number): void {
  const exchanges = generateMockExchanges(monthYear);
  const exchange = exchanges.find((e) => e.id === exchangeId);
  if (exchange) {
    exchange.status = 'accepted';
    exchange.responded_at = new Date().toISOString();
    exchange.completed_at = new Date().toISOString();
  }
}

export function mockDeclineExchange(monthYear: string, exchangeId: number): void {
  const exchanges = generateMockExchanges(monthYear);
  const exchange = exchanges.find((e) => e.id === exchangeId);
  if (exchange) {
    exchange.status = 'declined';
    exchange.responded_at = new Date().toISOString();
    exchange.decline_reason = 'Declined via mock';
  }
}

export function mockCancelExchange(monthYear: string, exchangeId: number): void {
  const exchanges = generateMockExchanges(monthYear);
  const exchange = exchanges.find((e) => e.id === exchangeId);
  if (exchange) {
    exchange.status = 'cancelled';
    exchange.responded_at = new Date().toISOString();
  }
}

export function mockCreateExchange(monthYear: string, data: {
  requesterDate: string;
  targetEmployeeId: number;
  targetEmployeeName: string;
  targetDate: string;
  reason?: string;
}): void {
  const exchanges = generateMockExchanges(monthYear);
  const maxId = exchanges.reduce((max, e) => Math.max(max, e.id), 0);
  exchanges.push({
    id: maxId + 1,
    month_year: monthYear,
    requester_employee_id: CURRENT_USER_ID,
    requester_employee_name: CURRENT_USER_NAME,
    requester_date: data.requesterDate,
    target_employee_id: data.targetEmployeeId,
    target_employee_name: data.targetEmployeeName,
    target_date: data.targetDate,
    status: 'pending',
    reason: data.reason,
    created_at: new Date().toISOString(),
  });
}

// ── Helpers for panels ───────────────────────────────────────────────
export function getMockIncomingRequests(monthYear: string): ExchangeRequest[] {
  return generateMockExchanges(monthYear).filter(
    (e) => e.status === 'pending' && e.target_employee_id === CURRENT_USER_ID
  );
}

export function getMockOutgoingRequests(monthYear: string): ExchangeRequest[] {
  return generateMockExchanges(monthYear).filter(
    (e) => e.status === 'pending' && e.requester_employee_id === CURRENT_USER_ID
  );
}

export function getMockHistory(monthYear: string): ExchangeRequest[] {
  return generateMockExchanges(monthYear).filter((e) => e.status !== 'pending');
}

export function getMockIncomingCount(monthYear: string): number {
  return getMockIncomingRequests(monthYear).length;
}
