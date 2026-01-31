import { AuthStatus } from './types/auth';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Include cookies in requests
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 - redirect to login
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  // Handle 403 - redirect to unauthorized
  if (response.status === 403) {
    window.location.href = '/unauthorized';
    throw new Error('Access denied');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authApi = {
  getLoginUrl: () => fetchApi<{ authorization_url: string }>('/auth/google/login'),

  logout: async () => {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.json();
  },

  getStatus: async (): Promise<AuthStatus> => {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { authenticated: false, user: null };
    }
    return response.json();
  },

  refresh: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

// Forms API
export const formsApi = {
  list: () => fetchApi<any[]>('/forms'),

  get: (id: number) => fetchApi<any>(`/forms/${id}`),

  generateDates: (data: {
    year: number;
    month: number;
    include_tuesdays: boolean;
    excluded_dates: string[];
    included_dates: string[];
  }) => fetchApi<any>('/forms/generate-dates', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  create: (data: {
    year: number;
    month: number;
    include_tuesdays: boolean;
    excluded_dates: string[];
    included_dates: string[];
  }) => fetchApi<any>('/forms/create', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getTemplate: (id: number) => fetchApi<any>(`/forms/${id}/template`),

  updateStatus: (id: number, status: string) =>
    fetchApi<any>(`/forms/${id}/status?status=${status}`, { method: 'PUT' }),

  delete: (id: number) =>
    fetchApi<any>(`/forms/${id}`, { method: 'DELETE' }),
};

// Assignments API
export const assignmentsApi = {
  list: (monthYear?: string) =>
    fetchApi<any>(monthYear ? `/assignments?month_year=${monthYear}` : '/assignments'),

  get: (monthYear: string) => fetchApi<any>(`/assignments/${monthYear}`),

  parseCSV: (data: { csv_data: string; included_dates: string[] }) =>
    fetchApi<any>('/assignments/parse-csv', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  validate: (formId: number, employees: any[]) =>
    fetchApi<any>(`/assignments/validate?form_id=${formId}`, {
      method: 'POST',
      body: JSON.stringify(employees),
    }),

  generate: (data: { form_id: number; employees: any[] }) =>
    fetchApi<any>('/assignments/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCalendar: (monthYear: string) =>
    fetch(`${API_BASE}/assignments/${monthYear}/calendar`).then((r) => r.text()),

  export: (monthYear: string) => fetchApi<any>(`/assignments/${monthYear}/export`),
};

// Employees API
export const employeesApi = {
  list: (activeOnly = true) =>
    fetchApi<any[]>(`/employees?active_only=${activeOnly}`),

  get: (id: number) => fetchApi<any>(`/employees/${id}`),

  create: (data: { name: string; email?: string; is_new: boolean }) =>
    fetchApi<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: any) =>
    fetchApi<any>(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<any>(`/employees/${id}`, { method: 'DELETE' }),

  getAssignments: (id: number) => fetchApi<any>(`/employees/${id}/assignments`),

  getStats: (id: number) => fetchApi<any>(`/employees/${id}/stats`),

  findDuplicates: () => fetchApi<any[]>('/employees/duplicates/find'),

  merge: (sourceId: number, targetId: number) =>
    fetchApi<any>('/employees/merge', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    }),

  mergeAllHebrew: () =>
    fetchApi<any>('/employees/merge/all-hebrew', { method: 'POST' }),

  translateAllToEnglish: () =>
    fetchApi<any>('/employees/translate/all-to-english', { method: 'POST' }),
};

// History API
export const historyApi = {
  get: () => fetchApi<any>('/history'),

  getFairness: () => fetchApi<any>('/history/fairness'),

  getMonthly: () => fetchApi<any>('/history/monthly'),

  getEmployeeTrends: () => fetchApi<any>('/history/employee-trends'),
};

// Google Forms API
export const googleApi = {
  getStatus: () => fetchApi<{
    authenticated: boolean;
    configured: boolean;
    message: string;
  }>('/google/status'),

  getAuthUrl: () => fetchApi<{ authorization_url: string }>('/google/authorize'),

  disconnect: () => fetchApi<{ message: string }>('/google/disconnect', { method: 'POST' }),

  createForm: (data: {
    form_id: number;
    title: string;
    included_dates: string[];
  }) => fetchApi<{
    success: boolean;
    form_id: string;
    edit_url: string;
    responder_url: string;
    message: string;
  }>('/google/create-form', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Chat API
export const chatApi = {
  health: () => fetchApi<{
    ollama_connected: boolean;
    model_available: boolean;
    model_name: string;
    error: string | null;
  }>('/chat/health'),

  send: (data: {
    message: string;
    conversation_history?: { role: string; content: string }[];
  }) => fetchApi<{
    success: boolean;
    message: { role: string; content: string; timestamp?: string };
    error?: string;
  }>('/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
