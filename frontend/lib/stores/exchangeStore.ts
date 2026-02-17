import { create } from 'zustand';
import {
  ExchangeNotification,
  ExchangeRequest,
  ShiftAssignment,
  ShiftWithCalendarLink,
  WSMessage,
} from '../types/exchange';

interface ExchangeState {
  // WebSocket
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // Notifications
  notifications: ExchangeNotification[];
  unreadCount: number;
  addNotification: (type: string, message: string, exchange?: ExchangeRequest, shifts?: ShiftWithCalendarLink[]) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  // Exchange data
  myShifts: ShiftAssignment[];
  setMyShifts: (shifts: ShiftAssignment[]) => void;
  incomingRequests: ExchangeRequest[];
  setIncomingRequests: (requests: ExchangeRequest[]) => void;
  outgoingRequests: ExchangeRequest[];
  setOutgoingRequests: (requests: ExchangeRequest[]) => void;
  exchangeHistory: ExchangeRequest[];
  setExchangeHistory: (history: ExchangeRequest[]) => void;

  // Selected month
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;

  // Handle WebSocket messages
  handleWSMessage: (msg: WSMessage) => void;

  // Selected shift date for calendar interaction
  selectedShiftDate: string | null;
  setSelectedShiftDate: (date: string | null) => void;

  // Mock data toggle
  useMockData: boolean;
  setUseMockData: (mock: boolean) => void;

  // Refresh trigger (increments to signal components to refetch)
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const useExchangeStore = create<ExchangeState>((set, get) => ({
  // WebSocket
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Notifications
  notifications: [],
  unreadCount: 0,
  addNotification: (type, message, exchange, shifts) => {
    const notification: ExchangeNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      exchange,
      shifts,
      timestamp: new Date().toISOString(),
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
  },
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

  // Exchange data
  myShifts: [],
  setMyShifts: (shifts) => set({ myShifts: shifts }),
  incomingRequests: [],
  setIncomingRequests: (requests) => set({ incomingRequests: requests }),
  outgoingRequests: [],
  setOutgoingRequests: (requests) => set({ outgoingRequests: requests }),
  exchangeHistory: [],
  setExchangeHistory: (history) => set({ exchangeHistory: history }),

  // Selected month
  selectedMonth: getCurrentMonth(),
  setSelectedMonth: (month) => set({ selectedMonth: month }),

  // Handle WebSocket messages
  handleWSMessage: (msg) => {
    const { addNotification, triggerRefresh } = get();

    switch (msg.type) {
      case 'exchange_request':
      case 'exchange_accepted':
      case 'exchange_declined':
      case 'exchange_cancelled':
      case 'exchange_invalid':
        addNotification(msg.type, msg.message, msg.exchange);
        triggerRefresh();
        break;
      case 'shifts_published':
        addNotification(msg.type, msg.message, undefined, msg.shifts);
        triggerRefresh();
        break;
      case 'assignment_updated':
        triggerRefresh();
        break;
    }
  },

  // Selected shift date
  selectedShiftDate: null,
  setSelectedShiftDate: (date) => set({ selectedShiftDate: date }),

  // Mock data toggle
  useMockData: true,
  setUseMockData: (mock) => set({ useMockData: mock }),

  // Refresh trigger
  refreshTrigger: 0,
  triggerRefresh: () =>
    set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));
