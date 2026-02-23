'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
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
  FlaskConical,
  Radio,
  Grid3X3,
  CalendarRange,
  RotateCcw,
  Target,
  Users,
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
  AreaChart,
  Area,
  ReferenceLine,
  ReferenceArea,
  LabelList,
  Label,
} from 'recharts';
import { Card, CardHeader, Badge, Tooltip as UITooltip } from '@/components/ui';
import { historyApi, assignmentsApi } from '@/lib/api';
import { cn, formatMonthYear } from '@/lib/utils';
import { X, ChevronRight, ChevronLeft, Printer } from 'lucide-react';
import { printCalendarHtml } from '@/lib/printCalendar';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { usePageAccess } from '@/lib/hooks/usePageAccess';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import {
  generateMockHistory,
  generateMockFairness,
  generateMockMonthlyData,
  generateMockEmployeeTrends,
  generateMockCalendarHtml,
} from '@/lib/mockData/historyMockData';
import { SHIFT_TYPES, DEFAULT_SHIFT_TYPE, getShiftTypeConfig } from '@/lib/constants/shiftTypes';

const SHIFT_TYPE_KEYS = Object.keys(SHIFT_TYPES);

// Color palette for charts (used for per-employee lines)
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
];

type ChartView = 'trends' | 'monthly' | 'distribution' | 'heatmap';
type SortOption = 'shifts-desc' | 'shifts-asc' | 'name-asc' | 'name-desc';

// Shared chart tooltip container classes
const TOOLTIP_BOX = 'bg-white dark:bg-slate-800 px-4 py-3 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 min-w-[280px]';

// Memoized custom tooltip for line chart
const TrendsTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={cn(TOOLTIP_BOX, 'max-h-64 overflow-y-auto')}>
        <p className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">{label}</p>
        {payload
          .slice()
          .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
          .map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
              </div>
              <span className="font-semibold tabular-nums" style={{ color: entry.color }}>{entry.value ?? 0}</span>
            </div>
          ))}
      </div>
    );
  }
  return null;
});
TrendsTooltip.displayName = 'TrendsTooltip';

// Sunburst tooltip: distinguishes inner ring (type) from outer ring (employee)
const SunburstTooltip = memo(({ active, payload, grandTotal }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const isOuter = 'shiftType' in d;
    const pct = grandTotal > 0 ? ((d.value / grandTotal) * 100).toFixed(1) : '0';
    const bulletColor = d.fill;
    return (
      <div className={TOOLTIP_BOX}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bulletColor, opacity: isOuter ? 0.65 : 1 }} />
          <p className="font-semibold text-sm" style={{ color: bulletColor }}>{d.name}</p>
        </div>
        {isOuter && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1 pl-[18px]">{d.shiftType} type</p>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-300 pl-[18px]">
          <span className="font-semibold" style={{ color: bulletColor }}>{d.value}</span> shifts · {pct}% of total
        </p>
      </div>
    );
  }
  return null;
});
SunburstTooltip.displayName = 'SunburstTooltip';

// Gap Analysis tooltip: colored bullet per employee bar
const GapAnalysisTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const barColor = getGapBarColor(d.deviation);
    const sign = d.deviation > 0 ? '+' : '';
    return (
      <div className={TOOLTIP_BOX}>
        <p className="font-semibold text-slate-900 dark:text-white text-sm mb-2">{label}</p>
        <div className="flex items-center justify-between gap-4 text-sm py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
            <span className="text-slate-600 dark:text-slate-300">Deviation</span>
          </div>
          <span className="font-semibold tabular-nums" style={{ color: barColor }}>{sign}{d.deviation}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm py-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">Total shifts</span>
          </div>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{d.total}</span>
        </div>
      </div>
    );
  }
  return null;
});
GapAnalysisTooltip.displayName = 'GapAnalysisTooltip';

// Fairness Over Time tooltip: colored bullets for each metric
const FairnessOverTimeTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const METRIC_META: Record<string, { label: string; color: string; suffix: string }> = {
      fairness: { label: 'Fairness Score', color: '#22c55e', suffix: '%' },
      gap: { label: 'Max-Min Gap', color: '#8b5cf6', suffix: '' },
      stdDev: { label: 'Std Deviation', color: '#f59e0b', suffix: '' },
    };
    return (
      <div className={TOOLTIP_BOX}>
        <p className="font-semibold text-slate-900 dark:text-white text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => {
          const meta = METRIC_META[entry.dataKey] || {
            label: entry.name, color: entry.color || '#94a3b8', suffix: '',
          };
          return (
            <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="text-slate-600 dark:text-slate-300">{meta.label}</span>
              </div>
              <span className="font-semibold tabular-nums" style={{ color: meta.color }}>
                {entry.value ?? 0}{meta.suffix}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
});
FairnessOverTimeTooltip.displayName = 'FairnessOverTimeTooltip';

// Monthly Overview Shifts pane tooltip: colored bullets per shift type
const MonthlyShiftsTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className={TOOLTIP_BOX}>
        <p className="font-semibold text-slate-900 dark:text-white text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill || entry.color }} />
              <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
            </div>
            <span className="font-semibold tabular-nums" style={{ color: entry.fill || entry.color }}>
              {entry.value} shifts
            </span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-semibold">
            <span className="text-slate-500 dark:text-slate-400">Total</span>
            <span className="text-slate-900 dark:text-white">{total} shifts</span>
          </div>
        )}
      </div>
    );
  }
  return null;
});
MonthlyShiftsTooltip.displayName = 'MonthlyShiftsTooltip';

// Monthly Overview Employees pane tooltip
const MonthlyEmployeesTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={TOOLTIP_BOX}>
        <p className="font-semibold text-slate-900 dark:text-white text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill || entry.color }} />
              <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
            </div>
            <span className="font-semibold tabular-nums" style={{ color: entry.fill || entry.color }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
});
MonthlyEmployeesTooltip.displayName = 'MonthlyEmployeesTooltip';

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

const getGapBarColor = (deviation: number) => {
  const abs = Math.abs(deviation);
  if (abs <= 0.5) return '#22c55e';
  if (deviation > 0) return abs > 3 ? '#ef4444' : '#6366f1';
  return abs > 3 ? '#ef4444' : '#f59e0b';
};

const getHeatCellStyle = (val: number, maxVal: number, shiftTypeColor?: string) => {
  if (val === 0) return { backgroundColor: 'transparent' };
  const intensity = maxVal > 0 ? val / maxVal : 0;
  const baseColor = shiftTypeColor || '99, 102, 241';
  return {
    backgroundColor: `rgba(${baseColor}, ${intensity * 0.7 + 0.1})`,
    color: intensity > 0.45 ? 'white' : undefined,
  };
};

