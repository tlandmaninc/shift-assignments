/**
 * Google Calendar URL generation utilities for ECT shift events.
 */

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
 * Build a Google Calendar URL for an ECT shift (07:30-10:00 Israel time).
 */
export function buildShiftCalendarUrl(date: string, employeeName: string): string {
  // date is "YYYY-MM-DD"
  const dateObj = new Date(date + 'T00:00:00');
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
  const dayNum = dateObj.getDate();

  const dateCompact = date.replace(/-/g, '');

  return buildGoogleCalendarUrl({
    title: `ECT Shift - ${dayName}, ${monthName} ${dayNum}`,
    description: `ECT shift assignment for ${employeeName}.\nPsychiatrics Department`,
    startDate: `${dateCompact}T073000`,
    endDate: `${dateCompact}T100000`,
    timezone: 'Asia/Jerusalem',
  });
}
