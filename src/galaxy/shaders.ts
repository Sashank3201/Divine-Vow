/** GLSL ES 3.00 sources for the galaxy renderer. */

export const PARTICLE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor; // rgb, intensity
layout(location = 2) in vec4 aMeta;  // size, birth, life, type

uniform mat4 uViewProj;
uniform mat4 uView;
uniform float uFocal;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uSimTime;
uniform float uTime;
uniform float uBurst;
uniform float uFade;
uniform float uDust;
uniform float uYouth;
uniform float uDustAmount;

out vec3 vColor;
flat out float vType;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  vec4 viewPos = uView * vec4(aPos, 1.0);
  float depth = -viewPos.z;
  gl_Position = uViewProj * vec4(aPos, 1.0);
  float type = aMeta.w;
  vType = type;

  if (depth < 0.05) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    return;
  }

  float px = aMeta.x * uFocal / depth;
  float size = clamp(px, uMinSize, uMaxSize);
  // Flux conservation: a sprite drawn bigger than its true size gets dimmer.
  float flux = (px * px) / (size * size);
  float intensity = aColor.a;

  // Particles with a birth time (starburst, reborn disk) fade in; the
  // progenitors' young stars and dust fade out after the merger instead.
  bool born = aMeta.y > -1.0e5;
  float env = 1.0;
  if (born) {
    float age = uSimTime - aMeta.y;
    env = smoothstep(0.0, 0.9, age) * (1.0 - smoothstep(aMeta.z * 0.45, aMeta.z, age));
  }
  if (uDust > 0.5) {
    intensity *= min(flux, 1.0) * (born ? env : uDustAmount);
  } else {
    intensity *= min(flux, 4.0);
    float h = hash11(float(gl_VertexID));
    if (type < 0.5 || (type > 5.5 && type < 6.5)) {
      // Gentle scintillation on point-like stars.
      intensity *= 0.86 + 0.14 * sin(uTime * (1.3 + h * 2.7) + h * 40.0);
    }
    if (type > 0.5 && type < 2.5) {
      // Young stars and HII regions flare up when gas is compressed,
      // and fade once the merger has used up the gas.
      intensity *= (1.0 + uBurst * (type > 1.5 ? 2.2 : 1.1)) * (born ? 1.0 : uYouth);
    }
    intensity *= env;
  }

  gl_PointSize = size;
  vColor = aColor.rgb * intensity * uFade;
}
`;

export const PARTICLE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColor;
flat in float vType;
uniform float uDust;
out vec4 outColor;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  if (uDust > 0.5) {
    float f = exp(-r2 * 3.0) * (1.0 - r2);
    outColor = vec4(min(vColor * f, vec3(0.92)), 1.0);
    return;
  }
  float soft = (vType > 1.5 && vType < 4.5) || vType > 7.5 ? 1.0 : 0.0;
  float f = soft > 0.5 ? exp(-r2 * 3.2) * (1.0 - r2) : exp(-r2 * 7.0) + 0.06 * exp(-r2 * 1.5) * (1.0 - r2);
  outColor = vec4(vColor * f, 1.0);
}
`;

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const NEBULA_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform float uIntensity;
uniform float uTime;
out vec4 outColor;

uniform highp sampler3D uNoise;

// Value noise from a pre-smoothed, tiling 64³ texture: hardware trilinear
// filtering is fast on every GPU and immune to driver precision quirks.
float vnoise(vec3 p) {
  return texture(uNoise, p * 0.0625 + 0.5).r;
}

float fbm(vec3 p) {
  float v = 0.5 * vnoise(p);
  v += 0.25 * vnoise(p * 2.03 + vec3(0.31, 0.77, 0.53));
  v += 0.125 * vnoise(p * 4.07 + vec3(0.13, 0.41, 0.91));
  v += 0.0625 * vnoise(p * 8.11 + vec3(0.67, 0.23, 0.19));
  v += 0.03125 * vnoise(p * 16.3 + vec3(0.43, 0.59, 0.71));
  return v / 0.96875;
}

