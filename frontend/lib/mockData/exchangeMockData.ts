/**
 * Mock data generator for shift exchange UI development.
 * Produces deterministic, realistic simulated data so the UI can be
 * evaluated without a running backend.
 *
 * WARNING: This module must NEVER be used in production.
 * All exported functions throw if called when NODE_ENV === 'production'.
 */

import {
  ExchangeRequest,
  MonthSchedule,
  ScheduleDateCell,
  CellAssignment,
  EmployeeAvailability,
  EnhancedSwapCandidate,
} from '../types/exchange';
import { isDemoAllowed } from './demoMode';

function assertNotProduction() {
  if (!isDemoAllowed) {
    throw new Error('Mock data must not be used in production');
  }
}

// ── Employee roster ──────────────────────────────────────────────────
interface MockEmployee {
  id: number;
  name: string;
  is_new: boolean;
}

const EMPLOYEES: MockEmployee[] = [
  { id: 1, name: 'Noa Levi', is_new: false },
  { id: 2, name: 'James Wilson', is_new: false },
  { id: 3, name: 'Fatima Al-Rashid', is_new: false },
  { id: 4, name: 'Wei Chen', is_new: false },
  { id: 5, name: 'Yael Mizrahi', is_new: false },
  { id: 6, name: 'Sarah Thompson', is_new: false },
  { id: 7, name: 'Omar Hassan', is_new: false },
  { id: 8, name: 'Li Zhang', is_new: false },
  { id: 9, name: 'David Cohen', is_new: false },
  { id: 10, name: 'Amira Khalil', is_new: true },
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

// ── Shift types for mock data ────────────────────────────────────────
const SHIFT_TYPE_KEYS = ['ect', 'internal', 'er'] as const;

// ── Caches ───────────────────────────────────────────────────────────
// Caches are cleared on HMR to ensure code changes take effect immediately.
let assignmentCache = new Map<string, Map<string, { name: string; id: number; shift_type: string }[]>>();
let scheduleCache = new Map<string, MonthSchedule>();
let exchangeCache = new Map<string, ExchangeRequest[]>();
let availabilityCache = new Map<string, EmployeeAvailability[]>();

// Clear caches on HMR so code changes take effect without full reload
if (typeof module !== 'undefined' && (module as any).hot) {
  (module as any).hot.dispose(() => {
    assignmentCache = new Map();
    scheduleCache = new Map();
    exchangeCache = new Map();
    availabilityCache = new Map();
  });
}

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
 * Generate shift dates for a month across multiple shift types.
 *
 * ECT: 15-18 dates (weekdays, no Fri/Sat), max 2 per employee, 1 per week, etc.
 * Internal & ER: A smaller number of additional shifts on some overlapping dates
 * to demonstrate multi-type per date.
 *
 * Returns a Map where each date maps to an array of assignments (supporting
 * multiple shift types on the same date).
 */
export function generateMonthAssignments(
  year: number,
  month: number
): Map<string, { name: string; id: number; shift_type: string }[]> {
  assertNotProduction();
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

  // ── ECT assignments (primary, same logic as before) ─────────────
  const targetCount = Math.min(15 + Math.floor(rand() * 4), eligibleDates.length);
  const shuffled = [...eligibleDates].sort(() => rand() - 0.5);
  const ectDates = shuffled.slice(0, targetCount).sort();

  const allWeeks = [...new Set(ectDates.map((ds) => getISOWeek(parseDate(ds))))].sort(
    (a, b) => a - b
  );
  const allowedNewWeeks = new Set(allWeeks.slice(-2));

  const assignments = new Map<string, { name: string; id: number; shift_type: string }[]>();

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

  const empOrder = [...EMPLOYEES].sort(() => rand() - 0.5);

  for (const dateStr of ectDates) {
    const d = parseDate(dateStr);
    const week = getISOWeek(d);
    const weekday = d.getDay();

    let assigned = false;
    for (const emp of empOrder) {
      const count = empCount.get(emp.id)!;
      const weeks = empWeeks.get(emp.id)!;
      const dates = empDates.get(emp.id)!;
      const weekdays = empWeekdays.get(emp.id)!;

      if (count >= 2) continue;
      if (weeks.has(week)) continue;
      if (dates.length > 0) {
        const lastDate = parseDate(dates[dates.length - 1]);
        const diff = Math.abs(d.getTime() - lastDate.getTime()) / 86400000;
        if (diff === 1) continue;
      }
      if (count === 1 && weekdays.has(weekday)) continue;
      if (emp.is_new && !allowedNewWeeks.has(week)) continue;

      assignments.set(dateStr, [{ name: emp.name, id: emp.id, shift_type: 'ect' }]);
      empCount.set(emp.id, count + 1);
      weeks.add(week);
      dates.push(dateStr);
      weekdays.add(weekday);
      assigned = true;
      break;
    }

    if (!assigned) {
      for (const emp of empOrder) {
        if (empCount.get(emp.id)! < 2) {
          assignments.set(dateStr, [{ name: emp.name, id: emp.id, shift_type: 'ect' }]);
          empCount.set(emp.id, empCount.get(emp.id)! + 1);
          empWeeks.get(emp.id)!.add(week);
          empDates.get(emp.id)!.push(dateStr);
          empWeekdays.get(emp.id)!.add(weekday);
          break;
        }
      }
    }
  }

  // ── Internal Medicine & ER assignments (overlay on some ECT dates) ──
  // Add ~4 Internal and ~3 ER shifts on some dates that already have ECT
  const ectAssignedDates = [...assignments.keys()];
  const overlayTypes: { type: string; count: number }[] = [
    { type: 'internal', count: Math.min(4, Math.floor(ectAssignedDates.length / 4)) },
    { type: 'er', count: Math.min(3, Math.floor(ectAssignedDates.length / 5)) },
  ];

  const rand2 = seededRandom(year * 300 + month);
  const shuffledDates = [...ectAssignedDates].sort(() => rand2() - 0.5);

  let dateIdx = 0;
  for (const { type, count } of overlayTypes) {
    const availableEmps = [...EMPLOYEES].sort(() => rand2() - 0.5);
    let empIdx = 0;

    for (let i = 0; i < count && dateIdx < shuffledDates.length; i++, dateIdx++) {
      const dateStr = shuffledDates[dateIdx];
      const existing = assignments.get(dateStr) || [];

      // Pick an employee not already assigned on this date
      let chosenEmp = availableEmps[empIdx % availableEmps.length];
      const existingNames = new Set(existing.map((e) => e.name));
      let tries = 0;
      while (existingNames.has(chosenEmp.name) && tries < EMPLOYEES.length) {
        empIdx++;
        chosenEmp = availableEmps[empIdx % availableEmps.length];
        tries++;
      }
      if (existingNames.has(chosenEmp.name)) continue;

      existing.push({ name: chosenEmp.name, id: chosenEmp.id, shift_type: type });
      assignments.set(dateStr, existing);
      empIdx++;
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
  assertNotProduction();
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
      const entries = assignments.get(dateStr);
      const isAssigned = entries?.some((e) => e.id === emp.id);
      if (isAssigned) {
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

// ── Helpers for flat view (for swap validation) ──────────────────────
/**
 * Flatten multi-entry assignments for a specific employee.
 * Picks the entry matching `forEmployeeName` when present, otherwise first.
 */
function flattenAssignments(
  assignments: Map<string, { name: string; id: number; shift_type: string }[]>,
  forEmployeeName?: string
): Map<string, { name: string; id: number }> {
  const flat = new Map<string, { name: string; id: number }>();
  for (const [dateStr, entries] of assignments) {
    if (entries.length > 0) {
      const match = forEmployeeName
        ? entries.find((e) => e.name === forEmployeeName)
        : undefined;
      const entry = match || entries[0];
      flat.set(dateStr, { name: entry.name, id: entry.id });
    }
  }
  return flat;
}

// ── Swap validation (port of backend validate_swap) ──────────────────
function validateSwap(
  assignments: Map<string, { name: string; id: number; shift_type: string }[]>,
  requesterName: string,
  requesterDate: string,
  targetName: string,
  targetDate: string
): string[] {
  const errors: string[] = [];

  // 1. Ownership check — look at raw entries to support multi-type dates
  const rEntries = assignments.get(requesterDate) || [];
  const tEntries = assignments.get(targetDate) || [];
  const rAssignee = rEntries.find((e) => e.name === requesterName);
  const tAssignee = tEntries.find((e) => e.name === targetName);
  if (!rAssignee) {
    errors.push(`${requesterName} is not assigned to ${requesterDate}`);
  }
  if (!tAssignee) {
    errors.push(`${targetName} is not assigned to ${targetDate}`);
  }
  if (errors.length > 0) return errors;

  // Build flat view for per-employee constraint checks
  const flat = flattenAssignments(assignments);

  // Simulate swap
  const simulated = new Map(flat);
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
  assertNotProduction();
  const assignments = generateMonthAssignments(year, month);
  const formResponses = generateFormResponses(year, month);

  const dateEntries = assignments.get(shiftDate);
  const requester = dateEntries?.find((e) => e.id === CURRENT_USER_ID);
  if (!requester) return [];

  const candidates: EnhancedSwapCandidate[] = [];

  // For each other employee who has shifts this month (use flat view for iteration)
  for (const [dateStr, entries] of assignments) {
    for (const assignee of entries) {
      if (assignee.id === CURRENT_USER_ID) continue;

      let candidate = candidates.find((c) => c.employee_id === assignee.id);

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
          const empDates: string[] = [];
          for (const [d, ents] of assignments) {
            if (ents.some((e) => e.id === assignee.id)) empDates.push(d);
          }
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
        if (!candidate.eligible_dates.includes(dateStr)) {
          candidate.eligible_dates.push(dateStr);
        }
      }
    }
  }

  // Also include employees who are available on the shift date but have no
  // assignments yet (they can simply take the shift — no swap needed).
  // This ensures the candidates panel is never empty for a valid user shift.
  for (const emp of EMPLOYEES) {
    if (emp.id === CURRENT_USER_ID) continue;
    if (candidates.some((c) => c.employee_id === emp.id)) continue;

    const avail = formResponses.find((a) => a.employeeId === emp.id);
    if (!avail || !avail.availableDates.includes(shiftDate)) continue;

    const empDates: string[] = [];
    for (const [d, ents] of assignments) {
      if (ents.some((e) => e.id === emp.id)) empDates.push(d);
    }

    // Prefer employees with fewer shifts but allow up to 2 for mock variety
    if (empDates.length > 2) continue;

    candidates.push({
      employee_id: emp.id,
      employee_name: emp.name,
      eligible_dates: [shiftDate],
      is_new: emp.is_new,
      all_shift_dates: empDates,
      availability: avail,
    });
  }

  return candidates.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

// ── Month schedule builder ───────────────────────────────────────────
export function generateMonthSchedule(year: number, month: number): MonthSchedule {
  assertNotProduction();
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
    const entries = assignments.get(dateStr) || [];
    const isCurrentUser = entries.some((e) => e.id === CURRENT_USER_ID);
    const firstEntry = entries[0] || null;

    if (isCurrentUser) currentUserShiftDates.push(dateStr);

    const cellAssignments: CellAssignment[] = entries.map((e) => ({
      employee_name: e.name,
      employee_id: e.id,
      shift_type: e.shift_type,
      isCurrentUser: e.id === CURRENT_USER_ID,
    }));

    dates.push({
      date: dateStr,
      dayNumber: d,
      assignments: cellAssignments,
      assignedEmployee: firstEntry?.name || null,
      assignedEmployeeId: firstEntry?.id || null,
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
  assertNotProduction();
  if (exchangeCache.has(monthYear)) return exchangeCache.get(monthYear)!;

  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const assignments = generateMonthAssignments(year, month);
  const today = new Date().toISOString().split('T')[0];

  const exchanges: ExchangeRequest[] = [];
  let idCounter = 1;

  // Collect ALL dates (for history) and future dates (for pending exchanges)
  const allMyDates: { date: string; shift_type: string }[] = [];
  const futureMyDates: { date: string; shift_type: string }[] = [];
  const allOtherAssignments: { date: string; name: string; id: number; shift_type: string }[] = [];
  const futureOtherAssignments: { date: string; name: string; id: number; shift_type: string }[] = [];

  for (const [dateStr, entries] of assignments) {
    for (const assignee of entries) {
      if (assignee.id === CURRENT_USER_ID) {
        allMyDates.push({ date: dateStr, shift_type: assignee.shift_type });
        if (dateStr >= today) futureMyDates.push({ date: dateStr, shift_type: assignee.shift_type });
      } else {
        allOtherAssignments.push({ date: dateStr, name: assignee.name, id: assignee.id, shift_type: assignee.shift_type });
        if (dateStr >= today) futureOtherAssignments.push({ date: dateStr, name: assignee.name, id: assignee.id, shift_type: assignee.shift_type });
      }
    }
  }

  // Use future dates for pending if available, otherwise fall back to all dates
  // (so that mid-month the mock data still shows realistic pending exchanges)
  const myDates = futureMyDates.length > 0 ? futureMyDates : allMyDates;
  const otherAssignments = futureOtherAssignments.length >= 3 ? futureOtherAssignments : allOtherAssignments;

  // 2 pending incoming requests (others want to swap with current user)
  if (myDates.length > 0 && otherAssignments.length >= 2) {
    for (let i = 0; i < Math.min(2, otherAssignments.length); i++) {
      const other = otherAssignments[i];
      const myShift = myDates[0];
      exchanges.push({
        id: idCounter++,
        month_year: monthYear,
        requester_employee_id: other.id,
        requester_employee_name: other.name,
        requester_date: other.date,
        requester_shift_type: other.shift_type,
        target_employee_id: CURRENT_USER_ID,
        target_employee_name: CURRENT_USER_NAME,
        target_date: myShift.date,
        target_shift_type: myShift.shift_type,
        status: 'pending',
        reason: i === 0 ? 'I have a doctor appointment that day' : undefined,
        created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      });
    }
  }

  // 1 pending outgoing request (current user wants to swap with someone)
  if (myDates.length > 0 && otherAssignments.length >= 3) {
    const other = otherAssignments[2];
    const myShift = myDates[myDates.length > 1 ? 1 : 0];
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: CURRENT_USER_ID,
      requester_employee_name: CURRENT_USER_NAME,
      requester_date: myShift.date,
      requester_shift_type: myShift.shift_type,
      target_employee_id: other.id,
      target_employee_name: other.name,
      target_date: other.date,
      target_shift_type: other.shift_type,
      status: 'pending',
      reason: 'Family event',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    });
  }

  // 1 accepted (history) - use all dates (including past) for history items
  if (allOtherAssignments.length >= 4) {
    const other = allOtherAssignments[3];
    const myShift = allMyDates.length > 0 ? allMyDates[0] : null;
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: CURRENT_USER_ID,
      requester_employee_name: CURRENT_USER_NAME,
      requester_date: myShift ? myShift.date : formatDate(year, month, 10),
      requester_shift_type: myShift?.shift_type,
      target_employee_id: other.id,
      target_employee_name: other.name,
      target_date: other.date,
      target_shift_type: other.shift_type,
      status: 'accepted',
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      responded_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      completed_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    });
  }

  // 1 declined (history) - use all dates for history items
  if (allOtherAssignments.length >= 5) {
    const other = allOtherAssignments[4];
    const myShift = allMyDates.length > 1 ? allMyDates[1] : null;
    exchanges.push({
      id: idCounter++,
      month_year: monthYear,
      requester_employee_id: other.id,
      requester_employee_name: other.name,
      requester_date: other.date,
      requester_shift_type: other.shift_type,
      target_employee_id: CURRENT_USER_ID,
      target_employee_name: CURRENT_USER_NAME,
      target_date: myShift ? myShift.date : formatDate(year, month, 15),
      target_shift_type: myShift?.shift_type,
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
  assertNotProduction();
  const exchanges = generateMockExchanges(monthYear);
  const exchange = exchanges.find((e) => e.id === exchangeId);
  if (exchange) {
    exchange.status = 'accepted';
    exchange.responded_at = new Date().toISOString();
    exchange.completed_at = new Date().toISOString();
  }
}

export function mockDeclineExchange(monthYear: string, exchangeId: number): void {
  assertNotProduction();
  const exchanges = generateMockExchanges(monthYear);
  const exchange = exchanges.find((e) => e.id === exchangeId);
  if (exchange) {
    exchange.status = 'declined';
    exchange.responded_at = new Date().toISOString();
    exchange.decline_reason = 'Declined via mock';
  }
}

export function mockCancelExchange(monthYear: string, exchangeId: number): void {
  assertNotProduction();
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
  requesterShiftType?: string;
  targetShiftType?: string;
}): void {
  assertNotProduction();
  const exchanges = generateMockExchanges(monthYear);
  const maxId = exchanges.reduce((max, e) => Math.max(max, e.id), 0);
  exchanges.push({
    id: maxId + 1,
    month_year: monthYear,
    requester_employee_id: CURRENT_USER_ID,
    requester_employee_name: CURRENT_USER_NAME,
    requester_date: data.requesterDate,
    requester_shift_type: data.requesterShiftType,
    target_employee_id: data.targetEmployeeId,
    target_employee_name: data.targetEmployeeName,
    target_date: data.targetDate,
    target_shift_type: data.targetShiftType,
    status: 'pending',
    reason: data.reason,
    created_at: new Date().toISOString(),
  });
}

// ── Helpers for panels ───────────────────────────────────────────────
export function getMockIncomingRequests(monthYear: string): ExchangeRequest[] {
  assertNotProduction();
  return generateMockExchanges(monthYear).filter(
    (e) => e.status === 'pending' && e.target_employee_id === CURRENT_USER_ID
  );
}

export function getMockOutgoingRequests(monthYear: string): ExchangeRequest[] {
  assertNotProduction();
  return generateMockExchanges(monthYear).filter(
    (e) => e.status === 'pending' && e.requester_employee_id === CURRENT_USER_ID
  );
}

export function getMockHistory(monthYear: string): ExchangeRequest[] {
  assertNotProduction();
  return generateMockExchanges(monthYear).filter((e) => e.status !== 'pending');
}

export function getMockIncomingCount(monthYear: string): number {
  assertNotProduction();
  return getMockIncomingRequests(monthYear).length;
}
