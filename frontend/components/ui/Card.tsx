'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
}

export function Card({ children, className, hover = false, glass = false }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={hover ? { y: -2, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' } : undefined}
      className={cn(
        'rounded-2xl p-6',
        glass
          ? 'glass'
          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm',
        className
      )}
    >
      {children}
    </motion.div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  tooltip?: ReactNode;
}

export function CardHeader({ title, description, action, tooltip }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          {tooltip}
        </div>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
