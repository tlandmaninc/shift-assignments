'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { exchangeApi } from '@/lib/api';
import { ExchangeRequest } from '@/lib/types/exchange';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { useAuth } from '@/contexts/AuthContext';
import { getMockOutgoingRequests, mockCancelExchange } from '@/lib/mockData/exchangeMockData';
import { ExchangeRequestCard } from './ExchangeRequestCard';
import { ExchangeEmptyState } from './ExchangeEmptyState';
import toast from 'react-hot-toast';

export function OutgoingRequestsPanel() {
  const { selectedMonth, refreshTrigger, triggerRefresh, useMockData } = useExchangeStore();
  const { user } = useAuth();
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (useMockData) {
      setLoading(true);
      setTimeout(() => {
        setRequests(getMockOutgoingRequests(selectedMonth));
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
        const outgoing = data.exchanges.filter(
          (e) => e.requester_employee_id === user?.employee_id
        );
        setRequests(outgoing);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [selectedMonth, refreshTrigger, user?.employee_id, useMockData]);

  const handleCancel = async (id: number) => {
    setActionLoading(id);
    if (useMockData) {
      await new Promise((r) => setTimeout(r, 800));
      mockCancelExchange(selectedMonth, id);
      toast.success('Swap request cancelled. (Mock)');
      triggerRefresh();
      setActionLoading(null);
      return;
    }
    try {
      await exchangeApi.cancel(id);
      toast.success('Swap request cancelled.');
      triggerRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel swap');
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
    return <ExchangeEmptyState tab="outgoing" />;
  }

  return (
    <div className="space-y-3">
      {requests.map((exchange) => (
        <ExchangeRequestCard
          key={exchange.id}
          exchange={exchange}
          perspective="outgoing"
          onCancel={() => handleCancel(exchange.id)}
          isLoading={actionLoading === exchange.id}
        />
      ))}
    </div>
  );
}
