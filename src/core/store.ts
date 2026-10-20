/**
 * Local-first, typed persistent store. Nothing ever leaves the device:
 * everything lives in localStorage under a single versioned key.
 */

export type Mood = 1 | 2 | 3 | 4 | 5;

/** Quit: one slip resets it. Build: a good habit, one missed day is forgiven. */
export type HabitKind = 'quit' | 'build';

export interface Habit {
  id: string;
  kind: HabitKind;
  /** What the person calls it — never the habit itself. */
  name: string;
  createdAt: number;
  /** First day (YYYY-MM-DD) the habit counts from. */
  since: string;
  /** Day → kept (clean / done) or broken (slipped / missed). */
  log: Record<string, boolean>;
  /** Longest streak, in days. */
  best: number;
}

export interface Vow {
  createdAt: number;
  reasons: string[];
  vowText: string;
  signature: string;
}

export interface Relapse {
  id: string;
  at: number;
  habitId: string;
  /** Streak lost, in days. */
  days: number;
  note: string;
  trigger: string;
}

export type UrgeOutcome = 'won' | 'slipped';

export interface UrgeLog {
  id: string;
  at: number;
  habitId?: string;
  intensity: number;
  outcome: UrgeOutcome;
  tools: string[];
  trigger: string;
  note: string;
  durationSec: number;
}

export interface JournalEntry {
  id: string;
  at: number;
  mood: Mood;
  title: string;
  text: string;
  tags: string[];
}

/** The night check-in for one day. */
export interface CheckIn {
  /** Local date key, YYYY-MM-DD. */
  date: string;
  at: number;
  mood?: Mood;
}

/** A message from past you, shown first when an urge hits. */
export interface Message {
  id: string;
  at: number;
  text: string;
}

export type MotionPref = 'auto' | 'reduced' | 'full';
export type QualityPref = 'auto' | 'high' | 'medium' | 'low';

export interface Settings {
  motion: MotionPref;
  quality: QualityPref;
  haptics: boolean;
  /** SHA-256 of the PIN, if app lock is enabled. */
  pinHash: string | null;
  seenIntro: boolean;
  name: string;
  /** Daily check-in reminder, HH:MM. */
  reminder: string;
}

export interface State {
  version: 2;
  vow: Vow | null;
  habits: Habit[];
  /** The quit habit that drives the galaxy and the day counter. */
  mainId: string | null;
  checkins: CheckIn[];
  messages: Message[];
  relapses: Relapse[];
  urges: UrgeLog[];
  journal: JournalEntry[];
  settings: Settings;
  /** Milestone id → unlock timestamp, for the main habit's current streak. */
  milestones: Record<string, number>;
  /** Lifetime milestone unlocks (survive relapses). */
  everMilestones: Record<string, number>;
}

const KEY = 'divine-vow:v2';
/** Version 1 kept one vow with a time-based streak; it is migrated on load. */
const LEGACY_KEY = 'divine-vow:v1';

const DAY = 86_400_000;

const defaultSettings: Settings = {
  motion: 'auto',
  quality: 'auto',
  haptics: true,
  pinHash: null,
  seenIntro: false,
  name: '',
  reminder: '21:30',
};

