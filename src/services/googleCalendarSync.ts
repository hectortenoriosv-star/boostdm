import type { CalendarEvent } from '../types';

interface GCalItem {
  id:           string;
  summary?:     string;
  start?:       { dateTime?: string; date?: string };
  end?:         { dateTime?: string; date?: string };
  location?:    string;
  description?: string;
  status?:      string;
}

// Fetches events from the user's primary Google Calendar.
// Range: start of today → 30 days out.
export async function fetchCalendarEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now          = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMin      = todayMidnight.toISOString();
  const timeMax      = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin',      timeMin);
  url.searchParams.set('timeMax',      timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy',      'startTime');
  url.searchParams.set('maxResults',   '250');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    if (res.status === 401) throw new Error('Token expired — please reconnect Google Calendar.');
    throw new Error(body.error?.message ?? `Google Calendar API error (HTTP ${res.status})`);
  }

  const data    = await res.json() as { items?: GCalItem[] };
  const syncedAt = new Date().toISOString();

  return (data.items ?? []).map((item): CalendarEvent => {
    const rawStatus = item.status ?? 'confirmed';
    const status: CalendarEvent['status'] =
      rawStatus === 'tentative' ? 'tentative' :
      rawStatus === 'cancelled' ? 'cancelled' : 'confirmed';

    return {
      id:          item.id,
      title:       item.summary ?? '(No title)',
      start:       item.start?.dateTime ?? item.start?.date ?? '',
      end:         item.end?.dateTime   ?? item.end?.date   ?? '',
      location:    item.location,
      description: item.description,
      source:      'google_calendar',
      status,
      syncedAt,
    };
  });
}
