// Google Identity Services (GIS) token flow — browser OAuth for Calendar & Tasks.
// Uses the implicit/token flow (not auth-code). Only "Authorized JavaScript origins"
// must be configured in Google Cloud Console — no redirect URIs needed.

export interface OAuthToken {
  access_token: string;
  expires_at:   number;   // Unix ms — invalid at or after this time
  scope:        string;
}

export type GoogleService = 'calendar' | 'tasks';

const TOKEN_KEYS: Record<GoogleService, string> = {
  calendar: 'gis_token_calendar_v1',
  tasks:    'gis_token_tasks_v1',
};

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const TASKS_SCOPE    = 'https://www.googleapis.com/auth/tasks.readonly';

// ── Token persistence ─────────────────────────────────────────────────────────

export function loadToken(service: GoogleService): OAuthToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS[service]);
    if (!raw) return null;
    const t = JSON.parse(raw) as OAuthToken;
    if (Date.now() >= t.expires_at) {
      localStorage.removeItem(TOKEN_KEYS[service]);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function saveToken(service: GoogleService, token: OAuthToken): void {
  localStorage.setItem(TOKEN_KEYS[service], JSON.stringify(token));
}

export function clearToken(service: GoogleService): void {
  localStorage.removeItem(TOKEN_KEYS[service]);
}

export function isTokenValid(service: GoogleService): boolean {
  return loadToken(service) !== null;
}

// ── GIS script loader ─────────────────────────────────────────────────────────

let gisLoadPromise: Promise<void> | null = null;

export function loadGISScript(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    if (document.getElementById('gis-script')) {
      resolve();
      return;
    }
    const s  = document.createElement('script');
    s.id     = 'gis-script';
    s.src    = 'https://accounts.google.com/gsi/client';
    s.async  = true;
    s.defer  = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoadPromise = null;  // allow retry on error
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(s);
  });

  return gisLoadPromise;
}

// ── GIS type declarations ─────────────────────────────────────────────────────

interface GISTokenResponse {
  access_token?: string;
  error?:        string;
  expires_in?:   number;
  scope?:        string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope:     string;
            callback:  (resp: GISTokenResponse) => void;
          }): { requestAccessToken(opts?: { prompt?: string }): void };
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

// ── Request token (opens GIS popup) ──────────────────────────────────────────

export function requestToken(clientId: string, service: GoogleService): Promise<OAuthToken> {
  const scope = service === 'calendar' ? CALENDAR_SCOPE : TASKS_SCOPE;

  return new Promise<OAuthToken>((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded. Reload the page and try again.'));
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (resp) => {
        if (resp.error) {
          const msg =
            resp.error === 'access_denied'
              ? 'Permission denied — please allow access in the Google sign-in popup.'
              : resp.error === 'popup_closed_by_user'
              ? 'Popup was closed before sign-in completed.'
              : resp.error === 'popup_blocked_by_browser'
              ? 'Popup blocked — allow popups for this page and try again.'
              : resp.error;
          reject(new Error(msg));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('No access token received from Google.'));
          return;
        }
        const token: OAuthToken = {
          access_token: resp.access_token,
          // Subtract 60 s buffer so we never use a token right at expiry
          expires_at:   Date.now() + ((resp.expires_in ?? 3600) * 1000) - 60_000,
          scope:        resp.scope ?? scope,
        };
        saveToken(service, token);
        resolve(token);
      },
    });

    client.requestAccessToken();
  });
}

// ── Disconnect (revoke + clear) ───────────────────────────────────────────────

export function disconnect(service: GoogleService): void {
  const token = loadToken(service);
  if (token?.access_token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  clearToken(service);
}
