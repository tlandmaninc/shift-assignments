export type UserRole = 'admin' | 'basic' | 'employee';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  employee_id?: number;
  is_active: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  user: User | null;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}
