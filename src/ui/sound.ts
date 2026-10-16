/**
 * Procedural cosmic sound — no audio files. A slow drone pad with drifting
 * filters, a breath of "solar wind", deep impacts for the collisions and
 * soft bells for milestones. Off by default; browsers require a gesture.
 */

import { store } from '../core/store';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: DelayNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;

  get enabled(): boolean {
    return store.get().settings.sound;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    // A long feedback delay as a cheap sense of space.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(master);
    this.ctx = ctx;
    this.master = master;
    this.fx = delay;
    return ctx;
  }

  toggle(): boolean {
    const on = !this.enabled;
    store.update((s) => {
      s.settings.sound = on;
    });
    if (on) this.startAmbient();
    else this.stopAmbient();
    return on;
  }

  /** Call from a user gesture when sound is enabled to (re)start the drone. */
  resume(): void {
    if (this.enabled && !this.ambientGain) this.startAmbient();
  }

  startAmbient(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.ambientGain) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.22, t + 4);
    out.connect(this.master);
    this.ambientGain = out;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.8;
    filter.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    const voices: Array<[number, OscillatorType, number, number]> = [
      [55, 'sine', 0.5, 0],
      [82.41, 'sine', 0.32, 4],
      [110, 'triangle', 0.18, -5],
      [164.81, 'sine', 0.1, 7],
    ];
    const nodes: AudioNode[] = [filter, lfo, lfoGain, out];
    for (const [f, type, g, detune] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(filter);
      o.start();
      nodes.push(o, og);
    }

    // Solar wind: looping noise through a wandering band-pass.
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    const nlfo = ctx.createOscillator();
    nlfo.frequency.value = 0.07;
    const nlfoG = ctx.createGain();
    nlfoG.gain.value = 380;
    nlfo.connect(nlfoG).connect(band.frequency);
    noise.connect(band).connect(ng).connect(out);
    noise.start();
    nlfo.start();
    nodes.push(noise, band, ng, nlfo, nlfoG);

    // High shimmer into the delay.
    const shimmer = ctx.createOscillator();
    shimmer.frequency.value = 1318.5;
    const sg = ctx.createGain();
    sg.gain.value = 0.006;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.13;
    const tg = ctx.createGain();
    tg.gain.value = 0.006;
    trem.connect(tg).connect(sg.gain);
    shimmer.connect(sg);
    sg.connect(out);
    if (this.fx) sg.connect(this.fx);
    shimmer.start();
    trem.start();
    nodes.push(shimmer, sg, trem, tg);
    this.ambientNodes = nodes;
  }

  stopAmbient(): void {
    const ctx = this.ctx;
    const g = this.ambientGain;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    const nodes = this.ambientNodes;
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          (n as OscillatorNode).stop?.();
        } catch {
          /* already stopped */
        }
        n.disconnect();
      });
    }, 1400);
    this.ambientNodes = [];
    this.ambientGain = null;
  }

  /** A deep, slow boom — galaxies colliding. */
  impact(strength = 1): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(96, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 2.8);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.7 * strength, t + 0.04);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 3.8);

    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 2.6);
    const ng = ctx.createGain();
    ng.gain.value = 0.32 * strength;
    n.connect(lp).connect(ng).connect(this.master);
    if (this.fx) ng.connect(this.fx);
    n.start(t);

    this.bell(1760, 0.05 * strength, 2.4);
  }

  private bell(freq: number, gain: number, decay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (const [mult, g] of [
      [1, 1],
      [2.756, 0.45],
      [5.404, 0.22],
    ] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(gain * g, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + decay / mult);
      o.connect(og).connect(this.master);
      if (this.fx) og.connect(this.fx);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  /** Soft bell — milestones, sealed vows, caught stars. */
  chime(note = 0): void {
    if (!this.enabled) return;
    if (!this.ensure()) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
    this.bell(scale[((note % scale.length) + scale.length) % scale.length]!, 0.09, 2.2);
  }

  /** A breath tone that rises on inhale and falls on exhale. */
  breath(kind: 'in' | 'hold' | 'out', seconds: number): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const base = 196;
    const from = kind === 'in' ? base : kind === 'out' ? base * 1.5 : base * 1.5;
    const to = kind === 'in' ? base * 1.5 : kind === 'out' ? base : base * 1.5;
    o.frequency.setValueAtTime(from, t);
    o.frequency.linearRampToValueAtTime(to, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(kind === 'hold' ? 0.025 : 0.05, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.master);
    if (this.fx) g.connect(this.fx);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }
}

export const sound = new SoundEngine();
