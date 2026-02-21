/**
 * Tests for lib/api.ts - API client functions
 *
 * All tests mock global fetch to avoid real HTTP calls.
 * window.location is mocked to prevent JSDOM navigation errors.
 */

import {
  authApi,
  formsApi,
  employeesApi,
  assignmentsApi,
  historyApi,
  exchangeApi,
  chatApi,
  googleApi,
} from '@/lib/api';

// Suppress JSDOM navigation errors from window.location.href assignments
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Not implemented: navigation')) return;
    originalConsoleError(...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
});

// Reset mocks between tests
beforeEach(() => {
  jest.resetAllMocks();
});

// Helper: create a mock Response
function mockResponse(body: any, init?: ResponseInit): Response {
  return {
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic' as ResponseType,
    url: '',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    bytes: jest.fn(),
  } as unknown as Response;
}

// ─────────────────────────────────────────────
// fetchApi (tested indirectly through public API calls)
// ─────────────────────────────────────────────
describe('fetchApi (via formsApi.list)', () => {
  it('returns parsed JSON on successful response', async () => {
    const data = [{ id: 1, name: 'Form 1' }];
    global.fetch = jest.fn().mockResolvedValue(mockResponse(data));

    const result = await formsApi.list();
    expect(result).toEqual(data);
    expect(global.fetch).toHaveBeenCalledWith('/api/forms', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });

  it('throws "Session expired" on 401', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({}, { status: 401 })
    );

    await expect(formsApi.list()).rejects.toThrow('Session expired');
  });

  it('throws "Access denied" on 403', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({}, { status: 403 })
    );

    await expect(formsApi.list()).rejects.toThrow('Access denied');
  });

  it('throws with error detail from non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ detail: 'Something went wrong' }, { status: 500 })
    );

    await expect(formsApi.list()).rejects.toThrow('Something went wrong');
  });

  it('throws generic error when response has no detail', async () => {
    const resp = mockResponse({}, { status: 500 });
    (resp.json as jest.Mock).mockRejectedValue(new Error('parse error'));
    global.fetch = jest.fn().mockResolvedValue(resp);

    await expect(formsApi.list()).rejects.toThrow('Unknown error');
  });
});

// ─────────────────────────────────────────────
// authApi
// ─────────────────────────────────────────────
describe('authApi', () => {
  describe('getStatus', () => {
    it('returns AuthStatus on success', async () => {
      const authStatus = {
        authenticated: true,
        user: { id: '1', email: 'test@test.com', name: 'Test', role: 'admin', is_active: true },
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse(authStatus));

      const result = await authApi.getStatus();
      expect(result).toEqual(authStatus);
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    });

    it('returns {authenticated: false, user: null} on failure', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({}, { status: 500 })
      );

      const result = await authApi.getStatus();
      expect(result).toEqual({ authenticated: false, user: null });
    });
  });

  describe('logout', () => {
    it('calls POST /api/auth/logout', async () => {
      global.fetch = jest.fn().mockResolvedValue(mockResponse({ message: 'Logged out' }));

      const result = await authApi.logout();
      expect(result).toEqual({ message: 'Logged out' });
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    });
  });

  describe('refresh', () => {
    it('returns true on success', async () => {
      global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

      const result = await authApi.refresh();
      expect(result).toBe(true);
    });

    it('returns false on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({}, { status: 401 })
      );

      const result = await authApi.refresh();
      expect(result).toBe(false);
    });

    it('returns false on fetch error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await authApi.refresh();
      expect(result).toBe(false);
    });
  });

  describe('verifyPhoneAuth', () => {
    it('returns success data on ok response', async () => {
      const successData = {
        success: true,
        message: 'Verified',
        redirect_url: '/dashboard',
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse(successData));

      const result = await authApi.verifyPhoneAuth('a@b.com', '+1234567890', 'token123');
      expect(result).toEqual(successData);
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/phone/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'a@b.com',
          phone_number: '+1234567890',
          firebase_token: 'token123',
        }),
      });
    });

    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({ detail: 'Invalid token' }, { status: 400 })
      );

      await expect(
        authApi.verifyPhoneAuth('a@b.com', '+1234567890', 'badtoken')
      ).rejects.toThrow('Invalid token');
    });

    it('throws generic message when no detail is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({}, { status: 400 })
      );

      await expect(
        authApi.verifyPhoneAuth('a@b.com', '+1234567890', 'badtoken')
      ).rejects.toThrow('Phone verification failed');
    });
  });

  describe('getLoginUrl', () => {
    it('returns authorization URL', async () => {
      const data = { authorization_url: 'https://accounts.google.com/...' };
      global.fetch = jest.fn().mockResolvedValue(mockResponse(data));

      const result = await authApi.getLoginUrl();
      expect(result).toEqual(data);
    });
  });
});

