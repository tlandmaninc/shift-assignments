import { create } from 'zustand';
import { ShiftTypeConfig, SHIFT_TYPES } from '../constants/shiftTypes';
import { shiftTypesApi } from '../api';

interface ShiftTypeState {
  types: Record<string, ShiftTypeConfig>;
  loaded: boolean;
  loading: boolean;
  fetchTypes: () => Promise<void>;
}

function toFrontendConfig(key: string, raw: any): ShiftTypeConfig {
  return {
    label: raw.label || key.toUpperCase(),
    color: raw.color || '#6B7280',
    bgClass: raw.bgClass || '',
    textClass: raw.textClass || '',
    bgLight: raw.bgLight || '',
    borderClass: raw.borderClass || '',
    startTime: raw.start_time || raw.startTime || '',
    endTime: raw.end_time || raw.endTime || '',
    nextDayEnd: raw.next_day_end ?? raw.nextDayEnd ?? false,
    slots: raw.slots ?? 1,
    slotDetails: raw.slot_details || raw.slotDetails,
    excludeWeekends: raw.exclude_weekends ?? raw.excludeWeekends ?? true,
    calendarTitle: raw.calendar_title || raw.calendarTitle || `${raw.label || key} Shift`,
    calendarDesc: raw.calendar_desc || raw.calendarDesc || '',
  };
}

export const useShiftTypeStore = create<ShiftTypeState>((set, get) => ({
  types: SHIFT_TYPES,
  loaded: false,
  loading: false,

  fetchTypes: async () => {
    if (get().loading) return;  // Prevent concurrent fetches only
    set({ loading: true });
    try {
      const raw = await shiftTypesApi.list();
      const types: Record<string, ShiftTypeConfig> = {};
      for (const [key, cfg] of Object.entries(raw)) {
        const builtin = SHIFT_TYPES[key];
        if (builtin) {
          // Merge: keep Tailwind classes from built-in, apply dynamic overrides
          types[key] = { ...builtin, ...toFrontendConfig(key, cfg) };
          // Preserve Tailwind classes for built-in types
          types[key].bgClass = builtin.bgClass;
          types[key].textClass = builtin.textClass;
          types[key].bgLight = builtin.bgLight;
          types[key].borderClass = builtin.borderClass;
        } else {
          types[key] = toFrontendConfig(key, cfg);
        }
      }
      set({ types, loaded: true, loading: false });
    } catch {
      // On error, keep static fallback
      set({ loaded: true, loading: false });
    }
  },
}));
