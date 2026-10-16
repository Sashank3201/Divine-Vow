/**
 * Procedural models of the Milky Way and Andromeda.
 *
 * Before the encounter the disks are animated with a density-wave model
 * (Lin & Shu): every star travels an ellipse whose orientation twists with
 * radius. Overlapping ellipses crowd into spiral arms that keep their shape
 * while the stars stream through them — so the galaxies stay beautiful
 * however long the intro lasts. Young stars, HII regions and dust are locked
 * to the pattern itself. Once the galaxies feel each other the whole set is
 * handed to the N-body integrator (see simulation.ts).
 */

import { CoreTrack, type OrbitEvents } from './orbit';
import { Rng, TAU, clamp, lerp, mat3, vec3, type Mat3, type Vec3 } from './math';

/** Particle type, read by the shaders (aMeta.w). */
export const PT = {
  Star: 0,
  Young: 1,
  HII: 2,
  Dust: 3,
  Haze: 4,
  Bulge: 5,
  Halo: 6,
  Burst: 7,
  Glow: 8,
} as const;
export type ParticleType = (typeof PT)[keyof typeof PT];

/** How a particle moves during the kinematic (pre-encounter) phase. */
export const MODE = {
  /** Density-wave ellipse in the rotating pattern frame (ω may be 0 → locked to the arms). */
  Wave: 0,
  /** Fixed offset in the galaxy's non-rotating frame (halo, satellites). */
  Fixed: 1,
  /** Sits exactly on the nucleus (glow sprites). */
  Core: 2,
  /** The reborn disk: density-wave orbits around the merged nucleus, always analytic. */
  Reborn: 3,
} as const;

export const ATTRIB_STRIDE = 8; // r, g, b, intensity, size, birth, life, type

export interface GalaxySpec {
  name: string;
  mass: number;
  /** Plummer scale length of the potential. */
  softening: number;
  radius: number;
  /** Spin axis in world space (the orbit's angular momentum points along −Y). */
  normal: Vec3;
  /** Orientation of the disk pattern around its spin axis. */
  positionAngle: number;
  /** Pattern-frame phase at t = 0. */
  phase: number;
  /** Radians of arm twist from the inner to the outer disk. */
  twist: number;
  /** Fraction of the radius occupied by the bar (0 = no bar). */
  bar: number;
  /** Ellipse axis ratio of the innermost orbits / at the disk edge. */
  innerRatio: number;
  outerRatio: number;
  diskScale: number;
  bulgeScale: number;
  bulgeFlattening: number;
  ring: { radius: number; width: number } | null;
  minorArms: boolean;
  colors: {
    bulge: Vec3;
    disk: Vec3;
    young: Vec3;
    hii: Vec3;
    dust: Vec3;
    haze: Vec3;
  };
  counts: {
    bulge: number;
    disk: number;
    young: number;
    hii: number;
    haze: number;
    dust: number;
    halo: number;
    burst: number;
    outer: number;
  };
  satellites: Array<{
    name: string;
    offset: Vec3;
    radius: number;
    count: number;
    color: Vec3;
    flattening: number;
  }>;
}

export const MILKY_WAY: GalaxySpec = {
  name: 'Milky Way',
  mass: 1.0,
  softening: 0.25,
  radius: 1.0,
  // ~18° from the orbital axis: a prograde encounter that raises long tidal tails,
  // and almost face-on to the opening camera.
  normal: [0, -0.952, -0.305],
  positionAngle: -0.25,
  phase: 0.35,
  twist: 3.7,
  bar: 0.26,
  innerRatio: 0.36,
  outerRatio: 0.9,
  diskScale: 0.3,
  bulgeScale: 0.06,
  bulgeFlattening: 0.65,
  ring: null,
  minorArms: true,
  colors: {
    bulge: [1.0, 0.7, 0.4],
    disk: [1.0, 0.86, 0.72],
    young: [0.52, 0.7, 1.0],
    hii: [1.0, 0.3, 0.55],
    dust: [0.42, 0.56, 0.78],
    haze: [0.85, 0.78, 0.72],
  },
  counts: { bulge: 5600, disk: 13000, young: 12500, hii: 720, haze: 6500, dust: 6400, halo: 1000, burst: 2600, outer: 7000 },
  satellites: [],
};

