'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Copy,
  FileText,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Loader2,
  Trash2,
  FlaskConical,
  Radio,
} from 'lucide-react';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import { formsApi, googleApi } from '@/lib/api';
import { cn, formatMonthYear, getMonthYearString } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { usePageAccess } from '@/lib/hooks/usePageAccess';
import { useExchangeStore } from '@/lib/stores/exchangeStore';
import {
  mockGenerateDates,
  mockListForms,
  mockCreateForm,
  mockDeleteForm,
} from '@/lib/mockData/formsMockData';
import { isDemoAllowed } from '@/lib/mockData/demoMode';
import { DEFAULT_SHIFT_TYPE, getShiftTypeStyle, getShiftTypeConfig } from '@/lib/constants/shiftTypes';
import { useShiftTypes } from '@/hooks/useShiftTypes';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatDateQuestion = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const dayName = DAYS_FULL[d.getDay()];
  return `Availability on ${month} ${day} (${dayName})`;
};

export default function FormsPage() {
  const router = useRouter();
  const { canAccess, isLoading: accessLoading } = usePageAccess();
  const { useMockData, setUseMockData } = useExchangeStore();
  const { types: SHIFT_TYPES } = useShiftTypes();
  // Safe accessor — always returns a valid config even during store transitions
  const stFor = (key: string) => getShiftTypeConfig(key, SHIFT_TYPES);

  useEffect(() => {
    if (!accessLoading && !canAccess('/forms')) {
      toast.error('You do not have access to this page');
      router.replace('/');
    }
  }, [accessLoading, canAccess, router]);
  const today = new Date();
  const defaultMonth = today.getMonth() + 2; // getMonth() is 0-indexed, +2 for next month
  const [year, setYear] = useState(defaultMonth > 12 ? today.getFullYear() + 1 : today.getFullYear());
  const [month, setMonth] = useState(defaultMonth > 12 ? 1 : defaultMonth);
  const [includeTuesdays, setIncludeTuesdays] = useState(false);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [includedDates, setIncludedDates] = useState<string[]>([]);
  const [generatedDates, setGeneratedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [createdForm, setCreatedForm] = useState<any>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [shiftType, setShiftType] = useState<string>(DEFAULT_SHIFT_TYPE);

  // Google Forms integration
  const [googleAuth, setGoogleAuth] = useState<{
    authenticated: boolean;
    configured: boolean;
    message: string;
  } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [createdGoogleForm, setCreatedGoogleForm] = useState<{
    edit_url: string;
    responder_url: string;
  } | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const generateFormQuestions = () => {
    if (!createdForm) return [];
    const stConfig = stFor(shiftType);
    const questions = [
      { type: 'Short answer', question: 'Employee Name', required: true },
      { type: 'Multiple choice', question: `Is this your first month doing ${stConfig.label} shift?`, options: ['Yes', 'No'], required: true },
    ];
    createdForm.included_dates?.forEach((dateStr: string) => {
      questions.push({
        type: 'Multiple choice',
        question: formatDateQuestion(dateStr),
        options: ['Available', 'Not Available'],
        required: true,
      });
    });
    return questions;
  };

  // Helper to get existing form for current month/year/shiftType selection
  const getExistingFormForSelectedMonth = () => {
    const monthYear = `${year}-${month.toString().padStart(2, '0')}`;
    return forms.find((f) => f?.month_year === monthYear && f?.shift_type === shiftType);
  };

  const existingFormForMonth = getExistingFormForSelectedMonth();

  // Load existing forms
  const loadForms = async (): Promise<any[]> => {
    try {
      const data = useMockData ? mockListForms() : await formsApi.list();
      console.log('Loaded forms:', data.map((f: any) => f.month_year));
      setForms(data);
      return data;
    } catch (error) {
      console.error('Failed to load forms:', error);
      return [];
    }
  };

  useEffect(() => {
    loadForms();
  }, [useMockData]);

  // Check Google auth status
  useEffect(() => {
    if (!useMockData) {
      googleApi.getStatus().then(setGoogleAuth).catch(console.error);
    }
  }, [useMockData]);

  // Generate dates when settings change
  useEffect(() => {
    generateDates();
  }, [year, month, includeTuesdays, excludedDates, includedDates, useMockData, shiftType]);

  // Refresh forms when month/year changes to ensure existence check is accurate
  // Also reset created form when shift type changes (title/dates differ per type)
  useEffect(() => {
    loadForms();
    setCreatedForm(null);
    setCreatedGoogleForm(null);
  }, [year, month, shiftType]);

  const generateDates = async () => {
    try {
      const params = {
        year,
        month,
        include_tuesdays: includeTuesdays,
        excluded_dates: excludedDates,
        included_dates: includedDates,
        shift_type: shiftType,
      };
      const result = useMockData
        ? mockGenerateDates(params)
        : await formsApi.generateDates(params);
      setGeneratedDates(result.included_dates);
    } catch (error) {
      console.error('Failed to generate dates:', error);
    }
  };

  const handleCreateGoogleForm = async () => {
    if (!createdForm) return;

    setGoogleLoading(true);
    try {
      const result = await googleApi.createForm({
        form_id: createdForm.id,
        title: createdForm.title,
        included_dates: createdForm.included_dates,
        shift_type: shiftType,
      });
      setCreatedGoogleForm({
        edit_url: result.edit_url,
        responder_url: result.responder_url,
      });
      toast.success('Google Form created successfully!');
      // Open the form in a new tab
      window.open(result.edit_url, '_blank');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create Google Form');
      // Refresh Google auth status in case token was revoked
      googleApi.getStatus().then(setGoogleAuth).catch(console.error);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDeleteForm = async (formId: number, formTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${formTitle}"?`)) {
      return;
    }

    try {
      if (useMockData) {
        mockDeleteForm(formId);
      } else {
        await formsApi.delete(formId);
      }
      // Refresh forms to ensure state is synchronized
      await loadForms();
      toast.success('Form deleted successfully');
    } catch (error: any) {
      console.error('Delete form error:', error);
      toast.error(error.message || 'Failed to delete form');
      // Refresh forms to ensure UI is in sync with server state
      await loadForms();
    }
  };

  const handleCreateForm = async () => {
    // Refresh forms from server before checking to ensure we have latest data
    const freshForms = await loadForms();

    // Check if form already exists for this month + shift type
    const monthYear = `${year}-${month.toString().padStart(2, '0')}`;
    const stLabel = stFor(shiftType).label;
    const existingForm = freshForms.find((f) => f?.month_year === monthYear && f?.shift_type === shiftType);
    if (existingForm) {
      console.log('Found existing form:', existingForm);
      toast.error(
        `A ${stLabel} form already exists for ${MONTHS[month - 1]} ${year}. Delete it first to create a new one.`,
        { duration: 5000 }
      );
      return;
    }

    setLoading(true);
    try {
      const createParams = {
        year,
        month,
        include_tuesdays: includeTuesdays,
        excluded_dates: excludedDates,
        included_dates: includedDates,
        shift_type: shiftType,
      };
      const result = useMockData
        ? mockCreateForm(createParams)
        : await formsApi.create(createParams);
      setCreatedForm(result);
      // Refresh from server to ensure state is synchronized
      await loadForms();
      toast.success('Form configuration created successfully!');
    } catch (error: any) {
      console.error('Create form error:', error);
      const message = error.message || 'Failed to create form';
      // Make error messages more user-friendly
      if (message.includes('already exists')) {
        toast.error(message, { duration: 5000 });
      } else {
        toast.error(message);
      }
      // Refresh forms to ensure UI is in sync with server state
      await loadForms();
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay();
  };

  const isDateExcluded = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const stConfig = stFor(shiftType);
    // Friday (5) and Saturday (6) excluded only for shift types that exclude weekends
    if (stConfig.excludeWeekends && (day === 5 || day === 6)) return true;
    // Tuesday (2) excluded unless includeTuesdays (only for weekend-excluding types)
    if (stConfig.excludeWeekends && day === 2 && !includeTuesdays) return true;
    // Manually excluded
    if (excludedDates.includes(dateStr)) return true;
    return false;
  };

  const isDateIncluded = (dateStr: string) => {
    return generatedDates.includes(dateStr);
  };

  const toggleDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const stConfig = stFor(shiftType);

    // Can't toggle Friday/Saturday for types that exclude weekends
    if (stConfig.excludeWeekends && (day === 5 || day === 6)) return;

    if (isDateIncluded(dateStr)) {
      // Remove from included by adding to excluded
      if (!excludedDates.includes(dateStr)) {
        setExcludedDates([...excludedDates, dateStr]);
      }
      setIncludedDates(includedDates.filter((d) => d !== dateStr));
    } else {
      // Add to included
      setIncludedDates([...includedDates, dateStr]);
      setExcludedDates(excludedDates.filter((d) => d !== dateStr));
    }
  };

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => null);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Form Generation
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure and create availability forms for department staff
          </p>
        </div>
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
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Picker */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Select Dates"
            description="Click on dates to include/exclude them from the form"
          />

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="text-lg font-semibold">
              {MONTHS[month - 1]} {year}
            </h3>
            <Button variant="ghost" size="sm" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-slate-500 py-2"
              >
                {day}
              </div>
            ))}
            {blanks.map((_, i) => (
              <div key={`blank-${i}`} className="h-12" />
            ))}
            {days.map((day) => {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day
                .toString()
                .padStart(2, '0')}`;
              const d = new Date(dateStr);
              const dayOfWeek = d.getDay();
              const stConfig = stFor(shiftType);
              const isWeekend = stConfig.excludeWeekends && (dayOfWeek === 5 || dayOfWeek === 6);
              const isTuesday = stConfig.excludeWeekends && dayOfWeek === 2;
              const included = isDateIncluded(dateStr);

              return (
                <motion.button
                  key={day}
                  whileHover={{ scale: isWeekend ? 1 : 1.05 }}
                  whileTap={{ scale: isWeekend ? 1 : 0.95 }}
                  onClick={() => toggleDate(dateStr)}
                  disabled={isWeekend}
                  className={`h-12 rounded-lg flex flex-col items-center justify-center text-sm transition-colors ${
                    isWeekend
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      : included
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-500'
                      : isTuesday && !includeTuesdays
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-300 dark:border-amber-700'
                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="font-medium">{day}</span>
                  {included && <Check className="w-3 h-3" />}
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500" />
              <span>Included</span>
            </div>
            {(stFor(shiftType)).excludeWeekends && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800" />
                  <span>Weekend (excluded)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300" />
                  <span>Tuesday (default excluded)</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Settings Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Settings" />

            {/* Shift Type Selector */}
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Shift Type
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SHIFT_TYPES).map(([key, config]) => {
                  const style = getShiftTypeStyle(config);
                  const isActive = shiftType === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setShiftType(key)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                        style.bgClass
                          ? isActive
                            ? `${style.bgClass} text-white ${style.borderClass}`
                            : `${style.bgLight} ${style.textClass} border-transparent`
                          : 'border-transparent',
                      )}
                      style={!style.bgClass ? {
                        backgroundColor: isActive ? config.color : `${config.color}20`,
                        color: isActive ? '#fff' : config.color,
                        borderColor: isActive ? config.color : 'transparent',
                      } : undefined}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Google Connection Status */}
            {googleAuth?.configured && (
              <div className="mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${googleAuth.authenticated ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span className="text-sm font-medium">
                    {googleAuth.authenticated ? 'Google Connected' : 'Google Not Connected'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {googleAuth.authenticated
                    ? 'Forms can be created automatically'
                    : 'Log out and log back in to enable Google Forms'}
                </p>
              </div>
            )}

            {/* Include Tuesdays Toggle - only relevant for ECT (weekend-excluding types) */}
            {(stFor(shiftType)).excludeWeekends && (
              <button
                onClick={() => setIncludeTuesdays(!includeTuesdays)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    Include Tuesdays
                  </p>
                  <p className="text-xs text-slate-500">
                    {includeTuesdays ? 'Tuesdays will be included' : 'Tuesdays are excluded'}
                  </p>
                </div>
                {includeTuesdays ? (
                  <ToggleRight className="w-8 h-8 text-primary-500" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-400" />
                )}
              </button>
            )}

            {/* Summary */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-sm text-slate-500">Dates to include:</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {generatedDates.length}
              </p>
            </div>
          </Card>

          {/* Existing Form Warning */}
          {existingFormForMonth && !createdForm && (
            <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <X className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    A {stFor(shiftType).label} form already exists for {MONTHS[month - 1]} {year}.
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Delete the existing form below to create a new one, or select a different shift type.
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteForm(existingFormForMonth.id, existingFormForMonth.title)}
                  className="p-1.5 text-amber-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete existing form"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          )}

          {/* Create Form Button */}
          <Button
            onClick={handleCreateForm}
            loading={loading}
            className="w-full"
            disabled={generatedDates.length === 0 || !!existingFormForMonth}
          >
            <FileText className="w-4 h-4" />
            Configure Google Form
          </Button>

          {/* Created Form Info */}
          {createdForm && (
            <div
              className={cn(
                'p-4 rounded-2xl border border-l-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
                stFor(shiftType).borderClass,
              )}
              style={!stFor(shiftType).borderClass
                ? { borderLeftColor: stFor(shiftType).color }
                : undefined
              }
            >
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                      Form Created!
                    </p>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-semibold text-white',
                        stFor(shiftType).bgClass,
                      )}
                      style={!stFor(shiftType).bgClass
                        ? { backgroundColor: stFor(shiftType).color }
                        : undefined
                      }
                    >
                      {stFor(shiftType).label}
                    </span>
                  </div>

                  {/* Form Title with Copy */}
                  <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Form Title:</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {createdForm.title}
                      </p>
                      <button
                        onClick={() => copyToClipboard(createdForm.title)}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-emerald-600 mt-2">
                    {createdForm.included_dates?.length + 2} questions to create
                  </p>

                  <div className="flex flex-col gap-2 mt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowInstructions(!showInstructions)}
                      className="w-full justify-center"
                    >
                      <FileText className="w-4 h-4" />
                      {showInstructions ? 'Hide' : 'View'} Questions
                    </Button>

                    {/* Google Form Creation */}
                    {createdGoogleForm ? (
                      <div className="space-y-2">
                        <a
                          href={createdGoogleForm.edit_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Edit Google Form
                        </a>
                        <button
                          onClick={() => copyToClipboard(createdGoogleForm.responder_url)}
                          className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copy Share Link
                        </button>
                      </div>
                    ) : googleAuth?.authenticated ? (
                      <Button
                        onClick={handleCreateGoogleForm}
                        loading={googleLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap"
                        size="sm"
                      >
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        Generate Google Form
                      </Button>
                    ) : googleAuth?.configured ? (
                      <p className="text-xs text-slate-500 text-center py-1.5">
                        Log out and log back in to enable Google Forms
                      </p>
                    ) : (
                      <a
                        href="https://forms.google.com/create"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Create Google Form Manually
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form Instructions */}
          {createdForm && showInstructions && (
            <Card>
              <CardHeader
                title="Google Form Questions"
                description="Create these questions in Google Forms"
              />
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {generateFormQuestions().map((q, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <span className="text-slate-400 font-mono text-xs mt-0.5">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {q.question}
                      </p>
                      <p className="text-xs text-slate-500">
                        {q.type}{q.options ? `: ${q.options.join(' / ')}` : ''} {q.required && '(Required)'}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(q.question)}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded flex-shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-3"
                onClick={() => {
                  const allQuestions = generateFormQuestions()
                    .map((q, i) => `${i + 1}. ${q.question} (${q.type}${q.options ? ': ' + q.options.join('/') : ''})`)
                    .join('\n');
                  copyToClipboard(allQuestions);
                }}
              >
                <Copy className="w-4 h-4" />
                Copy All Questions
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Existing Forms */}
      {forms.length > 0 && (
        <Card>
          <CardHeader title="Existing Forms" description="Previously created form configurations" />
          <div className="space-y-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-white">{form.title}</p>
                    {(() => {
                      const formSt = stFor(form.shift_type || 'ect');
                      return (
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-semibold text-white',
                            formSt.bgClass,
                          )}
                          style={!formSt.bgClass
                            ? { backgroundColor: formSt.color }
                            : undefined
                          }
                        >
                          {formSt.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-slate-500">
                    {form.included_dates?.length || 0} dates
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                  <button
                    onClick={() => handleDeleteForm(form.id, form.title)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete form"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
