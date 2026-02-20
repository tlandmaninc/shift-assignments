export interface SlotDetail {
  label: string;
  start: string;
  end: string;
  nextDay: boolean;
}

export interface ShiftTypeConfig {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  bgLight: string;
  borderClass: string;
  startTime: string;
  endTime: string;
  nextDayEnd?: boolean;
  slots?: number;
  slotDetails?: SlotDetail[];
  excludeWeekends: boolean;
  calendarTitle: string;
  calendarDesc: string;
}

export const SHIFT_TYPES: Record<string, ShiftTypeConfig> = {
  ect: {
    label: 'ECT',
    color: '#3B82F6',
    bgClass: 'bg-blue-500',
    textClass: 'text-blue-600',
    bgLight: 'bg-blue-100',
    borderClass: 'border-blue-500',
    startTime: 'T073000',
    endTime: 'T100000',
    nextDayEnd: false,
    slots: 1,
    excludeWeekends: true,
    calendarTitle: 'ECT Shift',
    calendarDesc: 'Psychiatry Department',
  },
  internal: {
    label: 'Internal',
    color: '#10B981',
    bgClass: 'bg-emerald-500',
    textClass: 'text-emerald-600',
    bgLight: 'bg-emerald-100',
    borderClass: 'border-emerald-500',
    startTime: 'T080000',
    endTime: 'T100000',
    nextDayEnd: true,
    slots: 1,
    excludeWeekends: false,
    calendarTitle: 'Internal Medicine Shift',
    calendarDesc: 'Psychiatry Department',
  },
  er: {
    label: 'ER',
    color: '#EF4444',
    bgClass: 'bg-red-500',
    textClass: 'text-red-600',
    bgLight: 'bg-red-100',
    borderClass: 'border-red-500',
    startTime: 'T080000',
    endTime: 'T230000',
    nextDayEnd: false,
    slots: 2,
    excludeWeekends: false,
    slotDetails: [
      { label: 'Day', start: 'T080000', end: 'T230000', nextDay: false },
      { label: 'Overnight', start: 'T080000', end: 'T100000', nextDay: true },
    ],
    calendarTitle: 'ER Shift',
    calendarDesc: 'Emergency Department',
  },
};

export const DEFAULT_SHIFT_TYPE = 'ect';

export function getShiftTypeConfig(shiftType: string): ShiftTypeConfig {
  return SHIFT_TYPES[shiftType] || SHIFT_TYPES.ect;
}
