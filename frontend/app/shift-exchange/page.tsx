'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Wifi, WifiOff, FlaskConical, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePageAccess } from '@/lib/hooks/usePageAccess';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { exchangeApi } from '@/lib/api';
import { getMockIncomingCount } from '@/lib/mockData/exchangeMockData';
import { isDemoAllowed } from '@/lib/mockData/demoMode';
import {
  ExchangeTabBar,
  MonthSelector,
  MyShiftsPanel,
  IncomingRequestsPanel,
  OutgoingRequestsPanel,
  ExchangeHistoryPanel,
} from '@/components/exchange';

export default function ShiftExchangePage() {
  const router = useRouter();
  const { canAccess, isLoading: accessLoading } = usePageAccess();

  useEffect(() => {
    if (!accessLoading && !canAccess('/shift-exchange')) {
      toast.error('You do not have access to this page');
      router.replace('/');
    }
  }, [accessLoading, canAccess, router]);
  const { user, isAdmin, isLoading } = useAuth();
  const {
    selectedMonth,
    setSelectedMonth,
    wsConnected,
    refreshTrigger,
    useMockData,
    setUseMockData,
  } = useExchangeStore();

  const [activeTab, setActiveTab] = useState('shifts');
  const [incomingCount, setIncomingCount] = useState(0);

  const isEmployee = useMockData || !!user?.employee_id || isAdmin;

  // Fetch incoming request count for badge
  useEffect(() => {
    if (!isEmployee) return;

    if (useMockData) {
      setIncomingCount(getMockIncomingCount(selectedMonth));
      return;
    }

    const fetchCount = async () => {
      try {
        const data = await exchangeApi.list({
          month_year: selectedMonth,
          status: 'pending',
        });
        const incoming = data.exchanges.filter(
          (e) => e.target_employee_id === user?.employee_id
        );
        setIncomingCount(incoming.length);
      } catch {
        setIncomingCount(0);
      }
    };
    fetchCount();
  }, [selectedMonth, refreshTrigger, isEmployee, user?.employee_id, useMockData]);

  const tabs = [
    { id: 'shifts', label: 'My Shifts' },
    { id: 'incoming', label: 'Incoming', count: incomingCount },
    { id: 'outgoing', label: 'Outgoing' },
    { id: 'history', label: 'History' },
  ];

  // Show loading while auth context is still fetching user data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 dark:border-primary-800 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isEmployee) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20"
      >
        <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <ArrowLeftRight className="w-10 h-10 text-slate-400 dark:text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Account Not Linked
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
          Your account is not linked to an employee profile.
          {isAdmin
            ? ' Use the admin panel to link accounts to employee profiles.'
            : ' Please contact an administrator to link your account.'}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Shift Exchange
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Swap shifts with your colleagues
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isDemoAllowed && (
            <button
              onClick={() => setUseMockData(!useMockData)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                useMockData
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              )}
              title={useMockData ? 'Using mock data' : 'Using real API'}
            >
              {useMockData ? (
                <FlaskConical className="w-3.5 h-3.5" />
              ) : (
                <Radio className="w-3.5 h-3.5" />
              )}
              {useMockData ? 'Mock' : 'Live'}
            </button>
          )}
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-slate-400" />
            )}
            <span
              className={cn(
                'text-xs font-medium',
                wsConnected
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <MonthSelector
            selectedMonth={selectedMonth}
            onChange={setSelectedMonth}
          />
        </div>
      </div>

      {/* Tab bar */}
      <ExchangeTabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      <div>
        {activeTab === 'shifts' && <MyShiftsPanel />}
        {activeTab === 'incoming' && <IncomingRequestsPanel />}
        {activeTab === 'outgoing' && <OutgoingRequestsPanel />}
        {activeTab === 'history' && <ExchangeHistoryPanel />}
      </div>
    </motion.div>
  );
}
