'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { WSMessage } from '@/lib/types/exchange';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds

export function useWebSocket(isAuthenticated: boolean, employeeId?: number) {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const { setWsConnected, handleWSMessage } = useExchangeStore();

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
  }, [setWsConnected]);

  const connect = useCallback(() => {
    if (!isAuthenticated || !employeeId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Get the access token from cookies for WS auth
    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
      return match ? match[2] : null;
    };

    const token = getCookie('ect_access_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const host = backendUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${protocol}//${host}/api/exchanges/ws?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectAttemptRef.current = 0;

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, HEARTBEAT_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const msg: WSMessage = JSON.parse(event.data);
          handleWSMessage(msg);
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }

        // Auto-reconnect with exponential backoff
        if (isAuthenticated && employeeId) {
          const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
            RECONNECT_MAX_DELAY
          );
          reconnectAttemptRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, handling reconnection
      };
    } catch {
      // Connection failed, will retry via onclose
    }
  }, [isAuthenticated, employeeId, setWsConnected, handleWSMessage]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);
}
