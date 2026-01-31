'use client';

import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      </div>
      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-sm">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{
                repeat: Infinity,
                duration: 1,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
