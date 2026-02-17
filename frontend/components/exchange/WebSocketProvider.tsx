'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useExchangeStore } from '@/lib/stores/exchangeStore';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const employeeId = user?.employee_id;

  // Connect WebSocket
  useWebSocket(isAuthenticated, employeeId);

  // Show toast notifications for new exchange events
  const prevCountRef = useRef(0);
  const notifications = useExchangeStore((s) => s.notifications);

  useEffect(() => {
    if (notifications.length > prevCountRef.current && prevCountRef.current > 0) {
      const latest = notifications[0];
      if (!latest.read) {
        const icon = getNotificationIcon(latest.type);
        toast(latest.message, { icon });
      }
    }
    prevCountRef.current = notifications.length;
  }, [notifications]);

  return <>{children}</>;
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'exchange_request':
      return '\u{1F504}';
    case 'exchange_accepted':
      return '\u{2705}';
    case 'exchange_declined':
      return '\u{274C}';
    case 'exchange_cancelled':
      return '\u{1F6AB}';
    case 'exchange_invalid':
      return '\u{26A0}\u{FE0F}';
    case 'shifts_published':
      return '\u{1F4C5}';
    default:
      return '\u{1F514}';
  }
}
