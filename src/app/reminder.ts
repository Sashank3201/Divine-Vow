/**
 * The nightly reminder lives in the person's own calendar: a daily event
 * that opens the app. No account and no server; the event's title never
 * names the habit.
 */

const TITLE = 'Divine Vow · check in';

const pad = (n: number) => String(n).padStart(2, '0');

export function appUrl(): string {
  return `${location.origin}${location.pathname}#/home`;
}

/** The next time the reminder fires: today if it's still ahead, else tomorrow. */
function nextAt(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 21, m ?? 30, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

/** Floating local time, e.g. 20261020T213000. */
const local = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** A Google Calendar link that opens a new daily event, ready to save. */
export function googleCalendarUrl(time: string): string {
  const start = nextAt(time);
  const end = new Date(start.getTime() + 5 * 60_000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: TITLE,
    details: `One tap: ${appUrl()}`,
    dates: `${local(start)}/${local(end)}`,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recur: 'RRULE:FREQ=DAILY',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** The same event as an .ics file, with an alert at the time of the event. */
export function icsFile(time: string): string {
  const start = nextAt(time);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const url = appUrl();
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Divine Vow//Check-in//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:checkin-${now.getTime()}@divine-vow`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${TITLE}`,
    `DESCRIPTION:One tap: ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to check in',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
