/**
 * Streaks, celestial ranks and the 90-day cosmic journey.
 *
 * Streaks count days, and a day only counts once it is confirmed at the
 * night check-in. Quit habits reset on a single slip. Build habits forgive
 * one missed day; two in a row end the streak.
 *
 * The main habit's streak is mapped onto the simulated merger: on day 17
 * the galaxies make first contact, on day 75 they merge, and on day 90
 * Milkomeda — the new galaxy — has fully formed. The galaxy only moves
 * forward when you check in.
 */

import { store, dateKey, shiftDay, uid, type Habit, type HabitKind, type Mood, type State } from './store';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** The night check-in opens at this hour. */
export const CHECKIN_HOUR = 18;
/** How many missed days the catch-up asks about. */
export const CATCHUP_DAYS = 7;

export interface Milestone {
  id: string;
  name: string;
  days: number;
  title: string;
  blurb: string;
}

export const MILESTONES: Milestone[] = [
  { id: 'meteor', name: 'Meteor', days: 1, title: '1 day', blurb: 'A full day without it.' },
  { id: 'comet', name: 'Comet', days: 3, title: '3 days', blurb: 'The hardest stretch is behind you.' },
  { id: 'moon', name: 'Moon', days: 7, title: '1 week', blurb: 'One week clean.' },
  { id: 'planet', name: 'Planet', days: 14, title: '2 weeks', blurb: 'The habit is losing its grip.' },
  { id: 'star', name: 'Star', days: 30, title: '30 days', blurb: 'One month. This is who you are now.' },
  { id: 'nebula', name: 'Nebula', days: 60, title: '60 days', blurb: 'Two months strong.' },
  { id: 'galaxy', name: 'Galaxy', days: 90, title: '90 days', blurb: 'Milkomeda is complete. So is your reset.' },
  { id: 'quasar', name: 'Quasar', days: 180, title: '6 months', blurb: 'Half a year free.' },
  { id: 'universe', name: 'Universe', days: 365, title: '1 year', blurb: 'One full year.' },
];

export const JOURNEY_DAYS = 90;

/** Day of the journey → simulation time, anchored to the merger's events. */
const ANCHORS: Array<[day: number, sim: number]> = [
  [0, 0.4],
  [7, 4.4],
  [17, 6.74],
  [37, 14.74],
  [67, 27.0],
  [75, 29.6],
  [90, 37.6],
  [365, 60],
];

export const JOURNEY_BEATS = [
  { day: 0, label: 'Start', text: 'The galaxies are on their way.' },
  { day: 17, label: 'First contact', text: 'They pass through each other.' },
  { day: 37, label: 'Furthest apart', text: 'Thrown apart, trailing stars.' },
  { day: 67, label: 'Return', text: 'Gravity pulls them back.' },
  { day: 75, label: 'Merger', text: 'The cores become one.' },
  { day: 90, label: 'Milkomeda', text: 'A new galaxy has formed.' },
];

export function simTimeForDays(days: number): number {
  const d = Math.max(0, days);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [d0, s0] = ANCHORS[i]!;
    const [d1, s1] = ANCHORS[i + 1]!;
    if (d <= d1) return s0 + ((d - d0) / (d1 - d0)) * (s1 - s0);
  }
  return ANCHORS[ANCHORS.length - 1]![1];
}

export function beatFor(days: number) {
  const day = Math.min(days, JOURNEY_DAYS);
  return [...JOURNEY_BEATS].reverse().find((b) => b.day <= day) ?? JOURNEY_BEATS[0]!;
}

// ── Streaks ───────────────────────────────────────────────────────────────

/** Quit: confirmed clean days since the last slip. */
function quitStreak(h: Habit): number {
  let n = 0;
  for (const day of Object.keys(h.log).sort().reverse()) {
    if (!h.log[day]) break;
    n++;
  }
  return n;
}

export interface BuildStatus {
  days: number;
  /** The last finished day was missed: one more miss ends the streak. */
  warn: boolean;
}

