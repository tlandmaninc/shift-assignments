'use client';

import { CalendarRange, ArrowDown, ArrowUp, Info } from 'lucide-react';
import { Card, Tooltip as UITooltip } from '@/components/ui';

interface MonthlySummaryCardsProps {
  filteredMonthsCount: number;
  minShifts: number;
  maxShifts: number;
}

export default function MonthlySummaryCards({
  filteredMonthsCount,
  minShifts,
  maxShifts,
}: MonthlySummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <CalendarRange className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
              Total Months
              <UITooltip
                content={
                  <div className="space-y-1">
                    <p>Calendar months with recorded shift data in the selected range.</p>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </UITooltip>
            </p>
            <p className="text-2xl font-bold mt-0.5">{filteredMonthsCount}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ArrowDown className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
              Min Shifts (Employee)
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <p>Lowest shift count for any employee in the selected period.</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                      <span>Large <strong style={{ color: '#f59e0b' }}>min–max gap</strong> signals inequity</span>
                    </div>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </UITooltip>
            </p>
            <p className="text-2xl font-bold mt-0.5 text-amber-600">{minShifts}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <ArrowUp className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
              Max Shifts (Employee)
              <UITooltip
                content={
                  <div className="space-y-1.5">
                    <p>Highest shift count for any employee in the selected period.</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#10b981' }} />
                      <span>Compare with <strong style={{ color: '#10b981' }}>Min</strong> to assess distribution range</span>
                    </div>
                  </div>
                }
                position="bottom"
              >
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </UITooltip>
            </p>
            <p className="text-2xl font-bold mt-0.5 text-emerald-600">{maxShifts}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