export const ANDROMEDA: GalaxySpec = {
  name: 'Andromeda',
  mass: 1.25,
  softening: 0.32,
  radius: 1.38,
  // Steeply inclined (~70° to the line of sight), like the Andromeda we see in our own sky.
  normal: [-0.6, -0.7, 0.4],
  positionAngle: 0.62,
  phase: 1.9,
  twist: 7.6,
  bar: 0,
  innerRatio: 0.82,
  outerRatio: 0.93,
  diskScale: 0.3,
  bulgeScale: 0.1,
  bulgeFlattening: 0.78,
  ring: { radius: 0.5, width: 0.045 },
  minorArms: false,
  colors: {
    bulge: [1.0, 0.66, 0.34],
    disk: [1.0, 0.82, 0.62],
    young: [0.5, 0.68, 1.0],
    hii: [1.0, 0.34, 0.58],
    dust: [0.46, 0.6, 0.8],
    haze: [0.92, 0.78, 0.62],
  },
  counts: { bulge: 8600, disk: 16500, young: 9500, hii: 800, haze: 7500, dust: 8200, halo: 1300, burst: 2600, outer: 7500 },
  satellites: [
    { name: 'M32', offset: [0.2, -0.32, 0.14], radius: 0.035, count: 900, color: [1.0, 0.8, 0.58], flattening: 0.85 },
    { name: 'M110', offset: [-0.62, 0.78, -0.3], radius: 0.075, count: 1600, color: [1.0, 0.83, 0.64], flattening: 0.6 },
  ],
};

/**
 * Milkomeda — the galaxy born from the merger. Gas-rich mergers regrow a
 * disk around the remnant; here it forms inside-out, aligned with the
 * orbital angular momentum the two galaxies brought into the collision.
 */
export const MILKOMEDA: GalaxySpec = {
  name: 'Milkomeda',
  mass: 2.25,
  softening: 0.3,
  radius: 1.85,
  normal: [0.06, -0.99, -0.1],
  positionAngle: 0.9,
  phase: 0,
  twist: 4.6,
  bar: 0.14,
  innerRatio: 0.5,
  outerRatio: 0.9,
  diskScale: 0.3,
  bulgeScale: 0.08,
  bulgeFlattening: 0.7,
  ring: { radius: 0.32, width: 0.03 },
  minorArms: true,
  colors: {
    bulge: [1.0, 0.76, 0.46],
    disk: [1.0, 0.88, 0.74],
    young: [0.5, 0.72, 1.0],
    hii: [1.0, 0.38, 0.72],
    dust: [0.4, 0.55, 0.8],
    haze: [0.86, 0.8, 0.78],
  },
  counts: { bulge: 0, disk: 9000, young: 12000, hii: 900, haze: 4200, dust: 5200, halo: 0, burst: 0, outer: 4000 },
  satellites: [],
};

export interface ParticleSet {
  count: number;
  /** The reborn Milkomeda disk occupies [rebornStart, glowStart) and [rebornDustStart, count). */
  rebornStart: number;
  rebornDustStart: number;
  /** Additive particles live in [0, additiveCount) — stars, then glow sprites at the end. */
  additiveCount: number;
  glowStart: number;
  glowCount: number;
  /** Absorbing dust lives in [additiveCount, count). */
  dustStart: number;
  dustCount: number;

  galaxy: Uint8Array;
  mode: Uint8Array;
  /** Ellipse semi-axes (Wave) or local offset x/y (Fixed). */
  a: Float32Array;
  b: Float32Array;
  cphi: Float32Array;
  sphi: Float32Array;
  theta0: Float32Array;
  omega: Float32Array;
  /** Height above the disk (Wave) or local offset z (Fixed). */
  z: Float32Array;
  /** Dynamics hand-off: fraction of circular speed, velocity dispersion (Wave), or local velocity (Fixed). */
  rot: Float32Array;
  sigma: Float32Array;
  fv: Float32Array;

