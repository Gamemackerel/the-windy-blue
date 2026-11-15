// Time of day, sky, sun/moon and the shared lighting palette.
import * as THREE from 'three';

export const DAY_LENGTH = 20 * 60; // seconds for a full cycle

const C = (hex: string) => new THREE.Color(hex);

// Art-directed palette (sRGB hex, converted to linear by three).
const PAL = {
  day: { zenith: C('#4f6679'), horizon: C('#c4c2b8'), sun: C('#fff0da'), cloudLit: C('#e9e4d8'), cloudDark: C('#6e7780'), deep: C('#0b1a26'), scatter: C('#2a4a5e') },
  dawn: { zenith: C('#333d52'), horizon: C('#d39a72'), sun: C('#ff9d5c'), cloudLit: C('#f0b48a'), cloudDark: C('#4a4654'), deep: C('#0c1a26'), scatter: C('#3a4a5c') },
  dusk: { zenith: C('#2b2c40'), horizon: C('#c0623c'), sun: C('#ff7a3c'), cloudLit: C('#e8875a'), cloudDark: C('#3d3442'), deep: C('#0b1620'), scatter: C('#4a3c48') },
  night: { zenith: C('#060a13'), horizon: C('#161f2d'), sun: C('#9db4d6'), cloudLit: C('#1b2634'), cloudDark: C('#06090e'), deep: C('#050b12'), scatter: C('#0f2434') },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform float uSunGlow;
uniform float uMoonGlow;

// Smooth sky gradient plus sun and moon glow. No discs, stars or clouds, so it
// is cheap enough to use for water reflections and fog.
vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, 1.0 - exp(-h * 3.2));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * uSunGlow * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5 + pow(sd, 3.0) * exp(-h * 7.0) * 0.35);
  float md = max(dot(d, uMoonDir), 0.0);
  c += vec3(0.55, 0.68, 0.9) * uMoonGlow * (pow(md, 24.0) * 0.05 + pow(md, 300.0) * 0.25);
  return c;
}
`;

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; }
  return s;
}
`;

export class Environment {
  /** 0..1, 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset */
  time = 0.36;
  timeScale = 1;
  elapsed = 0;

  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  readonly lightDir = new THREE.Vector3(); // toward the dominant light
  daylight = 1;

