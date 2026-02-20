'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface EmptyStateProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export function EmptyState({ suggestions, onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center mb-4 shadow-lg shadow-primary-500/30"
      >
        <Sparkles className="w-8 h-8 text-white" />
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-lg font-semibold text-slate-900 dark:text-white mb-2"
      >
        Ask me anything about your shifts
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-slate-500 dark:text-slate-400 mb-6 max-w-md"
      >
        I can help you find assignments, check fairness metrics, and analyze scheduling patterns.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap gap-2 justify-center"
      >
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(suggestion)}
            className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
          >
            {suggestion}
          </button>
        ))}
      </motion.div>
    </div>
  );
}
