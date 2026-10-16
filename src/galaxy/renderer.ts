/**
 * WebGL2 renderer: HDR additive star sprites, multiplicative dust extinction,
 * a procedural nebula sky, physically-based bloom and a filmic composite.
 */

import {
  COMPOSITE_FS,
  DOWNSAMPLE_FS,
  FULLSCREEN_VS,
  NEBULA_FS,
  PARTICLE_FS,
  PARTICLE_VS,
  UPSAMPLE_FS,
  MAX_GLASS,
} from './shaders';
import type { Mat4, Vec3 } from './math';

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  prog: WebGLProgram;
  u: Uniforms;
}

export interface FrameUniforms {
  view: Mat4;
  viewProj: Mat4;
  invViewProj: Mat4;
  camPos: Vec3;
  focal: number;
  simTime: number;
  time: number;
  exposure: number;
  bloom: number;
  burst: number;
  flash: number;
  flashPos: [number, number];
  vignette: number;
  saturation: number;
  aberration: number;
  grain: number;
  streak: number;
  nebula: number;
  fade: number;
  skyFade: number;
  youth: number;
  dust: number;
  glass?: GlassFrame;
  /** Canvas pixels per CSS pixel. */
  pixelRatio?: number;
}

/** Liquid-glass panels for this frame, in canvas pixels (origin bottom-left). */
export interface GlassFrame {
  rects: Float32Array;
  params: Float32Array;
  count: number;
  light: [number, number];
  accent: [number, number, number];
}

export interface ParticleRanges {
  additiveCount: number;
  dustStart: number;
  dustCount: number;
}

