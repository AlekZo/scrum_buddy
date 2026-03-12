/**
 * Google Calendar OAuth + API service
 * Uses implicit grant flow (no backend needed)
 */

const GCAL_STORAGE_KEY = "gcal-settings";
const GCAL_TOKENS_KEY = "gcal-tokens";

export interface GCalSettings {
  clientId: string;
  redirectUri: string;
  filters: GCalFilters;
}

export interface GCalFilters {
  nameKeywords: string[];       // Include events matching these keywords in name
  excludeNameKeywords: string[]; // Exclude events matching these keywords
  attendeeDomains: string[];    // Only include if attendees match these domains
  attendeeKeywords: string[];   // Only include if attendee email contains keyword
  minDurationMinutes: number;   // Skip events shorter than this
  maxDurationMinutes: number;   // Skip events longer than this (0 = no limit)
}

export interface GCalToken {
  accessToken: string;
  expiresAt: number; // ms timestamp
  email: string;
  accountId: string; // unique id for multi-account
}

export interface GCalEvent {
  id: string;
  summary: string;
  start: string; // ISO datetime
  end: string;
  durationHours: number;
  attendees: string[];
  calendarEmail: string;
}

const DEFAULT_FILTERS: GCalFilters = {
  nameKeywords: [],
  excludeNameKeywords: [],
  attendeeDomains: [],
  attendeeKeywords: [],
  minDurationMinutes: 0,
  maxDurationMinutes: 0,
};

// ── Settings persistence ──

export function getGCalSettings(): GCalSettings | null {
  try {
    const raw = localStorage.getItem(GCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveGCalSettings(settings: GCalSettings): void {
  localStorage.setItem(GCAL_STORAGE_KEY, JSON.stringify(settings));
}

export function clearGCalSettings(): void {
  localStorage.removeItem(GCAL_STORAGE_KEY);
  localStorage.removeItem(GCAL_TOKENS_KEY);
}

export function getDefaultFilters(): GCalFilters {
  return { ...DEFAULT_FILTERS };
}

// ── Token persistence ──

export function getGCalTokens(): GCalToken[] {
  try {
    const raw = localStorage.getItem(GCAL_TOKENS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveGCalTokens(tokens: GCalToken[]): void {
  localStorage.setItem(GCAL_TOKENS_KEY, JSON.stringify(tokens));
}

export function removeGCalToken(accountId: string): void {
  const tokens = getGCalTokens().filter((t) => t.accountId !== accountId);
  saveGCalTokens(tokens);
}

function addOrUpdateToken(token: GCalToken): void {
  const tokens = getGCalTokens().filter((t) => t.accountId !== token.accountId);
  tokens.push(token);
  saveGCalTokens(tokens);
}

// ── OAuth Flow (Implicit Grant) ──

const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

export function startGoogleAuth(settings: GCalSettings): void {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: "token",
    scope: SCOPES,
    prompt: "select_account",
    access_type: "online",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Call on app load to check if we're returning from OAuth redirect
 */
export async function handleOAuthCallback(): Promise<GCalToken | null> {
  const hash = window.location.hash;
  if (!hash.includes("access_token")) return null;

  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  const expiresIn = parseInt(params.get("expires_in") || "3600");

  if (!accessToken) return null;

  // Clear hash from URL
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  // Get user email to identify account
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = await res.json();

    const token: GCalToken = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      email: info.email || "unknown",
      accountId: info.id || info.email || crypto.randomUUID(),
    };

    addOrUpdateToken(token);
    return token;
  } catch {
    // Still save token even without email
    const token: GCalToken = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      email: "unknown",
      accountId: crypto.randomUUID(),
    };
    addOrUpdateToken(token);
    return token;
  }
}

// ── Calendar API ──

async function fetchCalendarEvents(
  token: GCalToken,
  dateStr: string
): Promise<GCalEvent[]> {
  if (Date.now() > token.expiresAt) {
    throw new Error(`Token expired for ${token.email}. Please re-authenticate.`);
  }

  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59");

  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const events: GCalEvent[] = [];

  for (const item of data.items || []) {
    if (item.status === "cancelled") continue;

    const start = item.start?.dateTime || item.start?.date;
    const end = item.end?.dateTime || item.end?.date;
    if (!start || !end) continue;

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const durationHours = Math.round(((endMs - startMs) / 3600000) * 100) / 100;

    events.push({
      id: item.id,
      summary: item.summary || "(No title)",
      start,
      end,
      durationHours,
      attendees: (item.attendees || []).map((a: any) => a.email || ""),
      calendarEmail: token.email,
    });
  }

  return events;
}

// ── Filtering ──

function matchesFilters(event: GCalEvent, filters: GCalFilters): boolean {
  const name = event.summary.toLowerCase();
  const durationMin = event.durationHours * 60;

  // Duration filters
  if (filters.minDurationMinutes > 0 && durationMin < filters.minDurationMinutes) return false;
  if (filters.maxDurationMinutes > 0 && durationMin > filters.maxDurationMinutes) return false;

  // Exclude keywords
  if (filters.excludeNameKeywords.length > 0) {
    if (filters.excludeNameKeywords.some((kw) => name.includes(kw.toLowerCase()))) return false;
  }

  // Name keywords (if set, at least one must match)
  if (filters.nameKeywords.length > 0) {
    if (!filters.nameKeywords.some((kw) => name.includes(kw.toLowerCase()))) return false;
  }

  // Attendee domain filter (if set, at least one attendee must match)
  if (filters.attendeeDomains.length > 0) {
    const hasMatch = event.attendees.some((email) =>
      filters.attendeeDomains.some((domain) => email.toLowerCase().endsWith(`@${domain.toLowerCase()}`))
    );
    if (!hasMatch) return false;
  }

  // Attendee keyword filter
  if (filters.attendeeKeywords.length > 0) {
    const hasMatch = event.attendees.some((email) =>
      filters.attendeeKeywords.some((kw) => email.toLowerCase().includes(kw.toLowerCase()))
    );
    if (!hasMatch) return false;
  }

  return true;
}

// ── Public API ──

/**
 * Fetch and filter events from all connected accounts for a given date
 */
export async function getFilteredEvents(
  date: string,
  filters: GCalFilters
): Promise<GCalEvent[]> {
  const tokens = getGCalTokens();
  if (tokens.length === 0) return [];

  const allEvents: GCalEvent[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      const events = await fetchCalendarEvents(token, date);
      allEvents.push(...events);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length > 0 && allEvents.length === 0) {
    throw new Error(errors.join("; "));
  }

  return allEvents
    .filter((e) => matchesFilters(e, filters))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Convert filtered events to bullet-point text for the "doing" field
 */
export function eventsToDoingText(events: GCalEvent[]): string {
  return events
    .map((e) => {
      const hours = e.durationHours;
      const timeStr = hours >= 1 ? `${hours}h` : `${Math.round(hours * 60)}m`;
      return `• ${e.summary} - ${timeStr}`;
    })
    .join("\n");
}

export function isGCalConfigured(): boolean {
  const settings = getGCalSettings();
  return !!settings?.clientId;
}

export function hasValidTokens(): boolean {
  return getGCalTokens().some((t) => Date.now() < t.expiresAt);
}
