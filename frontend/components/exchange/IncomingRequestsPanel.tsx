'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { exchangeApi } from '@/lib/api';
import { ExchangeRequest } from '@/lib/types/exchange';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { useAuth } from '@/contexts/AuthContext';
import { getMockIncomingRequests, mockAcceptExchange, mockDeclineExchange } from '@/lib/mockData/exchangeMockData';
import { ExchangeRequestCard } from './ExchangeRequestCard';
import { ExchangeEmptyState } from './ExchangeEmptyState';
import toast from 'react-hot-toast';

export function IncomingRequestsPanel() {
  const { selectedMonth, refreshTrigger, triggerRefresh, useMockData } = useExchangeStore();
  const { user } = useAuth();
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (useMockData) {
      setLoading(true);
      setTimeout(() => {
        setRequests(getMockIncomingRequests(selectedMonth));
        setLoading(false);
      }, 300);
      return;
    }

    const fetchRequests = async () => {
      setLoading(true);
      try {
        const data = await exchangeApi.list({
          month_year: selectedMonth,
          status: 'pending',
        });
        const incoming = data.exchanges.filter(
          (e) => e.target_employee_id === user?.employee_id
        );
        setRequests(incoming);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [selectedMonth, refreshTrigger, user?.employee_id, useMockData]);

  const handleAccept = async (id: number) => {
    setActionLoading(id);
    if (useMockData) {
      await new Promise((r) => setTimeout(r, 800));
      mockAcceptExchange(selectedMonth, id);
      toast.success('Swap accepted! Schedules updated. (Mock)');
      triggerRefresh();
      setActionLoading(null);
      return;
    }
    try {
      await exchangeApi.respond(id, { action: 'accept' });
      toast.success('Swap accepted! Schedules updated.');
      triggerRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept swap');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (id: number) => {
    setActionLoading(id);
    if (useMockData) {
      await new Promise((r) => setTimeout(r, 800));
      mockDeclineExchange(selectedMonth, id);
      toast.success('Swap request declined. (Mock)');
      triggerRefresh();
      setActionLoading(null);
      return;
    }
    try {
      await exchangeApi.respond(id, { action: 'decline' });
      toast.success('Swap request declined.');
      triggerRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline swap');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (requests.length === 0) {
    return <ExchangeEmptyState tab="incoming" />;
  }

  return (
    <div className="space-y-3">
      {requests.map((exchange) => (
        <ExchangeRequestCard
          key={exchange.id}
          exchange={exchange}
          perspective="incoming"
          onAccept={() => handleAccept(exchange.id)}
          onDecline={() => handleDecline(exchange.id)}
          isLoading={actionLoading === exchange.id}
        />
      ))}
    </div>
  );
}
