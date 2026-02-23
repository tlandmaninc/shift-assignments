'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Users,
  History,
  ChevronLeft,
  CalendarDays,
  MessageCircle,
  ArrowLeftRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePageAccess } from '@/lib/hooks/usePageAccess';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/profile', label: 'My Profile', icon: User },
  { href: '/forms', label: 'Form Generation', icon: FileText },
  { href: '/assignments', label: 'Assignments', icon: Calendar },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/history', label: 'History', icon: History },
  { href: '/shift-exchange', label: 'Shift Exchange', icon: ArrowLeftRight },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
];

export function Sidebar({ open, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { canAccess } = usePageAccess();

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 256 : 72 }}
      className="relative flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-slate-200 dark:border-slate-800">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 flex items-center justify-center shadow-md dark:shadow-lg shadow-primary-500/15 dark:shadow-primary-500/30">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex flex-col whitespace-nowrap overflow-hidden"
              >
                <span className="text-xl font-bold gradient-text">
                  Shift Assignment
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 -mt-1">
                  Psychiatry
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          if (!canAccess(item.href)) {
            return null;
          }

          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                isActive && 'bg-primary-50/70 dark:bg-primary-900/30 text-primary-500 dark:text-primary-400',
                !isActive && 'text-slate-600 dark:text-slate-400'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {open && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
      >
        <ChevronLeft
          className={cn(
            'w-4 h-4 text-slate-500 transition-transform duration-200',
            !open && 'rotate-180'
          )}
        />
      </button>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <AnimatePresence>
          {open && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-slate-400 dark:text-slate-600"
            >
              Shift Assignment Platform v1.0
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
