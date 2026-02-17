'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { exchangeApi } from '@/lib/api';
import { ExchangeRequest } from '@/lib/types/exchange';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { getMockHistory } from '@/lib/mockData/exchangeMockData';
import { ExchangeRequestCard } from './ExchangeRequestCard';
import { ExchangeEmptyState } from './ExchangeEmptyState';

export function ExchangeHistoryPanel() {
  const { selectedMonth, refreshTrigger, useMockData } = useExchangeStore();
  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (useMockData) {
      setLoading(true);
      setTimeout(() => {
        setExchanges(getMockHistory(selectedMonth));
        setLoading(false);
      }, 300);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await exchangeApi.list({ month_year: selectedMonth });
        const history = data.exchanges.filter((e) => e.status !== 'pending');
        setExchanges(history);
      } catch {
        setExchanges([]);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [selectedMonth, refreshTrigger, useMockData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (exchanges.length === 0) {
    return <ExchangeEmptyState tab="history" />;
  }

  return (
    <div className="space-y-3">
      {exchanges.map((exchange) => (
        <ExchangeRequestCard
          key={exchange.id}
          exchange={exchange}
          perspective="history"
        />
      ))}
    </div>
  );
}
