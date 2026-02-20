'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Moon, Sun, Menu, Bell, LogOut, Shield, CalendarPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { NotificationBadge } from '@/components/exchange/NotificationBadge';

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
  const unreadCount = useExchangeStore((s) => s.unreadCount);
  const notifications = useExchangeStore((s) => s.notifications);
  const markAllRead = useExchangeStore((s) => s.markAllRead);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [notificationPosition, setNotificationPosition] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedOutsideMenu = menuRef.current && !menuRef.current.contains(target);
      const clickedOutsideButton = buttonRef.current && !buttonRef.current.contains(target);
      const clickedOutsideNotification = notificationRef.current && !notificationRef.current.contains(target);
      const clickedOutsideNotificationButton = notificationButtonRef.current && !notificationButtonRef.current.contains(target);

      if (clickedOutsideMenu && clickedOutsideButton) {
        setShowUserMenu(false);
      }
      if (clickedOutsideNotification && clickedOutsideNotificationButton) {
        setShowNotifications(false);
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
          alt="Shift Assignment Platform Banner"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/40 to-transparent flex items-center px-6">
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">
                Shift Assignment Platform
              </h1>
              <p className="text-sm text-slate-200">
                Psychiatry Department - Shift & Employee Management
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <button
                ref={notificationButtonRef}
                onClick={() => {
                  if (notificationButtonRef.current) {
                    const rect = notificationButtonRef.current.getBoundingClientRect();
                    setNotificationPosition({
                      top: rect.bottom + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                  if (!showNotifications) {
                    markAllRead();
                  }
                }}
                className="p-2 hover:bg-white/10 rounded-lg relative"
              >
                <Bell className="w-5 h-5 text-white" />
                <NotificationBadge count={unreadCount} />
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

              {/* User avatar button */}
              <button
                ref={buttonRef}
                onClick={() => {
                  if (buttonRef.current) {
                    const rect = buttonRef.current.getBoundingClientRect();
                    setMenuPosition({
                      top: rect.bottom + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
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
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover border-2 border-white/20"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 flex items-center justify-center text-white font-medium shadow-md dark:shadow-lg shadow-primary-500/15 dark:shadow-primary-500/30">
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
            </div>
          </div>
        </div>
      </div>

      {/* Notifications dropdown - rendered via portal to avoid overflow clipping */}
      {mounted && createPortal(
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              ref={notificationRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ top: notificationPosition.top, right: notificationPosition.right }}
              className="fixed w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50"
            >
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-medium text-sm text-slate-900 dark:text-white">
                  Notifications
                </h3>
                <Link
                  href="/shift-exchange"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-primary-500 hover:text-primary-600"
                >
                  View all
                </Link>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) =>
                    n.type === 'shifts_published' && n.shifts ? (
                      <div
                        key={n.id}
                        className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                      >
                        <p className="text-sm text-slate-900 dark:text-white">{n.message}</p>
                        <div className="mt-1.5 space-y-1">
                          {n.shifts.map((s) => (
                            <a
                              key={s.date}
                              href={s.calendar_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <CalendarPlus className="w-3 h-3" />
                              {s.day_of_week}, {s.date}
                            </a>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : (
                      <Link
                        key={n.id}
                        href="/shift-exchange"
                        onClick={() => setShowNotifications(false)}
                        className="block px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                      >
                        <p className="text-sm text-slate-900 dark:text-white">{n.message}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </Link>
                    )
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Dropdown menu - rendered via portal to avoid overflow clipping */}
      {mounted && createPortal(
        <AnimatePresence>
          {showUserMenu && isAuthenticated && user && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ top: menuPosition.top, right: menuPosition.right }}
              className="fixed w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50"
            >
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {getInitials(user.name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </p>
                </div>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded text-xs font-medium shrink-0">
                    <Shield className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body
      )}
    </header>
  );
}