  attribs: Float32Array;
}

export interface GalaxyRuntime {
  spec: GalaxySpec;
  /** Base (non-rotating) disk frame. */
  basis: Mat3;
  /** Spin axis (= basis z). */
  normal: Vec3;
  patternSpeed: number;
}

/** Circular speed of a Plummer sphere. */
export function circularSpeed(mass: number, soft: number, r: number): number {
  const r2 = r * r;
  return Math.sqrt((mass * r2) / Math.pow(r2 + soft * soft, 1.5));
}

export function createRuntime(spec: GalaxySpec): GalaxyRuntime {
  const normal = vec3.normalize(spec.normal);
  const basis = mat3.basisFromNormal(normal, spec.positionAngle);
  const rc = spec.radius * 0.62;
  return {
    spec,
    basis,
    normal,
    patternSpeed: circularSpeed(spec.mass, spec.softening, rc) / rc,
  };
}

/** Black-body-ish stellar colour for a population (0 = old/red … 1 = young/blue). */
function starTint(rng: Rng, youth: number, base: Vec3): Vec3 {
  const r = rng.next();
  let tint: Vec3;
  if (r < 0.04 + youth * 0.3) tint = [0.62, 0.74, 1.0]; // O/B
  else if (r < 0.16 + youth * 0.35) tint = [0.85, 0.9, 1.0]; // A/F
  else if (r < 0.62) tint = [1.0, 0.93, 0.82]; // G
  else if (r < 0.88) tint = [1.0, 0.78, 0.55]; // K
  else tint = [1.0, 0.6, 0.42]; // M
  const m = 0.55;
  return [lerp(base[0], tint[0], m), lerp(base[1], tint[1], m), lerp(base[2], tint[2], m)];
}

interface Builder {
  push(p: {
    galaxy: number;
    mode: number;
    a: number;
    b: number;
    phi: number;
    theta: number;
    omega: number;
    z: number;
    rot?: number;
    sigma?: number;
    fv?: Vec3;
    color: Vec3;
    intensity: number;
    size: number;
    birth?: number;
    life?: number;
    type: ParticleType;
  }): void;
}

const NEVER = -1e6;

class SetBuilder implements Builder {
  readonly items: Array<Parameters<Builder['push']>[0]> = [];
  push(p: Parameters<Builder['push']>[0]): void {
    this.items.push(p);
  }
}

/** Ellipse geometry of the density-wave model as a function of semi-major axis. */
function waveGeometry(spec: GalaxySpec, a: number): { ratio: number; phi: number } {
  const R = spec.radius;
  const x = a / R;
  const barEnd = spec.bar;
  let ratio: number;
  let phi: number;
  if (barEnd > 0 && x < barEnd) {
    ratio = spec.innerRatio;
    phi = 0;
  } else {
    const t = clamp((x - barEnd) / (1 - barEnd), 0, 1.4);
    const k = clamp(t, 0, 1);
    ratio = lerp(barEnd > 0 ? spec.innerRatio + 0.2 : spec.innerRatio, spec.outerRatio, Math.sqrt(k));
    if (t > 1) ratio = lerp(spec.outerRatio, 1, clamp(t - 1, 0, 1) * 2.5);
    phi = -spec.twist * t;
  }
  return { ratio, phi };
}

