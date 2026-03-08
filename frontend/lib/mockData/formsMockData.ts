/**
 * Mock data generators for the Forms page.
 * Provides deterministic mock form data so the Forms page can work
 * without a running backend.
 *
 * WARNING: This module must NEVER be used in production.
 * All exported functions throw if called when NODE_ENV === 'production'.
 */

import { SHIFT_TYPES } from '../constants/shiftTypes';
import { isDemoAllowed } from './demoMode';

function assertNotProduction() {
  if (!isDemoAllowed) {
    throw new Error('Mock data must not be used in production');
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Generate the eligible dates for a given month, respecting shift type rules. */
function generateEligibleDates(
  year: number,
  month: number,
  includeTuesdays: boolean,
  excludedDates: string[],
  includedDates: string[],
  shiftType: string = 'ect'
): string[] {
  const totalDays = getDaysInMonth(year, month);
  const dates: string[] = [];
  const stConfig = SHIFT_TYPES[shiftType] || SHIFT_TYPES.ect;
  const excludeWeekends = stConfig.excludeWeekends;

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();

    // Skip Fri (5) and Sat (6) only if shift type excludes weekends
    if (excludeWeekends && (dayOfWeek === 5 || dayOfWeek === 6)) continue;
    // Skip Tue (2) unless includeTuesdays (only for weekend-excluding types)
    if (excludeWeekends && dayOfWeek === 2 && !includeTuesdays) continue;
    // Skip manually excluded
    if (excludedDates.includes(dateStr)) continue;

    dates.push(dateStr);
  }

  // Add any manually included dates not already present
  for (const dateStr of includedDates) {
    if (!dates.includes(dateStr)) {
      dates.push(dateStr);
    }
  }

  return dates.sort();
}

/** Mock: generate dates (replaces formsApi.generateDates). */
export function mockGenerateDates(data: {
  year: number;
  month: number;
  include_tuesdays: boolean;
  excluded_dates: string[];
  included_dates: string[];
  shift_type?: string;
}) {
  assertNotProduction();
  const dates = generateEligibleDates(
    data.year,
    data.month,
    data.include_tuesdays,
    data.excluded_dates,
    data.included_dates,
    data.shift_type
  );
  return { included_dates: dates };
}

// In-memory store for mock forms
let mockForms: any[] = [];
let nextFormId = 1;

// Seed with some existing forms so the "Existing Forms" list is populated
function ensureSeeded() {
  if (mockForms.length > 0) return;

  const seedShiftTypes = ['ect', 'internal'];
  const now = new Date();
  // Create a form for last month and the month before
  for (let offset = 2; offset >= 1; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    const shiftType = seedShiftTypes[offset - 1] || 'ect';
    const dates = generateEligibleDates(year, month, false, [], [], shiftType);

    const SHIFT_LABELS: Record<string, string> = { ect: 'ECT', internal: 'Internal', er: 'ER' };
    const label = SHIFT_LABELS[shiftType] || 'ECT';

    mockForms.push({
      id: nextFormId++,
      month_year: monthYear,
      title: `${MONTHS[month - 1]} ${year} ${label} Shift Assignment`,
      included_dates: dates,
      status: offset === 2 ? 'processed' : 'active',
      shift_type: shiftType,
      created_at: new Date(
        now.getFullYear(),
        now.getMonth() - offset,
        1
      ).toISOString(),
    });
  }
}

/** Mock: list existing forms (replaces formsApi.list). */
export function mockListForms() {
  assertNotProduction();
  ensureSeeded();
  return [...mockForms];
}

/** Mock: create a new form (replaces formsApi.create). */
export function mockCreateForm(data: {
  year: number;
  month: number;
  include_tuesdays: boolean;
  excluded_dates: string[];
  included_dates: string[];
  shift_type?: string;
}) {
  assertNotProduction();
  ensureSeeded();
  const monthYear = `${data.year}-${String(data.month).padStart(2, '0')}`;

  const shiftType = data.shift_type || 'ect';

  // Check for duplicate (same month + shift type)
  const SHIFT_LABELS: Record<string, string> = { ect: 'ECT', internal: 'Internal', er: 'ER' };
  if (mockForms.some((f) => f.month_year === monthYear && f.shift_type === shiftType)) {
    throw new Error(
      `${SHIFT_LABELS[shiftType] || 'ECT'} form already exists for ${MONTHS[data.month - 1]} ${data.year}`
    );
  }

  const dates = generateEligibleDates(
    data.year,
    data.month,
    data.include_tuesdays,
    data.excluded_dates,
    data.included_dates,
    shiftType
  );
  const label = SHIFT_LABELS[shiftType] || 'ECT';

  const form = {
    id: nextFormId++,
    month_year: monthYear,
    title: `${MONTHS[data.month - 1]} ${data.year} ${label} Shift Assignment`,
    included_dates: dates,
    status: 'draft',
    shift_type: shiftType,
    created_at: new Date().toISOString(),
  };

  mockForms.push(form);
  return form;
}

/** Mock: delete a form (replaces formsApi.delete). */
export function mockDeleteForm(formId: number) {
  assertNotProduction();
  ensureSeeded();
  mockForms = mockForms.filter((f) => f.id !== formId);
  return { success: true };
}
