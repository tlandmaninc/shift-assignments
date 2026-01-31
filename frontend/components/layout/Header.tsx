'use client';

import Image from 'next/image';
import { Moon, Sun, Menu, Bell, LogOut, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Header({
  darkMode,
  onToggleDarkMode,
  sidebarOpen,
  onToggleSidebar,
}: HeaderProps) {
  const { user, isAuthenticated, isAdmin, logout, isLoading } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* Banner */}
      <div className="w-full h-32 relative overflow-hidden">
        <Image
          src="/ect_banner.png"
          alt="ECT Shifts Management Platform Banner"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/70 to-slate-900/30 flex items-center px-6">
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">
                ECT Shifts Management Platform
              </h1>
              <p className="text-sm text-slate-200">
                Psychiatrics Department - Shift & Employee Management
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <button className="p-2 hover:bg-white/10 rounded-lg relative">
                <Bell className="w-5 h-5 text-white" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full" />
              </button>

              {/* Dark mode toggle */}
              <motion.button
                onClick={onToggleDarkMode}
                className="p-2 hover:bg-white/10 rounded-lg"
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  initial={false}
                  animate={{ rotate: darkMode ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {darkMode ? (
                    <Sun className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-white" />
                  )}
                </motion.div>
              </motion.button>

              {/* User avatar and menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {isLoading ? (
                    <div className="w-9 h-9 rounded-full bg-slate-600 animate-pulse" />
                  ) : isAuthenticated && user ? (
                    <>
                      {user.picture ? (
                        <img
                          src={user.picture}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover border-2 border-white/20"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-medium shadow-lg shadow-primary-500/30">
                          {getInitials(user.name)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center">
                      <span className="text-white text-sm">?</span>
                    </div>
                  )}
                </button>

                {/* Dropdown menu */}
                <AnimatePresence>
                  {showUserMenu && isAuthenticated && user && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
                    >
                      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-start gap-3">
                          {user.picture ? (
                            <img
                              src={user.picture}
                              alt={user.name}
                              className="w-10 h-10 rounded-full shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium shrink-0">
                              {getInitials(user.name)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white break-words">
                              {user.name}
                            </p>
                            {isAdmin && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded text-xs font-medium">
                                <Shield className="w-3 h-3" />
                                Admin
                              </span>
                            )}
                            <p className="text-sm text-slate-500 dark:text-slate-400 break-words mt-1">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            logout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
