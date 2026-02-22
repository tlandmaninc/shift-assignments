'use client';

import { ReactNode, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const GAP = 8;
const PAD = 8;

export function Tooltip({ children, content, className, position = 'bottom' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const tooltipRef = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node || !wrapperRef.current) return;
      const tr = wrapperRef.current.getBoundingClientRect();
      const tt = node.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = tr.top - tt.height - GAP;
          left = tr.left + tr.width / 2 - tt.width / 2;
          break;
        case 'bottom':
          top = tr.bottom + GAP;
          left = tr.left + tr.width / 2 - tt.width / 2;
          break;
        case 'left':
          top = tr.top + tr.height / 2 - tt.height / 2;
          left = tr.left - tt.width - GAP;
          break;
        case 'right':
          top = tr.top + tr.height / 2 - tt.height / 2;
          left = tr.right + GAP;
          break;
      }

      // Clamp to viewport
      if (left + tt.width > window.innerWidth - PAD) left = window.innerWidth - PAD - tt.width;
      if (left < PAD) left = PAD;
      if (top + tt.height > window.innerHeight - PAD) top = window.innerHeight - PAD - tt.height;
      if (top < PAD) top = PAD;

      setCoords({ top, left });
    },
    [isVisible, position] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-800 dark:border-t-slate-700 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 dark:border-b-slate-700 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-800 dark:border-l-slate-700 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-800 dark:border-r-slate-700 border-y-transparent border-l-transparent',
  };

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => { setCoords(null); setIsVisible(true); }}
      onMouseLeave={() => { setIsVisible(false); setCoords(null); }}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.span
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={coords
              ? { top: coords.top, left: coords.left }
              : { top: -9999, left: -9999 }
            }
            className={cn(
              'fixed z-50 px-3 py-2 text-sm text-white bg-slate-800 dark:bg-slate-700 rounded-lg shadow-lg w-max max-w-[480px] leading-relaxed block whitespace-normal border border-slate-700 dark:border-slate-600',
              className
            )}
          >
            {content}
            <span
              className={cn(
                'absolute w-0 h-0 border-4',
                arrowClasses[position]
              )}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