function buildGalaxy(
  b: Builder,
  gi: number,
  rt: GalaxyRuntime,
  rng: Rng,
  scale: number,
  events: OrbitEvents,
): void {
  const s = rt.spec;
  const R = s.radius;
  const C = s.colors;
  const n = (k: number) => Math.max(1, Math.round(k * scale));
  const lum = 1 / Math.sqrt(scale); // fewer particles → each a bit brighter
  const omegaAt = (a: number) => circularSpeed(s.mass, s.softening, Math.max(a, 0.02)) / Math.max(a, 0.02);

  // ── Bulge (and bar) ────────────────────────────────────────────────────
  for (let i = 0, N = n(s.counts.bulge); i < N; i++) {
    const inBar = s.bar > 0 && i < N * 0.74;
    let a: number, ratio: number, z: number;
    const theta = rng.range(0, TAU);
    if (inBar) {
      a = Math.abs(rng.gauss()) * R * s.bar * 0.52;
      ratio = s.innerRatio * rng.range(0.85, 1.15);
      z = rng.gauss() * R * 0.035 * (1 - a / (R * s.bar * 1.6));
    } else {
      // Flattened 3D spheroid, Hernquist-like cusp.
      const u = rng.next();
      const r = (s.bulgeScale * R * Math.sqrt(u)) / (1 - Math.sqrt(u) * 0.92);
      const cosT = rng.range(-1, 1);
      const sinT = Math.sqrt(1 - cosT * cosT);
      a = Math.min(r * sinT, R * 0.5);
      ratio = rng.range(0.9, 1.0);
      z = r * cosT * s.bulgeFlattening;
    }
    const tint = starTint(rng, 0.05, C.bulge);
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a,
      b: a * ratio,
      phi: 0,
      theta,
      omega: omegaAt(a) * (inBar ? 1 : 0.55),
      z,
      rot: inBar ? 0.8 : 0.35,
      sigma: inBar ? 0.12 : 0.32,
      color: tint,
      intensity: rng.range(0.5, 1.1) * lum,
      size: rng.range(0.007, 0.013),
      type: PT.Bulge,
    });
  }

  // ── Old stellar disk (density-wave ellipses) ───────────────────────────
  for (let i = 0, N = n(s.counts.disk); i < N; i++) {
    const a = rng.expDisk(s.diskScale * R, R * 1.18) + R * 0.02;
    const { ratio, phi } = waveGeometry(s, a);
    const youth = rng.next() * 0.35;
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a,
      b: a * ratio,
      phi,
      theta: rng.range(0, TAU),
      omega: omegaAt(a),
      z: rng.gauss() * R * 0.028,
      rot: 1,
      sigma: 0.06,
      color: starTint(rng, youth, C.disk),
      intensity: rng.range(0.3, 0.8) * lum,
      size: rng.range(0.006, 0.012),
      type: PT.Star,
    });
  }

  // Positions along an arm ridge (locked to the pattern). `k` selects the arm.
  const armPoint = (x: number, k: number, spread: number) => {
    const a = x * R;
    const { phi } = waveGeometry(s, a);
    const arms = s.minorArms ? [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5] : [0, Math.PI];
    const offset = arms[k % arms.length]!;
    // Arms widen outward; minor arms are fainter and more ragged.
    const ang = phi + offset + 0.32 + rng.gauss() * spread * (0.6 + x * 0.6);
    const r = a * (1 + rng.gauss() * spread * 0.35);
    return { r, ang };
  };

  const pickArm = () => {
    if (!s.minorArms) return rng.chance(0.5) ? 0 : 1;
    const u = rng.next();
    return u < 0.36 ? 0 : u < 0.72 ? 1 : u < 0.86 ? 2 : 3;
  };

  const startX = s.bar > 0 ? s.bar * 0.95 : 0.16;

  // ── Young blue stars along the arms / ring ─────────────────────────────
  for (let i = 0, N = n(s.counts.young); i < N; i++) {
    let r: number, ang: number;
    if (s.ring && rng.chance(0.38)) {
      r = (s.ring.radius + rng.gauss() * s.ring.width) * R;
      ang = rng.range(0, TAU);
    } else {
      const x = startX + Math.pow(rng.next(), 0.8) * (1.08 - startX);
      ({ r, ang } = armPoint(x, pickArm(), 0.11));
    }
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a: r,
      b: r,
      phi: 0,
      theta: ang,
      omega: 0,
      z: rng.gauss() * R * 0.012,
      rot: 1,
      sigma: 0.04,
      color: starTint(rng, 0.9, C.young),
      intensity: rng.range(0.6, 1.5) * lum,
      size: rng.range(0.007, 0.014),
      type: PT.Young,
    });
  }

  // ── HII regions: clumpy pink knots on the arms ─────────────────────────
  for (let i = 0, N = n(s.counts.hii); i < N; ) {
    let r: number, ang: number;
    if (s.ring && rng.chance(0.45)) {
      r = (s.ring.radius + rng.gauss() * s.ring.width * 0.8) * R;
      ang = rng.range(0, TAU);
    } else {
      const x = startX + rng.next() * (1.0 - startX);
      ({ r, ang } = armPoint(x, pickArm(), 0.1));
    }
    const clump = 1 + Math.floor(rng.next() * 6);
    for (let c = 0; c < clump && i < N; c++, i++) {
      const rr = r + rng.gauss() * 0.012 * R;
      const aa = ang + (rng.gauss() * 0.012 * R) / Math.max(r, 0.05);
      b.push({
        galaxy: gi,
        mode: MODE.Wave,
        a: rr,
        b: rr,
        phi: 0,
        theta: aa,
        omega: 0,
        z: rng.gauss() * R * 0.008,
        rot: 1,
        sigma: 0.03,
        color: rng.chance(0.25) ? [0.75, 0.62, 1.0] : C.hii,
        intensity: rng.range(0.6, 1.5) * lum,
        size: rng.range(0.014, 0.028),
        type: PT.HII,
      });
    }
  }

  // ── Extended outer disk: faint young stars and gas beyond the optical edge.
  // Barely visible at first — these are what the tide pulls into long tails.
  for (let i = 0, N = n(s.counts.outer); i < N; i++) {
    const a = R * (0.85 + Math.abs(rng.gauss()) * 0.42 + rng.next() * 0.25);
    const { ratio, phi } = waveGeometry(s, Math.min(a, R * 1.15));
    const armish = rng.chance(0.55);
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a,
      b: a * Math.min(1, ratio + 0.04),
      phi: armish ? phi : rng.range(0, TAU),
      theta: armish ? rng.gauss() * 0.5 + (rng.chance(0.5) ? 0 : Math.PI) : rng.range(0, TAU),
      omega: omegaAt(a),
      z: rng.gauss() * R * 0.03,
      rot: 1,
      sigma: 0.04,
      color: starTint(rng, 0.85, [0.62, 0.74, 1.0]),
      intensity: rng.range(0.35, 0.9) * lum,
      size: rng.range(0.008, 0.016),
      type: PT.Young,
    });
  }

  // ── Unresolved starlight haze: large faint sprites ─────────────────────
  for (let i = 0, N = n(s.counts.haze); i < N; i++) {
    const central = rng.chance(0.35);
    const a = central ? Math.abs(rng.gauss()) * R * (s.bulgeScale * 2.2) : rng.expDisk(s.diskScale * R * 1.05, R * 1.1);
    const { ratio, phi } = waveGeometry(s, a);
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a,
      b: a * (central ? (s.bar > 0 ? 0.55 : 0.92) : ratio),
      phi: central ? 0 : phi,
      theta: rng.range(0, TAU),
      omega: omegaAt(a) * (central ? 0.6 : 1),
      z: rng.gauss() * R * (central ? 0.06 : 0.03),
      rot: central ? 0.4 : 1,
      sigma: central ? 0.25 : 0.06,
      color: central ? C.bulge : C.haze,
      intensity: (central ? 0.07 : 0.03) * lum * rng.range(0.7, 1.15),
      size: central ? rng.range(0.06, 0.13) : rng.range(0.06, 0.12),
      type: PT.Haze,
    });
  }

  // ── Stellar halo + globular clusters ───────────────────────────────────
  const globulars = Math.max(4, Math.round(14 * Math.sqrt(scale)));
  const gcCenters: Vec3[] = [];
  for (let g = 0; g < globulars; g++) {
    const r = rng.range(0.25, 1.3) * R;
    const dir = vec3.normalize([rng.gauss(), rng.gauss(), rng.gauss()]);
    gcCenters.push(vec3.scale(dir, r));
  }
  for (let i = 0, N = n(s.counts.halo); i < N; i++) {
    let p: Vec3;
    let size = rng.range(0.005, 0.01);
    let inten = rng.range(0.25, 0.6) * lum;
    if (i < N * 0.45) {
      const c = gcCenters[i % gcCenters.length]!;
      p = vec3.add(c, [rng.gauss() * 0.012 * R, rng.gauss() * 0.012 * R, rng.gauss() * 0.012 * R]);
      inten *= 1.4;
      size *= 0.9;
    } else {
      const r = (R * 0.35) / Math.pow(rng.next() + 0.02, 0.55);
      const dir = vec3.normalize([rng.gauss(), rng.gauss(), rng.gauss()]);
      p = vec3.scale(dir, Math.min(r, R * 2.4));
    }
    const rr = vec3.len(p);
    const vc = circularSpeed(s.mass, s.softening, rr);
    // Random orbital plane through the star; motion perpendicular to radius.
    const rand: Vec3 = vec3.normalize([rng.gauss(), rng.gauss(), rng.gauss()]);
    const t = vec3.normalize(vec3.cross(p, rand));
    const v = vec3.scale(t, vc * rng.range(0.6, 0.95));
    b.push({
      galaxy: gi,
      mode: MODE.Fixed,
      a: p[0],
      b: p[1],
      phi: 0,
      theta: 0,
      omega: 0,
      z: p[2],
      fv: v,
      color: starTint(rng, 0.0, [1.0, 0.85, 0.7]),
      intensity: inten,
      size,
      type: PT.Halo,
    });
  }

  // ── Satellite galaxies (M32, M110) ─────────────────────────────────────
  for (const sat of s.satellites) {
    const c = vec3.scale(sat.offset, R);
    const rc = vec3.len(c);
    const vc = circularSpeed(s.mass, s.softening, rc);
    const orbitNormal = vec3.normalize([0.2, 0.3, 1]);
    const vCenter = vec3.scale(vec3.normalize(vec3.cross(orbitNormal, c)), vc * 0.9);
    for (let i = 0, N = n(sat.count); i < N; i++) {
      const u = rng.next();
      const r = (sat.radius * R * Math.sqrt(u)) / (1 - Math.sqrt(u) * 0.85);
      const dir = vec3.normalize([rng.gauss(), rng.gauss(), rng.gauss() * sat.flattening]);
      const p = vec3.add(c, vec3.scale(dir, Math.min(r, sat.radius * R * 6)));
      const disp = 0.05;
      b.push({
        galaxy: gi,
        mode: MODE.Fixed,
        a: p[0],
        b: p[1],
        phi: 0,
        theta: 0,
        omega: 0,
        z: p[2],
        fv: [vCenter[0] + rng.gauss() * disp, vCenter[1] + rng.gauss() * disp, vCenter[2] + rng.gauss() * disp],
        color: starTint(rng, 0.0, sat.color),
        intensity: rng.range(0.45, 1.0) * lum,
        size: rng.range(0.006, 0.011),
        type: PT.Bulge,
      });
    }
    // A soft haze for each satellite.
    for (let i = 0; i < Math.max(3, Math.round(30 * scale)); i++) {
      const p = vec3.add(c, [rng.gauss() * sat.radius * R, rng.gauss() * sat.radius * R, rng.gauss() * sat.radius * R * 0.6]);
      b.push({
        galaxy: gi,
        mode: MODE.Fixed,
        a: p[0],
        b: p[1],
        phi: 0,
        theta: 0,
        omega: 0,
        z: p[2],
        fv: vCenter,
        color: sat.color,
        intensity: 0.035 * lum,
        size: sat.radius * R * rng.range(1.2, 2.2),
        type: PT.Haze,
      });
    }
  }

  // ── Starburst population: invisible until the collision ignites them ───
  for (let i = 0, N = n(s.counts.burst); i < N; i++) {
    const a = Math.abs(rng.gauss()) * R * 0.38 + 0.03;
    const { ratio, phi } = waveGeometry(s, a);
    const second = rng.chance(0.55);
    const birth = second
      ? rng.range(events.secondPericenter - 0.4, events.merger + 2.5)
      : rng.range(events.firstPericenter - 0.5, events.firstPericenter + 2.5);
    const pink = rng.chance(0.3);
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a,
      b: a * ratio,
      phi,
      theta: rng.range(0, TAU),
      omega: omegaAt(a),
      z: rng.gauss() * R * 0.02,
      rot: 1,
      sigma: 0.08,
      color: pink ? C.hii : starTint(rng, 1, [0.6, 0.75, 1.0]),
      intensity: (pink ? rng.range(1.6, 3.2) : rng.range(1.2, 2.6)) * lum,
      size: pink ? rng.range(0.02, 0.04) : rng.range(0.008, 0.016),
      birth,
      life: rng.range(4, 9),
      type: PT.Burst,
    });
  }
}

