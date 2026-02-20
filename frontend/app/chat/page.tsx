'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui';
import { MessageBubble, TypingIndicator, EmptyState, ChatHistoryPanel } from '@/components/chat';
import { chatApi } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingMessageId = useRef<string | null>(null);

  // Quick suggestions for common queries
  const suggestions = [
    "Who is assigned this week?",
    "What's the current fairness score?",
    "Who has the most shifts?",
    "Show me recent assignments",
  ];

  // Check AI provider connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    setConnectionError(null);
    try {
      const health = await chatApi.health();
      if (health.connected && health.model_available) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
        setConnectionError(health.error || 'AI service is not properly configured');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      setConnectionError('Failed to connect to AI service');
    }
  };

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      inputRef.current?.focus();
    }
  }, [connectionStatus]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    inputRef.current?.focus();
  }, []);

  const handleSelectConversation = useCallback(async (id: string) => {
    if (id === conversationId) return;
    try {
      const conv = await chatApi.getConversation(id);
      setConversationId(id);
      setMessages(
        conv.messages.map((m, i) => ({
          id: `${id}_${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }))
      );
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, [conversationId]);

  const sendMessage = async () => {
    if (!input.trim() || loading || streaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const currentMessages = messages;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();
    streamingMessageId.current = assistantMsgId;
    let firstToken = true;

    try {
      await chatApi.sendStream(
        {
          message: userMessage.content,
          conversation_history: currentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          conversation_id: conversationId || undefined,
        },
        // onToken
        (token) => {
          if (firstToken) {
            firstToken = false;
            setLoading(false);
          }
          setStreaming(true);

          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId);
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + token }
                  : m
              );
            }
            return [
              ...prev,
              {
                id: assistantMsgId,
                role: 'assistant' as const,
                content: token,
                timestamp: new Date(),
              },
            ];
          });
        },
        // onConversationId
        (id) => {
          setConversationId(id);
        },
        // onDone
        () => {
          setLoading(false);
          setStreaming(false);
          streamingMessageId.current = null;
          setRefreshTrigger((prev) => prev + 1);
          inputRef.current?.focus();
        },
        // onError
        (error) => {
          setLoading(false);
          setStreaming(false);
          streamingMessageId.current = null;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId);
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content || 'Sorry, an error occurred. Please try again.' }
                  : m
              );
            }
            return [
              ...prev,
              {
                id: assistantMsgId,
                role: 'assistant' as const,
                content: 'Sorry, an error occurred. Please try again.',
                timestamp: new Date(),
              },
            ];
          });
          inputRef.current?.focus();
        },
      );
    } catch (error) {
      setLoading(false);
      setStreaming(false);
      streamingMessageId.current = null;
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantMsgId);
        if (!existing) {
          return [
            ...prev,
            {
              id: assistantMsgId,
              role: 'assistant' as const,
              content: 'Sorry, I encountered an error processing your request. Please try again.',
              timestamp: new Date(),
            },
          ];
        }
        return prev;
      });
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  // Disconnected state
  if (connectionStatus === 'disconnected') {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Chat with Your Data
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Ask questions about shifts, employees, and scheduling
          </p>
        </motion.div>

        <Card className="p-8">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              AI Service Unavailable
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
              {connectionError || 'The AI provider is not properly configured.'}
            </p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 text-left max-w-md mx-auto mb-6">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                To get started with Gemini (recommended):
              </p>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                <li>Get a free API key at <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">aistudio.google.com/app/apikey</code></li>
                <li>Set <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">AI_PROVIDER=gemini</code> in backend .env</li>
                <li>Set <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">GEMINI_API_KEY=your_key</code> in backend .env</li>
              </ol>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-3 mb-2">
                Or use Ollama for local inference:
              </p>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                <li>Install Ollama from ollama.ai</li>
                <li>Run: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">ollama serve</code></li>
                <li>Set <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">AI_PROVIDER=ollama</code> in backend .env</li>
              </ol>
            </div>
            <button
              onClick={checkConnection}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Checking connection state
  if (connectionStatus === 'checking') {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Chat with Your Data
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Ask questions about shifts, employees, and scheduling
          </p>
        </motion.div>

        <Card className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            <span className="ml-3 text-slate-600 dark:text-slate-400">
              Connecting to AI service...
            </span>
          </div>
        </Card>
      </div>
    );
  }

  // Connected state - main chat interface with sidebar
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex-shrink-0"
      >
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Chat with Your Data
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Ask questions about shifts, employees, and scheduling
        </p>
      </motion.div>

      {/* Chat Layout: Sidebar + Chat Area */}
      <Card className="flex-1 flex overflow-hidden min-h-0">
        {/* History Sidebar */}
        <ChatHistoryPanel
          activeConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          refreshTrigger={refreshTrigger}
        />

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <EmptyState
                suggestions={suggestions}
                onSuggestionClick={handleSuggestionClick}
              />
            ) : (
              <>
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <AnimatePresence>
                  {loading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <TypingIndicator />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 flex-shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about shifts, employees, or statistics..."
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 border-0 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={loading || streaming}
              />
              <button
                onClick={sendMessage}
                disabled={loading || streaming || !input.trim()}
                className="px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading || streaming ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
