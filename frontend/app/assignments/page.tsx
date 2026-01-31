'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Calendar,
  Upload,
  Play,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import { formsApi, assignmentsApi } from '@/lib/api';
import { formatMonthYear } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function AssignmentsPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [forms, setForms] = useState<any[]>([]);

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
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [csvData, setCsvData] = useState('');
  const [parsedEmployees, setParsedEmployees] = useState<any[]>([]);
  const [validation, setValidation] = useState<any>(null);
  const [assignmentResult, setAssignmentResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Select Form, 2: Upload CSV, 3: Review, 4: Results

  useEffect(() => {
    formsApi.list().then(setForms).catch(console.error);
  }, []);

  const handleFormSelect = (form: any) => {
    setSelectedForm(form);
    setStep(2);
  };

  const handleCSVPaste = async () => {
    if (!csvData.trim() || !selectedForm) return;

    setLoading(true);
    try {
      const result = await assignmentsApi.parseCSV({
        csv_data: csvData,
        included_dates: selectedForm.included_dates,
      });
      setParsedEmployees(result.employees);

      // Validate
      const validationResult = await assignmentsApi.validate(
        selectedForm.id,
        result.employees
      );
      setValidation(validationResult);
      setStep(3);
      toast.success(`Parsed ${result.employees_count} employees`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAssignments = async () => {
    if (!selectedForm || parsedEmployees.length === 0) return;

    setLoading(true);
    try {
      const result = await assignmentsApi.generate({
        form_id: selectedForm.id,
        employees: parsedEmployees,
      });
      setAssignmentResult(result);
      setStep(4);
      toast.success('Assignments generated successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!assignmentResult) return;

    // Create download link for JSON
    const data = JSON.stringify(assignmentResult, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assignments-${assignmentResult.month_year}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported!');
  };

  const handleExportHTML = () => {
    if (!assignmentResult?.calendar_html) return;

    const blob = new Blob([assignmentResult.calendar_html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-${assignmentResult.month_year}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Calendar HTML exported!');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Shift Assignments
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Generate Psychiatrics ECT shift assignments from form responses
        </p>
      </motion.div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4 py-4">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step >= s
                  ? 'bg-primary-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}
            >
              {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 4 && (
              <div
                className={`w-12 h-0.5 ${
                  step > s ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Form */}
      {step === 1 && (
        <Card>
          <CardHeader
            title="Step 1: Select Form"
            description="Choose the form to generate assignments for"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms
              .filter((f) => f.status !== 'processed')
              .map((form) => (
                <motion.button
                  key={form.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleFormSelect(form)}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start justify-between">
                    <FileText className="w-8 h-8 text-primary-500" />
                    <Badge variant={form.status === 'active' ? 'warning' : 'default'}>
                      {form.status}
                    </Badge>
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white mt-3">
                    {form.title}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {form.included_dates?.length || 0} dates
                  </p>
                </motion.button>
              ))}
            {forms.filter((f) => f.status !== 'processed').length === 0 && (
              <div className="col-span-full text-center py-8 text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active forms available</p>
                <a href="/forms" className="text-primary-500 hover:underline text-sm">
                  Create a new form
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 2: Upload CSV */}
      {step === 2 && selectedForm && (
        <Card>
          <CardHeader
            title="Step 2: Paste CSV Data"
            description="Copy the responses from Google Sheets and paste below"
          />

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Instructions:</strong> Open your Google Form responses in Google Sheets,
                select all data (Ctrl+A), copy it (Ctrl+C), and paste it below.
              </p>
            </div>

            <textarea
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              placeholder="Paste CSV data here..."
              className="w-full h-64 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleCSVPaste} loading={loading} disabled={!csvData.trim()}>
                <Upload className="w-4 h-4" />
                Parse CSV
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && validation && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Step 3: Review Data"
              description="Verify the parsed data before generating assignments"
            />

            {/* Validation Status */}
            <div
              className={`p-4 rounded-xl ${
                validation.valid
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {validation.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span
                  className={
                    validation.valid
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-700 dark:text-red-300'
                  }
                >
                  {validation.valid
                    ? 'Data is valid and ready for assignment'
                    : 'There are issues with the data'}
                </span>
              </div>

              {validation.errors?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {validation.errors.map((err: string, i: number) => (
                    <li key={i} className="text-sm text-red-600 dark:text-red-400">
                      • {err}
                    </li>
                  ))}
                </ul>
              )}

              {validation.warnings?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {validation.warnings.map((warn: string, i: number) => (
                    <li key={i} className="text-sm text-amber-600 dark:text-amber-400">
                      ⚠ {warn}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Employee List */}
            <div className="mt-4">
              <h4 className="font-medium mb-2">
                Employees ({parsedEmployees.length})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {parsedEmployees.map((emp, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <p className="font-medium">{emp.employee_name}</p>
                    <p className="text-xs text-slate-500">
                      {emp.is_first_month ? 'New' : 'Experienced'} •{' '}
                      {Object.values(emp.availability).filter(Boolean).length} available
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleGenerateAssignments}
                loading={loading}
                disabled={!validation.valid}
              >
                <Play className="w-4 h-4" />
                Generate Assignments
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && assignmentResult && (
        <div className="space-y-4">
          <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <div>
                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  Assignments Generated Successfully!
                </h3>
                <p className="text-emerald-600 dark:text-emerald-400">
                  {assignmentResult.message}
                </p>
              </div>
            </div>
          </Card>

          {/* Calendar Preview */}
          <Card>
            <CardHeader
              title="Calendar Preview"
              action={
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="w-4 h-4" />
                    JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportHTML}>
                    <Download className="w-4 h-4" />
                    HTML
                  </Button>
                </div>
              }
            />
            <div
              className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
              dangerouslySetInnerHTML={{ __html: assignmentResult.calendar_html }}
            />
          </Card>

          {/* Shift Counts */}
          <Card>
            <CardHeader title="Shift Distribution" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {assignmentResult.shift_counts.map((emp: any) => (
                <div
                  key={emp.name}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800"
                >
                  <p className="font-medium text-slate-900 dark:text-white">
                    {emp.name}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-primary-600">
                      {emp.shifts}
                    </span>
                    <Badge variant={emp.is_new ? 'info' : 'default'}>
                      {emp.is_new ? 'New' : 'Experienced'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Button
            variant="outline"
            onClick={() => {
              setStep(1);
              setSelectedForm(null);
              setCsvData('');
              setParsedEmployees([]);
              setValidation(null);
              setAssignmentResult(null);
            }}
          >
            Start New Assignment
          </Button>
        </div>
      )}
    </div>
  );
}
