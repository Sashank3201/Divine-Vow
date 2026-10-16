/**
 * Restricted N-body simulation of the Milky Way – Andromeda merger.
 *
 * Stars are test particles moving in the time-dependent potential of the
 * two galactic cores (softened Plummer spheres following the pre-integrated
 * CoreTrack). This is the classic Toomre & Toomre (1972) recipe that first
 * explained tidal tails and bridges, extended with dynamical friction on
 * the cores so the encounter ends in a merger.
 *
 * Phase 1 (kinematic): the disks are animated analytically with the
 * density-wave model so their spiral structure stays crisp.
 * Phase 2 (dynamic): once the galaxies get close, every particle receives
 * the velocity it would have on its orbit and the integrator takes over.
 */

import { CoreTrack, DEFAULT_ORBIT } from './orbit';
import { MODE, buildModel, circularSpeed, type GalaxyModel, type GalaxyRuntime, type ParticleSet } from './model';
import { Rng, mat3, type Mat3 } from './math';

export interface SimOptions {
  /** Particle count multiplier (quality tier). */
  scale: number;
  /** Largest integration step; smaller is more accurate. */
  maxStep?: number;
  /** Upper bound on steps per advance() call to protect the frame budget. */
  maxStepsPerFrame?: number;
}

export class GalaxySim {
  readonly track: CoreTrack;
  readonly model: GalaxyModel;
  readonly set: ParticleSet;
  readonly galaxies: GalaxyRuntime[];
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  /** Moment the integrator takes over from the density-wave animation. */
  readonly switchTime: number;
  /** Simulation time already integrated. */
  time = 0;
  dynamic = false;
  /** Core positions/velocities at `time` (pa, pb, va, vb). */
  readonly cores = new Float64Array(12);

  private readonly maxStep: number;
  private readonly maxStepsPerFrame: number;
  private readonly pattern: Mat3[];
  private readonly coreTmp = new Float64Array(12);
  private readonly mA: number;
  private readonly mB: number;
  private readonly eA2: number;
  private readonly eB2: number;
  /** Cached cos/sin of every orbit phase, advanced incrementally between frames. */
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;
  private kinT = Number.NaN;
  private rebornT = Number.NaN;
  private readonly maxOmega: number;
  /** The reborn disk is invisible before this time, so it is not animated. */
  private readonly rebornFrom: number;
  private rebornParked = false;

  constructor(opts: SimOptions) {
    this.track = new CoreTrack(DEFAULT_ORBIT);
    this.model = buildModel(this.track, opts.scale);
    this.set = this.model.set;
    this.galaxies = this.model.galaxies;
    this.pos = new Float32Array(this.set.count * 3);
    this.vel = new Float32Array(this.set.count * 3);
    this.pattern = this.galaxies.map(() => new Float32Array(9));
    this.maxStep = opts.maxStep ?? 0.012;
    this.maxStepsPerFrame = opts.maxStepsPerFrame ?? 10;
    const [A, B] = this.galaxies as [GalaxyRuntime, GalaxyRuntime];
    this.mA = A.spec.mass;
    this.mB = B.spec.mass;
    this.eA2 = A.spec.softening ** 2;
    this.eB2 = B.spec.softening ** 2;
    // Hand over shortly before contact: late enough that the spiral arms are
    // still crisp, early enough that the tide is felt on the way in.
    this.switchTime = Math.max(0.5, this.track.events.firstPericenter - 1.6);
    this.cosT = new Float32Array(this.set.count);
    this.sinT = new Float32Array(this.set.count);
    let maxOmega = 0;
    for (let i = 0; i < this.set.count; i++) maxOmega = Math.max(maxOmega, Math.abs(this.set.omega[i]!));
    this.maxOmega = Math.max(maxOmega, 1e-3);
    let from = Infinity;
    for (let i = this.set.rebornStart; i < this.set.glowStart; i++) from = Math.min(from, this.set.attribs[i * 8 + 5]!);
    this.rebornFrom = Number.isFinite(from) ? from - 0.5 : 0;
    this.reset();
  }

  get events() {
    return this.track.events;
  }