/** Build: days done. One missed day is forgiven; two in a row end the streak. */
export function buildStatus(h: Habit, today = dateKey()): BuildStatus {
  let days = 0;
  let run = 0;
  let firstMissed: boolean | null = null;
  // Today is still open until it is marked.
  let d = h.log[today] === undefined ? shiftDay(today, -1) : today;
  for (let guard = 0; d >= h.since && guard < 4000; d = shiftDay(d, -1), guard++) {
    const done = h.log[d] === true;
    if (firstMissed === null) firstMissed = !done;
    if (done) {
      days++;
      run = 0;
    } else if (++run >= 2) break;
  }
  return { days, warn: !!firstMissed && days > 0 };
}

export function habitStreak(h: Habit): number {
  return h.kind === 'quit' ? quitStreak(h) : buildStatus(h).days;
}

export function mainHabit(state: Readonly<State> = store.get()): Habit | null {
  return state.habits.find((h) => h.id === state.mainId) ?? state.habits.find((h) => h.kind === 'quit') ?? null;
}

/** The main habit's streak: the big counter, and where the galaxy is. */
export function mainDays(state: Readonly<State> = store.get()): number {
  const h = mainHabit(state);
  return h ? habitStreak(h) : 0;
}

/** Main habit first, then quit habits, then build habits. */
export function orderedHabits(state: Readonly<State> = store.get()): Habit[] {
  const main = mainHabit(state);
  const rank = (h: Habit) => (h === main ? 0 : h.kind === 'quit' ? 1 : 2);
  return [...state.habits].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
}

export function cleanDays(h: Habit): number {
  return Object.values(h.log).filter(Boolean).length;
}

export const dayWord = (n: number): string => (n === 1 ? 'day' : 'days');

// ── Check-ins ─────────────────────────────────────────────────────────────

/** Minutes after midnight when tonight's check-in opens: 6 pm, or the reminder if it's earlier. */
export function checkinOpensAt(state: Readonly<State> = store.get()): number {
  const [h, m] = state.settings.reminder.split(':').map(Number);
  const reminder = Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : CHECKIN_HOUR * 60;
  return Math.min(CHECKIN_HOUR * 60, reminder);
}

export function checkinOpensLabel(state: Readonly<State> = store.get()): string {
  const at = checkinOpensAt(state);
  const d = new Date();
  d.setHours(Math.floor(at / 60), at % 60, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: at % 60 ? '2-digit' : undefined });
}

export function checkinOpen(now = new Date(), state: Readonly<State> = store.get()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= checkinOpensAt(state);
}

export function checkedIn(day = dateKey(), state: Readonly<State> = store.get()): boolean {
  return state.checkins.some((c) => c.date === day);
}

/** Recent days that ended without a check-in, oldest first. */
export function pendingDays(state: Readonly<State> = store.get(), today = dateKey()): string[] {
  const out: string[] = [];
  const done = new Set(state.checkins.map((c) => c.date));
  for (let i = CATCHUP_DAYS; i >= 1; i--) {
    const d = shiftDay(today, -i);
    if (done.has(d)) continue;
    if (state.habits.some((h) => h.since <= d && h.log[d] === undefined)) out.push(d);
  }
  return out;
}

/** Habits that existed on a given day. */
export function habitsOn(day: string, state: Readonly<State> = store.get()): Habit[] {
  return orderedHabits(state).filter((h) => h.since <= day);
}

function refreshBest(s: State): void {
  for (const h of s.habits) h.best = Math.max(h.best, habitStreak(h));
}

/** Confirms one day: every habit kept or not, plus an optional mood. */
export function recordDay(date: string, marks: Record<string, boolean>, mood?: Mood): void {
  const now = Date.now();
  store.update((s) => {
    for (const h of s.habits) {
      const kept = marks[h.id];
      if (kept === undefined) continue;
      if (h.kind === 'quit' && !kept && h.log[date] !== false) {
        s.relapses.push({ id: uid(), at: now, habitId: h.id, days: quitStreak(h), note: '', trigger: '' });
      }
      h.log[date] = kept;
    }
    s.checkins = s.checkins.filter((c) => c.date !== date);
    s.checkins.push(mood ? { date, at: now, mood } : { date, at: now });
    refreshBest(s);
  });
}

