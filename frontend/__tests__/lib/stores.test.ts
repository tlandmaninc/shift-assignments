/**
 * Tests for lib/stores/exchangeStore.ts - Zustand store
 */

import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { ExchangeRequest, WSMessage } from '@/lib/types/exchange';

// Reset store state before each test
beforeEach(() => {
  useExchangeStore.setState({
    wsConnected: false,
    notifications: [],
    unreadCount: 0,
    myShifts: [],
    incomingRequests: [],
    outgoingRequests: [],
    exchangeHistory: [],
    selectedShiftDate: null,
    useMockData: true,
    refreshTrigger: 0,
  });
});

describe('useExchangeStore', () => {
  describe('initial state', () => {
    it('has expected defaults', () => {
      const state = useExchangeStore.getState();
      expect(state.wsConnected).toBe(false);
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.myShifts).toEqual([]);
      expect(state.incomingRequests).toEqual([]);
      expect(state.outgoingRequests).toEqual([]);
      expect(state.exchangeHistory).toEqual([]);
      expect(state.selectedShiftDate).toBeNull();
      expect(state.useMockData).toBe(true);
      expect(state.refreshTrigger).toBe(0);
    });

    it('selectedMonth is set to current month', () => {
      // Reset fully to get fresh selectedMonth from getCurrentMonth
      const state = useExchangeStore.getState();
      expect(state.selectedMonth).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('setWsConnected', () => {
    it('updates wsConnected', () => {
      useExchangeStore.getState().setWsConnected(true);
      expect(useExchangeStore.getState().wsConnected).toBe(true);

      useExchangeStore.getState().setWsConnected(false);
      expect(useExchangeStore.getState().wsConnected).toBe(false);
    });
  });

  describe('notifications', () => {
    it('addNotification adds a notification and increments unreadCount', () => {
      const { addNotification } = useExchangeStore.getState();
      addNotification('exchange_request', 'New swap request');

      const state = useExchangeStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('exchange_request');
      expect(state.notifications[0].message).toBe('New swap request');
      expect(state.notifications[0].read).toBe(false);
      expect(state.unreadCount).toBe(1);
    });

    it('addNotification prepends new notifications', () => {
      const { addNotification } = useExchangeStore.getState();
      addNotification('exchange_request', 'First');
      addNotification('exchange_accepted', 'Second');

      const state = useExchangeStore.getState();
      expect(state.notifications[0].message).toBe('Second');
      expect(state.notifications[1].message).toBe('First');
    });

    it('addNotification limits to 50 notifications', () => {
      const { addNotification } = useExchangeStore.getState();
      for (let i = 0; i < 55; i++) {
        addNotification('exchange_request', `Notification ${i}`);
      }
      expect(useExchangeStore.getState().notifications).toHaveLength(50);
    });

    it('markAllRead marks all notifications as read and resets unreadCount', () => {
      const state = useExchangeStore.getState();
      state.addNotification('exchange_request', 'Test 1');
      state.addNotification('exchange_accepted', 'Test 2');
      expect(useExchangeStore.getState().unreadCount).toBe(2);

      useExchangeStore.getState().markAllRead();
      const updated = useExchangeStore.getState();
      expect(updated.unreadCount).toBe(0);
      expect(updated.notifications.every((n) => n.read)).toBe(true);
    });

    it('clearNotifications empties notifications and resets unreadCount', () => {
      const state = useExchangeStore.getState();
      state.addNotification('exchange_request', 'Test');
      expect(useExchangeStore.getState().notifications).toHaveLength(1);

      useExchangeStore.getState().clearNotifications();
      expect(useExchangeStore.getState().notifications).toEqual([]);
      expect(useExchangeStore.getState().unreadCount).toBe(0);
    });
  });

  describe('exchange data setters', () => {
    it('setMyShifts updates myShifts', () => {
      const shifts = [{ date: '2026-03-15', day_of_week: 'Sunday', employee_name: 'Alice' }];
      useExchangeStore.getState().setMyShifts(shifts);
      expect(useExchangeStore.getState().myShifts).toEqual(shifts);
    });

    it('setIncomingRequests updates incomingRequests', () => {
      const requests = [{ id: 1, status: 'pending' }] as ExchangeRequest[];
      useExchangeStore.getState().setIncomingRequests(requests);
      expect(useExchangeStore.getState().incomingRequests).toEqual(requests);
    });

    it('setOutgoingRequests updates outgoingRequests', () => {
      const requests = [{ id: 2, status: 'pending' }] as ExchangeRequest[];
      useExchangeStore.getState().setOutgoingRequests(requests);
      expect(useExchangeStore.getState().outgoingRequests).toEqual(requests);
    });

    it('setExchangeHistory updates exchangeHistory', () => {
      const history = [{ id: 3, status: 'accepted' }] as ExchangeRequest[];
      useExchangeStore.getState().setExchangeHistory(history);
      expect(useExchangeStore.getState().exchangeHistory).toEqual(history);
    });
  });

  describe('selectedMonth', () => {
    it('setSelectedMonth updates the month', () => {
      useExchangeStore.getState().setSelectedMonth('2026-05');
      expect(useExchangeStore.getState().selectedMonth).toBe('2026-05');
    });
  });

  describe('selectedShiftDate', () => {
    it('setSelectedShiftDate updates the date', () => {
      useExchangeStore.getState().setSelectedShiftDate('2026-03-15');
      expect(useExchangeStore.getState().selectedShiftDate).toBe('2026-03-15');
    });

    it('setSelectedShiftDate can set to null', () => {
      useExchangeStore.getState().setSelectedShiftDate('2026-03-15');
      useExchangeStore.getState().setSelectedShiftDate(null);
      expect(useExchangeStore.getState().selectedShiftDate).toBeNull();
    });
  });

  describe('useMockData', () => {
    it('setUseMockData toggles mock data', () => {
      useExchangeStore.getState().setUseMockData(false);
      expect(useExchangeStore.getState().useMockData).toBe(false);

      useExchangeStore.getState().setUseMockData(true);
      expect(useExchangeStore.getState().useMockData).toBe(true);
    });
  });

  describe('refreshTrigger', () => {
    it('triggerRefresh increments the trigger', () => {
      expect(useExchangeStore.getState().refreshTrigger).toBe(0);

      useExchangeStore.getState().triggerRefresh();
      expect(useExchangeStore.getState().refreshTrigger).toBe(1);

      useExchangeStore.getState().triggerRefresh();
      expect(useExchangeStore.getState().refreshTrigger).toBe(2);
    });
  });

  describe('handleWSMessage', () => {
    it('handles exchange_request messages', () => {
      const msg: WSMessage = {
        type: 'exchange_request',
        message: 'New swap request from Alice',
        exchange: { id: 1, status: 'pending' } as ExchangeRequest,
      };

      useExchangeStore.getState().handleWSMessage(msg);
      const state = useExchangeStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('exchange_request');
      expect(state.refreshTrigger).toBe(1);
    });

    it('handles exchange_accepted messages', () => {
      const msg: WSMessage = {
        type: 'exchange_accepted',
        message: 'Swap accepted',
        exchange: { id: 1, status: 'accepted' } as ExchangeRequest,
      };

      useExchangeStore.getState().handleWSMessage(msg);
      expect(useExchangeStore.getState().notifications).toHaveLength(1);
      expect(useExchangeStore.getState().refreshTrigger).toBe(1);
    });

    it('handles exchange_declined messages', () => {
      const msg: WSMessage = {
        type: 'exchange_declined',
        message: 'Swap declined',
        exchange: { id: 1, status: 'declined' } as ExchangeRequest,
      };

      useExchangeStore.getState().handleWSMessage(msg);
      expect(useExchangeStore.getState().notifications).toHaveLength(1);
    });

    it('handles exchange_cancelled messages', () => {
      const msg: WSMessage = {
        type: 'exchange_cancelled',
        message: 'Swap cancelled',
        exchange: { id: 1, status: 'cancelled' } as ExchangeRequest,
      };

      useExchangeStore.getState().handleWSMessage(msg);
      expect(useExchangeStore.getState().notifications).toHaveLength(1);
    });

    it('handles shifts_published messages', () => {
      const msg: WSMessage = {
        type: 'shifts_published',
        message: 'March shifts published',
        shifts: [{ date: '2026-03-15', day_of_week: 'Sunday', calendar_url: 'https://...' }],
      };

      useExchangeStore.getState().handleWSMessage(msg);
      const state = useExchangeStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('shifts_published');
      expect(state.refreshTrigger).toBe(1);
    });

    it('handles assignment_updated by refreshing only', () => {
      const msg: WSMessage = {
        type: 'assignment_updated',
        message: 'Assignments updated',
      };

      useExchangeStore.getState().handleWSMessage(msg);
      expect(useExchangeStore.getState().notifications).toHaveLength(0);
      expect(useExchangeStore.getState().refreshTrigger).toBe(1);
    });

    it('ignores unknown message types', () => {
      const msg: WSMessage = {
        type: 'unknown_type',
        message: 'Something unknown',
      };

      useExchangeStore.getState().handleWSMessage(msg);
      expect(useExchangeStore.getState().notifications).toHaveLength(0);
      expect(useExchangeStore.getState().refreshTrigger).toBe(0);
    });
  });
});
