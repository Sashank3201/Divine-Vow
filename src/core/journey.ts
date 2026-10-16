/**
 * Streaks, celestial ranks and the 90-day cosmic journey.
 *
 * Your streak is mapped onto the simulated merger: on day 17 the galaxies
 * make first contact, on day 75 they merge, and on day 90 Milkomeda — the
 * new galaxy — has fully formed. Every day you keep your vow, the cosmos
 * behind the app moves forward with you.
 */

import { store, type State } from './store';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface Milestone {
  id: string;
  name: string;
  at: number;
  title: string;
  blurb: string;
  hue: string;
}

export const MILESTONES: Milestone[] = [
  { id: 'spark', name: 'Spark', at: HOUR, title: '1 hour', blurb: 'First hour done.', hue: '#ffffff' },
  { id: 'meteor', name: 'Meteor', at: DAY, title: '1 day', blurb: 'A full day without it.', hue: '#ffffff' },
  { id: 'comet', name: 'Comet', at: 3 * DAY, title: '3 days', blurb: 'The hardest stretch is behind you.', hue: '#ffffff' },
  { id: 'moon', name: 'Moon', at: 7 * DAY, title: '1 week', blurb: 'One week clean.', hue: '#ffffff' },
  { id: 'planet', name: 'Planet', at: 14 * DAY, title: '2 weeks', blurb: 'The habit is losing its grip.', hue: '#ffffff' },
  { id: 'star', name: 'Star', at: 30 * DAY, title: '30 days', blurb: 'One month. This is who you are now.', hue: '#ffffff' },
  { id: 'nebula', name: 'Nebula', at: 60 * DAY, title: '60 days', blurb: 'Two months strong.', hue: '#ffffff' },
  { id: 'galaxy', name: 'Galaxy', at: 90 * DAY, title: '90 days', blurb: 'Milkomeda is complete. So is your reset.', hue: '#ffffff' },
  { id: 'quasar', name: 'Quasar', at: 180 * DAY, title: '6 months', blurb: 'Half a year free.', hue: '#ffffff' },
  { id: 'universe', name: 'Universe', at: 365 * DAY, title: '1 year', blurb: 'One full year.', hue: '#ffffff' },
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

export function streakMs(state: Readonly<State> = store.get(), now = Date.now()): number {
  return state.vow ? Math.max(0, now - state.vow.startAt) : 0;
}

export interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function parts(ms: number): Parts {
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function shortAt(ms: number): string {
  if (ms >= 365 * DAY) return `${Math.round(ms / (365 * DAY))}y`;
  if (ms >= DAY) return `${Math.round(ms / DAY)}d`;
  return `${Math.round(ms / HOUR)}h`;
}

export function humanDuration(ms: number): string {
  const p = parts(ms);
  if (p.days > 0) return `${p.days}d ${p.hours}h`;
  if (p.hours > 0) return `${p.hours}h ${p.minutes}m`;
  if (p.minutes > 0) return `${p.minutes}m`;
  return `${p.seconds}s`;
}

export function currentRank(ms: number): Milestone | null {
  let rank: Milestone | null = null;
  for (const m of MILESTONES) if (ms >= m.at) rank = m;
  return rank;
}

export function nextMilestone(ms: number): { next: Milestone | null; progress: number; prevAt: number } {
  let prevAt = 0;
  for (const m of MILESTONES) {
    if (ms < m.at) return { next: m, progress: (ms - prevAt) / (m.at - prevAt), prevAt };
    prevAt = m.at;
  }
  return { next: null, progress: 1, prevAt };
}

/** Records milestones reached by the current streak; returns the newly unlocked ones. */
export function syncMilestones(now = Date.now()): Milestone[] {
  const state = store.get();
  if (!state.vow) return [];
  const ms = streakMs(state, now);
  const fresh = MILESTONES.filter((m) => ms >= m.at && !state.milestones[m.id]);
  const best = Math.max(state.bestStreakMs, ms);
  if (fresh.length || best !== state.bestStreakMs) {
    store.update((s) => {
      for (const m of fresh) {
        const at = s.vow!.startAt + m.at;
        s.milestones[m.id] = at;
        if (!s.everMilestones[m.id]) s.everMilestones[m.id] = at;
      }
      s.bestStreakMs = best;
    });
  }
  return fresh;
}

/** Total time lived inside the vow across every attempt. */
export function totalFreeMs(state: Readonly<State> = store.get(), now = Date.now()): number {
  return state.relapses.reduce((sum, r) => sum + r.streakMs, 0) + streakMs(state, now);
}

export function gyrForSim(simTime: number): number {
  return 3.75 + simTime * 0.11;
}