export class GalaxyRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly hdr: boolean;
  private readonly maxPointSize: number;
  private particle!: Program;
  private nebula!: Program;
  private down!: Program;
  private up!: Program;
  private composite!: Program;
  private galaxyVao!: WebGLVertexArrayObject;
  private skyVao!: WebGLVertexArrayObject;
  private emptyVao!: WebGLVertexArrayObject;
  private noiseTex!: WebGLTexture;
  private posBuffer!: WebGLBuffer;
  private attrBuffer!: WebGLBuffer;
  private skyPosBuffer!: WebGLBuffer;
  private skyAttrBuffer!: WebGLBuffer;
  private ranges: ParticleRanges = { additiveCount: 0, dustStart: 0, dustCount: 0 };
  private skyCount = 0;
  private scene: Target | null = null;
  private nebulaTarget: Target | null = null;
  private mips: Target[] = [];
  private frost: Target | null = null;
  private width = 1;
  private height = 1;
  private particleCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('EXT_float_blend');
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    this.maxPointSize = Math.max(64, range?.[1] ?? 256);
    this.init();
  }

  static create(canvas: HTMLCanvasElement): GalaxyRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new GalaxyRenderer(gl);
    } catch (err) {
      console.warn('[divine-vow] WebGL init failed', err);
      return null;
    }
  }

  private init(): void {
    const gl = this.gl;
    this.particle = this.program(PARTICLE_VS, PARTICLE_FS, [
      'uViewProj', 'uView', 'uFocal', 'uMinSize', 'uMaxSize', 'uSimTime', 'uTime', 'uBurst', 'uFade', 'uDust',
      'uYouth', 'uDustAmount',
    ]);
    this.nebula = this.program(FULLSCREEN_VS, NEBULA_FS, ['uInvViewProj', 'uIntensity', 'uTime', 'uNoise']);
    this.noiseTex = this.createNoiseTexture(64);
    this.down = this.program(FULLSCREEN_VS, DOWNSAMPLE_FS, ['uSrc', 'uTexel', 'uKaris']);
    this.up = this.program(FULLSCREEN_VS, UPSAMPLE_FS, ['uSrc', 'uTexel', 'uRadius', 'uWeight']);
    this.composite = this.program(FULLSCREEN_VS, COMPOSITE_FS, [
      'uScene', 'uBloom', 'uNebula', 'uResolution', 'uExposure', 'uBloomStrength', 'uVignette', 'uGrain', 'uTime',
      'uFlash', 'uFlashPos', 'uSaturation', 'uAberration', 'uStreak', 'uStreakTex',
      'uFrost', 'uFrostTexel', 'uGlassRect', 'uGlassParam', 'uGlassCount', 'uLight', 'uAccent', 'uPx',
    ]);

    this.posBuffer = gl.createBuffer()!;
    this.attrBuffer = gl.createBuffer()!;
    this.skyPosBuffer = gl.createBuffer()!;
    this.skyAttrBuffer = gl.createBuffer()!;
    this.galaxyVao = this.particleVao(this.posBuffer, this.attrBuffer);
    this.skyVao = this.particleVao(this.skyPosBuffer, this.skyAttrBuffer);
    this.emptyVao = gl.createVertexArray()!;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  /** Tiling value-noise volume: white noise smoothed by a separable [1 2 1] blur, then contrast-normalised. */
  private createNoiseTexture(size: number): WebGLTexture {
    const gl = this.gl;
    const n = size * size * size;
    let a = new Float32Array(n);
    let seed = 1337;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      a[i] = seed / 4294967296;
    }
    let b = new Float32Array(n);
    const idx = (x: number, y: number, z: number) =>
      ((z + size) % size) * size * size + ((y + size) % size) * size + ((x + size) % size);
    const axes: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let pass = 0; pass < 2; pass++) {
      for (const [dx, dy, dz] of axes) {
        for (let z = 0; z < size; z++)
          for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
              b[idx(x, y, z)] =
                (a[idx(x - dx, y - dy, z - dz)]! + 2 * a[idx(x, y, z)]! + a[idx(x + dx, y + dy, z + dz)]!) * 0.25;
            }
        [a, b] = [b, a];
      }
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += a[i]!;
    mean /= n;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (a[i]! - mean) ** 2;
    const std = Math.sqrt(variance / n) || 1;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = 0.5 + ((a[i]! - mean) / std) * 0.2;
      bytes[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, size, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
  }

  private particleVao(pos: WebGLBuffer, attr: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, attr);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    return vao;
  }

  private shader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile error: ${log}`);
    }
    return sh;
  }

  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, this.shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    const u: Uniforms = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u };
  }

  setParticles(attribs: Float32Array, count: number, ranges: ParticleRanges): void {
    const gl = this.gl;
    this.particleCount = count;
    this.ranges = ranges;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.attrBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, attribs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, count * 12, gl.DYNAMIC_DRAW);
  }

  setSky(pos: Float32Array, attribs: Float32Array): void {
    const gl = this.gl;
    this.skyCount = pos.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyAttrBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, attribs, gl.STATIC_DRAW);
  }

  updatePositions(pos: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos, 0, this.particleCount * 3);
  }

  private createTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  private deleteTarget(t: Target | null): void {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  resize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height && this.scene) return;
    this.width = width;
    this.height = height;
    this.deleteTarget(this.scene);
    this.deleteTarget(this.nebulaTarget);
    this.mips.forEach((m) => this.deleteTarget(m));
    this.deleteTarget(this.frost);
    this.scene = this.createTarget(width, height);
    // A clean blur of the scene for frosted glass (the bloom mips get accumulated into).
    this.frost = this.createTarget(Math.max(1, width >> 3), Math.max(1, height >> 3));
    this.nebulaTarget = this.createTarget(Math.max(1, width >> 2), Math.max(1, height >> 2));
    this.mips = [];
    let w = width >> 1;
    let h = height >> 1;
    while (this.mips.length < 7 && w >= 4 && h >= 4) {
      this.mips.push(this.createTarget(w, h));
      w >>= 1;
      h >>= 1;
    }
  }

  get pointScale(): number {
    return this.height;
  }

  render(f: FrameUniforms): void {
    const gl = this.gl;
    if (!this.scene || !this.nebulaTarget || gl.isContextLost()) return;

    // ── Scene: sky + stars (additive), then dust (extinction) ────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.scene.w, this.scene.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);

    const p = this.particle;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uViewProj!, false, f.viewProj);
    gl.uniformMatrix4fv(p.u.uView!, false, f.view);
    gl.uniform1f(p.u.uFocal!, f.focal);
    gl.uniform1f(p.u.uMinSize!, 1.6);
    gl.uniform1f(p.u.uMaxSize!, this.maxPointSize);
    gl.uniform1f(p.u.uSimTime!, f.simTime);
    gl.uniform1f(p.u.uTime!, f.time);
    gl.uniform1f(p.u.uBurst!, f.burst);
    gl.uniform1f(p.u.uDust!, 0);
    gl.uniform1f(p.u.uYouth!, 1);
    gl.uniform1f(p.u.uDustAmount!, 1);

    if (this.skyCount > 0 && f.skyFade > 0) {
      gl.uniform1f(p.u.uFade!, f.skyFade);
      gl.bindVertexArray(this.skyVao);
      gl.drawArrays(gl.POINTS, 0, this.skyCount);
    }

    if (this.particleCount > 0 && f.fade > 0) {
      gl.uniform1f(p.u.uFade!, f.fade);
      gl.uniform1f(p.u.uYouth!, f.youth);
      gl.bindVertexArray(this.galaxyVao);
      gl.drawArrays(gl.POINTS, 0, this.ranges.additiveCount);
      if (this.ranges.dustCount > 0 && f.dust > 0.001) {
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
        gl.uniform1f(p.u.uDustAmount!, f.dust);
        gl.uniform1f(p.u.uDust!, 1);
        gl.drawArrays(gl.POINTS, this.ranges.dustStart, this.ranges.dustCount);
      }
    }
    gl.disable(gl.BLEND);

    // ── Nebula sky at quarter resolution ─────────────────────────────────
    gl.bindVertexArray(this.emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.nebulaTarget.fbo);
    gl.viewport(0, 0, this.nebulaTarget.w, this.nebulaTarget.h);
    const n = this.nebula;
    gl.useProgram(n.prog);
    gl.uniformMatrix4fv(n.u.uInvViewProj!, false, f.invViewProj);
    gl.uniform1f(n.u.uIntensity!, f.nebula);
    gl.uniform1f(n.u.uTime!, f.time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
    gl.uniform1i(n.u.uNoise!, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_3D, null);

    // ── Bloom: progressive down/up sampling ──────────────────────────────
    const d = this.down;
    gl.useProgram(d.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(d.u.uSrc!, 0);
    let src: Target = this.scene;
    this.mips.forEach((mip, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip.fbo);
      gl.viewport(0, 0, mip.w, mip.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(d.u.uTexel!, 1 / src.w, 1 / src.h);
      gl.uniform1f(d.u.uKaris!, i === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = mip;
    });
    const frostSrc = this.mips[1] ?? this.mips[0];
    if (this.frost && frostSrc) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.frost.fbo);
      gl.viewport(0, 0, this.frost.w, this.frost.h);
      gl.bindTexture(gl.TEXTURE_2D, frostSrc.tex);
      gl.uniform2f(d.u.uTexel!, 1 / frostSrc.w, 1 / frostSrc.h);
      gl.uniform1f(d.u.uKaris!, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const u = this.up;
    gl.useProgram(u.prog);
    gl.uniform1i(u.u.uSrc!, 0);
    gl.uniform1f(u.u.uRadius!, 1.0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const dst = this.mips[i]!;
      const from = this.mips[i + 1]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(u.u.uTexel!, 1 / from.w, 1 / from.h);
      gl.uniform1f(u.u.uWeight!, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // ── Composite to the canvas ──────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const c = this.composite;
    gl.useProgram(c.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(c.u.uScene!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mips[0]?.tex ?? this.scene.tex);
    gl.uniform1i(c.u.uBloom!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.nebulaTarget.tex);
    gl.uniform1i(c.u.uNebula!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.mips[Math.min(3, this.mips.length - 1)]?.tex ?? this.scene.tex);
    gl.uniform1i(c.u.uStreakTex!, 3);
    gl.uniform2f(c.u.uResolution!, this.width, this.height);
    gl.uniform1f(c.u.uExposure!, f.exposure);
    // Bloom mips accumulate energy from every level; normalise by depth.
    gl.uniform1f(c.u.uBloomStrength!, f.bloom / Math.max(1, this.mips.length));
    gl.uniform1f(c.u.uVignette!, f.vignette);
    gl.uniform1f(c.u.uGrain!, f.grain);
    gl.uniform1f(c.u.uTime!, f.time);
    gl.uniform1f(c.u.uFlash!, f.flash);
    gl.uniform2f(c.u.uFlashPos!, f.flashPos[0], f.flashPos[1]);
    gl.uniform1f(c.u.uSaturation!, f.saturation);
    gl.uniform1f(c.u.uAberration!, f.aberration);
    gl.uniform1f(c.u.uStreak!, f.streak);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.frost?.tex ?? this.scene.tex);
    gl.uniform1i(c.u.uFrost!, 4);
    gl.uniform2f(c.u.uFrostTexel!, 1 / (this.frost?.w ?? this.width), 1 / (this.frost?.h ?? this.height));
    const g = f.glass;
    gl.uniform1i(c.u.uGlassCount!, g ? Math.min(g.count, MAX_GLASS) : 0);
    if (g && g.count > 0) {
      gl.uniform4fv(c.u.uGlassRect!, g.rects);
      gl.uniform4fv(c.u.uGlassParam!, g.params);
      gl.uniform2f(c.u.uLight!, g.light[0], g.light[1]);
      gl.uniform3f(c.u.uAccent!, g.accent[0], g.accent[1], g.accent[2]);
    }
    gl.uniform1f(c.u.uPx!, f.pixelRatio ?? 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    this.deleteTarget(this.scene);
    this.deleteTarget(this.nebulaTarget);
    this.deleteTarget(this.frost);
    this.mips.forEach((m) => this.deleteTarget(m));
    this.scene = null;
    this.frost = null;
    this.nebulaTarget = null;
    this.mips = [];
    [this.posBuffer, this.attrBuffer, this.skyPosBuffer, this.skyAttrBuffer].forEach((b) => gl.deleteBuffer(b));
    [this.galaxyVao, this.skyVao, this.emptyVao].forEach((v) => gl.deleteVertexArray(v));
    gl.deleteTexture(this.noiseTex);
    [this.particle, this.nebula, this.down, this.up, this.composite].forEach((p) => gl.deleteProgram(p.prog));
  }
}
