/**
 * Two-core orbit for the Milky Way – Andromeda encounter.
 *
 * The galactic nuclei (and their dark halos) are modelled as two softened
 * point masses on a bound, nearly parabolic orbit. Overlapping halos bleed
 * orbital energy through a Chandrasekhar-style dynamical-friction term, which
 * is what turns a fly-by into a merger: first passage, a long tidal swing,
 * a second plunge and finally coalescence into one nucleus.
 *
 * The orbit is integrated once up-front (it does not depend on the stars),
 * so every event — pericentres, apocentre, merger — is known before the
 * cinematic starts and the Anime.js timeline can be choreographed around it.
 */

export interface OrbitParams {
  massA: number;
  massB: number;
  /** Distance of first closest approach (Kepler estimate, before friction). */
  pericenter: number;
  /** Orbit eccentricity (1 = parabolic). */
  eccentricity: number;
  /** Initial separation. */
  separation: number;
  /** Softening of the core–core force (overlapping halos). */
  softening: number;
  /** Dynamical-friction strength and range. */
  friction: number;
  frictionRange: number;
  duration: number;
}

export interface OrbitEvents {
  firstPericenter: number;
  apocenter: number;
  secondPericenter: number;
  merger: number;
  settled: number;
}

export const DEFAULT_ORBIT: OrbitParams = {
  massA: 1.0,
  massB: 1.25,
  pericenter: 1.6,
  eccentricity: 0.9,
  separation: 6,
  softening: 0.6,
  friction: 1.0,
  frictionRange: 1.1,
  duration: 60,
};

/**
 * Pre-integrated core trajectories, sampled at a fixed step and linearly
 * interpolated. Positions are in world space (orbit in the XZ plane, Y up),
 * in the centre-of-mass frame.
 */
export class CoreTrack {
  readonly step = 0.01;
  readonly samples: number;
  readonly events: OrbitEvents;
  /** [ax, az, bx, bz, avx, avz, bvx, bvz] per sample. */
  private readonly data: Float64Array;

  constructor(readonly params: OrbitParams = DEFAULT_ORBIT) {
    const { massA, massB, pericenter: q, eccentricity: e, separation: d0, softening, friction, frictionRange, duration } =
      params;
    const M = massA + massB;
    const h = Math.sqrt(M * q * (1 + e));
    const v2 = M * (2 / d0 - (1 - e) / q);
    const vt = h / d0;
    const vr = -Math.sqrt(Math.max(0, v2 - vt * vt));

    // Relative coordinates (B − A) in the orbital plane.
    let x = d0, y = 0, vx = vr, vy = vt;
    const eps2 = softening * softening;
    const acc = (px: number, py: number, pvx: number, pvy: number, out: Float64Array) => {
      const r2 = px * px + py * py;
      const inv = M / Math.pow(r2 + eps2, 1.5);
      const g = friction * Math.exp(-r2 / (frictionRange * frictionRange));
      out[0] = -px * inv - g * pvx;
      out[1] = -py * inv - g * pvy;
    };

    const fine = 0.002;
    const sub = Math.round(this.step / fine);
    this.samples = Math.ceil(duration / this.step) + 1;
    this.data = new Float64Array(this.samples * 8);
    const fa = massB / M;
    const fb = massA / M;
    const a1 = new Float64Array(2);
    const a2 = new Float64Array(2);

    const events: Partial<OrbitEvents> = {};
    let prevD = d0;
    let prevDD = 0;
    let t = 0;

    const write = (i: number) => {
      const o = i * 8;
      // Map the 2D orbital plane (x, y) → world (x, 0, y).
      this.data[o] = -fa * x;
      this.data[o + 1] = -fa * y;
      this.data[o + 2] = fb * x;
      this.data[o + 3] = fb * y;
      this.data[o + 4] = -fa * vx;
      this.data[o + 5] = -fa * vy;
      this.data[o + 6] = fb * vx;
      this.data[o + 7] = fb * vy;
    };
    write(0);

    for (let i = 1; i < this.samples; i++) {
      for (let s = 0; s < sub; s++) {
        // RK2 (midpoint) — friction makes the system non-Hamiltonian, so a
        // symplectic scheme buys nothing here.
        acc(x, y, vx, vy, a1);
        const mx = x + vx * fine * 0.5, my = y + vy * fine * 0.5;
        const mvx = vx + a1[0]! * fine * 0.5, mvy = vy + a1[1]! * fine * 0.5;
        acc(mx, my, mvx, mvy, a2);
        x += mvx * fine;
        y += mvy * fine;
        vx += a2[0]! * fine;
        vy += a2[1]! * fine;
        t += fine;

        const d = Math.hypot(x, y);
        const dd = d - prevD;
        if (prevDD < 0 && dd >= 0) {
          if (events.firstPericenter === undefined) events.firstPericenter = t;
          else if (events.secondPericenter === undefined) events.secondPericenter = t;
        }
        if (prevDD > 0 && dd <= 0 && events.apocenter === undefined && events.firstPericenter !== undefined) {
          events.apocenter = t;
        }
        if (events.merger === undefined && events.secondPericenter !== undefined && d < 0.12) events.merger = t;
        if (events.settled === undefined && events.merger !== undefined && d < 0.02) events.settled = t;
        prevDD = dd;
        prevD = d;
      }
      write(i);
    }

    this.events = {
      firstPericenter: events.firstPericenter ?? duration * 0.2,
      apocenter: events.apocenter ?? duration * 0.35,
      secondPericenter: events.secondPericenter ?? duration * 0.5,
      merger: events.merger ?? duration * 0.6,
      settled: events.settled ?? duration * 0.7,
    };
  }

  /** Writes both core positions/velocities at time t into `out` (12 floats: pa, pb, va, vb). */
  sample(t: number, out: Float64Array): void {
    const f = Math.min(Math.max(t / this.step, 0), this.samples - 1.000001);
    const i = Math.floor(f);
    const w = f - i;
    const d = this.data;
    const o0 = i * 8;
    const o1 = o0 + 8;
    const L = (k: number) => d[o0 + k]! + (d[o1 + k]! - d[o0 + k]!) * w;
    out[0] = L(0); out[1] = 0; out[2] = L(1);
    out[3] = L(2); out[4] = 0; out[5] = L(3);
    out[6] = L(4); out[7] = 0; out[8] = L(5);
    out[9] = L(6); out[10] = 0; out[11] = L(7);
  }

  separation(t: number): number {
    const tmp = new Float64Array(12);
    this.sample(t, tmp);
    return Math.hypot(tmp[3]! - tmp[0]!, tmp[5]! - tmp[2]!);
  }
}
