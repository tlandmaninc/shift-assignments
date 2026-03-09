'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export const DEFAULT_PAGE_ACCESS: Record<string, string> = {
  forms: 'admin',
  assignments: 'admin',
  employees: 'admin',
  history: 'all',
  'shift-exchange': 'all',
  chat: 'all',
};

export function usePageAccess() {
  const { isAdmin, isAuthenticated, isLoading: authLoading } = useAuth();
  const [config, setConfig] = useState<Record<string, string>>(DEFAULT_PAGE_ACCESS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to resolve before deciding access
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    settingsApi
      .getPageAccess()
      .then(setConfig)
      .catch(() => setConfig(DEFAULT_PAGE_ACCESS))
      .finally(() => setIsLoading(false));
  }, [authLoading, isAuthenticated]);

  const canAccess = useCallback(
    (path: string): boolean => {
      if (!isAuthenticated) return false;
      if (isAdmin) return true;

      // Strip leading slash to match config keys
      const key = path.replace(/^\//, '');
      const access = config[key];
      // Pages not in config (Dashboard, Profile, Login) are always accessible
      if (access === undefined) return true;
      return access === 'all';
    },
    [isAdmin, isAuthenticated, config],
  );

  return { canAccess, config, isLoading };
}
