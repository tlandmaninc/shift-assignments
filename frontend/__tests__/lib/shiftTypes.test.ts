/**
 * Tests for lib/constants/shiftTypes.ts
 */

import { SHIFT_TYPES, DEFAULT_SHIFT_TYPE, getShiftTypeConfig } from '@/lib/constants/shiftTypes';

describe('SHIFT_TYPES', () => {
  it('defines ect, internal, and er shift types', () => {
    expect(Object.keys(SHIFT_TYPES)).toEqual(
      expect.arrayContaining(['ect', 'internal', 'er'])
    );
  });

  it('each shift type has required properties', () => {
    for (const [key, config] of Object.entries(SHIFT_TYPES)) {
      expect(config.label).toBeTruthy();
      expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(config.bgClass).toBeTruthy();
      expect(config.textClass).toBeTruthy();
      expect(config.bgLight).toBeTruthy();
      expect(config.borderClass).toBeTruthy();
      expect(config.startTime).toBeTruthy();
      expect(config.endTime).toBeTruthy();
      expect(typeof config.excludeWeekends).toBe('boolean');
      expect(config.calendarTitle).toBeTruthy();
      expect(config.calendarDesc).toBeTruthy();
    }
  });

  it('ect excludes weekends', () => {
    expect(SHIFT_TYPES.ect.excludeWeekends).toBe(true);
  });

  it('internal does not exclude weekends', () => {
    expect(SHIFT_TYPES.internal.excludeWeekends).toBe(false);
  });

  it('er has 2 slots with slotDetails', () => {
    expect(SHIFT_TYPES.er.slots).toBe(2);
    expect(SHIFT_TYPES.er.slotDetails).toHaveLength(2);
    expect(SHIFT_TYPES.er.slotDetails![0].label).toBe('Day');
    expect(SHIFT_TYPES.er.slotDetails![1].label).toBe('Overnight');
  });
});

describe('DEFAULT_SHIFT_TYPE', () => {
  it('is "ect"', () => {
    expect(DEFAULT_SHIFT_TYPE).toBe('ect');
  });
});

describe('getShiftTypeConfig', () => {
  it('returns config for known shift type', () => {
    const config = getShiftTypeConfig('ect');
    expect(config).toBe(SHIFT_TYPES.ect);
  });

  it('returns config for "er"', () => {
    const config = getShiftTypeConfig('er');
    expect(config).toBe(SHIFT_TYPES.er);
  });

  it('falls back to ect for unknown shift type', () => {
    const config = getShiftTypeConfig('nonexistent');
    expect(config).toBe(SHIFT_TYPES.ect);
  });

  it('falls back to ect for empty string', () => {
    const config = getShiftTypeConfig('');
    expect(config).toBe(SHIFT_TYPES.ect);
  });
});
