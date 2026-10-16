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
  vec3 violet = vec3(0.15, 0.06, 0.3);
  vec3 teal = vec3(0.02, 0.1, 0.17);
  vec3 rose = vec3(0.26, 0.045, 0.13);
  vec3 col = mix(teal, violet, smoothstep(0.4, 0.62, warp)) * clouds;
  col += rose * wisps * clouds * 0.9;
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

export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uNebula;
uniform sampler2D uStreakTex;
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

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * uAberration;
  vec3 col;
  col.r = texture(uScene, uv - off).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv + off).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * uBloomStrength;

  // Anamorphic streak from the wide bloom, stretched horizontally.
  if (uStreak > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = -16; i <= 16; i++) {
      float x = float(i) / 16.0;
      float w = exp(-abs(x) * 3.5);
      s += texture(uStreakTex, uv + vec2(x * 0.22, 0.0)).rgb * w;
    }
    col += s * vec3(0.5, 0.68, 1.0) * uStreak * 0.012;
  }

  col += texture(uNebula, uv).rgb;

  float aspect = uResolution.x / uResolution.y;
  vec2 fd = (uv - uFlashPos) * vec2(aspect, 1.0);
  float fl = dot(fd, fd);
  col += uFlash * (vec3(1.0, 0.88, 0.72) * exp(-fl * 70.0) * 1.6 + vec3(1.0, 0.8, 0.6) * exp(-fl * 16.0) * 0.35 + vec3(0.55, 0.65, 1.0) * exp(-fl * 3.0) * 0.08);

  col *= uExposure;
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  float vig = smoothstep(0.95, 0.18, length(d * vec2(aspect * 0.75, 1.0)));
  col *= mix(1.0, vig, uVignette);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5) * uGrain;
  outColor = vec4(col, 1.0);
}
`;