void main() {
  // Unproject two points close to the camera: the far plane loses precision in float32.
  vec4 a = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vUv * 2.0 - 1.0, 0.5, 1.0);
  vec3 dir = normalize(b.xyz / b.w - a.xyz / a.w);
  vec3 p = dir * 1.4 + vec3(0.0, 0.0, uTime * 0.002);
  float warp = fbm(p * 1.7);
  float n = fbm(p * 2.6 + (warp - 0.5) * 3.0);
  float m = fbm(p * 5.2 - (warp - 0.5) * 2.0);
  float clouds = smoothstep(0.5, 0.78, n);
  clouds *= clouds;
  float wisps = smoothstep(0.52, 0.72, m);
  // Neutral, cool interstellar haze: no purple, no pink.
  vec3 deep = vec3(0.035, 0.055, 0.11);
  vec3 teal = vec3(0.015, 0.06, 0.09);
  vec3 grey = vec3(0.06, 0.065, 0.08);
  vec3 col = mix(teal, deep, smoothstep(0.4, 0.62, warp)) * clouds;
  col += grey * wisps * clouds * 0.6;
  // Dark dust lanes inside the clouds give them texture.
  col *= 0.35 + smoothstep(0.4, 0.62, m) * 0.9;
  // Faint diffuse band across the sky for depth.
  float band = exp(-pow(dot(dir, normalize(vec3(0.25, 1.0, -0.35))) * 3.0, 2.0));
  col += vec3(0.03, 0.028, 0.05) * band * (0.5 + 0.5 * n);
  outColor = vec4(col * uIntensity, 1.0);
}
`;

/** 13-tap downsample (Jimenez, "Next Generation Post Processing in Call of Duty: AW"). */
export const DOWNSAMPLE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uKaris;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 c) { return c / (1.0 + luma(c)); }

void main() {
  vec2 t = uTexel;
  vec3 a = texture(uSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture(uSrc, vUv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture(uSrc, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture(uSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture(uSrc, vUv).rgb;
  vec3 f = texture(uSrc, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture(uSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uSrc, vUv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture(uSrc, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture(uSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture(uSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture(uSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 col;
  if (uKaris > 0.5) {
    // Karis average per group kills fireflies from single bright stars.
    vec3 g0 = (j + k + l + m) * 0.25;
    vec3 g1 = (a + b + d + e) * 0.25;
    vec3 g2 = (b + c + e + f) * 0.25;
    vec3 g3 = (d + e + g + h) * 0.25;
    vec3 g4 = (e + f + h + i) * 0.25;
    float w0 = 0.5 / (1.0 + luma(g0));
    float w1 = 0.125 / (1.0 + luma(g1));
    float w2 = 0.125 / (1.0 + luma(g2));
    float w3 = 0.125 / (1.0 + luma(g3));
    float w4 = 0.125 / (1.0 + luma(g4));
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

/** 3×3 tent upsample, blended additively into the next mip. */
export const UPSAMPLE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;
out vec4 outColor;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 col = texture(uSrc, vUv).rgb * 4.0;
  col += (texture(uSrc, vUv + vec2(0.0, t.y)).rgb + texture(uSrc, vUv - vec2(0.0, t.y)).rgb
        + texture(uSrc, vUv + vec2(t.x, 0.0)).rgb + texture(uSrc, vUv - vec2(t.x, 0.0)).rgb) * 2.0;
  col += texture(uSrc, vUv + t).rgb + texture(uSrc, vUv - t).rgb
       + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb + texture(uSrc, vUv + vec2(-t.x, t.y)).rgb;
  outColor = vec4(col * (uWeight / 16.0), 1.0);
}
`;

export const MAX_GLASS = 16;

