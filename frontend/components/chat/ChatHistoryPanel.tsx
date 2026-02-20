'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { chatApi, type ConversationSummary } from '@/lib/api';

interface ChatHistoryPanelProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  refreshTrigger: number;
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'Previous 7 Days';
  return 'Older';
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChatHistoryPanel({
  activeConversationId,
  onSelectConversation,
  onNewChat,
  refreshTrigger,
}: ChatHistoryPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [refreshTrigger]);

  const loadConversations = async () => {
    try {
      const data = await chatApi.listConversations();
      setConversations(data.conversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await chatApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        onNewChat();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeletingId(null);
    }
  };

  // Group conversations by date
  const grouped: Record<string, ConversationSummary[]> = {};
  const groupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
  for (const conv of conversations) {
    const group = getDateGroup(conv.updated_at);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(conv);
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 w-12 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onNewChat}
          className="p-2 mt-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[280px] flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors flex-1 mr-2 justify-center"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No conversations yet
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Start a new chat to begin
            </p>
          </div>
        ) : (
          <div className="py-2">
            {groupOrder.map((group) => {
              const items = grouped[group];
              if (!items || items.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {group}
                    </span>
                  </div>
                  <AnimatePresence>
                    {items.map((conv) => (
                      <motion.div
                        key={conv.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        onClick={() => onSelectConversation(conv.id)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectConversation(conv.id); }}
                        className={cn(
                          'w-full text-left px-3 py-2.5 mx-1 rounded-lg transition-colors group flex items-start gap-2 cursor-pointer',
                          activeConversationId === conv.id
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        )}
                        style={{ width: 'calc(100% - 8px)' }}
                      >
                        <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-50" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate font-medium">
                            {conv.title}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {formatRelativeTime(conv.updated_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          disabled={deletingId === conv.id}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                          title="Delete conversation"
                        >
                          {deletingId === conv.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