  readonly uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: this.sunDir },
    uMoonDir: { value: this.moonDir },
    uLightDir: { value: this.lightDir },
    uLightCol: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() },
    uSunGlow: { value: 1 },
    uMoonGlow: { value: 0 },
    uStars: { value: 0 },
    uCloudLit: { value: new THREE.Color() },
    uCloudDark: { value: new THREE.Color() },
    uCloudCover: { value: 0.5 },
    uDeep: { value: new THREE.Color() },
    uScatter: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() },
    uFogDensity: { value: 0.00075 },
  };

  /** underwater / enclosed override, driven by the laboratory */
  readonly under = { amount: 0, fog: new THREE.Color('#010409'), density: 0.05, ambient: new THREE.Color('#203040'), intensity: 0.3 };

  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x101820, 1);
  readonly sky: THREE.Mesh;
  readonly fog = new THREE.FogExp2(0xffffff, 0.00075);

  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float uTime;
        uniform float uStars;
        uniform vec3 uCloudLit;
        uniform vec3 uCloudDark;
        uniform float uCloudCover;
        ${SKY_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = skyBase(d);

          // stars
          if (uStars > 0.01 && d.y > 0.0) {
            vec3 q = d * 190.0;
            vec3 id = floor(q);
            float h = hash31(id);
            float s = step(0.994, h) * smoothstep(0.42, 0.05, length(fract(q) - 0.5));
            float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
            c += vec3(0.85, 0.9, 1.0) * s * tw * uStars * (0.4 + 4.0 * fract(h * 917.0)) * smoothstep(0.0, 0.25, d.y);
          }
          // sun and moon discs
          float sd = dot(d, uSunDir);
          c += uSunCol * smoothstep(0.99955, 0.99985, sd) * 14.0 * uSunGlow;
          float md = dot(d, uMoonDir);
          c += vec3(0.8, 0.86, 1.0) * smoothstep(0.99975, 0.9999, md) * 2.2 * uMoonGlow;

          // cloud deck
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.14) * 0.75 + uTime * vec2(0.0045, 0.0018);
            float n = fbm(uv);
            float lo = 0.78 - uCloudCover * 0.55;
            float dens = smoothstep(lo, lo + 0.3, n);
            float n2 = fbm(uv + normalize(uSunDir.xz + vec2(0.0001)) * 0.12);
            float lit = clamp(0.5 + (n - n2) * 3.5, 0.0, 1.0);
            float towardSun = pow(max(dot(d, uSunDir), 0.0), 4.0);
            vec3 cc = mix(uCloudDark, uCloudLit, lit * 0.8 + towardSun * 0.5);
            cc += uSunCol * uSunGlow * towardSun * (1.0 - dens) * 0.6;
            dens *= smoothstep(0.0, 0.16, d.y);
            c = mix(c, cc, dens * 0.9);
          }
          // soft haze band at the horizon so sea and sky meet
          c = mix(c, uHorizon, exp(-max(d.y, 0.0) * 26.0) * 0.85);
          if (d.y < 0.0) c = uHorizon;

          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.sky.scale.setScalar(9000);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    this.update(0, new THREE.Vector3(), new THREE.Vector3());
  }

  update(dt: number, camPos: THREE.Vector3, focus: THREE.Vector3) {
    this.elapsed += dt;
    this.time = (this.time + (dt * this.timeScale) / DAY_LENGTH) % 1;
    const u = this.uniforms;
    u.uTime.value = this.elapsed;

    const th = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.92, Math.cos(th) * 0.42 - 0.25).normalize();
    this.moonDir.set(-Math.cos(th) * 0.8, -Math.sin(th) * 0.85 + 0.12, 0.45).normalize();

    const sy = this.sunDir.y;
    const day = THREE.MathUtils.smoothstep(sy, -0.06, 0.32);
    const tw = Math.exp(-Math.pow((sy - 0.02) / 0.17, 2));
    const night = 1 - THREE.MathUtils.smoothstep(sy, -0.22, 0.02);
    const twPal = this.sunDir.x > 0 ? PAL.dawn : PAL.dusk;
    this.daylight = day;

    const mix3 = (out: THREE.Color, key: keyof typeof PAL.day) => {
      out.copy(PAL.night[key]).lerp(PAL.day[key], day).lerp(twPal[key], tw * 0.85);
    };
    mix3(u.uZenith.value, 'zenith');
    mix3(u.uHorizon.value, 'horizon');
    mix3(u.uSunCol.value, 'sun');
    mix3(u.uCloudLit.value, 'cloudLit');
    mix3(u.uCloudDark.value, 'cloudDark');
    mix3(u.uDeep.value, 'deep');
    mix3(u.uScatter.value, 'scatter');

    u.uSunGlow.value = THREE.MathUtils.smoothstep(sy, -0.12, 0.05);
    const moonUp = THREE.MathUtils.smoothstep(this.moonDir.y, -0.05, 0.15);
    u.uMoonGlow.value = night * moonUp;
    u.uStars.value = night;

    // dominant light: sun by day, moon by night
    const useSun = sy > -0.04;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    if (this.lightDir.y < 0.06) { this.lightDir.y = 0.06; this.lightDir.normalize(); }
    const sunI = THREE.MathUtils.smoothstep(sy, -0.04, 0.25) * 2.6 + tw * 0.5;
    const moonI = 0.2 + 0.5 * moonUp;
    const lc = u.uLightCol.value;
    if (useSun) lc.copy(u.uSunCol.value).multiplyScalar(Math.max(sunI, 0.02));
    else lc.set(0.55, 0.68, 0.9).multiplyScalar(moonI);

    u.uAmbient.value.copy(u.uZenith.value).lerp(u.uHorizon.value, 0.5).multiplyScalar(0.9 + night * 1.2);

    this.sun.color.copy(lc);
    this.sun.intensity = 1;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 40);
    this.hemi.color.copy(u.uZenith.value).lerp(u.uHorizon.value, 0.6);
    this.hemi.groundColor.copy(u.uDeep.value).lerp(u.uHorizon.value, 0.25);
    this.hemi.intensity = 1.6 + night * 5.0;

    this.fog.color.copy(u.uHorizon.value);
    this.fog.density = u.uFogDensity.value;
    this.sky.position.copy(camPos);

    const un = this.under;
    if (un.amount > 0.001) {
      const k = un.amount;
      this.sun.color.multiplyScalar(1 - k);
      this.hemi.color.lerp(un.ambient, k);
      this.hemi.groundColor.lerp(un.ambient, k).multiplyScalar(1 - 0.5 * k);
      this.hemi.intensity += (un.intensity - this.hemi.intensity) * k;
      this.fog.color.lerp(un.fog, k);
      this.fog.density += (un.density - this.fog.density) * k;
    }
  }
}
