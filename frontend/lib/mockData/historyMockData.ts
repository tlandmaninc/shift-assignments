/**
 * Mock data generators for the History & Analytics page.
 * Uses the same employee roster from exchangeMockData for consistency.
 */

import { generateMonthAssignments } from './exchangeMockData';
import { SHIFT_TYPES } from '../constants/shiftTypes';

const SHIFT_TYPE_KEYS = Object.keys(SHIFT_TYPES);

// Re-use the same roster
const EMPLOYEES = [
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

/** Get the last N months as YYYY-MM strings, ending with the current month. */
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }
  return months;
}

/** Count shifts by type from assignments. */
function countByType(
  assignments: Map<string, { name: string; id: number; shift_type: string }[]>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of SHIFT_TYPE_KEYS) counts[key] = 0;

  for (const entries of assignments.values()) {
    for (const entry of entries) {
      const st = entry.shift_type || 'ect';
      counts[st] = (counts[st] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Generate mock history data (monthly assignment summaries).
 * Shape matches what historyApi.get() returns.
 */
export function generateMockHistory() {
  const months = getRecentMonths(6);
  const monthlyAssignments = months.map((monthYear) => {
    const [yearStr, monthStr] = monthYear.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const assignments = generateMonthAssignments(year, month);

    const employeeSet = new Set<string>();
    for (const entries of assignments.values()) {
      for (const e of entries) {
        employeeSet.add(e.name);
      }
    }

    const byType = countByType(assignments);

    return {
      month_year: monthYear,
      total_shifts: [...assignments.values()].reduce((s, arr) => s + arr.length, 0),
      employees_count: employeeSet.size,
      by_type: byType,
    };
  });

  return { monthly_assignments: monthlyAssignments };
}

/**
 * Generate mock fairness scores.
 * Shape matches what historyApi.getFairness() returns.
 * When shiftType is provided, only counts shifts of that type.
 */
export function generateMockFairness(shiftType?: string | null) {
  const months = getRecentMonths(6);

  // Tally up total shifts per employee across all months
  const shiftCounts = new Map<number, number>();
  const shiftsByType = new Map<number, Record<string, number>>();
  const lastShift = new Map<number, string>();

  for (const emp of EMPLOYEES) {
    shiftCounts.set(emp.id, 0);
    const typeMap: Record<string, number> = {};
    for (const key of SHIFT_TYPE_KEYS) typeMap[key] = 0;
    shiftsByType.set(emp.id, typeMap);
  }

  for (const monthYear of months) {
    const [yearStr, monthStr] = monthYear.split('-');
    const assignments = generateMonthAssignments(
      parseInt(yearStr),
      parseInt(monthStr)
    );

    for (const [dateStr, entries] of assignments) {
      for (const entry of entries) {
        const st = entry.shift_type || 'ect';
        // Update by-type counts
        const typeMap = shiftsByType.get(entry.id);
        if (typeMap) typeMap[st] = (typeMap[st] || 0) + 1;

        // If filtering by type, only count matching shifts for totals
        if (shiftType && st !== shiftType) continue;

        shiftCounts.set(entry.id, (shiftCounts.get(entry.id) || 0) + 1);
        const prev = lastShift.get(entry.id);
        if (!prev || dateStr > prev) {
          lastShift.set(entry.id, dateStr);
        }
      }
    }
  }

  const employees = EMPLOYEES.map((emp) => ({
    id: emp.id,
    name: emp.name,
    is_new: emp.is_new,
    total_shifts: shiftCounts.get(emp.id) || 0,
    last_shift_date: lastShift.get(emp.id) || null,
    shifts_by_type: shiftsByType.get(emp.id) || {},
  }));

  const totalShifts = employees.reduce((s, e) => s + e.total_shifts, 0);
  const activeCount = employees.filter((e) => e.total_shifts > 0).length;
  const average = activeCount > 0 ? totalShifts / activeCount : 0;

  const counts = employees
    .filter((e) => e.total_shifts > 0)
    .map((e) => e.total_shifts);
  const maxShifts = Math.max(...counts, 0);
  const minShifts = Math.min(...counts, 0);

  // Standard deviation
  const variance =
    counts.length > 0
      ? counts.reduce((sum, c) => sum + (c - average) ** 2, 0) / counts.length
      : 0;
  const stdDev = Math.sqrt(variance);

  // Fairness score: 100 - (MAD / median) * 100
  const sorted = [...counts].sort((a, b) => a - b);
  const median =
    sorted.length > 0
      ? sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      : 0;
  const mad =
    sorted.length > 0
      ? sorted.map((c) => Math.abs(c - median)).sort((a, b) => a - b)[
          Math.floor(sorted.length / 2)
        ]
      : 0;
  const fairnessScore = median > 0 ? Math.max(0, 100 - (mad / median) * 100) : 100;

  return {
    fairness_score: fairnessScore,
    average_shifts: average,
    std_deviation: stdDev,
    max_shifts: maxShifts,
    min_shifts: minShifts,
    employees,
  };
}

/**
 * Generate mock monthly data (shifts per month, employee counts).
 * Shape matches what historyApi.getMonthly() returns.
 */
export function generateMockMonthlyData() {
  const months = getRecentMonths(6);

  const monthsData = months.map((monthYear) => {
    const [yearStr, monthStr] = monthYear.split('-');
    const assignments = generateMonthAssignments(
      parseInt(yearStr),
      parseInt(monthStr)
    );

    const employeeSet = new Set<number>();
    let totalShifts = 0;
    for (const entries of assignments.values()) {
      for (const e of entries) {
        employeeSet.add(e.id);
        totalShifts++;
      }
    }

    const byType = countByType(assignments);

    return {
      month_year: monthYear,
      total_shifts: totalShifts,
      employees_count: employeeSet.size,
      by_type: byType,
    };
  });

  return { months: monthsData };
}

/**
 * Generate mock employee trends (shifts per employee per month).
 * Shape matches what historyApi.getEmployeeTrends() returns.
 * Includes per-type monthly counts.
 */
export function generateMockEmployeeTrends() {
  const months = getRecentMonths(6);

  const trends = EMPLOYEES.map((emp) => {
    const monthlyShifts: Record<string, number> = {};
    const monthlyShiftsByType: Record<string, Record<string, number>> = {};

    for (const monthYear of months) {
      const [yearStr, monthStr] = monthYear.split('-');
      const assignments = generateMonthAssignments(
        parseInt(yearStr),
        parseInt(monthStr)
      );

      let count = 0;
      const typeCounts: Record<string, number> = {};
      for (const key of SHIFT_TYPE_KEYS) typeCounts[key] = 0;

      for (const entries of assignments.values()) {
        for (const e of entries) {
          if (e.id === emp.id) {
            count++;
            const st = e.shift_type || 'ect';
            typeCounts[st] = (typeCounts[st] || 0) + 1;
          }
        }
      }
      monthlyShifts[monthYear] = count;
      monthlyShiftsByType[monthYear] = typeCounts;
    }

    return {
      employee_id: emp.id,
      employee_name: emp.name,
      monthly_shifts: monthlyShifts,
      monthly_shifts_by_type: monthlyShiftsByType,
    };
  });

  return { trends };
}

/**
 * Generate mock calendar HTML for a given month.
 * Mirrors the backend CalendarGenerator output so the history modal works in mock mode.
 */
export function generateMockCalendarHtml(monthYear: string): string {
  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const assignments = generateMonthAssignments(year, month);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const title = `${monthNames[month - 1]} ${year}`;

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sunday

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Track shift counts per employee and active shift types
  const shiftCounts = new Map<string, number>();
  const activeTypes = new Set<string>();

  let dayCellsHtml = '';

  // Leading empty cells
  for (let i = 0; i < startDow; i++) {
    dayCellsHtml += '<div class="day-cell other-month"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, d).getDay();
    const classes: string[] = [];
    if (dateStr === todayIso) classes.push('today');
    if (dow === 5 || dow === 6) classes.push('weekend');

    const entries = assignments.get(dateStr) || [];
    let badgesHtml = '';
    if (entries.length > 0) {
      classes.push('has-shift');
      for (const entry of entries) {
        const st = entry.shift_type || 'ect';
        activeTypes.add(st);
        const config = SHIFT_TYPES[st] || SHIFT_TYPES.ect;
        shiftCounts.set(entry.name, (shiftCounts.get(entry.name) || 0) + 1);
        badgesHtml += `<div class="shift-badge" style="background-color: ${config.color}"><span class="type-label">${config.label}</span> <span class="employee-name">${entry.name}</span></div>`;
      }
    }

    dayCellsHtml += `<div class="day-cell ${classes.join(' ')}"><div class="day-number">${d}</div>${badgesHtml}</div>`;
  }

  // Trailing empty cells
  const totalCells = startDow + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    dayCellsHtml += '<div class="day-cell other-month"></div>';
  }

  // Legend
  const shiftTypeColors: Record<string, { label: string; color: string }> = {
    ect: { label: 'ECT', color: '#3B82F6' },
    internal: { label: 'Internal', color: '#10B981' },
    er: { label: 'ER', color: '#EF4444' },
  };

  let legendHtml = '';
  for (const st of activeTypes) {
    const cfg = shiftTypeColors[st] || { label: st, color: '#6366f1' };
    legendHtml += `<div class="legend-item"><div class="legend-color" style="background-color: ${cfg.color}"></div><span class="legend-name">${cfg.label}</span></div>`;
  }

  // Summary
  let summaryHtml = '';
  const sorted = [...shiftCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, count] of sorted) {
    summaryHtml += `<div class="summary-card"><span class="name">${name}</span><span class="count">${count} shifts</span></div>`;
  }

  return `<div class="container">
  <div class="header"><h1>${title}</h1><p>Shift Assignments</p></div>
  <div class="calendar">
    <div class="calendar-header">
      <div class="day-header">Sun</div><div class="day-header">Mon</div><div class="day-header">Tue</div>
      <div class="day-header">Wed</div><div class="day-header">Thu</div><div class="day-header">Fri</div><div class="day-header">Sat</div>
    </div>
    <div class="calendar-body">${dayCellsHtml}</div>
  </div>
  <div class="legend">${legendHtml}</div>
  <div class="summary"><h2>Shift Summary</h2><div class="summary-grid">${summaryHtml}</div></div>
</div>
<style>
  .container{max-width:1200px;margin:0 auto}
  .header{text-align:center;margin-bottom:1.5rem}
  .header h1{font-size:2rem;font-weight:700;color:#1e3a5f;margin-bottom:0.25rem}
  .header p{color:#64748b;font-size:1rem}
  .calendar{border-radius:0.75rem;overflow:hidden;border:1px solid #e2e8f0}
  .calendar-header{display:grid;grid-template-columns:repeat(7,1fr);background:#f1f5f9}
  .day-header{padding:0.75rem;text-align:center;font-weight:600;color:#334155;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em}
  .calendar-body{display:grid;grid-template-columns:repeat(7,1fr)}
  .day-cell{min-height:100px;padding:0.5rem;border:1px solid #f1f5f9;position:relative}
  .day-cell.other-month{background:#f8fafc}
  .day-cell.weekend{background:#fef2f2}
  .day-cell.has-shift{background:#eff6ff}
  .day-number{font-size:0.8rem;font-weight:500;color:#64748b;margin-bottom:0.35rem}
  .day-cell.today .day-number{background:#3b82f6;color:white;width:1.5rem;height:1.5rem;display:flex;align-items:center;justify-content:center;border-radius:50%}
  .shift-badge{padding:0.2rem 0.4rem;border-radius:0.3rem;font-size:0.65rem;color:white;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:0.2rem}
  .shift-badge .type-label{font-weight:700;margin-right:0.15rem;opacity:0.9}
  .shift-badge .employee-name{font-weight:400}
  .legend{margin-top:1.5rem;display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center}
  .legend-item{display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.75rem;background:#f8fafc;border-radius:0.4rem}
  .legend-color{width:0.85rem;height:0.85rem;border-radius:0.2rem}
  .legend-name{font-size:0.8rem;color:#334155}
  .summary{margin-top:1.5rem;background:#f8fafc;border-radius:0.75rem;padding:1.25rem}
  .summary h2{font-size:1.1rem;margin-bottom:0.75rem;color:#1e293b}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.75rem}
  .summary-card{background:#f1f5f9;padding:0.75rem;border-radius:0.4rem;display:flex;justify-content:space-between;align-items:center}
  .summary-card .name{font-weight:500;color:#1e293b;font-size:0.85rem}
  .summary-card .count{background:#dbeafe;padding:0.2rem 0.6rem;border-radius:0.75rem;font-size:0.8rem;color:#3b82f6}
</style>`;
}