  /** Separation between the two nuclei right now. */
  get separation(): number {
    const c = this.cores;
    return Math.hypot(c[3]! - c[0]!, c[4]! - c[1]!, c[5]! - c[2]!);
  }

  reset(): void {
    this.time = 0;
    this.dynamic = false;
    this.kinT = Number.NaN;
    this.rebornT = Number.NaN;
    this.kinematic(0);
  }

  /**
   * Advance towards `target` sim time. Returns the time actually reached
   * (the integrator may lag behind during very fast time-lapses).
   */
  advance(target: number): number {
    if (target < this.time - 1e-6) {
      this.reset();
    }
    if (!this.dynamic) {
      if (target < this.switchTime) {
        this.time = target;
        this.kinematic(target);
        return this.time;
      }
      this.time = this.switchTime;
      this.kinematic(this.switchTime);
      this.beginDynamics();
    }
    const remaining = target - this.time;
    if (remaining <= 1e-9) return this.time;
    let steps = Math.ceil(remaining / this.maxStep);
    let dt = remaining / steps;
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      // Allow slightly coarser steps before lagging behind the timeline.
      dt = Math.min(remaining / steps, this.maxStep * 2.2);
    }
    for (let i = 0; i < steps; i++) this.step(dt);
    this.placeGlows();
    this.placeReborn(this.time);
    return this.time;
  }

  /**
   * Updates cos/sin of θ = θ0 + ωt for a range of particles. Between nearby
   * frames the angle is advanced with a rotation recurrence (no trig calls);
   * after a jump in time it is recomputed exactly.
   */
  private phases(from: number, to: number, t: number, cacheT: number): void {
    const { theta0, omega, mode } = this.set;
    const cs = this.cosT;
    const sn = this.sinT;
    const dt = t - cacheT;
    if (!(Math.abs(dt) * this.maxOmega < 0.25)) {
      for (let i = from; i < to; i++) {
        const th = theta0[i]! + omega[i]! * t;
        cs[i] = Math.cos(th);
        sn[i] = Math.sin(th);
      }
      return;
    }
    if (dt === 0) return;
    for (let i = from; i < to; i++) {
      const m = mode[i];
      if (m !== MODE.Wave && m !== MODE.Reborn) continue;
      const w = omega[i]!;
      if (w === 0) continue;
      const d = w * dt;
      const d2 = d * d;
      const cd = 1 - d2 * 0.5 + d2 * d2 * (1 / 24);
      const sd = d * (1 - d2 * (1 / 6) + d2 * d2 * (1 / 120));
      const c0 = cs[i]!;
      const s0 = sn[i]!;
      let c1 = c0 * cd - s0 * sd;
      let s1 = s0 * cd + c0 * sd;
      const k = 1.5 - 0.5 * (c1 * c1 + s1 * s1);
      c1 *= k;
      s1 *= k;
      cs[i] = c1;
      sn[i] = s1;
    }
  }

  /** Density-wave positions at time t. */
  private kinematic(t: number): void {
    const s = this.set;
    const c = this.cores;
    this.track.sample(t, c);
    this.galaxies.forEach((g, gi) => mat3.rotateZ(this.pattern[gi]!, g.basis, g.spec.phase + g.patternSpeed * t));
    this.phases(0, s.rebornStart, t, this.kinT);
    this.phases(s.glowStart, s.rebornDustStart, t, this.kinT);
    this.kinT = t;
    const pos = this.pos;
    const cs = this.cosT;
    const sn = this.sinT;
    const { galaxy, mode, a, b, cphi, sphi, z } = s;
    for (let i = 0, N = s.count; i < N; i++) {
      const m = mode[i];
      if (m === MODE.Reborn) continue;
      const gi = galaxy[i]!;
      const co = gi * 3;
      const cx = c[co]!, cy = c[co + 1]!, cz = c[co + 2]!;
      const o = i * 3;
      if (m === MODE.Wave) {
        const ct = cs[i]!, st = sn[i]!;
        const A = a[i]!, B = b[i]!, cp = cphi[i]!, sp = sphi[i]!;
        const lx = A * ct * cp - B * st * sp;
        const ly = A * ct * sp + B * st * cp;
        const lz = z[i]!;
        const P = this.pattern[gi]!;
        pos[o] = cx + P[0]! * lx + P[3]! * ly + P[6]! * lz;
        pos[o + 1] = cy + P[1]! * lx + P[4]! * ly + P[7]! * lz;
        pos[o + 2] = cz + P[2]! * lx + P[5]! * ly + P[8]! * lz;
      } else if (m === MODE.Fixed) {
        const Bm = this.galaxies[gi]!.basis;
        const lx = a[i]!, ly = b[i]!, lz = z[i]!;
        pos[o] = cx + Bm[0]! * lx + Bm[3]! * ly + Bm[6]! * lz;
        pos[o + 1] = cy + Bm[1]! * lx + Bm[4]! * ly + Bm[7]! * lz;
        pos[o + 2] = cz + Bm[2]! * lx + Bm[5]! * ly + Bm[8]! * lz;
      } else {
        pos[o] = cx;
        pos[o + 1] = cy;
        pos[o + 2] = cz;
      }
    }
    this.placeReborn(t);
  }

  /** The reborn disk orbits the merged nucleus analytically, in both phases. */
  private placeReborn(t: number): void {
    const s = this.set;
    const c = this.cores;
    if (t < this.rebornFrom) {
      // Not born yet: park the (invisible) particles behind everything once.
      if (!this.rebornParked) {
        this.pos.fill(0, s.rebornStart * 3, s.glowStart * 3);
        this.pos.fill(0, s.rebornDustStart * 3, s.count * 3);
        this.rebornParked = true;
        this.rebornT = Number.NaN;
      }
      return;
    }
    this.rebornParked = false;
    this.phases(s.rebornStart, s.glowStart, t, this.rebornT);
    this.phases(s.rebornDustStart, s.count, t, this.rebornT);
    this.rebornT = t;
    const cs = this.cosT;
    const sn = this.sinT;
    const wA = this.mA / (this.mA + this.mB);
    const wB = 1 - wA;
    const cx = c[0]! * wA + c[3]! * wB;
    const cy = c[1]! * wA + c[4]! * wB;
    const cz = c[2]! * wA + c[5]! * wB;
    const g = this.galaxies[2]!;
    const P = this.pattern[2]!;
    mat3.rotateZ(P, g.basis, g.spec.phase + g.patternSpeed * t);
    const pos = this.pos;
    const { a, b, cphi, sphi, z } = s;
    const ranges: Array<[number, number]> = [
      [s.rebornStart, s.glowStart],
      [s.rebornDustStart, s.count],
    ];
    for (const [from, to] of ranges) {
      for (let i = from; i < to; i++) {
        const ct = cs[i]!, st = sn[i]!;
        const A = a[i]!, B = b[i]!, cp = cphi[i]!, sp = sphi[i]!;
        const lx = A * ct * cp - B * st * sp;
        const ly = A * ct * sp + B * st * cp;
        const lz = z[i]!;
        const o = i * 3;
        pos[o] = cx + P[0]! * lx + P[3]! * ly + P[6]! * lz;
        pos[o + 1] = cy + P[1]! * lx + P[4]! * ly + P[7]! * lz;
        pos[o + 2] = cz + P[2]! * lx + P[5]! * ly + P[8]! * lz;
      }
    }
  }

  /** Give every particle the velocity of its orbit and start integrating. */
  private beginDynamics(): void {
    const s = this.set;
    const c = this.cores;
    const rng = new Rng(7);
    const pos = this.pos, vel = this.vel;
    for (let i = 0, N = s.count; i < N; i++) {
      if (s.mode[i] === MODE.Reborn) continue;
      const gi = s.galaxy[i]!;
      const g = this.galaxies[gi]!;
      const co = gi * 3;
      const vo = 6 + gi * 3;
      const o = i * 3;
      const m = s.mode[i];
      if (m === MODE.Wave) {
        const rx = pos[o]! - c[co]!, ry = pos[o + 1]! - c[co + 1]!, rz = pos[o + 2]! - c[co + 2]!;
        const n = g.normal;
        const h = rx * n[0] + ry * n[1] + rz * n[2];
        const px = rx - h * n[0], py = ry - h * n[1], pz = rz - h * n[2];
        const rho = Math.hypot(px, py, pz) || 1e-4;
        const r = Math.hypot(rx, ry, rz);
        const vc = circularSpeed(g.spec.mass, g.spec.softening, r);
        // Tangent = n × r̂ (counter-clockwise about the spin axis).
        const tx = (n[1] * pz - n[2] * py) / rho;
        const ty = (n[2] * px - n[0] * pz) / rho;
        const tz = (n[0] * py - n[1] * px) / rho;
        const rot = s.rot[i]! * vc;
        const sig = s.sigma[i]! * vc;
        vel[o] = c[vo]! + tx * rot + rng.gauss() * sig;
        vel[o + 1] = c[vo + 1]! + ty * rot + rng.gauss() * sig;
        vel[o + 2] = c[vo + 2]! + tz * rot + rng.gauss() * sig;
      } else if (m === MODE.Fixed) {
        const Bm = g.basis;
        const fx = s.fv[o]!, fy = s.fv[o + 1]!, fz = s.fv[o + 2]!;
        vel[o] = c[vo]! + Bm[0]! * fx + Bm[3]! * fy + Bm[6]! * fz;
        vel[o + 1] = c[vo + 1]! + Bm[1]! * fx + Bm[4]! * fy + Bm[7]! * fz;
        vel[o + 2] = c[vo + 2]! + Bm[2]! * fx + Bm[5]! * fy + Bm[8]! * fz;
      } else {
        vel[o] = vel[o + 1] = vel[o + 2] = 0;
      }
    }
    this.dynamic = true;
  }

  /** Drift–kick–drift leapfrog step in the field of both cores. */
  private step(dt: number): void {
    const h = dt * 0.5;
    const c = this.coreTmp;
    this.track.sample(this.time + h, c);
    const ax = c[0]!, ay = c[1]!, az = c[2]!;
    const bx = c[3]!, by = c[4]!, bz = c[5]!;
    const mA = this.mA, mB = this.mB, eA = this.eA2, eB = this.eB2;
    const pos = this.pos, vel = this.vel;
    // Progenitor stars + dust are integrated; glows sit on the cores and the
    // reborn disk is analytic.
    const s = this.set;
    const end1 = s.rebornStart;
    const start2 = s.dustStart;
    const end2 = s.rebornDustStart;
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? 0 : start2;
      const to = pass === 0 ? end1 : end2;
      for (let i = from; i < to; i++) {
        const o = i * 3;
        let x = pos[o]!, y = pos[o + 1]!, z = pos[o + 2]!;
        let vx = vel[o]!, vy = vel[o + 1]!, vz = vel[o + 2]!;
        x += vx * h;
        y += vy * h;
        z += vz * h;
        let dx = ax - x, dy = ay - y, dz = az - z;
        let r2 = dx * dx + dy * dy + dz * dz + eA;
        let inv = mA / (r2 * Math.sqrt(r2));
        let fx = dx * inv, fy = dy * inv, fz = dz * inv;
        dx = bx - x;
        dy = by - y;
        dz = bz - z;
        r2 = dx * dx + dy * dy + dz * dz + eB;
        inv = mB / (r2 * Math.sqrt(r2));
        fx += dx * inv;
        fy += dy * inv;
        fz += dz * inv;
        vx += fx * dt;
        vy += fy * dt;
        vz += fz * dt;
        pos[o] = x + vx * h;
        pos[o + 1] = y + vy * h;
        pos[o + 2] = z + vz * h;
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
      }
    }
    this.time += dt;
    this.track.sample(this.time, this.cores);
  }

  private placeGlows(): void {
    const s = this.set;
    const c = this.cores;
    for (let i = s.glowStart; i < s.glowStart + s.glowCount; i++) {
      const co = s.galaxy[i]! * 3;
      this.pos[i * 3] = c[co]!;
      this.pos[i * 3 + 1] = c[co + 1]!;
      this.pos[i * 3 + 2] = c[co + 2]!;
    }
  }
}
