'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  X,
  Check,
  UserPlus,
  GitMerge,
  Languages,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, Button, Badge, Input } from '@/components/ui';
import { employeesApi } from '@/lib/api';
import { usePageAccess } from '@/lib/hooks/usePageAccess';
import { RegisteredUsers } from '@/components/employees/RegisteredUsers';
import { isDemoAllowed } from '@/lib/mockData/demoMode';
import { generateMockEmployees } from '@/lib/mockData/historyMockData';
import { FlaskConical, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface DuplicatePair {
  employee_a: any;
  employee_b: any;
  name_a: string;
  name_b: string;
  similarity: number;
  match_type: string;
}

const isHebrew = (text: string) => /[\u0590-\u05FF]/.test(text);

const matchTypeLabel: Record<string, string> = {
  exact: 'Exact',
  hebrew_english: 'Hebrew/English',
  name_contained: 'Name Contained',
  cross_language: 'Cross-Language',
  token_overlap: 'Token Overlap',
  fuzzy: 'Fuzzy Match',
};

export default function EmployeesPage() {
  const router = useRouter();
  const { canAccess, isLoading: accessLoading } = usePageAccess();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(isDemoAllowed);

  // Redirect users without access
  useEffect(() => {
    if (!accessLoading && !canAccess('/employees')) {
      toast.error('You do not have access to this page');
      router.replace('/');
    }
  }, [accessLoading, canAccess, router]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', is_new: true });
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [showDuplicatesSection, setShowDuplicatesSection] = useState(false);
  const [merging, setMerging] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [useMockData]);

  const loadEmployees = async () => {
    try {
      if (useMockData) {
        setEmployees(generateMockEmployees());
      } else {
        const data = await employeesApi.list(false); // Include inactive
        setEmployees(data);
      }
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.name.trim()) {
      toast.error('Please enter a name');
      return;
    }

    try {
      const created = await employeesApi.create(newEmployee);
      setEmployees([created, ...employees]);
      setShowAddModal(false);
      setNewEmployee({ name: '', email: '', is_new: true });
      toast.success('Employee added successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add employee');
    }
  };

  const handleUpdateEmployee = async (id: number, updates: any) => {
    try {
      const updated = await employeesApi.update(id, updates);
      setEmployees(employees.map((e) => (e.id === id ? updated : e)));
      setEditingEmployee(null);
      toast.success('Employee updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update employee');
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this employee?')) return;

    try {
      await employeesApi.delete(id);
      setEmployees(
        employees.map((e) => (e.id === id ? { ...e, is_active: false } : e))
      );
      toast.success('Employee deactivated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to deactivate employee');
    }
  };

  const findDuplicates = async () => {
    try {
      const dups = await employeesApi.findDuplicates();
      setDuplicates(dups);
      setShowDuplicatesSection(true);
      if (dups.length === 0) {
        toast.success('No potential duplicates found');
      } else {
        toast.success(`Found ${dups.length} potential duplicate(s)`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to find duplicates');
    }
  };

  const handleMerge = async (sourceId: number, targetId: number, sourceName: string, targetName: string) => {
    if (!confirm(`Merge "${sourceName}" into "${targetName}"? This will transfer all assignments and deactivate "${sourceName}".`)) {
      return;
    }

    setMerging(true);
    try {
      const result = await employeesApi.merge(sourceId, targetId);
      toast.success(result.message || 'Employees merged successfully');
      setDuplicates(duplicates.filter(d =>
        d.employee_a.id !== sourceId && d.employee_b.id !== sourceId
      ));
      await loadEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Failed to merge employees');
    } finally {
      setMerging(false);
    }
  };

  const handleMergeAll = async () => {
    if (duplicates.length === 0) {
      toast.error('No duplicates to merge');
      return;
    }

    if (!confirm(`Merge all ${duplicates.length} Hebrew entries into their English equivalents? This action cannot be undone.`)) {
      return;
    }

    setMerging(true);
    try {
      const result = await employeesApi.mergeAllHebrew();
      toast.success(`Merged ${result.merges_performed} employee(s)`);
      setDuplicates([]);
      await loadEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Failed to merge employees');
    } finally {
      setMerging(false);
    }
  };

  const handleTranslateAll = async () => {
    if (!confirm('Translate ALL Hebrew names to English? This will:\n\n1. Merge duplicate employees\n2. Rename Hebrew employee names to English\n3. Update ALL history records\n\nThis action cannot be undone.')) {
      return;
    }

    setTranslating(true);
    try {
      const result = await employeesApi.translateAllToEnglish();

      if (result.errors && result.errors.length > 0) {
        const errorNames = result.errors.map((e: any) => e.hebrew_name).join(', ');
        toast.error(`Some names could not be translated: ${errorNames}`, { duration: 5000 });
      }

      if (result.successful > 0) {
        toast.success(`Translated ${result.successful} name(s) to English`);
      } else if (result.errors?.length === 0) {
        toast.success('All names are already in English');
      }

      setShowDuplicatesSection(false);
      setDuplicates([]);
      await loadEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Failed to translate names');
    } finally {
      setTranslating(false);
    }
  };

  const activeEmployees = employees.filter((e) => e.is_active);
  const inactiveEmployees = employees.filter((e) => !e.is_active);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Employees
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage Psychiatry staff records and shift assignment history
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleTranslateAll}
            disabled={translating}
            className="whitespace-nowrap"
          >
            {translating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Languages className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Translate All</span>
            <span className="sm:hidden">Translate</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={findDuplicates}
            className="whitespace-nowrap"
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">Find Duplicates</span>
            <span className="sm:hidden">Duplicates</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Employee</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Active Employees</p>
              <p className="text-2xl font-bold">{activeEmployees.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">New Employees</p>
              <p className="text-2xl font-bold">
                {activeEmployees.filter((e) => e.is_new).length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Shifts Assigned</p>
              <p className="text-2xl font-bold">
                {employees.reduce((a, e) => a + (e.total_shifts || 0), 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Potential Duplicates Section */}
      {showDuplicatesSection && (
        <Card>
          <CardHeader
            title={`Potential Duplicates (${duplicates.length})`}
            description="Employee pairs that may be the same person — review and merge as needed"
            action={
              duplicates.length > 0 && (
                <Button
                  onClick={handleMergeAll}
                  disabled={merging}
                  variant="outline"
                >
                  {merging ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <GitMerge className="w-4 h-4" />
                  )}
                  Merge All
                </Button>
              )
            }
          />
          {duplicates.length > 0 ? (
            <div className="space-y-3">
              {duplicates.map((dup, index) => (
                <motion.div
                  key={`${dup.employee_a.id}-${dup.employee_b.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-blue-50 dark:from-amber-900/20 dark:to-blue-900/20 border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex flex-wrap items-center gap-3 min-w-0">
                    {[
                      { name: dup.name_a, shifts: dup.employee_a.total_shifts },
                      { name: dup.name_b, shifts: dup.employee_b.total_shifts },
                    ].map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 min-w-0">
                        {i === 1 && (
                          <ArrowRight className="w-5 h-5 text-slate-400 shrink-0 hidden sm:block" />
                        )}
                        <div className={`w-10 h-10 shrink-0 rounded-full bg-gradient-to-br ${i === 0 ? 'from-amber-500 to-amber-700' : 'from-blue-500 to-blue-700'} flex items-center justify-center text-white font-medium`}>
                          {entry.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="font-medium text-slate-900 dark:text-white truncate"
                            dir={isHebrew(entry.name) ? 'rtl' : undefined}
                          >
                            {entry.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {entry.shifts || 0} shifts
                          </p>
                        </div>
                      </div>
                    ))}
                    <Badge variant="warning" size="sm">
                      {Math.round(dup.similarity * 100)}%
                      {' '}
                      {matchTypeLabel[dup.match_type] || dup.match_type}
                    </Badge>
                  </div>
                  <Button
                    onClick={() => handleMerge(
                      dup.employee_a.id, dup.employee_b.id,
                      dup.name_a, dup.name_b
                    )}
                    disabled={merging}
                    size="sm"
                    className="shrink-0 self-end sm:self-auto"
                  >
                    {merging ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <GitMerge className="w-4 h-4" />
                    )}
                    Merge
                  </Button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
              <Languages className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No potential duplicates found.</p>
            </div>
          )}
        </Card>
      )}

      {/* Active Employees */}
      <Card>
        <CardHeader
          title={`Active Employees (${activeEmployees.length})`}
          description="Employees available for shift assignments"
        />
        <div className="overflow-x-auto">
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
              {activeEmployees.map((employee) => (
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
                        onClick={() =>
                          handleUpdateEmployee(employee.id, {
                            is_new: !employee.is_new,
                          })
                        }
                      >
                        {employee.is_new ? 'Mark Experienced' : 'Mark New'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteEmployee(employee.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {activeEmployees.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No active employees. Add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inactive Employees */}
      {inactiveEmployees.length > 0 && (
        <Card>
          <CardHeader
            title={`Inactive Employees (${inactiveEmployees.length})`}
            description="Previously deactivated employees"
          />
          <div className="space-y-2">
            {inactiveEmployees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800 opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-white font-medium text-sm">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{employee.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleUpdateEmployee(employee.id, { is_active: true })
                  }
                >
                  Reactivate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Registered Users */}
      <RegisteredUsers />

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Employee</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Input
                label="Name"
                value={newEmployee.name}
                onChange={(e) =>
                  setNewEmployee({ ...newEmployee, name: e.target.value })
                }
                placeholder="Enter employee name"
              />
              <Input
                label="Email (optional)"
                type="email"
                value={newEmployee.email}
                onChange={(e) =>
                  setNewEmployee({ ...newEmployee, email: e.target.value })
                }
                placeholder="employee@example.com"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEmployee.is_new}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, is_new: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm">First month doing shifts in ECT/Internal/ER (new staff)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddEmployee}>
                <Check className="w-4 h-4" />
                Add Employee
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