/** Stars of the reborn disk switch on inside-out after the merger. */
function buildReborn(stars: Builder, dust: Builder, gi: number, rt: GalaxyRuntime, rng: Rng, scale: number, start: number): void {
  const tmpStars = new SetBuilder();
  const tmpDust = new SetBuilder();
  const silent: OrbitEvents = { firstPericenter: 0, apocenter: 0, secondPericenter: 0, merger: 0, settled: 0 };
  buildGalaxy(tmpStars, gi, rt, rng, scale, silent);
  buildDust(tmpDust, gi, rt, rng, scale);
  const R = rt.spec.radius;
  const birthOf = (a: number) => start + Math.min(a / R, 1.3) * 4.2 + rng.next() * 1.4;
  for (const p of tmpStars.items) {
    if (p.type === PT.Halo || p.type === PT.Burst) continue;
    // A touch brighter than its parents: the new galaxy should shine.
    const glow = p.type === PT.Young || p.type === PT.HII ? 1.55 : 1.25;
    stars.push({ ...p, mode: MODE.Reborn, intensity: p.intensity * glow, birth: birthOf(Math.max(p.a, p.b)), life: 1e6 });
  }
  for (const p of tmpDust.items) {
    dust.push({ ...p, mode: MODE.Reborn, birth: birthOf(p.a) + 0.6, life: 1e6 });
  }
}

