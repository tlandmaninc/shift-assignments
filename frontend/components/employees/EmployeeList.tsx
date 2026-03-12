'use client';

import { motion } from 'framer-motion';
import { Trash2, UserPlus, UserCheck } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

interface EmployeeListProps {
  employees: any[];
  onUpdateEmployee: (id: number, data: Record<string, any>) => void;
  onDeleteEmployee: (id: number) => void;
}

export function EmployeeList({ employees, onUpdateEmployee, onDeleteEmployee }: EmployeeListProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Name', 'Status', 'Total Shifts'].map((h) => (
                <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-500">{h}</th>
              ))}
              <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <motion.tr
                key={employee.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-medium">
                      {employee.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {employee.name}
                      </p>
                      {employee.email && (
                        <p className="text-sm text-slate-500">{employee.email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <Badge variant={employee.is_new ? 'info' : 'success'}>
                    {employee.is_new ? 'New' : 'Experienced'}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <span className="font-medium">{employee.total_shifts || 0}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdateEmployee(employee.id, { is_new: !employee.is_new })}
                    >
                      {employee.is_new ? 'Mark Experienced' : 'Mark New'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteEmployee(employee.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </motion.tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No active employees. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
              {emp.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {emp.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    emp.is_new
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {emp.is_new ? 'New' : 'Experienced'}
                </span>
                <span className="text-xs text-slate-500">
                  {emp.total_shifts || 0} shifts
                </span>
              </div>
            </div>
            <button
              onClick={() => onUpdateEmployee(emp.id, { is_new: !emp.is_new })}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={emp.is_new ? 'Mark Experienced' : 'Mark New'}
            >
              {emp.is_new ? (
                <UserCheck className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
        {employees.length === 0 && (
          <p className="py-8 text-center text-slate-500">
            No active employees. Add one to get started.
          </p>
        )}
      </div>
    </>
  );
}
