'use client';

import { motion } from 'framer-motion';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  thinking?: string[];
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
          'max-w-[80%] p-4 rounded-2xl overflow-hidden break-words',
          isUser
            ? 'bg-primary-500 text-white rounded-tr-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm'
        )}
      >
        {!isUser && message.thinking && message.thinking.length > 0 && (
          <details className="mb-2 text-xs">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-300 select-none">
              Thinking
            </summary>
            <div className="mt-1 p-2 rounded bg-gray-800/50 text-gray-400 font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto">
              {message.thinking.map((t, i) => <div key={i}>{t}</div>)}
            </div>
          </details>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-base prose-strong:text-inherit prose-code:text-inherit prose-code:bg-black/10 dark:prose-code:bg-white/10 prose-code:px-1 prose-code:rounded prose-pre:bg-black/10 dark:prose-pre:bg-white/10 prose-pre:p-2 prose-pre:rounded-lg [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
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
