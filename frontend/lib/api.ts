import { AuthStatus } from './types/auth';
import { ExchangeRequest, ShiftAssignment, SwapCandidate } from './types/exchange';

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

  verifyPhoneAuth: async (
    email: string,
    phoneNumber: string,
    firebaseToken: string
  ): Promise<{ success: boolean; message: string; redirect_url: string }> => {
    const response = await fetch(`${API_BASE}/auth/phone/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        phone_number: phoneNumber,
        firebase_token: firebaseToken,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Phone verification failed');
    }
    return data;
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
    shift_type?: string;
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
    shift_type?: string;
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

  getCalendar: async (monthYear: string) => {
    const r = await fetch(`${API_BASE}/assignments/${monthYear}/calendar`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Failed to load calendar' }));
      throw new Error(err.detail || `HTTP error ${r.status}`);
    }
    return r.text();
  },

  export: (monthYear: string) => fetchApi<any>(`/assignments/${monthYear}/export`),

  publish: (monthYear: string) =>
    fetchApi<{
      success: boolean;
      month_year: string;
      notified: string[];
      not_linked: string[];
      message: string;
    }>(`/assignments/${monthYear}/publish`, { method: 'POST' }),
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
  get: (shiftType?: string | null) =>
    fetchApi<any>(`/history${shiftType ? `?shift_type=${shiftType}` : ''}`),

  getFairness: (shiftType?: string | null) =>
    fetchApi<any>(`/history/fairness${shiftType ? `?shift_type=${shiftType}` : ''}`),

  getMonthly: (shiftType?: string | null) =>
    fetchApi<any>(`/history/monthly${shiftType ? `?shift_type=${shiftType}` : ''}`),

  getEmployeeTrends: (shiftType?: string | null) =>
    fetchApi<any>(`/history/employee-trends${shiftType ? `?shift_type=${shiftType}` : ''}`),
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
    shift_type?: string;
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

  fetchResponses: (formId: number) =>
    fetchApi<{ success: boolean; employees_count: number; employees: any[]; total_responses_fetched?: number }>(
      '/google/fetch-responses',
      { method: 'POST', body: JSON.stringify({ form_id: formId }) }
    ),
};

// Exchange API
export const exchangeApi = {
  getMyShifts: (monthYear: string) =>
    fetchApi<{ shifts: ShiftAssignment[]; month_year: string }>(
      `/exchanges/my-shifts?month_year=${monthYear}`
    ),

  getSchedule: (monthYear: string) =>
    fetchApi<{
      month_year: string;
      employee_id: number;
      assignments: Record<string, { employee_name: string; shift_type: string; is_current_user: boolean }[]>;
    }>(`/exchanges/schedule?month_year=${monthYear}`),

  getCandidates: (shiftDate: string) =>
    fetchApi<{ partners: SwapCandidate[]; shift_date: string }>(
      `/exchanges/eligible/${shiftDate}`
    ),

  create: (data: {
    requester_date: string;
    target_employee_id: number;
    target_date: string;
    reason?: string;
  }) =>
    fetchApi<ExchangeRequest>('/exchanges/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (params?: { month_year?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.month_year) searchParams.set('month_year', params.month_year);
    if (params?.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    return fetchApi<{ exchanges: ExchangeRequest[] }>(
      `/exchanges/${qs ? `?${qs}` : ''}`
    );
  },

  get: (id: number) => fetchApi<ExchangeRequest>(`/exchanges/${id}`),

  respond: (id: number, data: { action: string; decline_reason?: string }) =>
    fetchApi<ExchangeRequest>(`/exchanges/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancel: (id: number) =>
    fetchApi<ExchangeRequest>(`/exchanges/${id}/cancel`, {
      method: 'POST',
    }),
};

// Chat API - uses direct backend URL for send() to avoid proxy timeout with slow LLM inference
const CHAT_BACKEND_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  : '';

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: { role: string; content: string; timestamp?: string }[];
}

export const chatApi = {
  health: () => fetchApi<{
    connected: boolean;
    ollama_connected: boolean;
    model_available: boolean;
    model_name: string;
    provider: string;
    error: string | null;
  }>('/chat/health'),

  send: async (data: {
    message: string;
    conversation_history?: { role: string; content: string }[];
    conversation_id?: string;
  }): Promise<{
    success: boolean;
    message: { role: string; content: string; timestamp?: string };
    conversation_id?: string;
    error?: string;
  }> => {
    // Call backend directly to avoid Next.js proxy timeout for slow LLM responses
    const url = `${CHAT_BACKEND_URL}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP error ${response.status}`);
    }
    return response.json();
  },

  sendStream: async (
    data: {
      message: string;
      conversation_history?: { role: string; content: string }[];
      conversation_id?: string;
    },
    onToken: (token: string) => void,
    onConversationId: (id: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
  ): Promise<void> => {
    const url = `${API_BASE}/chat/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.conversation_id) {
            onConversationId(data.conversation_id);
          } else if (data.token) {
            onToken(data.token);
          } else if (data.error) {
            onError(data.error);
          } else if (data.done) {
            onDone();
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  },

  listConversations: () =>
    fetchApi<{ conversations: ConversationSummary[] }>('/chat/conversations'),

  getConversation: (id: string) =>
    fetchApi<ConversationDetail>(`/chat/conversations/${id}`),

  deleteConversation: (id: string) =>
    fetchApi<{ success: boolean }>(`/chat/conversations/${id}`, { method: 'DELETE' }),
};
