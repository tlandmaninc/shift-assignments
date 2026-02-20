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
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface DuplicatePair {
  hebrew_employee: any;
  english_employee: any;
  hebrew_name: string;
  english_name: string;
}

export default function EmployeesPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/unauthorized');
    }
  }, [isAdmin, authLoading, router]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Don't render if not admin
  if (!isAdmin) {
    return null;
  }
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', is_new: true });
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [showDuplicatesSection, setShowDuplicatesSection] = useState(false);
  const [merging, setMerging] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await employeesApi.list(false); // Include inactive
      setEmployees(data);
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
        toast.success('No Hebrew-English duplicates found');
      } else {
        toast.success(`Found ${dups.length} potential duplicate(s)`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to find duplicates');
    }
  };

  const handleMerge = async (sourceId: number, targetId: number, sourceName: string, targetName: string) => {
    if (!confirm(`Merge "${sourceName}" into "${targetName}"? This will transfer all assignments and deactivate the Hebrew entry.`)) {
      return;
    }

    setMerging(true);
    try {
      const result = await employeesApi.merge(sourceId, targetId);
      toast.success(result.message || 'Employees merged successfully');
      setDuplicates(duplicates.filter(d => d.hebrew_employee.id !== sourceId));
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

      {/* Hebrew-English Duplicates Section */}
      {showDuplicatesSection && (
        <Card>
          <CardHeader
            title={`Hebrew-English Duplicates (${duplicates.length})`}
            description="Employees with both Hebrew and English entries that can be merged"
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
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-blue-50 dark:from-amber-900/20 dark:to-blue-900/20 border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex flex-wrap items-center gap-3 min-w-0">
                    {/* Hebrew Employee */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white font-medium">
                        {dup.hebrew_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate" dir="rtl">
                          {dup.hebrew_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {dup.hebrew_employee.total_shifts || 0} shifts
                        </p>
                      </div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-400 shrink-0 hidden sm:block" />

                    {/* English Employee */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-medium">
                        {dup.english_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {dup.english_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {dup.english_employee.total_shifts || 0} shifts
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleMerge(
                      dup.hebrew_employee.id,
                      dup.english_employee.id,
                      dup.hebrew_name,
                      dup.english_name
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
              <p>No Hebrew-English duplicates found.</p>
              <p className="text-sm">All employee records appear to be unique.</p>
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
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Total Shifts
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">
                  Actions
                </th>
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
