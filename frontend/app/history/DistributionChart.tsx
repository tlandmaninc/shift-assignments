'use client';

import { memo, useMemo } from 'react';
import {
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
  LabelList,
} from 'recharts';
import { SHIFT_TYPES, getShiftTypeConfig } from '@/lib/constants/shiftTypes';

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
];

const TOOLTIP_BOX =
  'bg-white dark:bg-slate-800 px-4 py-3 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 min-w-[200px] sm:min-w-[280px]';

const PieTooltip = memo(({ active, payload, total }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const color = data.payload?.fill ?? CHART_COLORS[0];
    const pct = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0';
    return (
      <div className={TOOLTIP_BOX}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-slate-900 dark:text-white text-sm">{data.name}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm py-0.5">
          <span className="text-slate-600 dark:text-slate-300">Shifts</span>
          <span className="font-semibold tabular-nums" style={{ color }}>{data.value}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm py-0.5">
          <span className="text-slate-600 dark:text-slate-300">Share</span>
          <span className="font-semibold tabular-nums" style={{ color }}>{pct}%</span>
        </div>
      </div>
    );
  }
  return null;
});
PieTooltip.displayName = 'PieTooltip';

const BarTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
    return (
      <div className={`${TOOLTIP_BOX} max-h-64 overflow-y-auto`}>
        <p className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) =>
          entry.value > 0 ? (
            <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill }} />
                <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
              </div>
              <span className="font-semibold tabular-nums" style={{ color: entry.fill }}>{entry.value}</span>
            </div>
          ) : null
        )}
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-semibold">
          <span className="text-slate-500 dark:text-slate-400">Total</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{total}</span>
        </div>
      </div>
    );
  }
  return null;
});
BarTooltip.displayName = 'BarTooltip';

interface DistributionChartProps {
  activeFairness: any;
  selectedShiftType: string | null;
}

export default function DistributionChart({ activeFairness, selectedShiftType }: DistributionChartProps) {
  // Per-employee stacked bar data (All Types) or per-employee pie (specific type)
  const chartData = useMemo(() => {
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

    // Specific type: per-employee pie
    return activeFairness.employees
      .filter((emp: any) => emp.total_shifts > 0)
      .map((emp: any) => ({
        name: emp.name,
        value: emp.total_shifts,
        isNew: emp.is_new,
      }));
  }, [activeFairness, selectedShiftType]);

  const total = useMemo(
    () => chartData.reduce((a: number, d: any) => a + (d.value || 0), 0),
    [chartData]
  );

  if (!selectedShiftType) {
    // All Types: horizontal stacked bar chart — employee × shift type
    const barHeight = Math.max(300, chartData.length * 42 + 60);
    return (
      <div style={{ height: barHeight, maxHeight: 500, overflowY: 'auto' }}>
        <ResponsiveContainer width="100%" height={barHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 16, right: 56, top: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              className="stroke-slate-200 dark:stroke-slate-700"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              className="text-slate-500"
            />
            <YAxis
              dataKey="name"
              type="category"
              width={120}
              tick={{ fontSize: 11 }}
              className="text-slate-500"
            />
            <Tooltip content={<BarTooltip />} wrapperStyle={{ pointerEvents: 'auto' }} />
            <Legend
              wrapperStyle={{ paddingTop: '8px' }}
              formatter={(value: string) => (
                <span className="text-xs text-slate-600 dark:text-slate-400">{value}</span>
              )}
            />
            {Object.entries(SHIFT_TYPES).map(([key, config], i) => (
              <Bar
                key={key}
                dataKey={config.label}
                name={config.label}
                stackId="emp"
                fill={config.color}
                radius={
                  i === Object.keys(SHIFT_TYPES).length - 1
                    ? [0, 4, 4, 0]
                    : [0, 0, 0, 0]
                }
              >
                {i === Object.keys(SHIFT_TYPES).length - 1 && (
                  <LabelList
                    dataKey="total"
                    position="right"
                    className="text-xs fill-slate-500 dark:fill-slate-400"
                    formatter={(v: any) => (v > 0 ? v : '')}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Specific type: pie chart showing each employee's share
  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPie>
          <Pie
            data={chartData}
            cx="50%"
            cy="40%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) =>
              `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
            }
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {chartData.map((_: any, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip total={total} />} isAnimationActive={false} />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: '8px', maxHeight: '80px', overflowY: 'auto' }}
            formatter={(value: string) => (
              <span className="text-xs text-slate-600 dark:text-slate-400">{value}</span>
            )}
          />
        </RechartsPie>
      </ResponsiveContainer>
    </div>
  );
}