export default function HistoryPage() {
  const router = useRouter();
  const { canAccess, isLoading: accessLoading } = usePageAccess();
  const { useMockData, setUseMockData } = useExchangeStore();

  useEffect(() => {
    if (!accessLoading && !canAccess('/history')) {
      toast.error('You do not have access to this page');
      router.replace('/');
    }
  }, [accessLoading, canAccess, router]);
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
  const [selectedShiftType, setSelectedShiftType] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [sunburstDrill, setSunburstDrill] = useState<string | null>(null); // null = top level, string = drilled type key

  // Available months for date range picker (sorted)
  const availableMonths = useMemo(() => {
    if (!monthlyData?.months) return [];
    return monthlyData.months
      .map((m: any) => m.month_year)
      .sort();
  }, [monthlyData]);

  // Date range filter helper
  const filterByDateRange = useCallback(<T extends Record<string, any>>(data: T[], monthKey = 'month_year'): T[] => {
    if (!dateRange.from && !dateRange.to) return data;
    return data.filter(d => {
      const m = d[monthKey];
      if (dateRange.from && m < dateRange.from) return false;
      if (dateRange.to && m > dateRange.to) return false;
      return true;
    });
  }, [dateRange]);

  // Filter months within employee trend monthly_shifts by date range
  const filterMonthlyShifts = useCallback((monthlyShifts: Record<string, number>): Record<string, number> => {
    if (!dateRange.from && !dateRange.to) return monthlyShifts;
    const filtered: Record<string, number> = {};
    for (const [month, count] of Object.entries(monthlyShifts)) {
      if (dateRange.from && month < dateRange.from) continue;
      if (dateRange.to && month > dateRange.to) continue;
      filtered[month] = count;
    }
    return filtered;
  }, [dateRange]);

  // Memoized filtered fairness data
  const activeFairness = useMemo(() => {
    if (!fairness) return fairness;

    let employees = fairness.employees;

    // Filter by shift type
    if (selectedShiftType) {
      employees = employees.map((emp: any) => ({
        ...emp,
        total_shifts: emp.shifts_by_type?.[selectedShiftType] || 0,
      }));
    }

    // If date range is set, recalculate totals from trends data
    if ((dateRange.from || dateRange.to) && employeeTrends?.trends) {
      employees = employees.map((emp: any) => {
        const trend = employeeTrends.trends.find((t: any) => t.employee_name === emp.name);
        if (!trend) return emp;
        const filteredShifts = filterMonthlyShifts(trend.monthly_shifts || {});
        const total = Object.values(filteredShifts).reduce((a: number, b: number) => a + b, 0);
        return { ...emp, total_shifts: total };
      });
    }

    // Recalculate fairness metrics
    const shifts = employees.map((e: any) => e.total_shifts).filter((s: number) => s > 0);
    if (shifts.length === 0) return { ...fairness, employees, fairness_score: 100, average_shifts: 0, std_deviation: 0, min_shifts: 0, max_shifts: 0 };

    const avg = shifts.reduce((a: number, b: number) => a + b, 0) / shifts.length;
    const sorted = [...shifts].sort((a: number, b: number) => a - b);
    const n = sorted.length;
    const median = n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const mad = sorted.map((s: number) => Math.abs(s - median)).sort((a: number, b: number) => a - b)[Math.floor(n / 2)] || 0;
    const variance = shifts.reduce((sum: number, s: number) => sum + (s - avg) ** 2, 0) / n;

    return {
      ...fairness,
      employees,
      average_shifts: avg,
      std_deviation: Math.sqrt(variance),
      min_shifts: Math.min(...shifts),
      max_shifts: Math.max(...shifts),
      fairness_score: median > 0 ? Math.max(0, 100 - (mad / median) * 100) : 100,
    };
  }, [fairness, selectedShiftType, dateRange, employeeTrends, filterMonthlyShifts]);

  useEffect(() => {
    async function loadData() {
      try {
        if (useMockData) {
          setHistory(generateMockHistory());
          setFairness(generateMockFairness(selectedShiftType));
          setMonthlyData(generateMockMonthlyData());
          setEmployeeTrends(generateMockEmployeeTrends());
        } else {
          const [historyData, fairnessData, monthlyDataResult, trendsData] = await Promise.all([
            historyApi.get(selectedShiftType),
            historyApi.getFairness(selectedShiftType),
            historyApi.getMonthly(selectedShiftType),
            historyApi.getEmployeeTrends(selectedShiftType),
          ]);
          setHistory(historyData);
          setFairness(fairnessData);
          setMonthlyData(monthlyDataResult);
          setEmployeeTrends(trendsData);
        }
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [useMockData, selectedShiftType]);

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

  // Memoized chart data: Employee Trends line chart
  // BUG FIX: Always use monthly_shifts (backend already filters by shift_type).
  // Fall back to monthly_shifts_by_type for mock data compatibility.
  const trendsChartData = useMemo(() => {
    if (!employeeTrends?.trends || !monthlyData?.months) return [];

    const months = filterByDateRange(monthlyData.months)
      .map((m: any) => m.month_year)
      .sort();

    return months.map((month: string) => {
      const dataPoint: any = { month: formatMonthYear(month) };
      employeeTrends.trends.forEach((emp: any) => {
        dataPoint[emp.employee_name] =
          emp.monthly_shifts?.[month] ??
          emp.monthly_shifts_by_type?.[month]?.[selectedShiftType!] ?? 0;
      });
      return dataPoint;
    });
  }, [employeeTrends, monthlyData, selectedShiftType, filterByDateRange]);

  // Memoized chart data: Monthly stacked bar chart
  const monthlyChartData = useMemo(() => {
    if (!monthlyData?.months) return [];

    return filterByDateRange(monthlyData.months)
      .sort((a: any, b: any) => a.month_year.localeCompare(b.month_year))
      .map((m: any) => ({
        month: formatMonthYear(m.month_year),
        shifts: selectedShiftType ? (m.by_type?.[selectedShiftType] || 0) : m.total_shifts,
        employees: m.employees_count,
        ...(m.by_type && !selectedShiftType ? {
          ect: m.by_type.ect || 0,
          internal: m.by_type.internal || 0,
          er: m.by_type.er || 0,
        } : {}),
      }));
  }, [monthlyData, selectedShiftType, filterByDateRange]);

  // Memoized chart data: Distribution chart
  // When All Types: per-employee stacked bar (ECT / Internal / ER per person)
  // When All Types: stacked bar per employee; when specific type: per-employee pie
  const distributionChartData = useMemo(() => {
    if (!activeFairness?.employees) return [];

    if (!selectedShiftType) {
      // Stacked bar: each employee broken down by shift type
      return activeFairness.employees
        .filter((emp: any) => emp.total_shifts > 0)
        .sort((a: any, b: any) => b.total_shifts - a.total_shifts)
        .map((emp: any) => {
          const entry: any = { name: emp.name, total: emp.total_shifts };
          for (const [type, count] of Object.entries(emp.shifts_by_type || {})) {
            entry[getShiftTypeConfig(type).label] = count as number;
          }
          return entry;
        });
    }

    return activeFairness.employees
      .filter((emp: any) => emp.total_shifts > 0)
      .map((emp: any) => ({
        name: emp.name,
        value: emp.total_shifts,
        isNew: emp.is_new,
      }));
  }, [activeFairness, selectedShiftType]);

  const distributionTotal = useMemo(
    () => distributionChartData.reduce((a: number, d: any) => a + d.value, 0),
    [distributionChartData]
  );

  // Memoized sorted employees
  const sortedEmployees = useMemo(() => {
    if (!activeFairness?.employees) return [];

    return [...activeFairness.employees].sort((a: any, b: any) => {
      switch (employeeSort) {
        case 'shifts-desc': return b.total_shifts - a.total_shifts;
        case 'shifts-asc': return a.total_shifts - b.total_shifts;
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        default: return b.total_shifts - a.total_shifts;
      }
    });
  }, [activeFairness, employeeSort]);

  // Memoized gap analysis data (diverging bar chart)
  const gapAnalysisData = useMemo(() => {
    if (!activeFairness?.employees || !activeFairness.average_shifts) return [];
    const avg = activeFairness.average_shifts;
    return [...activeFairness.employees]
      .map((emp: any) => ({
        name: emp.name,
        deviation: +(emp.total_shifts - avg).toFixed(1),
        total: emp.total_shifts,
        isNew: emp.is_new,
      }))
      .sort((a: any, b: any) => b.deviation - a.deviation);
  }, [activeFairness]);

  // Memoized fairness over time data (area chart)
  const fairnessTrendData = useMemo(() => {
    if (!employeeTrends?.trends || !monthlyData?.months) return [];

    const months = filterByDateRange(monthlyData.months)
      .map((m: any) => m.month_year)
      .sort();

    return months.map((month: string) => {
      const counts = employeeTrends.trends
        .map((emp: any) => {
          return emp.monthly_shifts?.[month] ??
            emp.monthly_shifts_by_type?.[month]?.[selectedShiftType!] ?? 0;
        })
        .filter((c: number) => c > 0);

      if (counts.length === 0) return { month: formatMonthYear(month), fairness: 100, stdDev: 0, gap: 0 };

      const avg = counts.reduce((a: number, b: number) => a + b, 0) / counts.length;
      const sorted = [...counts].sort((a: number, b: number) => a - b);
      const n = sorted.length;
      const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const mad = sorted.map((c: number) => Math.abs(c - median)).sort((a: number, b: number) => a - b)[Math.floor(n / 2)] || 0;
      const variance = counts.reduce((s: number, c: number) => s + (c - avg) ** 2, 0) / n;

      return {
        month: formatMonthYear(month),
        fairness: +(median > 0 ? Math.max(0, 100 - (mad / median) * 100) : 100).toFixed(1),
        stdDev: +Math.sqrt(variance).toFixed(2),
        gap: Math.max(...counts) - Math.min(...counts),
      };
    });
  }, [employeeTrends, monthlyData, selectedShiftType, filterByDateRange]);

  // Memoized heatmap data
  const heatmapData = useMemo(() => {
    if (!employeeTrends?.trends || !monthlyData?.months) return { employees: [] as any[], months: [] as string[], maxCount: 0 };

    const months = filterByDateRange(monthlyData.months)
      .map((m: any) => m.month_year)
      .sort();

    let maxCount = 0;
    const employees = employeeTrends.trends.map((emp: any) => {
      const monthCounts = months.map((m: string) => {
        const count = emp.monthly_shifts?.[m] ??
          emp.monthly_shifts_by_type?.[m]?.[selectedShiftType!] ?? 0;
        if (count > maxCount) maxCount = count;
        return count;
      });
      return {
        name: emp.employee_name,
        id: emp.employee_id,
        counts: monthCounts,
        total: monthCounts.reduce((a: number, b: number) => a + b, 0),
      };
    }).sort((a: any, b: any) => b.total - a.total);

    return { employees, months, maxCount };
  }, [employeeTrends, monthlyData, selectedShiftType, filterByDateRange]);

  // Filtered monthly list for Monthly History section
  const filteredMonths = useMemo(() => {
    if (!monthlyData?.months) return [];
    return filterByDateRange(monthlyData.months);
  }, [monthlyData, filterByDateRange]);

  const handleMonthClick = useCallback(async (monthYear: string) => {
    setSelectedMonth(monthYear);
    setCalendarLoading(true);
    try {
      if (useMockData) {
        setCalendarHtml(generateMockCalendarHtml(monthYear));
      } else {
        const html = await assignmentsApi.getCalendar(monthYear);
        setCalendarHtml(html);
      }
    } catch (error) {
      console.error('Failed to load calendar:', error);
      setCalendarHtml('<div class="text-center py-8 text-red-500">Failed to load calendar</div>');
    } finally {
      setCalendarLoading(false);
    }
  }, [useMockData]);

  const closeCalendarModal = useCallback(() => {
    setSelectedMonth(null);
    setCalendarHtml('');
  }, []);

  const handlePrintCalendar = useCallback(() => {
    if (!calendarHtml) return;
    try {
      printCalendarHtml(calendarHtml);
      toast.success('Print dialog opened');
    } catch {
      toast.error('Failed to open print dialog');
    }
  }, [calendarHtml]);

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
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            History & Analytics
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Track shift assignment history and fairness metrics
          </p>
        </div>
        {process.env.NODE_ENV === 'development' && (
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
      </motion.div>

      {/* Filter Bar: Shift Type + Date Range */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Shift Type Filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedShiftType(null)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              selectedShiftType === null
                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            All Types
          </button>
          {Object.entries(SHIFT_TYPES).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedShiftType(key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all border-2',
                selectedShiftType === key
                  ? 'text-white shadow-md'
                  : 'border-transparent'
              )}
              style={selectedShiftType === key ? {
                backgroundColor: config.color,
                borderColor: config.color,
                color: 'white',
              } : {
                backgroundColor: config.color + '20',
                color: config.color,
                borderColor: 'transparent',
              }}
            >
              {config.label}
            </button>
          ))}
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <select
            value={dateRange.from || ''}
            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value || null }))}
            className="px-2 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-0 outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">From: All</option>
            {availableMonths.map((m: string) => (
              <option key={m} value={m}>{formatMonthYear(m)}</option>
            ))}
          </select>
          <span className="text-slate-400 text-sm">–</span>
          <select
            value={dateRange.to || ''}
            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value || null }))}
            className="px-2 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-0 outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">To: All</option>
            {availableMonths.map((m: string) => (
              <option key={m} value={m}>{formatMonthYear(m)}</option>
            ))}
          </select>
          {(dateRange.from || dateRange.to) && (
            <button
              onClick={() => setDateRange({ from: null, to: null })}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
              title="Reset date range"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active filter indicator */}
      {(dateRange.from || dateRange.to) && (
        <div className="text-xs text-slate-500 dark:text-slate-400 -mt-3">
          Showing {dateRange.from ? formatMonthYear(dateRange.from) : 'start'} – {dateRange.to ? formatMonthYear(dateRange.to) : 'latest'}
        </div>
      )}

      {/* Fairness Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                Fairness Score
                {selectedShiftType && (
                  <span
                    className={cn(
                      'ml-1 px-1.5 py-0.5 rounded text-xs font-medium',
                      SHIFT_TYPES[selectedShiftType].bgLight,
                      SHIFT_TYPES[selectedShiftType].textClass
                    )}
                  >
                    {SHIFT_TYPES[selectedShiftType].label}
                  </span>
                )}
                <UITooltip
                  content={
                    <div className="space-y-1.5">
                      <p><strong className="text-white">Score</strong> = 100 − (MAD / Median) × 100</p>
                      <p className="text-xs text-slate-400">MAD is calculated on each employee's total shift count. 100 = perfectly equal distribution; lower = less equal.</p>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                        <span><strong style={{ color: '#22c55e' }}>≥80</strong> — Good</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                        <span><strong style={{ color: '#f59e0b' }}>60–79</strong> — Fair</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#ef4444' }} />
                        <span><strong style={{ color: '#ef4444' }}>&lt;60</strong> — Needs improvement</span>
                      </div>
                    </div>
                  }
                  position="bottom"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                </UITooltip>
              </span>
              <p
                className={`text-4xl font-bold mt-1 ${getFairnessColor(
                  activeFairness?.fairness_score || 0
                )}`}
              >
                {activeFairness?.fairness_score?.toFixed(1) || 0}%
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {getFairnessLabel(activeFairness?.fairness_score || 0)}
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
              <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                Avg Shifts/Employee
                <UITooltip
                  content={
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#3B82F6' }} />
                      <span><strong style={{ color: '#3B82F6' }}>Mean</strong> shifts per active employee.<br />Higher values indicate more overall assignments.</span>
                    </div>
                  }
                  position="bottom"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                </UITooltip>
              </span>
              <p className="text-2xl font-bold">
                {activeFairness?.average_shifts?.toFixed(1) || 0}
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
              <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                Std Deviation
                <UITooltip
                  content={
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#8b5cf6' }} />
                      <span>How evenly shifts are distributed.<br /><strong style={{ color: '#8b5cf6' }}>Lower = more equitable</strong>.<br />Square root of variance from the mean.</span>
                    </div>
                  }
                  position="bottom"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                </UITooltip>
              </span>
              <p className="text-2xl font-bold">
                {activeFairness?.std_deviation?.toFixed(2) || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Top/Bottom Performers */}
      {sortedEmployees.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ArrowUp className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">Most Shifts</span>
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                      <span><strong style={{ color: '#22c55e' }}>Top 3</strong> employees by total shift count</span>
                    </div>
                    <p className="text-xs text-slate-400">A high value relative to peers may indicate disproportionate load.</p>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </UITooltip>
            </div>
            <div className="space-y-2">
              {sortedEmployees.slice(0, 3).map((emp: any, i: number) => (
                <div key={emp.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}.</span>
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-bold">
                      {emp.name.charAt(0)}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{emp.name}</span>
                  </div>
                  <span className="font-bold text-emerald-600">{emp.total_shifts}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ArrowDown className="w-4 h-4 text-amber-600" />
              </div>
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">Fewest Shifts</span>
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                      <span><strong style={{ color: '#f59e0b' }}>Bottom 3</strong> employees by total shift count</span>
                    </div>
                    <p className="text-xs text-slate-400">A large gap between top and bottom signals inequity.</p>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </UITooltip>
            </div>
            <div className="space-y-2">
              {[...sortedEmployees].reverse().slice(0, 3).map((emp: any, i: number) => (
                <div key={emp.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}.</span>
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-[10px] font-bold">
                      {emp.name.charAt(0)}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{emp.name}</span>
                  </div>
                  <span className="font-bold text-amber-600">{emp.total_shifts}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Shift Gap Analysis */}
      {gapAnalysisData.length > 0 && (
        <Card>
          <CardHeader
            title="Shift Gap Analysis"
            description={`Deviation from team average (${activeFairness?.average_shifts?.toFixed(1) || 0} shifts)`}
            tooltip={
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <p>Deviation from team average per employee:</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                      <span><strong style={{ color: '#22c55e' }}>Balanced</strong> — within ±0.5</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366f1' }} />
                      <span><strong style={{ color: '#6366f1' }}>Over average</strong> — above team mean</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                      <span><strong style={{ color: '#f59e0b' }}>Under average</strong> — below team mean</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#ef4444' }} />
                      <span><strong style={{ color: '#ef4444' }}>Extreme</strong> — &gt;3 shifts from average</span>
                    </div>
                  </div>
                }
                position="right"
              >
                <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
              </UITooltip>
            }
          />
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gapAnalysisData} layout="vertical" margin={{ left: 20, right: 56 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} className="text-slate-500" />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  className="text-slate-500"
                  width={110}
                />
                <Tooltip content={<GapAnalysisTooltip />} />
                <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={2} />
                <Bar dataKey="deviation" radius={[4, 4, 4, 4]}>
                  {gapAnalysisData.map((entry: any, index: number) => (
                    <Cell key={`gap-${index}`} fill={getGapBarColor(entry.deviation)} />
                  ))}
                  <LabelList
                    dataKey="deviation"
                    position="right"
                    formatter={(v: any) => `${v > 0 ? '+' : ''}${v}`}
                    className="text-xs fill-slate-600 dark:fill-slate-400"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
              <span>Balanced</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#6366f1' }} />
              <span>Over average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
              <span>Under average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
              <span>Extreme</span>
            </div>
          </div>
        </Card>
      )}

      {/* Fairness Over Time */}
      {fairnessTrendData.length > 1 && (
        <Card>
          <CardHeader
            title="Fairness Over Time"
            description="Track fairness score and shift balance progression"
            tooltip={
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <p>Monthly fairness progression:</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                      <span><strong style={{ color: '#22c55e' }}>Green area</strong> — Fairness Score (0–100), MAD/Median method</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#8b5cf6' }} />
                      <span><strong style={{ color: '#8b5cf6' }}>Purple dashed line</strong> — Max-Min Gap (most − fewest shifts)</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-600">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 opacity-0" />
                      <span className="text-xs text-slate-400">Colored bands: <strong style={{ color: '#22c55e' }}>Good</strong> 80–100 · <strong style={{ color: '#f59e0b' }}>Fair</strong> 60–80 · <strong style={{ color: '#ef4444' }}>Needs work</strong> &lt;60</span>
                    </div>
                  </div>
                }
                position="right"
              >
                <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
              </UITooltip>
            }
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fairnessTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fairnessGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-slate-500" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="text-slate-500" />
                <Tooltip content={<FairnessOverTimeTooltip />} />
                <ReferenceArea y1={80} y2={100} fill="#22c55e" fillOpacity={0.06} />
                <ReferenceArea y1={60} y2={80} fill="#f59e0b" fillOpacity={0.06} />
                <ReferenceArea y1={0} y2={60} fill="#ef4444" fillOpacity={0.06} />
                <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="fairness"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#fairnessGradient)"
                  dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#22c55e', fill: 'white' }}
                />
                <Line
                  type="monotone"
                  dataKey="gap"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = { fairness: 'Fairness Score', gap: 'Max-Min Gap' };
                    return <span className="text-xs text-slate-600 dark:text-slate-400">{labels[value] || value}</span>;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-2 rounded-sm" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }} />
              <span>Good (80-100)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-2 rounded-sm" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }} />
              <span>Fair (60-80)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-2 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }} />
              <span>Needs Work (&lt;60)</span>
            </div>
          </div>
        </Card>
      )}

      {/* Interactive Visualizations */}
      <Card>
        <CardHeader
          title="Analytics Dashboard"
          description="Interactive visualizations of shift data over time"
          tooltip={
            <UITooltip
              content={
                <div className="space-y-1.5">
                  <p>Four interactive chart views:</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366f1' }} />
                    <span><strong style={{ color: '#6366f1' }}>Employee Trends</strong> — monthly per-employee line chart</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#3B82F6' }} />
                    <span><strong style={{ color: '#3B82F6' }}>Monthly Overview</strong> — stacked bars + employee count</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#8b5cf6' }} />
                    <span><strong style={{ color: '#8b5cf6' }}>Shift Distribution</strong> — drill-down donut chart</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#14b8a6' }} />
                    <span><strong style={{ color: '#14b8a6' }}>Heatmap</strong> — intensity grid by employee × month</span>
                  </div>
                  <p className="text-xs text-slate-400">All views respect active shift type and date range filters.</p>
                </div>
              }
              position="right"
            >
              <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
            </UITooltip>
          }
        />

        {/* Chart Navigation Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: 'trends' as ChartView, label: 'Employee Trends', icon: TrendingUp, desc: 'Line chart: monthly shift count per employee. Hover to compare all staff on a given month.' },
            { id: 'monthly' as ChartView, label: 'Monthly Overview', icon: BarChart3, desc: 'Stacked bar: total shifts by type each month. Right axis shows active employee count.' },
            { id: 'distribution' as ChartView, label: 'Shift Distribution', icon: PieChart, desc: 'Sunburst: inner ring = shift type totals, outer ring = each employee\'s contribution per type.' },
            { id: 'heatmap' as ChartView, label: 'Employees Shifts Heatmap', icon: Grid3X3, desc: 'Grid: darker cell = more shifts that month. Rows sorted by total. Hover a cell for the exact count.' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveChart(tab.id)}
              title={tab.desc}
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
        {/* Per-chart description */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 min-h-[1rem]">
          {activeChart === 'trends' && 'Each line represents one employee\'s monthly shift count. Hover to compare across all staff.'}
          {activeChart === 'monthly' && 'Stacked bars show ECT, Internal, and ER shift counts per month. Hover a bar segment to see the exact count.'}
          {activeChart === 'distribution' && (selectedShiftType
            ? `Inner ring: total ${SHIFT_TYPES[selectedShiftType]?.label} shifts. Outer ring: each employee's share. Hover a segment to inspect.`
            : 'Inner ring shows total shifts per type (ECT / Internal / ER). Outer ring breaks each type into individual employees.')}
          {activeChart === 'heatmap' && 'Darker cells = more shifts that month. Hover a cell to see the exact count. Rows are sorted by total shifts.'}
        </p>

        {/* Charts Container */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeChart}-${selectedShiftType}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Employee Trends Line Chart */}
            {activeChart === 'trends' && (
              <div className="flex flex-col">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLine data={trendsChartData}>
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
                      <Tooltip content={<TrendsTooltip />} wrapperStyle={{ pointerEvents: 'auto' }} />
                      {employeeTrends?.trends?.map((emp: any, index: number) => (
                        <Line
                          key={emp.employee_id}
                          type="monotone"
                          dataKey={emp.employee_name}
                          stroke={CHART_COLORS[index % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 2 }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </RechartsLine>
                  </ResponsiveContainer>
                </div>
                {/* Custom scrollable legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3 max-h-16 overflow-y-auto px-2">
                  {employeeTrends?.trends?.map((emp: any, index: number) => (
                    <div key={emp.employee_id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="whitespace-nowrap">{emp.employee_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Shifts — two synchronized panes + right legend */}
            {activeChart === 'monthly' && (
              <div className="flex gap-2">
                {/* Two stacked chart panes */}
                <div className="flex-1 flex flex-col gap-0">

                  {/* Pane 1: Shift type stacked bars */}
                  <div style={{ height: 210 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} syncId="monthly-sync" margin={{ top: 8, right: 8, left: 28, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis dataKey="month" tick={false} axisLine={false} tickLine={false} />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11 }}
                          className="text-slate-500"
                          label={{ value: 'Shifts', angle: -90, position: 'insideLeft', offset: 8, dy: 20, style: { fontSize: 11, fill: '#94a3b8' } }}
                        />
                        <Tooltip content={<MonthlyShiftsTooltip />} />
                        {selectedShiftType ? (
                          <Bar dataKey="shifts" name={`${getShiftTypeConfig(selectedShiftType).label} Shifts`} fill={getShiftTypeConfig(selectedShiftType).color} radius={[4, 4, 0, 0]} />
                        ) : (
                          <>
                            <Bar dataKey="ect" name="ECT" stackId="s" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="internal" name="Internal" stackId="s" fill="#10B981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="er" name="ER" stackId="s" fill="#EF4444" radius={[4, 4, 0, 0]} />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Thin separator */}
                  <div className="border-t border-slate-700/50 mx-8" />

                  {/* Pane 2: Active Employees */}
                  <div style={{ height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} syncId="monthly-sync" margin={{ top: 4, right: 8, left: 28, bottom: 28 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: string) => v.split(' ')[0]}
                          label={{ value: 'Month', position: 'insideBottom', offset: -14, style: { fontSize: 11, fill: '#94a3b8' } }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickCount={4}
                          tick={{ fontSize: 10 }}
                          className="text-slate-500"
                          label={{ value: 'Employees', angle: -90, position: 'insideLeft', offset: 8, dy: 32, style: { fontSize: 11, fill: '#94a3b8' } }}
                        />
                        <Tooltip content={<MonthlyEmployeesTooltip />} />
                        <Bar dataKey="employees" name="Active Employees" fill="#8b5cf6" fillOpacity={0.65} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right-side legend */}
                <div className="flex flex-col pt-4 gap-1.5 min-w-[128px] pr-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Shift Types</p>
                  {selectedShiftType ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getShiftTypeConfig(selectedShiftType).color }} />
                      <span className="text-xs text-slate-300">{getShiftTypeConfig(selectedShiftType).label}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0 bg-blue-500" />
                        <span className="text-xs text-slate-300">ECT</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0 bg-red-500" />
                        <span className="text-xs text-slate-300">ER</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0 bg-emerald-500" />
                        <span className="text-xs text-slate-300">Internal</span>
                      </div>
                    </>
                  )}
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-0.5">Metrics</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0 bg-violet-500 opacity-65" />
                    <span className="text-xs text-slate-300">Active Employees</span>
                  </div>
                </div>
              </div>
            )}

            {/* Shift Sunburst — interactive drill-down: top level shows shift types, drill into a type to see employees */}
            {activeChart === 'distribution' && (() => {
              const SHIFT_COLORS: Record<string, string> = { ECT: '#3b82f6', Internal: '#10b981', ER: '#ef4444' };
              const RADIAN = Math.PI / 180;

              const employees = (activeFairness?.employees || []).filter((emp: any) => emp.total_shifts > 0);
              const relevantTypes = selectedShiftType
                ? Object.entries(SHIFT_TYPES).filter(([k]) => k === selectedShiftType)
                : Object.entries(SHIFT_TYPES);

              // Inner ring data (shift types)
              const typeData = relevantTypes.map(([key, config]: any) => {
                const total = employees.reduce((sum: number, emp: any) => sum + ((emp.shifts_by_type || {})[key] || 0), 0);
                return { name: config.label, value: total, fill: SHIFT_COLORS[key] || config.color, typeKey: key };
              }).filter((d: any) => d.value > 0);

              const grandTotal = typeData.reduce((s: number, d: any) => s + d.value, 0);

              // Outer ring data (employees across all types, grouped by type)
              const outerData = typeData.flatMap(({ typeKey, fill, name: typeName }: any) =>
                employees
                  .filter((emp: any) => ((emp.shifts_by_type || {})[typeKey] || 0) > 0)
                  .map((emp: any) => ({
                    name: emp.name,
                    value: (emp.shifts_by_type || {})[typeKey] || 0,
                    fill,
                    shiftType: typeName,
                  }))
              );

              // Drilled view data (employees of one specific type, sorted desc)
              const drilledType = sunburstDrill ? typeData.find((d: any) => d.typeKey === sunburstDrill) : null;
              const drilledData = drilledType
                ? employees
                    .filter((emp: any) => ((emp.shifts_by_type || {})[sunburstDrill!] || 0) > 0)
                    .map((emp: any) => {
                      const val = (emp.shifts_by_type || {})[sunburstDrill!] || 0;
                      return { name: emp.name, value: val, fill: drilledType.fill };
                    })
                    .sort((a: any, b: any) => b.value - a.value)
                    .map((d: any, i: number, arr: any[]) => ({
                      ...d,
                      opacity: 1 - (i / arr.length) * 0.5, // 1.0 → 0.5 gradient
                    }))
                : [];

              // Custom SVG label — uses <tspan> for two-line text
              const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
                if (percent < 0.06) return null;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                const pctText = `${(percent * 100).toFixed(0)}%`;
                const showName = percent >= 0.10;
                return (
                  <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
                    {showName ? (
                      <>
                        <tspan x={x} dy="-0.6em">{name}</tspan>
                        <tspan x={x} dy="1.3em">{pctText}</tspan>
                      </>
                    ) : (
                      <tspan>{pctText}</tspan>
                    )}
                  </text>
                );
              };

              // Center overlay rendered as absolutely-positioned div (more reliable than Recharts <Label> on dark bg)
              const centerLabel = sunburstDrill
                ? { line1: drilledType?.name ?? '', line2: `${drilledType?.value ?? 0} shifts` }
                : { line1: String(grandTotal), line2: 'Total Shifts' };

              return (
                <div className="relative flex flex-col items-center">
                  {/* Back button */}
                  <div className="h-7 flex items-center">
                    {sunburstDrill && (
                      <button
                        onClick={() => setSunburstDrill(null)}
                        className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to all types
                      </button>
                    )}
                  </div>

                  {/* Chart */}
                  <div className="relative w-full" style={{ height: 380 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        {!sunburstDrill ? (
                          <>
                            {/* Inner ring: shift type totals — click to drill in */}
                            <Pie
                              data={typeData}
                              cx="50%" cy="50%"
                              innerRadius={72} outerRadius={112}
                              dataKey="value" paddingAngle={3}
                              labelLine={false} label={renderCustomLabel}
                              animationDuration={400} isAnimationActive={true}
                              onClick={(data: any) => setSunburstDrill(data.typeKey)}
                              style={{ cursor: 'pointer' }}
                            >
                              {typeData.map((d: any, i: number) => <Cell key={`inner-${i}`} fill={d.fill} />)}
                            </Pie>
                            {/* Outer ring: employees per type */}
                            <Pie
                              data={outerData}
                              cx="50%" cy="50%"
                              innerRadius={120} outerRadius={158}
                              dataKey="value" paddingAngle={1}
                              label={false}
                              animationDuration={400} isAnimationActive={true}
                              style={{ cursor: 'default' }}
                            >
                              {outerData.map((d: any, i: number) => (
                                <Cell key={`outer-${i}`} fill={d.fill} fillOpacity={0.6} />
                              ))}
                            </Pie>
                          </>
                        ) : (
                          /* Drilled view: employees of selected type */
                          <Pie
                            data={drilledData}
                            cx="50%" cy="50%"
                            innerRadius={82} outerRadius={150}
                            dataKey="value" paddingAngle={2}
                            labelLine={false} label={renderCustomLabel}
                            animationDuration={400} isAnimationActive={true}
                          >
                            {drilledData.map((d: any, i: number) => (
                              <Cell key={`drilled-${i}`} fill={d.fill} fillOpacity={d.opacity} />
                            ))}
                          </Pie>
                        )}
                        <Tooltip content={<SunburstTooltip grandTotal={sunburstDrill ? (drilledType?.value || grandTotal) : grandTotal} />} />
                      </RechartsPie>
                    </ResponsiveContainer>

                    {/* Center label — absolutely positioned over the donut hole */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <div className="text-xl font-bold text-slate-100">{centerLabel.line1}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{centerLabel.line2}</div>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3 pb-1">
                    {(sunburstDrill ? drilledData : typeData).map((d: any) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.fill, opacity: d.opacity ?? 1 }} />
                        <span className="text-slate-300">{d.name}</span>
                        <span className="text-slate-500">({d.value})</span>
                      </div>
                    ))}
                  </div>

                  {/* Hint */}
                  {!sunburstDrill && (
                    <p className="text-xs text-slate-500 mt-1">Click a type segment to drill into employee breakdown</p>
                  )}
                </div>
              );
            })()}

            {/* Workload Heatmap */}
            {activeChart === 'heatmap' && (
              <div>
              {/* Color intensity legend */}
              <div className="flex items-center gap-3 mb-3 justify-end">
                <span className="text-xs text-slate-500 dark:text-slate-400">Fewer shifts</span>
                <div className="flex gap-0.5">
                  {[0.15, 0.3, 0.45, 0.6, 0.75].map((op) => (
                    <div
                      key={op}
                      className="w-5 h-4 rounded-sm"
                      style={{ backgroundColor: `rgba(99, 102, 241, ${op})` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">More shifts</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-slate-500 dark:text-slate-400 font-medium sticky left-0 bg-white dark:bg-slate-900 z-10 min-w-[120px]">
                        Employee
                      </th>
                      {heatmapData.months.map((m: string) => {
                        const [yr, mo] = m.split('-');
                        const label = new Date(parseInt(yr), parseInt(mo) - 1)
                          .toLocaleDateString('en-US', { month: 'short' });
                        return (
                          <th key={m} className="p-2 text-slate-500 dark:text-slate-400 text-center font-medium whitespace-nowrap">
                            {label} &lsquo;{yr.slice(2)}
                          </th>
                        );
                      })}
                      <th className="p-2 text-slate-500 dark:text-slate-400 text-center font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.employees.map((emp: any, rowIdx: number) => (
                      <motion.tr
                        key={emp.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: rowIdx * 0.03 }}
                      >
                        <td className="p-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 z-10">
                          {emp.name}
                        </td>
                        {emp.counts.map((count: number, colIdx: number) => {
                          const shiftTypeRgb = selectedShiftType
                            ? selectedShiftType === 'ect' ? '59, 130, 246' :
                              selectedShiftType === 'internal' ? '16, 185, 129' :
                              '239, 68, 68'
                            : '99, 102, 241';
                          return (
                            <td key={colIdx} className="p-0.5 text-center">
                              <div
                                className={cn(
                                  'w-full h-9 rounded-md flex items-center justify-center font-semibold transition-transform hover:scale-105',
                                  count === 0 ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600' : ''
                                )}
                                style={count > 0 ? getHeatCellStyle(count, heatmapData.maxCount, shiftTypeRgb) : {}}
                                title={`${emp.name} – ${heatmapData.months[colIdx]}: ${count} shifts`}
                              >
                                {count > 0 ? count : '–'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-bold text-slate-700 dark:text-slate-300">
                          {emp.total}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2 font-medium text-slate-500 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-900 z-10">
                        Total
                      </td>
                      {heatmapData.months.map((_: string, colIdx: number) => {
                        const colTotal = heatmapData.employees.reduce((sum: number, emp: any) => sum + emp.counts[colIdx], 0);
                        return (
                          <td key={colIdx} className="p-2 text-center font-bold text-slate-600 dark:text-slate-400">
                            {colTotal}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-bold text-primary-600">
                        {heatmapData.employees.reduce((sum: number, emp: any) => sum + emp.total, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Chart Insights */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-600">Active Employees</span>
              <UITooltip
                content={
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#6366f1' }} />
                    <span>Employees who received at least <strong style={{ color: '#6366f1' }}>one shift</strong> in the selected period.<br />Excludes zero-assignment staff.</span>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3 h-3 text-indigo-400 hover:text-indigo-600 cursor-help" />
              </UITooltip>
            </div>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
              {activeFairness?.employees?.filter((e: any) => e.total_shifts > 0).length || 0}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-600">Total Shifts</span>
              <UITooltip
                content={
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#22c55e' }} />
                    <span>Sum of all <strong style={{ color: '#22c55e' }}>shift assignments</strong> across employees and months matching active filters.</span>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3 h-3 text-emerald-400 hover:text-emerald-600 cursor-help" />
              </UITooltip>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {activeFairness?.employees?.reduce((a: number, e: any) => a + e.total_shifts, 0) || 0}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-800/20">
            <div className="flex items-center gap-2 mb-2">
              <LineChart className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-600">Months Tracked</span>
              <UITooltip
                content={
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#8b5cf6' }} />
                    <span>Distinct <strong style={{ color: '#8b5cf6' }}>calendar months</strong> with at least one recorded shift in the selected range.</span>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3 h-3 text-violet-400 hover:text-violet-600 cursor-help" />
              </UITooltip>
            </div>
            <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">
              {filteredMonths.length || 0}
            </p>
          </div>
        </div>
      </Card>

      {/* Employee Fairness Breakdown */}
      <Card>
        <CardHeader
          title="Employee Distribution"
          description={selectedShiftType
            ? `Shift distribution for ${SHIFT_TYPES[selectedShiftType].label} type`
            : 'Total shifts per employee — color segments show breakdown by type'}
          tooltip={
            <UITooltip
              content={
                <div className="space-y-1.5">
                  <p>Bar length = shifts relative to the top employee:</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                    <span><strong style={{ color: '#22c55e' }}>Green</strong> — above team average</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366f1' }} />
                    <span><strong style={{ color: '#6366f1' }}>Indigo</strong> — below team average</span>
                  </div>
                  <p className="text-xs text-slate-400">When viewing all types, segments are color-coded by shift type.</p>
                </div>
              }
              position="right"
            >
              <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
            </UITooltip>
          }
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
          {sortedEmployees.map((emp: any) => {
            const percentage =
              activeFairness.max_shifts > 0
                ? (emp.total_shifts / activeFairness.max_shifts) * 100
                : 0;
            const isAboveAverage = emp.total_shifts > activeFairness.average_shifts;

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
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {/* Shift type breakdown badges */}
                        {!selectedShiftType && emp.shifts_by_type && (
                          <div className="flex items-center gap-1">
                            {SHIFT_TYPE_KEYS.map((key) => {
                              const count = emp.shifts_by_type[key] || 0;
                              if (count === 0) return null;
                              return (
                                <span
                                  key={key}
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                    SHIFT_TYPES[key].bgLight,
                                    SHIFT_TYPES[key].textClass
                                  )}
                                >
                                  {count} {SHIFT_TYPES[key].label}
                                </span>
                              );
                            })}
                          </div>
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
                {!selectedShiftType && emp.shifts_by_type ? (
                  /* Segmented bar: one segment per shift type */
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    {Object.entries(SHIFT_TYPES).map(([key, config]) => {
                      const count = emp.shifts_by_type[key] || 0;
                      const segPct = activeFairness.max_shifts > 0
                        ? (count / activeFairness.max_shifts) * 100
                        : 0;
                      if (segPct === 0) return null;
                      return (
                        <motion.div
                          key={key}
                          initial={{ width: 0 }}
                          animate={{ width: `${segPct}%` }}
                          transition={{ duration: 0.5, delay: 0.1 }}
                          className="h-full"
                          style={{ backgroundColor: config.color }}
                          title={`${config.label}: ${count}`}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className={`h-full rounded-full ${
                        isAboveAverage ? 'bg-emerald-500' : 'bg-primary-500'
                      }`}
                      style={selectedShiftType ? { backgroundColor: getShiftTypeConfig(selectedShiftType).color } : {}}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Monthly Summary KPIs */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-1.5">
          Monthly Summary
          <UITooltip
            content={
              <div className="space-y-1.5">
                <p>Key distribution metrics for the selected period:</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400" />
                  <span><strong className="text-white">Total Months</strong> — months with recorded data</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                  <span><strong style={{ color: '#f59e0b' }}>Min Shifts</strong> — fewest for any employee</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
                  <span><strong style={{ color: '#22c55e' }}>Max Shifts</strong> — most for any employee</span>
                </div>
              </div>
            }
            position="right"
          >
            <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
          </UITooltip>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <CalendarRange className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                  Total Months
                  <UITooltip
                    content={
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1 bg-slate-400" />
                        <span><strong className="text-white">Calendar months</strong> with recorded shift data in the selected date range.</span>
                      </div>
                    }
                    position="bottom"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                  </UITooltip>
                </span>
                <p className="text-2xl font-bold mt-0.5">{filteredMonths.length || 0}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ArrowDown className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                  Min Shifts (Employee)
                  <UITooltip
                    content={
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#f59e0b' }} />
                        <span>The <strong style={{ color: '#f59e0b' }}>lowest</strong> total shift count any employee received.<br />A large min–max gap signals inequity.</span>
                      </div>
                    }
                    position="bottom"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                  </UITooltip>
                </span>
                <p className="text-2xl font-bold mt-0.5 text-amber-600">{activeFairness?.min_shifts || 0}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ArrowUp className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <span className="text-sm text-slate-500 inline-flex items-center gap-1">
                  Max Shifts (Employee)
                  <UITooltip
                    content={
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: '#22c55e' }} />
                        <span>The <strong style={{ color: '#22c55e' }}>highest</strong> total shift count any employee received.<br />Compare with Min to assess range.</span>
                      </div>
                    }
                    position="bottom"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                  </UITooltip>
                </span>
                <p className="text-2xl font-bold mt-0.5 text-emerald-600">{activeFairness?.max_shifts || 0}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Monthly History */}
      <Card>
        <CardHeader
          title="Monthly History"
          description="Past assignment summaries by month"
          tooltip={
            <UITooltip
              content={
                <div className="space-y-1.5">
                  <p>Click a month to open its shift calendar, color-coded by type:</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#3B82F6' }} />
                    <span><strong style={{ color: '#3B82F6' }}>ECT</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#10B981' }} />
                    <span><strong style={{ color: '#10B981' }}>Internal</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#EF4444' }} />
                    <span><strong style={{ color: '#EF4444' }}>ER</strong></span>
                  </div>
                  <p className="text-xs text-slate-400">Includes a per-employee summary at the bottom.</p>
                </div>
              }
              position="right"
            >
              <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 cursor-help flex-shrink-0" />
            </UITooltip>
          }
        />
        <div className="space-y-3" style={{ contentVisibility: 'auto' }}>
          {filteredMonths.length > 0 ? (
            filteredMonths.map((month: any) => (
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-slate-500">
                        {month.total_shifts} shifts &bull; {month.employees_count} employees
                      </p>
                      {/* Shift type breakdown badges */}
                      {month.by_type && (
                        <span className="flex gap-1.5 mt-1">
                          {Object.entries(month.by_type).map(([type, count]: [string, any]) => (
                            <span
                              key={type}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: getShiftTypeConfig(type).color }}
                            >
                              {count} {getShiftTypeConfig(type).label}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
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
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintCalendar}
                    disabled={calendarLoading || !calendarHtml}
                    title="Print as PDF"
                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-5 h-5 text-slate-500" />
                  </button>
                  <button
                    onClick={closeCalendarModal}
                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                {calendarLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <iframe
                    srcDoc={calendarHtml
                      ? calendarHtml.replace(
                          '</style>',
                          '.header { display: none; } body { padding: 0.75rem 1rem 1.25rem; }</style>'
                        )
                      : ''
                    }
                    className="w-full border-0 rounded-b-2xl"
                    style={{ height: 'calc(90vh - 80px)', minHeight: 500 }}
                    title="Shift calendar"
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
