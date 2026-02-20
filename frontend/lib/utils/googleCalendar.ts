/**
 * Google Calendar URL generation utilities for shift events.
 */

import { getShiftTypeConfig, DEFAULT_SHIFT_TYPE } from '@/lib/constants/shiftTypes';

interface GoogleCalendarParams {
  title: string;
  description: string;
  startDate: string; // YYYYMMDDTHHMMSS
  endDate: string; // YYYYMMDDTHHMMSS
  timezone: string;
}

/**
 * Build a Google Calendar event creation URL.
 */
export function buildGoogleCalendarUrl(params: GoogleCalendarParams): string {
  const { title, description, startDate, endDate, timezone } = params;

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('details', description);
  url.searchParams.set('dates', `${startDate}/${endDate}`);
  url.searchParams.set('ctz', timezone);

  return url.toString();
}

/**
 * Compute a date string offset by a number of days (YYYYMMDD format).
 */
function addDaysCompact(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Build a single Google Calendar URL for a shift.
 * For multi-slot shift types (e.g. ER), returns the URL for the first slot.
 */
export function buildShiftCalendarUrl(
  date: string,
  employeeName: string,
  shiftType?: string,
): string {
  const urls = buildShiftCalendarUrls(date, employeeName, shiftType);
  return urls[0];
}

/**
 * Build Google Calendar URL(s) for a shift (parameterized by shift type).
 * Returns an array of URLs -- one per slot for multi-slot types (e.g. ER),
 * or a single-element array for standard shifts.
 */
export function buildShiftCalendarUrls(
  date: string,
  employeeName: string,
  shiftType?: string,
): string[] {
  const type = shiftType || DEFAULT_SHIFT_TYPE;
  const cfg = getShiftTypeConfig(type);

  // date is "YYYY-MM-DD"
  const dateObj = new Date(date + 'T00:00:00');
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
  const dayNum = dateObj.getDate();

  const dateCompact = date.replace(/-/g, '');

  // Handle shift types with multiple slots (e.g. ER)
  if (cfg.slotDetails) {
    return cfg.slotDetails.map((slot) => {
      const endDateCompact = slot.nextDay ? addDaysCompact(date, 1) : dateCompact;
      return buildGoogleCalendarUrl({
        title: `${cfg.calendarTitle} (${slot.label}) - ${dayName}, ${monthName} ${dayNum}`,
        description: `${cfg.calendarTitle} (${slot.label}) assignment for ${employeeName}.\n${cfg.calendarDesc}`,
        startDate: `${dateCompact}${slot.start}`,
        endDate: `${endDateCompact}${slot.end}`,
        timezone: 'Asia/Jerusalem',
      });
    });
  }

  const endDateCompact = cfg.nextDayEnd ? addDaysCompact(date, 1) : dateCompact;

  return [buildGoogleCalendarUrl({
    title: `${cfg.calendarTitle} - ${dayName}, ${monthName} ${dayNum}`,
    description: `${cfg.calendarTitle} assignment for ${employeeName}.\n${cfg.calendarDesc}`,
    startDate: `${dateCompact}${cfg.startTime}`,
    endDate: `${endDateCompact}${cfg.endTime}`,
    timezone: 'Asia/Jerusalem',
  })];
}