/** A slip on a quit habit, any time: back to Day 0, history kept. */
export function recordSlip(habitId: string, trigger: string, note: string): void {
  const today = dateKey();
  store.update((s) => {
    const h = s.habits.find((x) => x.id === habitId);
    if (!h) return;
    s.relapses.push({ id: uid(), at: Date.now(), habitId, days: quitStreak(h), note, trigger });
    h.log[today] = false;
  });
  syncMilestones();
}

/** Ticks a build habit for today (or clears it so the day is open again). */
export function setDoneToday(habitId: string, done: boolean): void {
  const today = dateKey();
  store.update((s) => {
    const h = s.habits.find((x) => x.id === habitId);
    if (!h) return;
    if (done) h.log[today] = true;
    else delete h.log[today];
    refreshBest(s);
  });
}

// ── Habits ────────────────────────────────────────────────────────────────

/** A new habit. A quit habit started earlier counts the days since as clean. */
export function makeHabit(kind: HabitKind, name: string, since = dateKey()): Habit {
  const today = dateKey();
  const log: Record<string, boolean> = {};
  if (kind === 'quit') {
    for (let d = since, guard = 0; d < today && guard < 3660; d = shiftDay(d, 1), guard++) log[d] = true;
  }
  const h: Habit = { id: uid(), kind, name, createdAt: Date.now(), since, log, best: 0 };
  h.best = habitStreak(h);
  return h;
}

export function addHabit(kind: HabitKind, name: string, since?: string): Habit {
  const h = makeHabit(kind, name, since);
  store.update((s) => {
    s.habits.push(h);
    if (!s.mainId && kind === 'quit') s.mainId = h.id;
  });
  return h;
}

export function setMain(habitId: string): void {
  store.update((s) => {
    s.mainId = habitId;
    s.milestones = {};
  });
  // The new main habit's milestones count as already reached.
  syncMilestones();
}

export function removeHabit(habitId: string): void {
  store.update((s) => {
    s.habits = s.habits.filter((h) => h.id !== habitId);
    if (s.mainId === habitId) s.mainId = s.habits.find((h) => h.kind === 'quit')?.id ?? null;
  });
}

// ── Milestones ────────────────────────────────────────────────────────────

export function currentRank(days: number): Milestone | null {
  let rank: Milestone | null = null;
  for (const m of MILESTONES) if (days >= m.days) rank = m;
  return rank;
}

export function nextMilestone(days: number): { next: Milestone | null; progress: number } {
  let prev = 0;
  for (const m of MILESTONES) {
    if (days < m.days) return { next: m, progress: (days - prev) / (m.days - prev) };
    prev = m.days;
  }
  return { next: null, progress: 1 };
}

/**
 * Records milestones reached by the main habit's streak and forgets the
 * ones a slip took away. Returns the newly reached ones.
 */
export function syncMilestones(): Milestone[] {
  const state = store.get();
  if (!state.vow) return [];
  const days = mainDays(state);
  const fresh = MILESTONES.filter((m) => days >= m.days && !state.milestones[m.id]);
  const lost = MILESTONES.filter((m) => days < m.days && state.milestones[m.id]);
  if (fresh.length || lost.length) {
    const now = Date.now();
    store.update((s) => {
      for (const m of lost) delete s.milestones[m.id];
      for (const m of fresh) {
        s.milestones[m.id] = now;
        if (!s.everMilestones[m.id]) s.everMilestones[m.id] = now;
      }
    });
  }
  return fresh;
}

export function gyrForSim(simTime: number): number {
  return 3.75 + simTime * 0.11;
}