function buildDust(b: Builder, gi: number, rt: GalaxyRuntime, rng: Rng, scale: number): void {
  const s = rt.spec;
  const R = s.radius;
  const N = Math.max(1, Math.round(s.counts.dust * scale));
  const arms = s.minorArms ? 4 : 2;
  const startX = s.bar > 0 ? s.bar * 0.9 : 0.12;
  for (let i = 0; i < N; i++) {
    let r: number, ang: number;
    if (s.ring && rng.chance(0.3)) {
      r = (s.ring.radius - 0.02 + rng.gauss() * s.ring.width * 1.1) * R;
      ang = rng.range(0, TAU);
    } else if (rng.chance(0.18)) {
      // Diffuse inter-arm dust.
      r = rng.expDisk(s.diskScale * R, R) + 0.05;
      ang = rng.range(0, TAU);
    } else {
      const x = startX + Math.pow(rng.next(), 0.9) * (1.02 - startX);
      const a = x * R;
      const { phi } = waveGeometry(s, a);
      const k = Math.floor(rng.next() * arms);
      const major = k < 2;
      if (!major && rng.chance(0.55)) continue;
      // Dust lanes run along the inner (concave) edge of each arm.
      ang = phi + k * (TAU / arms) + 0.18 + rng.gauss() * 0.07 * (0.6 + x);
      r = a * (1 + rng.gauss() * 0.04);
    }
    const density = rng.range(0.25, 0.7) * (1 / Math.sqrt(scale)) * 0.55;
    b.push({
      galaxy: gi,
      mode: MODE.Wave,
      a: r,
      b: r,
      phi: 0,
      theta: ang,
      omega: 0,
      z: rng.gauss() * R * 0.01,
      rot: 1,
      sigma: 0.03,
      color: s.colors.dust,
      intensity: density,
      size: rng.range(0.035, 0.085),
      type: PT.Dust,
    });
  }
}

