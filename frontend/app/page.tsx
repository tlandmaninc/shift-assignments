'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Calendar,
  Users,
  FileText,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  Info,
  Shield,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, Button, Badge, Tooltip } from '@/components/ui';
import { historyApi, formsApi, settingsApi } from '@/lib/api';
import { formatMonthYear } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PAGE_ACCESS } from '@/lib/hooks/usePageAccess';
import toast from 'react-hot-toast';

const PAGE_LABELS: Record<string, string> = {
  forms: 'Form Generation',
  assignments: 'Assignments',
  employees: 'Employees',
  history: 'History',
  'shift-exchange': 'Shift Exchange',
  chat: 'Chat',
};

export default function Dashboard() {
  const { isAdmin, user, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentForms, setRecentForms] = useState<any[]>([]);
  const [activeFormsCount, setActiveFormsCount] = useState(0);
  const [fairness, setFairness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pageAccess, setPageAccess] = useState<Record<string, string> | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);

  const canAccessHistory = isAdmin || !!user?.employee_id;

  useEffect(() => {
    // Wait for auth to resolve before deciding whether to fetch data
    if (authLoading) return;
    if (!canAccessHistory) {
      setLoading(false);
      return;
    }
    setLoading(true);
    async function loadData() {
      try {
        const [statsData, fairnessData] = await Promise.all([
          historyApi.get(),
          historyApi.getFairness(),
        ]);
        setStats(statsData);
        setFairness(fairnessData);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [authLoading, canAccessHistory]);

  useEffect(() => {
    if (!isAdmin) return;
    formsApi.list()
      .then(data => {
        setRecentForms(data.slice(0, 3));
        setActiveFormsCount(data.filter((f: any) => f.status === 'active').length);
      })
      .catch(error => console.error('Failed to load forms:', error));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    settingsApi.getPageAccess()
      .then(setPageAccess)
      .catch(() => setPageAccess({ ...DEFAULT_PAGE_ACCESS }));
  }, [isAdmin]);

  const togglePageAccess = (page: string) => {
    if (!pageAccess) return;
    setPageAccess({
      ...pageAccess,
      [page]: pageAccess[page] === 'admin' ? 'all' : 'admin',
    });
  };

  const savePageAccess = async () => {
    if (!pageAccess) return;
    setSavingAccess(true);
    try {
      const saved = await settingsApi.updatePageAccess(pageAccess);
      setPageAccess(saved);
      toast.success('Page access updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update page access');
    } finally {
      setSavingAccess(false);
    }
  };

  const statCards = [
    {
      title: 'Total Employees',
      value: stats?.employee_stats?.length || 0,
      icon: Users,
      color: 'from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600',
      change: '+2 this month',
    },
    {
      title: 'Total Shifts Assigned',
      value: stats?.monthly_assignments?.reduce((a: number, m: any) => a + m.total_shifts, 0) || 0,
      icon: Calendar,
      color: 'from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600',
      change: 'All time',
    },
    {
      title: 'Active Forms',
      value: activeFormsCount,
      icon: FileText,
      color: 'from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600',
      change: 'Pending responses',
    },
    {
      title: 'Fairness Score',
      value: fairness?.fairness_score ? `${fairness.fairness_score.toFixed(1)}%` : '—',
      icon: TrendingUp,
      color: 'from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600',
      change: 'Well balanced',
      tooltip: 'Score = 100 − (MAD ÷ Median) × 100. Uses Median Absolute Deviation for robustness against outliers.',
    },
  ];

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Psychiatry Department - Shift assignments overview
          </p>
        </div>
        <Link href="/forms">
          <Button>
            <FileText className="w-4 h-4" />
            New Form
          </Button>
        </Link>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card hover className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                    {stat.title}
                    {stat.tooltip && (
                      <Tooltip content={stat.tooltip} position="bottom">
                        <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                      </Tooltip>
                    )}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {stat.change}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md dark:shadow-lg`}
                >
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
              {/* Decorative gradient */}
              <div
                className={`absolute -right-8 -bottom-8 w-24 h-24 bg-gradient-to-br ${stat.color} opacity-[0.06] dark:opacity-10 rounded-full blur-2xl`}
              />
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader title="Quick Actions" description="Common tasks you can perform" />
          <div className="space-y-3">
            <Link href="/forms" className="block">
              <motion.div
                whileHover={{ x: 4 }}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Form Generation</p>
                    <p className="text-xs text-slate-500">Create availability form</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </motion.div>
            </Link>

            <Link href="/assignments" className="block">
              <motion.div
                whileHover={{ x: 4 }}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      Assign Shifts
                    </p>
                    <p className="text-xs text-slate-500">Run scheduler algorithm</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </motion.div>
            </Link>

            <Link href="/history" className="block">
              <motion.div
                whileHover={{ x: 4 }}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-violet-500 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">View History</p>
                    <p className="text-xs text-slate-500">Past assignments & stats</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </motion.div>
            </Link>
          </div>
        </Card>

        {/* Recent Forms */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent Forms"
            description="Latest availability forms created"
            action={
              <Link href="/forms">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            }
          />
          {recentForms.length > 0 ? (
            <div className="space-y-3">
              {recentForms.map((form) => (
                <motion.div
                  key={form.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        form.status === 'processed'
                          ? 'bg-emerald-50 dark:bg-emerald-900/30'
                          : 'bg-amber-50 dark:bg-amber-900/30'
                      }`}
                    >
                      {form.status === 'processed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{form.title}</p>
                      <p className="text-sm text-slate-500">
                        {form.included_dates?.length || 0} dates •{' '}
                        {formatMonthYear(form.month_year)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      form.status === 'processed'
                        ? 'success'
                        : form.status === 'active'
                        ? 'warning'
                        : 'default'
                    }
                  >
                    {form.status}
                  </Badge>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No forms created yet</p>
              <Link href="/forms" className="text-primary-500 hover:underline text-sm">
                Create your first form
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Page Access Control (admin only) */}
      {isAdmin && pageAccess && (
        <Card>
          <CardHeader
            title="Page Access"
            description="Control which pages are visible to non-admin users"
            action={
              <Button
                size="sm"
                onClick={savePageAccess}
                loading={savingAccess}
              >
                <Shield className="w-4 h-4" />
                Save
              </Button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(PAGE_LABELS).map((page) => (
              <button
                key={page}
                onClick={() => togglePageAccess(page)}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {PAGE_LABELS[page]}
                </span>
                <Badge variant={pageAccess[page] === 'all' ? 'success' : 'default'}>
                  {pageAccess[page] === 'all' ? 'All Users' : 'Admin Only'}
                </Badge>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
