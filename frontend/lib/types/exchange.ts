export type ExchangeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'invalid'
  | 'expired';

export interface ShiftAssignment {
  date: string;
  day_of_week: string;
  employee_name: string;
}

export interface ExchangeRequest {
  id: number;
  month_year: string;
  requester_employee_id: number;
  requester_employee_name: string;
  requester_date: string;
  target_employee_id: number;
  target_employee_name: string;
  target_date: string;
  status: ExchangeStatus;
  reason?: string;
  decline_reason?: string;
  validation_errors?: string[];
  created_at: string;
  responded_at?: string;
  completed_at?: string;
}

export interface SwapCandidate {
  employee_id: number;
  employee_name: string;
  eligible_dates: string[];
}

export interface ShiftWithCalendarLink {
  date: string;
  day_of_week: string;
  calendar_url: string;
}

export interface ExchangeNotification {
  id: string;
  type: string;
  message: string;
  exchange?: ExchangeRequest;
  shifts?: ShiftWithCalendarLink[];
  timestamp: string;
  read: boolean;
}

export interface WSMessage {
  type: string;
  exchange?: ExchangeRequest;
  shifts?: ShiftWithCalendarLink[];
  message: string;
  month_year?: string;
}

// Schedule calendar types
export interface ScheduleDateCell {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  assignedEmployee: string | null;
  assignedEmployeeId: number | null;
  isCurrentUserShift: boolean;
  isPast: boolean;
  isWeekend: boolean; // Friday or Saturday
  hasPendingExchange: boolean;
}

export interface MonthSchedule {
  year: number;
  month: number;
  firstDayOffset: number;
  daysInMonth: number;
  dates: ScheduleDateCell[];
  currentUserShiftDates: string[];
}

export interface EmployeeAvailability {
  employeeId: number;
  name: string;
  availableDates: string[];
  unavailableDates: string[];
}

export interface EnhancedSwapCandidate extends SwapCandidate {
  is_new: boolean;
  all_shift_dates: string[];
  availability?: EmployeeAvailability;
}
