import type { GoogleTask } from '../types';

interface GTaskList {
  id:     string;
  title?: string;
}

interface GTaskItem {
  id:      string;
  title?:  string;
  notes?:  string;
  due?:    string;   // RFC 3339 timestamp; date portion gives due date
  status?: string;   // 'needsAction' | 'completed'
}

// Fetches incomplete tasks from all of the user's Google Task lists.
export async function fetchGoogleTasks(accessToken: string): Promise<GoogleTask[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 1. Get all task lists
  const listsRes = await fetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20',
    { headers },
  );

  if (!listsRes.ok) {
    const body = await listsRes.json().catch(() => ({})) as { error?: { message?: string } };
    if (listsRes.status === 401) throw new Error('Token expired — please reconnect Google Tasks.');
    throw new Error(body.error?.message ?? `Google Tasks API error (HTTP ${listsRes.status})`);
  }

  const listsData = await listsRes.json() as { items?: GTaskList[] };
  const lists     = listsData.items ?? [];

  const syncedAt = new Date().toISOString();
  const allTasks: GoogleTask[] = [];

  // 2. Get tasks from each list (skip completed)
  for (const list of lists) {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`);
    url.searchParams.set('showCompleted', 'false');
    url.searchParams.set('showHidden',    'false');
    url.searchParams.set('maxResults',    '100');

    const tasksRes = await fetch(url.toString(), { headers });
    if (!tasksRes.ok) continue;

    const tasksData = await tasksRes.json() as { items?: GTaskItem[] };

    for (const item of (tasksData.items ?? [])) {
      if (item.status === 'completed') continue;
      allTasks.push({
        id:      item.id,
        title:   item.title ?? '(No title)',
        notes:   item.notes,
        dueDate: item.due ? item.due.split('T')[0] : undefined,
        status:  'needsAction',
        source:  'google_tasks',
        syncedAt,
      });
    }
  }

  return allTasks;
}
