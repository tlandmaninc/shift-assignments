'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  BarChart3,
  Award,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  PieChart,
  LineChart,
  Activity,
  Info,
} from 'lucide-react';
import {
  LineChart as RechartsLine,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, Badge, Tooltip as UITooltip } from '@/components/ui';
import { historyApi, assignmentsApi } from '@/lib/api';
import { formatMonthYear } from '@/lib/utils';
import { X, ChevronRight } from 'lucide-react';

// Color palette for charts
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
];

type ChartView = 'trends' | 'monthly' | 'distribution';
type SortOption = 'shifts-desc' | 'shifts-asc' | 'name-asc' | 'name-desc';

export default function HistoryPage() {
  const [history, setHistory] = useState<any>(null);
  const [fairness, setFairness] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [employeeTrends, setEmployeeTrends] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<ChartView>('trends');
  const [employeeSort, setEmployeeSort] = useState<SortOption>('shifts-desc');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [calendarHtml, setCalendarHtml] = useState<string>('');
  const [calendarLoading, setCalendarLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [historyData, fairnessData, monthlyDataResult, trendsData] = await Promise.all([
          historyApi.get(),
          historyApi.getFairness(),
          historyApi.getMonthly(),
          historyApi.getEmployeeTrends(),
        ]);
        setHistory(historyData);
        setFairness(fairnessData);
        setMonthlyData(monthlyDataResult);
        setEmployeeTrends(trendsData);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Transform employee trends data for line chart
  const getTrendsChartData = () => {
    if (!employeeTrends?.trends || !monthlyData?.months) return [];

    const months = monthlyData.months.map((m: any) => m.month_year).sort();

    return months.map((month: string) => {
      const dataPoint: any = { month: formatMonthYear(month) };
      employeeTrends.trends.forEach((emp: any) => {
        dataPoint[emp.employee_name] = emp.monthly_shifts[month] || 0;
      });
      return dataPoint;
    });
  };

  // Transform monthly data for bar chart
  const getMonthlyChartData = () => {
    if (!monthlyData?.months) return [];

    return monthlyData.months
      .sort((a: any, b: any) => a.month_year.localeCompare(b.month_year))
      .map((m: any) => ({
        month: formatMonthYear(m.month_year),
        shifts: m.total_shifts,
        employees: m.employees_count,
      }));
  };

  // Transform fairness data for pie chart
  const getDistributionChartData = () => {
    if (!fairness?.employees) return [];

    return fairness.employees
      .filter((emp: any) => emp.total_shifts > 0)
      .map((emp: any) => ({
        name: emp.name,
        value: emp.total_shifts,
        isNew: emp.is_new,
      }));
  };

  // Custom tooltip for line chart
  const TrendsTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-600 dark:text-slate-400">{entry.name}:</span>
              <span className="font-medium text-slate-900 dark:text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for pie chart
  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white">{data.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {data.value} shifts ({((data.value / fairness?.employees?.reduce((a: number, e: any) => a + e.total_shifts, 0)) * 100).toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const getFairnessColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500';
    if (score >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const getFairnessLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Needs Improvement';
  };

  const getSortedEmployees = () => {
    if (!fairness?.employees) return [];

    return [...fairness.employees].sort((a: any, b: any) => {
      switch (employeeSort) {
        case 'shifts-desc':
          return b.total_shifts - a.total_shifts;
        case 'shifts-asc':
          return a.total_shifts - b.total_shifts;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return b.total_shifts - a.total_shifts;
      }
    });
  };

  const handleMonthClick = async (monthYear: string) => {
    setSelectedMonth(monthYear);
    setCalendarLoading(true);
    try {
      const html = await assignmentsApi.getCalendar(monthYear);
      setCalendarHtml(html);
    } catch (error) {
      console.error('Failed to load calendar:', error);
      setCalendarHtml('<div class="text-center py-8 text-red-500">Failed to load calendar</div>');
    } finally {
      setCalendarLoading(false);
    }
  };

  const closeCalendarModal = () => {
    setSelectedMonth(null);
    setCalendarHtml('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          History & Analytics
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Track Psychiatrics ECT assignment history and fairness metrics
        </p>
      </motion.div>

      {/* Fairness Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 inline-flex items-center gap-1">
                Fairness Score
                <UITooltip
                  content="Score = 100 − (MAD ÷ Median) × 100. Uses Median Absolute Deviation for robustness against outliers."
                  position="bottom"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                </UITooltip>
              </p>
              <p
                className={`text-4xl font-bold mt-1 ${getFairnessColor(
                  fairness?.fairness_score || 0
                )}`}
              >
                {fairness?.fairness_score?.toFixed(1) || 0}%
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {getFairnessLabel(fairness?.fairness_score || 0)}
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Award className="w-8 h-8 text-white" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Avg Shifts/Employee</p>
              <p className="text-2xl font-bold">
                {fairness?.average_shifts?.toFixed(1) || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Std Deviation</p>
              <p className="text-2xl font-bold">
                {fairness?.std_deviation?.toFixed(2) || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Interactive Visualizations */}
      <Card>
        <CardHeader
          title="Analytics Dashboard"
          description="Interactive visualizations of shift data over time"
        />

        {/* Chart Navigation Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'trends', label: 'Employee Trends', icon: TrendingUp },
            { id: 'monthly', label: 'Monthly Overview', icon: BarChart3 },
            { id: 'distribution', label: 'Distribution', icon: PieChart },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveChart(tab.id as ChartView)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeChart === tab.id
                  ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Charts Container */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeChart}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="h-80"
          >
            {/* Employee Trends Line Chart */}
            {activeChart === 'trends' && (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLine data={getTrendsChartData()}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="text-slate-500"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="text-slate-500"
                  />
                  <Tooltip content={<TrendsTooltip />} />
                  <Legend />
                  {employeeTrends?.trends?.map((emp: any, index: number) => (
                    <Line
                      key={emp.employee_id}
                      type="monotone"
                      dataKey={emp.employee_name}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                    />
                  ))}
                </RechartsLine>
              </ResponsiveContainer>
            )}

            {/* Monthly Shifts Bar Chart */}
            {activeChart === 'monthly' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getMonthlyChartData()}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="text-slate-500"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="text-slate-500"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, white)',
                      border: '1px solid var(--tooltip-border, #e2e8f0)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="shifts"
                    name="Total Shifts"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="employees"
                    name="Employees"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Distribution Pie Chart */}
            {activeChart === 'distribution' && (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={getDistributionChartData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {getDistributionChartData().map((_: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value: string) => (
                      <span className="text-sm text-slate-600 dark:text-slate-400">{value}</span>
                    )}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Chart Insights */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-600">Active Employees</span>
            </div>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
              {fairness?.employees?.filter((e: any) => e.total_shifts > 0).length || 0}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-600">Total Shifts</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {fairness?.employees?.reduce((a: number, e: any) => a + e.total_shifts, 0) || 0}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-800/20">
            <div className="flex items-center gap-2 mb-2">
              <LineChart className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-600">Months Tracked</span>
            </div>
            <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">
              {monthlyData?.months?.length || 0}
            </p>
          </div>
        </div>
      </Card>

      {/* Employee Fairness Breakdown */}
      <Card>
        <CardHeader
          title="Employee Distribution"
          description="Shift distribution across all employees"
        />

        {/* Sorting Controls */}
        <div className="relative mb-4" ref={sortDropdownRef}>
          <button
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm text-slate-600 dark:text-slate-400"
          >
            {(employeeSort === 'shifts-desc' || employeeSort === 'name-desc') ? (
              <ArrowDown className="w-4 h-4" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
            <span>
              {employeeSort === 'shifts-desc' && 'Most shifts'}
              {employeeSort === 'shifts-asc' && 'Fewest shifts'}
              {employeeSort === 'name-asc' && 'A-Z'}
              {employeeSort === 'name-desc' && 'Z-A'}
            </span>
          </button>

          <AnimatePresence>
            {sortDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-10 min-w-[140px]"
              >
                {[
                  { id: 'shifts-desc', label: 'Most shifts' },
                  { id: 'shifts-asc', label: 'Fewest shifts' },
                  { id: 'name-asc', label: 'A-Z' },
                  { id: 'name-desc', label: 'Z-A' },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setEmployeeSort(option.id as SortOption);
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                      employeeSort === option.id
                        ? 'text-primary-600 dark:text-primary-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          {getSortedEmployees().map((emp: any) => {
            const percentage =
              fairness.average_shifts > 0
                ? (emp.total_shifts / fairness.max_shifts) * 100
                : 0;
            const isAboveAverage = emp.total_shifts > fairness.average_shifts;

            return (
              <div key={emp.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-medium text-sm">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {emp.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={emp.is_new ? 'info' : 'default'}
                          size="sm"
                        >
                          {emp.is_new ? 'New' : 'Experienced'}
                        </Badge>
                        {emp.last_shift_date && (
                          <span className="text-xs text-slate-500">
                            Last: {emp.last_shift_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{emp.total_shifts}</span>
                    {isAboveAverage ? (
                      <ArrowUp className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className={`h-full rounded-full ${
                      isAboveAverage
                        ? 'bg-emerald-500'
                        : 'bg-primary-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Monthly History */}
      <Card>
        <CardHeader
          title="Monthly History"
          description="Past assignment summaries by month"
        />
        <div className="space-y-3">
          {monthlyData?.months?.length > 0 ? (
            monthlyData.months.map((month: any) => (
              <motion.div
                key={month.month_year}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => handleMonthClick(month.month_year)}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
                    <Calendar className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {formatMonthYear(month.month_year)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {month.total_shifts} shifts • {month.employees_count} employees
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-600">
                      {month.total_shifts}
                    </p>
                    <p className="text-xs text-slate-500">shifts</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary-600 transition-colors" />
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No assignment history yet</p>
            </div>
          )}
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-slate-500">Total Months</p>
            <p className="text-3xl font-bold mt-1">
              {history?.monthly_assignments?.length || 0}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-slate-500">Min Shifts (Employee)</p>
            <p className="text-3xl font-bold mt-1">{fairness?.min_shifts || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-slate-500">Max Shifts (Employee)</p>
            <p className="text-3xl font-bold mt-1">{fairness?.max_shifts || 0}</p>
          </div>
        </Card>
      </div>

      {/* Calendar Modal */}
      <AnimatePresence>
        {selectedMonth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeCalendarModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {formatMonthYear(selectedMonth)}
                    </h2>
                    <p className="text-sm text-slate-500">Shift assignments calendar</p>
                  </div>
                </div>
                <button
                  onClick={closeCalendarModal}
                  className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                {calendarLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <div
                    className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
                    dangerouslySetInnerHTML={{ __html: calendarHtml }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