export interface GalaxyModel {
  set: ParticleSet;
  galaxies: GalaxyRuntime[];
}

/**
 * Builds the full particle set. `scale` multiplies all particle counts
 * (quality tiers), brightness is compensated so the look stays consistent.
 */
export function buildModel(track: CoreTrack, scale: number, seed = 20251016): GalaxyModel {
  const rng = new Rng(seed);
  const galaxies = [createRuntime(MILKY_WAY), createRuntime(ANDROMEDA), createRuntime(MILKOMEDA)];
  const progenitors = galaxies.slice(0, 2);
  const stars = new SetBuilder();
  const dust = new SetBuilder();
  progenitors.forEach((g, i) => buildGalaxy(stars, i, g, rng, scale, track.events));
  progenitors.forEach((g, i) => buildDust(dust, i, g, rng, scale));
  const rebornStars = new SetBuilder();
  const rebornDust = new SetBuilder();
  buildReborn(rebornStars, rebornDust, 2, galaxies[2]!, rng, scale, track.events.merger + 0.8);

  // Nucleus glows: tight bright core, bulge glow, faint wide halo glow.
  const glowSpecs: Array<[number, number, number]> = [
    // [size factor, intensity, colour mix]
    [0.12, 2.6, 0.0],
    [0.36, 0.55, 0.4],
    [1.1, 0.07, 1.0],
  ];
  const glows = new SetBuilder();
  progenitors.forEach((g, gi) => {
    for (const [sz, inten, mix] of glowSpecs) {
      const c = g.spec.colors.bulge;
      const color: Vec3 = [lerp(1.0, c[0], 0.6 + mix * 0.4), lerp(0.92, c[1], 0.6 + mix * 0.4), lerp(0.8, c[2], 0.6 + mix * 0.4)];
      glows.push({
        galaxy: gi,
        mode: MODE.Core,
        a: 0,
        b: 0,
        phi: 0,
        theta: 0,
        omega: 0,
        z: 0,
        color,
        intensity: inten,
        size: sz * g.spec.radius,
        type: PT.Glow,
      });
    }
  });

  const all = [...stars.items, ...rebornStars.items, ...glows.items, ...dust.items, ...rebornDust.items];
  const N = all.length;
  const additive = stars.items.length + rebornStars.items.length + glows.items.length;
  const set: ParticleSet = {
    count: N,
    rebornStart: stars.items.length,
    rebornDustStart: additive + dust.items.length,
    additiveCount: additive,
    glowStart: stars.items.length + rebornStars.items.length,
    glowCount: glows.items.length,
    dustStart: additive,
    dustCount: dust.items.length + rebornDust.items.length,
    galaxy: new Uint8Array(N),
    mode: new Uint8Array(N),
    a: new Float32Array(N),
    b: new Float32Array(N),
    cphi: new Float32Array(N),
    sphi: new Float32Array(N),
    theta0: new Float32Array(N),
    omega: new Float32Array(N),
    z: new Float32Array(N),
    rot: new Float32Array(N),
    sigma: new Float32Array(N),
    fv: new Float32Array(N * 3),
    attribs: new Float32Array(N * ATTRIB_STRIDE),
  };

  for (let i = 0; i < N; i++) {
    const p = all[i]!;
    set.galaxy[i] = p.galaxy;
    set.mode[i] = p.mode;
    set.a[i] = p.a;
    set.b[i] = p.b;
    set.cphi[i] = Math.cos(p.phi);
    set.sphi[i] = Math.sin(p.phi);
    set.theta0[i] = p.theta;
    set.omega[i] = p.omega;
    set.z[i] = p.z;
    set.rot[i] = p.rot ?? 1;
    set.sigma[i] = p.sigma ?? 0.05;
    if (p.fv) {
      set.fv[i * 3] = p.fv[0];
      set.fv[i * 3 + 1] = p.fv[1];
      set.fv[i * 3 + 2] = p.fv[2];
    }
    const o = i * ATTRIB_STRIDE;
    set.attribs[o] = p.color[0];
    set.attribs[o + 1] = p.color[1];
    set.attribs[o + 2] = p.color[2];
    set.attribs[o + 3] = p.intensity;
    set.attribs[o + 4] = p.size;
    set.attribs[o + 5] = p.birth ?? NEVER;
    set.attribs[o + 6] = p.life ?? 0;
    set.attribs[o + 7] = p.type;
  }

  return { set, galaxies };
}