function emptyState(): State {
  return {
    version: 2,
    vow: null,
    habits: [],
    mainId: null,
    checkins: [],
    messages: [],
    relapses: [],
    urges: [],
    journal: [],
    settings: { ...defaultSettings },
    milestones: {},
    everMilestones: {},
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' ? (v as Record<string, T>) : {});

interface LegacyVow {
  createdAt: number;
  startAt: number;
  codename: string;
  reasons: string[];
  vowText: string;
  signature: string;
}

interface LegacyRelapse {
  id: string;
  at: number;
  streakMs: number;
  note: string;
  trigger: string;
}

/**
 * Version 1 → 2. The vow's codename becomes the main quit habit, and the
 * time-based streak becomes confirmed clean days, ending yesterday.
 */
function migrate(r: Record<string, unknown>): State {
  const base = emptyState();
  const legacy = r.vow as LegacyVow | null | undefined;
  const today = dateKey();
  let mainId: string | null = null;
  const habits: Habit[] = [];
  if (legacy) {
    mainId = uid();
    const days = Math.floor(Math.max(0, Date.now() - legacy.startAt) / DAY);
    const log: Record<string, boolean> = {};
    for (let i = 1; i <= days; i++) log[shiftDay(today, -i)] = true;
    const best = Math.floor((typeof r.bestStreakMs === 'number' ? r.bestStreakMs : 0) / DAY);
    habits.push({
      id: mainId,
      kind: 'quit',
      name: legacy.codename,
      createdAt: legacy.createdAt,
      since: shiftDay(today, -days),
      log,
      best: Math.max(best, days),
    });
  }
  const main = mainId ?? '';
  return {
    ...base,
    vow: legacy ? { createdAt: legacy.createdAt, reasons: legacy.reasons, vowText: legacy.vowText, signature: legacy.signature } : null,
    habits,
    mainId,
    // Old daily mood check-ins stay as history; today's must not count as tonight's check-in.
    checkins: arr<CheckIn & { strength?: number }>(r.checkins)
      .filter((c) => c.date !== today)
      .map((c) => ({ date: c.date, at: c.at, mood: c.mood })),
    relapses: arr<LegacyRelapse>(r.relapses).map((x) => ({
      id: x.id,
      at: x.at,
      habitId: main,
      days: Math.floor((x.streakMs ?? 0) / DAY),
      note: x.note ?? '',
      trigger: x.trigger ?? '',
    })),
    urges: arr<UrgeLog>(r.urges).map((u) => ({ ...u, habitId: main })),
    journal: arr<JournalEntry>(r.journal),
    settings: { ...defaultSettings, ...obj(r.settings) } as Settings,
    milestones: Object.fromEntries(Object.entries(obj<number>(r.milestones)).filter(([id]) => id !== 'spark')),
    everMilestones: obj<number>(r.everMilestones),
  };
}

function sanitize(raw: unknown): State {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (r.version !== 2) return migrate(r);
  const s = r as Partial<State>;
  return {
    ...base,
    vow: s.vow ?? null,
    habits: arr<Habit>(s.habits).map((h) => ({ ...h, log: obj<boolean>(h.log), best: typeof h.best === 'number' ? h.best : 0 })),
    mainId: typeof s.mainId === 'string' ? s.mainId : null,
    checkins: arr(s.checkins),
    messages: arr(s.messages),
    relapses: arr(s.relapses),
    urges: arr(s.urges),
    journal: arr(s.journal),
    settings: { ...defaultSettings, ...(s.settings ?? {}) },
    milestones: obj(s.milestones),
    everMilestones: obj(s.everMilestones),
  };
}

type Listener = (state: State, prev: State) => void;

class Store {
  private state: State;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = this.load();
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      const prev = this.state;
      this.state = this.load();
      this.listeners.forEach((l) => l(this.state, prev));
    });
  }

  private load(): State {
    try {
      const txt = localStorage.getItem(KEY);
      if (txt) return sanitize(JSON.parse(txt));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return emptyState();
      // The old key is left in place as a safety copy.
      const migrated = sanitize(JSON.parse(legacy));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return emptyState();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[divine-vow] could not persist state', err);
    }
  }

  get(): Readonly<State> {
    return this.state;
  }

  /** Immutable-ish update: the recipe mutates a structured clone. */
  update(recipe: (draft: State) => void): void {
    const prev = this.state;
    const draft = structuredClone(prev);
    recipe(draft);
    this.state = draft;
    this.persist();
    this.listeners.forEach((l) => l(this.state, prev));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  export(): string {
    return JSON.stringify({ app: 'divine-vow', exportedAt: new Date().toISOString(), state: this.state }, null, 2);
  }

  import(json: string): void {
    const parsed = JSON.parse(json) as { app?: string; state?: unknown };
    if (parsed.app !== 'divine-vow' || !parsed.state) throw new Error('This file is not a Divine Vow backup.');
    const prev = this.state;
    this.state = sanitize(parsed.state);
    this.persist();
    this.listeners.forEach((l) => l(this.state, prev));
  }

  wipe(): void {
    const prev = this.state;
    this.state = emptyState();
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l(this.state, prev));
  }
}

export const uid = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 18);

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The day `n` days after (or before) a date key. */
export function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y!, m! - 1, d! + n));
}

/** The local Date at midnight of a date key. */
export function dayDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export const store = new Store();

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`divine-vow::${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