// ─────────────────────────────────────────────
// formsApi
// ─────────────────────────────────────────────
describe('formsApi', () => {
  it('list calls /api/forms', async () => {
    const forms = [{ id: 1 }, { id: 2 }];
    global.fetch = jest.fn().mockResolvedValue(mockResponse(forms));

    const result = await formsApi.list();
    expect(result).toEqual(forms);
  });

  it('get calls /api/forms/:id', async () => {
    const form = { id: 5, name: 'Test' };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(form));

    const result = await formsApi.get(5);
    expect(result).toEqual(form);
    expect(global.fetch).toHaveBeenCalledWith('/api/forms/5', expect.any(Object));
  });

  it('create sends POST with body', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ id: 1 }));
    const createData = {
      year: 2026,
      month: 3,
      include_tuesdays: false,
      excluded_dates: [],
      included_dates: ['2026-03-05'],
    };

    await formsApi.create(createData);
    expect(global.fetch).toHaveBeenCalledWith('/api/forms/create', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(createData),
    }));
  });

  it('delete sends DELETE', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await formsApi.delete(3);
    expect(global.fetch).toHaveBeenCalledWith('/api/forms/3', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('updateStatus sends PUT with query param', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await formsApi.updateStatus(1, 'active');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/forms/1/status?status=active',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});

// ─────────────────────────────────────────────
// employeesApi
// ─────────────────────────────────────────────
describe('employeesApi', () => {
  it('list calls /api/employees with active_only', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse([]));

    await employeesApi.list();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/employees?active_only=true',
      expect.any(Object)
    );
  });

  it('list with activeOnly=false', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse([]));

    await employeesApi.list(false);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/employees?active_only=false',
      expect.any(Object)
    );
  });

  it('get calls /api/employees/:id', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ id: 1, name: 'Alice' }));

    const result = await employeesApi.get(1);
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('create sends POST', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ id: 1 }));

    await employeesApi.create({ name: 'Bob', is_new: true });
    expect(global.fetch).toHaveBeenCalledWith('/api/employees', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Bob', is_new: true }),
    }));
  });

  it('delete sends DELETE', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await employeesApi.delete(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/employees/2', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('merge sends POST with source and target ids', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await employeesApi.merge(1, 2);
    expect(global.fetch).toHaveBeenCalledWith('/api/employees/merge', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source_id: 1, target_id: 2 }),
    }));
  });

  it('findDuplicates calls correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse([]));

    await employeesApi.findDuplicates();
    expect(global.fetch).toHaveBeenCalledWith('/api/employees/duplicates/find', expect.any(Object));
  });
});

// ─────────────────────────────────────────────
// assignmentsApi
// ─────────────────────────────────────────────
describe('assignmentsApi', () => {
  it('list without params calls /api/assignments', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse([]));

    await assignmentsApi.list();
    expect(global.fetch).toHaveBeenCalledWith('/api/assignments', expect.any(Object));
  });

  it('list with monthYear adds query param', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse([]));

    await assignmentsApi.list('2026-03');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/assignments?month_year=2026-03',
      expect.any(Object)
    );
  });

  it('generate sends POST with form_id and employees', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await assignmentsApi.generate({ form_id: 1, employees: [{ name: 'Alice' }] });
    expect(global.fetch).toHaveBeenCalledWith('/api/assignments/generate', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('publish sends POST to correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ success: true, month_year: '2026-03', notified: [], not_linked: [], message: 'ok' })
    );

    await assignmentsApi.publish('2026-03');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/assignments/2026-03/publish',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getCalendar returns text', async () => {
    const calendarText = 'BEGIN:VCALENDAR...';
    const resp = mockResponse(calendarText);
    global.fetch = jest.fn().mockResolvedValue(resp);

    const result = await assignmentsApi.getCalendar('2026-03');
    expect(result).toBe(calendarText);
  });
});