/**
 * Final composite: tone-mapped galaxy + liquid glass.
 *
 * Glass panels are rounded rectangles tracked from the DOM. Inside each one
 * the galaxy is refracted (a convex bevel bends light most at the rim),
 * split into colour fringes, frosted with a blurred copy of the scene,
 * tinted, and lit by a moving specular highlight. Outside, panels cast a
 * soft contact shadow.
 */
export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
#define MAX_GLASS ${MAX_GLASS}
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uNebula;
uniform sampler2D uStreakTex;
uniform sampler2D uFrost;
uniform vec2 uFrostTexel;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uFlash;
uniform vec2 uFlashPos;
uniform float uSaturation;
uniform float uAberration;
uniform float uStreak;
uniform vec4 uGlassRect[MAX_GLASS];
uniform vec4 uGlassParam[MAX_GLASS];
uniform int uGlassCount;
uniform vec2 uLight;
uniform vec3 uAccent;
uniform float uPx;
out vec4 outColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 flashAt(vec2 uv) {
  float aspect = uResolution.x / uResolution.y;
  vec2 fd = (uv - uFlashPos) * vec2(aspect, 1.0);
  float fl = dot(fd, fd);
  return uFlash * (vec3(1.0, 0.9, 0.78) * exp(-fl * 70.0) * 1.6 + vec3(1.0, 0.85, 0.7) * exp(-fl * 16.0) * 0.35 + vec3(0.6, 0.72, 1.0) * exp(-fl * 3.0) * 0.08);
}

