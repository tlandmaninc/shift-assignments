import { useEffect } from 'react';
import { useShiftTypeStore } from '@/lib/stores/shiftTypeStore';
import { ShiftTypeConfig } from '@/lib/constants/shiftTypes';

export function useShiftTypes(): {
  types: Record<string, ShiftTypeConfig>;
  loaded: boolean;
  refresh: () => Promise<void>;
} {
  const { types, loaded, fetchTypes } = useShiftTypeStore();

  useEffect(() => {
    if (!loaded) {
      fetchTypes();
    }
  }, [loaded, fetchTypes]);

  return { types, loaded, refresh: fetchTypes };
}