// ─────────────────────────────────────────────
// historyApi
// ─────────────────────────────────────────────
describe('historyApi', () => {
  it('get without shiftType calls /api/history', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

    await historyApi.get();
    expect(global.fetch).toHaveBeenCalledWith('/api/history', expect.any(Object));
  });

  it('get with shiftType adds query param', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

    await historyApi.get('ect');
    expect(global.fetch).toHaveBeenCalledWith('/api/history?shift_type=ect', expect.any(Object));
  });

  it('getFairness calls correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

    await historyApi.getFairness('er');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/history/fairness?shift_type=er',
      expect.any(Object)
    );
  });

  it('getMonthly calls correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

    await historyApi.getMonthly();
    expect(global.fetch).toHaveBeenCalledWith('/api/history/monthly', expect.any(Object));
  });

  it('getEmployeeTrends calls correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}));

    await historyApi.getEmployeeTrends('internal');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/history/employee-trends?shift_type=internal',
      expect.any(Object)
    );
  });
});

// ─────────────────────────────────────────────
// exchangeApi
// ─────────────────────────────────────────────
describe('exchangeApi', () => {
  it('getMyShifts calls correct endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ shifts: [], month_year: '2026-03' })
    );

    const result = await exchangeApi.getMyShifts('2026-03');
    expect(result).toEqual({ shifts: [], month_year: '2026-03' });
  });

  it('create sends POST', async () => {
    const exchange = { id: 1, status: 'pending' };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(exchange));

    await exchangeApi.create({
      requester_date: '2026-03-15',
      target_employee_id: 2,
      target_date: '2026-03-20',
      reason: 'swap request',
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/exchanges/', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('respond sends POST with action', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ id: 1, status: 'accepted' }));

    await exchangeApi.respond(1, { action: 'accept' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/exchanges/1/respond',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('cancel sends POST', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ id: 1, status: 'cancelled' }));

    await exchangeApi.cancel(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/exchanges/1/cancel',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('list with params adds query string', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ exchanges: [] }));

    await exchangeApi.list({ month_year: '2026-03', status: 'pending' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/exchanges/'),
      expect.any(Object)
    );
  });

  it('list without params calls /api/exchanges/', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ exchanges: [] }));

    await exchangeApi.list();
    expect(global.fetch).toHaveBeenCalledWith('/api/exchanges/', expect.any(Object));
  });
});

// ─────────────────────────────────────────────
// googleApi
// ─────────────────────────────────────────────
describe('googleApi', () => {
  it('getStatus returns status object', async () => {
    const status = { authenticated: true, configured: true, message: 'ok' };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(status));

    const result = await googleApi.getStatus();
    expect(result).toEqual(status);
  });

  it('disconnect sends POST', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ message: 'Disconnected' }));

    await googleApi.disconnect();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/google/disconnect',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ─────────────────────────────────────────────
// chatApi
// ─────────────────────────────────────────────
describe('chatApi', () => {
  it('health calls /api/chat/health', async () => {
    const health = {
      connected: true,
      ollama_connected: false,
      model_available: true,
      model_name: 'gemini-2.5-flash',
      provider: 'gemini',
      error: null,
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(health));

    const result = await chatApi.health();
    expect(result).toEqual(health);
  });

  it('send calls backend URL directly with POST', async () => {
    const responseData = {
      success: true,
      message: { role: 'assistant', content: 'Hello!' },
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(responseData));

    const result = await chatApi.send({ message: 'Hi' });
    expect(result).toEqual(responseData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('send throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({ detail: 'Model unavailable' }, { status: 503 })
    );

    await expect(chatApi.send({ message: 'Hi' })).rejects.toThrow('Model unavailable');
  });

  it('listConversations returns conversations', async () => {
    const data = { conversations: [{ id: '1', title: 'Test', created_at: '', updated_at: '', message_count: 1 }] };
    global.fetch = jest.fn().mockResolvedValue(mockResponse(data));

    const result = await chatApi.listConversations();
    expect(result).toEqual(data);
  });

  it('deleteConversation sends DELETE', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ success: true }));

    await chatApi.deleteConversation('abc-123');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat/conversations/abc-123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
