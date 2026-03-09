'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthContextType } from '@/lib/types/auth';
import { authApi } from '@/lib/api';
import { isDemoAllowed } from '@/lib/mockData/demoMode';

const DEMO_USER: User = {
  id: 'demo',
  email: 'demo@example.com',
  name: 'Demo Admin',
  role: 'admin',
  employee_id: 1,
  is_active: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await authApi.getStatus();
      setUser(status.user ?? (isDemoAllowed ? DEMO_USER : null));
    } catch (error) {
      console.error('Failed to fetch auth status:', error);
      setUser(isDemoAllowed ? DEMO_USER : null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Set up token refresh interval (every 50 minutes)
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      const success = await authApi.refresh();
      if (!success) {
        setUser(null);
      }
    }, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(refreshInterval);
  }, [user]);

  const login = useCallback(async () => {
    try {
      const { authorization_url } = await authApi.getLoginUrl();
      window.location.href = authorization_url;
    } catch (error) {
      console.error('Failed to get login URL:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      setUser(null);
      window.location.href = '/login';
    } catch (error) {
      console.error('Failed to logout:', error);
      // Clear user state anyway
      setUser(null);
    }
  }, []);

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        isLoading,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
