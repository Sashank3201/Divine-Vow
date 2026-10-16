/**
 * Local-first, typed persistent store. Nothing ever leaves the device:
 * everything lives in localStorage under a single versioned key.
 */

export type Mood = 1 | 2 | 3 | 4 | 5;

export interface Vow {
  createdAt: number;
  /** Start of the current streak. */
  startAt: number;
  /** What the person calls the habit — never the habit itself. */
  codename: string;
  reasons: string[];
  vowText: string;
  signature: string;
}

export interface Relapse {
  id: string;
  at: number;
  streakMs: number;
  note: string;
  trigger: string;
}

export type UrgeOutcome = 'won' | 'slipped';

export interface UrgeLog {
  id: string;
  at: number;
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

export interface CheckIn {
  /** Local date key, YYYY-MM-DD. */
  date: string;
  mood: Mood;
  strength: Mood;
  at: number;
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
}

export interface State {
  version: 1;
  vow: Vow | null;
  relapses: Relapse[];
  urges: UrgeLog[];
  journal: JournalEntry[];
  checkins: CheckIn[];
  settings: Settings;
  bestStreakMs: number;
  /** Milestone id → unlock timestamp, for the current streak. */
  milestones: Record<string, number>;
  /** Lifetime milestone unlocks (survive relapses). */
  everMilestones: Record<string, number>;
}

const KEY = 'divine-vow:v1';

const defaultSettings: Settings = {
  motion: 'auto',
  quality: 'auto',
  haptics: true,
  pinHash: null,
  seenIntro: false,
  name: '',
};

function emptyState(): State {
  return {
    version: 1,
    vow: null,
    relapses: [],
    urges: [],
    journal: [],
    checkins: [],
    settings: { ...defaultSettings },
    bestStreakMs: 0,
    milestones: {},
    everMilestones: {},
  };
}

function sanitize(raw: unknown): State {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<State>;
  return {
    ...base,
    ...r,
    version: 1,
    relapses: Array.isArray(r.relapses) ? r.relapses : [],
    urges: Array.isArray(r.urges) ? r.urges : [],
    journal: Array.isArray(r.journal) ? r.journal : [],
    checkins: Array.isArray(r.checkins) ? r.checkins : [],
    settings: { ...defaultSettings, ...(r.settings ?? {}) },
    milestones: r.milestones && typeof r.milestones === 'object' ? r.milestones : {},
    everMilestones: r.everMilestones && typeof r.everMilestones === 'object' ? r.everMilestones : {},
    bestStreakMs: typeof r.bestStreakMs === 'number' ? r.bestStreakMs : 0,
    vow: r.vow ?? null,
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
      return txt ? sanitize(JSON.parse(txt)) : emptyState();
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
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l(this.state, prev));
  }
}

export const store = new Store();

export const uid = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 18);

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`divine-vow::${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
