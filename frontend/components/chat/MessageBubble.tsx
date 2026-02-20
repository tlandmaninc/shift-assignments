'use client';

import { motion } from 'framer-motion';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-primary-500 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] p-4 rounded-2xl',
          isUser
            ? 'bg-primary-500 text-white rounded-tr-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm'
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        <span
          className={cn(
            'text-xs mt-2 block',
            isUser ? 'text-primary-200' : 'text-slate-500 dark:text-slate-400'
          )}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}
