/**
 * Tests for lib/utils.ts - utility functions
 */

import { cn, formatDate, formatMonthYear, getMonthYearString } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toContain('text-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('handles conflicting tailwind classes by picking the last one', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'visible');
    expect(result).toContain('base');
    expect(result).toContain('visible');
    expect(result).not.toContain('hidden');
  });

  it('handles empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('handles undefined and null inputs', () => {
    const result = cn('base', undefined, null);
    expect(result).toBe('base');
  });
});

describe('formatDate', () => {
  it('formats a date string', () => {
    // Use a fixed date and check expected locale output
    const result = formatDate('2026-03-15');
    // The exact output depends on locale/timezone, but should contain key parts
    expect(result).toContain('2026');
    expect(result).toContain('March');
  });

  it('formats a Date object', () => {
    const date = new Date(2026, 2, 15); // March 15, 2026
    const result = formatDate(date);
    expect(result).toContain('2026');
    expect(result).toContain('March');
    expect(result).toContain('15');
  });

  it('includes day of week', () => {
    // March 15, 2026 is a Sunday
    const result = formatDate('2026-03-15T12:00:00');
    expect(result).toContain('Sunday');
  });
});

describe('formatMonthYear', () => {
  it('formats "2026-03" to "March 2026"', () => {
    const result = formatMonthYear('2026-03');
    expect(result).toContain('March');
    expect(result).toContain('2026');
  });

  it('formats "2025-12" to "December 2025"', () => {
    const result = formatMonthYear('2025-12');
    expect(result).toContain('December');
    expect(result).toContain('2025');
  });

  it('formats "2026-01" to "January 2026"', () => {
    const result = formatMonthYear('2026-01');
    expect(result).toContain('January');
    expect(result).toContain('2026');
  });
});

describe('getMonthYearString', () => {
  it('returns "2026-03" for year=2026, month=3', () => {
    expect(getMonthYearString(2026, 3)).toBe('2026-03');
  });

  it('pads single-digit months with leading zero', () => {
    expect(getMonthYearString(2026, 1)).toBe('2026-01');
  });

  it('does not double-pad two-digit months', () => {
    expect(getMonthYearString(2026, 12)).toBe('2026-12');
  });

  it('handles month=10 correctly', () => {
    expect(getMonthYearString(2025, 10)).toBe('2025-10');
  });
});