vec3 grade(vec3 hdr) {
  vec3 c = aces(hdr * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  return pow(c, vec3(1.0 / 2.2));
}

vec3 hdrAt(vec2 uv) {
  return texture(uScene, uv).rgb + texture(uBloom, uv).rgb * uBloomStrength + texture(uNebula, uv).rgb + flashAt(uv);
}

vec3 frostAt(vec2 uv) {
  vec2 t = uFrostTexel * 1.5;
  vec3 f = texture(uFrost, uv).rgb * 0.4
    + (texture(uFrost, uv + vec2(t.x, t.y)).rgb + texture(uFrost, uv + vec2(-t.x, t.y)).rgb
     + texture(uFrost, uv + vec2(t.x, -t.y)).rgb + texture(uFrost, uv + vec2(-t.x, -t.y)).rgb) * 0.15;
  return f + texture(uBloom, uv).rgb * uBloomStrength * 0.9 + texture(uNebula, uv).rgb + flashAt(uv);
}

float sdBox(vec2 p, vec2 h, float r, out vec2 n) {
  vec2 q = abs(p) - h + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  vec2 s = vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  if (q.x > 0.0 && q.y > 0.0) n = normalize(q) * s;
  else n = q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  vec2 off = dc * r2 * uAberration;
  vec3 hdr;
  hdr.r = texture(uScene, uv - off).r;
  hdr.g = texture(uScene, uv).g;
  hdr.b = texture(uScene, uv + off).b;
  hdr += texture(uBloom, uv).rgb * uBloomStrength;
  if (uStreak > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = -16; i <= 16; i++) {
      float x = float(i) / 16.0;
      s += texture(uStreakTex, uv + vec2(x * 0.22, 0.0)).rgb * exp(-abs(x) * 3.5);
    }
    hdr += s * vec3(0.55, 0.72, 1.0) * uStreak * 0.012;
  }
  hdr += texture(uNebula, uv).rgb + flashAt(uv);
  vec3 col = grade(hdr);

  // ── Liquid glass ──────────────────────────────────────────────────────
  vec2 px = gl_FragCoord.xy;
  float shadow = 0.0;
  int hit = -1;
  float hitD = 0.0;
  vec2 hitN = vec2(0.0);
  vec2 hitP = vec2(0.0);
  vec2 hitH = vec2(0.0);
  float hitR = 0.0;
  for (int i = 0; i < MAX_GLASS; i++) {
    if (i >= uGlassCount) break;
    vec4 R = uGlassRect[i];
    vec4 P = uGlassParam[i];
    vec2 h = R.zw * 0.5;
    vec2 p = px - (R.xy + h);
    if (abs(p.x) > h.x + 70.0 * uPx || abs(p.y) > h.y + 70.0 * uPx) continue;
    float r = min(P.x, min(h.x, h.y));
    vec2 n;
    float d = sdBox(p, h, r, n);
    // Soft contact shadow, offset downward.
    vec2 ns;
    float ds = sdBox(p + vec2(0.0, 10.0 * uPx), h, r, ns);
    shadow = max(shadow, P.y * 0.42 * exp(-max(ds, 0.0) / (26.0 * uPx)) * (ds > -2.0 ? 1.0 : 0.0));
    if (d < 1.0) {
      hit = i;
      hitD = d;
      hitN = n;
      hitP = p;
      hitH = h;
      hitR = r;
    }
  }
  col *= 1.0 - shadow;
  // Vignette the sky only; glass panes keep their own, even tone.
  float aspect = uResolution.x / uResolution.y;
  float vig = smoothstep(0.95, 0.18, length(dc * vec2(aspect * 0.75, 1.0)));
  col *= mix(1.0, vig, uVignette);

  if (hit >= 0) {
    vec4 R = uGlassRect[hit];
    vec4 P = uGlassParam[hit];
    float kind = P.z;
    float press = P.w;
    float depth = -hitD;
    // kind: 0 sheet · 1 control · 2 clear · 3 accent
    float frost = kind < 0.5 ? 0.9 : kind < 1.5 ? 0.62 : kind < 2.5 ? 0.18 : 0.55;
    float darken = kind < 0.5 ? 0.5 : kind < 1.5 ? 0.3 : kind < 2.5 ? 0.08 : 0.2;
    float refract = kind < 0.5 ? 0.55 : kind < 2.5 ? 1.0 : 0.8;
    float bevel = clamp(min(hitR * 0.9 + 6.0 * uPx, min(hitH.x, hitH.y) * 0.75), 4.0 * uPx, 36.0 * uPx);
    float t = clamp(1.0 - depth / bevel, 0.0, 1.0);
    float lens = t * t * (3.0 - 2.0 * t);
    // Gentle magnification across the whole pane, strong bending at the rim.
    vec2 center = R.xy + hitH;
    vec2 mag = (px - center) * 0.035 * refract;
    vec2 shift = hitN * lens * bevel * 0.9 * refract;
    vec3 sharp;
    sharp.r = grade(hdrAt((px - mag - shift * 1.0) / uResolution)).r;
    sharp.g = grade(hdrAt((px - mag - shift * 1.12) / uResolution)).g;
    sharp.b = grade(hdrAt((px - mag - shift * 1.24) / uResolution)).b;
    vec3 frosted = grade(frostAt((px - mag - shift * 1.1) / uResolution));
    vec3 g = mix(sharp, frosted, frost);
    g *= 1.0 - darken;
    g += vec3(0.022);
    if (kind > 2.5) g = mix(g, uAccent * 1.04, 0.9);
    // Specular: a crisp rim lit from the light direction, a softer one opposite.
    float lit = max(dot(hitN, uLight), 0.0);
    float back = max(dot(hitN, -uLight), 0.0);
    float rim = exp(-pow((depth - 0.9 * uPx) / (1.15 * uPx), 2.0));
    g += vec3(rim * (0.18 + 0.7 * lit + 0.28 * back));
    g += vec3(exp(-depth / (12.0 * uPx)) * (lit * 0.09 + back * 0.03));
    // Faint sheen falling from the top edge.
    float fromTop = (R.y + R.w) - px.y;
    g += vec3(0.045) * exp(-fromTop / (48.0 * uPx));
    g += vec3(0.06) * press;
    float aa = clamp(0.5 - hitD / uPx, 0.0, 1.0);
    col = mix(col, g, P.y * aa);
  }

  col += (hash12(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5) * uGrain;
  outColor = vec4(col, 1.0);
}
`;
