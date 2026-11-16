// Time of day, sky, sun/moon and the shared lighting palette.
import * as THREE from 'three';

export const DAY_LENGTH = 20 * 60; // seconds for a full cycle
const LATITUDE = 0.6, SIN_LAT = Math.sin(LATITUDE), COS_LAT = Math.cos(LATITUDE);   // about 34 degrees north
const SUN_DECL = 0.2;      // late spring: days a little longer than nights
const MOON_DAYS = 8;       // days from one new moon to the next
const _rot = new THREE.Matrix4(), _pole = new THREE.Vector3(0, SIN_LAT, -COS_LAT), _grey = new THREE.Color(), _snap = new THREE.Vector3();

const C = (hex: string) => new THREE.Color(hex);

// Art-directed palette (sRGB hex, converted to linear by three).
const PAL = {
  day: { zenith: C('#3a5672'), horizon: C('#b4bbbb'), sun: C('#fff1dc'), cloudLit: C('#f1ece0'), cloudDark: C('#55626e'), deep: C('#0b1a26'), scatter: C('#2a4a5e') },
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

export interface AtmosphereState {
  fog: THREE.Color; sun: THREE.Color; sunDir: THREE.Vector3; density: number; height: number;
  glow: number; rays: number; daylight: number; enclosed: number;
}

export class Environment {
  /** what the image pipeline needs to draw the air */
  readonly air: AtmosphereState = { fog: new THREE.Color(), sun: new THREE.Color(), sunDir: new THREE.Vector3(), density: 0.0007, height: 170, glow: 1, rays: 0, daylight: 1, enclosed: 0 };
  /** 0..1, 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset */
  time = 0.36;
  timeScale = 1;
  elapsed = 0;

  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  readonly lightDir = new THREE.Vector3(); // toward the dominant light
  daylight = 1;
  /** days since the game began, as a continuous number (drives the moon) */
  days = 0;
  /** how much of the moon's face is lit, 0..1 */
  moonLit = 0.5;
  private frame = 0;
  /** 0 fair weather, 1 the worst storm: set by the weather */
  gloom = 0;

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
    uMoonVis: { value: 0 },
    uSkyRot: { value: new THREE.Matrix3() },
    uCloudLit: { value: new THREE.Color() },
    uCloudDark: { value: new THREE.Color() },
    uCloudCover: { value: 0.44 },
    uDeep: { value: new THREE.Color() },
    uScatter: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() },
    uFogDensity: { value: 0.0007 },
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
        uniform float uMoonVis;
        uniform mat3 uSkyRot;
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
            vec3 q = (uSkyRot * d) * 190.0;
            vec3 id = floor(q);
            float h = hash31(id);
            float s = step(0.994, h) * smoothstep(0.42, 0.05, length(fract(q) - 0.5));
            float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
            c += vec3(0.85, 0.9, 1.0) * s * tw * uStars * (0.4 + 4.0 * fract(h * 917.0)) * smoothstep(0.0, 0.25, d.y);
          }
          // sun and moon discs
          float sd = dot(d, uSunDir);
          c += uSunCol * smoothstep(0.99955, 0.99985, sd) * 14.0 * uSunGlow;
          // the moon: a sphere lit from wherever the sun is, so it shows its true phase
          if (uMoonVis > 0.01 && dot(d, uMoonDir) > 0.9993) {
            vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir)), mu = cross(uMoonDir, mr);
            vec2 mq = vec2(dot(d, mr), dot(d, mu)) / 0.034;
            float r2 = dot(mq, mq);
            if (r2 < 1.0) {
              vec3 mn = mr * mq.x + mu * mq.y - uMoonDir * sqrt(1.0 - r2);
              float lit = smoothstep(-0.06, 0.14, dot(mn, uSunDir));
              float mare = 0.72 + 0.28 * fbm(mq * 2.4 + 3.0);
              c = mix(c, vec3(0.86, 0.9, 1.0) * (0.03 + lit * 2.4) * mare, smoothstep(1.0, 0.9, r2) * uMoonVis);
            }
          }

          // clouds: a broken low deck with lit tops and dark bases, and high streaks above it
          if (d.y > 0.0) {
            vec2 sunXZ = normalize(uSunDir.xz + vec2(0.0001));
            float towardSun = pow(max(dot(d, uSunDir), 0.0), 5.0);
            // high cirrus, stretched along the wind
            vec2 cu = d.xz / (d.y + 0.3) * vec2(0.5, 2.2) + uTime * vec2(0.0012, 0.0004);
            float cir = smoothstep(0.52, 0.85, fbm(cu)) * smoothstep(0.05, 0.4, d.y) * 0.5;
            c = mix(c, mix(uCloudLit, uSunCol, 0.3) * (0.75 + towardSun * 1.2), cir * 0.55);

            vec2 uv = d.xz / (d.y + 0.14) * 0.75 + uTime * vec2(0.0045, 0.0018);
            float n = fbm(uv) * 0.75 + fbm(uv * 3.1 + 5.0) * 0.25;
            float lo = 0.78 - uCloudCover * 0.55;
            float dens = smoothstep(lo, lo + 0.26, n);
            // how much cloud lies between this point and the sun
            float sh1 = fbm(uv + sunXZ * 0.07) * 0.75 + fbm((uv + sunXZ * 0.07) * 3.1 + 5.0) * 0.25;
            float sh2 = fbm(uv + sunXZ * 0.2);
            float shade = clamp((sh1 - n) * 4.0 + (sh2 - n) * 2.0, -1.0, 1.0);
            float lit = clamp(0.55 - shade * 0.9, 0.0, 1.0);
            float edge = (1.0 - dens) * dens * 4.0;                       // thin edges glow
            vec3 cc = mix(uCloudDark, uCloudLit, lit);
            cc += uSunCol * uSunGlow * (edge * (0.25 + towardSun * 2.2) + towardSun * 0.35);
            cc *= 0.82 + 0.3 * smoothstep(0.0, 0.5, d.y);
            dens *= smoothstep(0.0, 0.16, d.y);
            c = mix(c, cc, dens * 0.93);
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
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.update(0, new THREE.Vector3(), new THREE.Vector3());
  }

  update(dt: number, camPos: THREE.Vector3, focus: THREE.Vector3) {
    this.elapsed += dt;
    this.time = (this.time + (dt * this.timeScale) / DAY_LENGTH) % 1;
    const u = this.uniforms;
    u.uTime.value = this.elapsed;

    // ---- where the sun and moon are: a turning planet, seen from one latitude
    this.days += (dt * this.timeScale) / DAY_LENGTH;
    const H = (this.time - 0.5) * Math.PI * 2;                 // hour angle of the sun
    const place = (out: THREE.Vector3, h: number, decl: number) => {
      const cd = Math.cos(decl), sd = Math.sin(decl), ch = Math.cos(h);
      return out.set(-cd * Math.sin(h), SIN_LAT * sd + COS_LAT * cd * ch, -(COS_LAT * sd - SIN_LAT * cd * ch));
    };
    place(this.sunDir, H, SUN_DECL);
    // the moon falls a little further behind the sun each day, which is what gives it phases
    const phase = (((this.days / MOON_DAYS + 0.44) % 1) + 1) % 1;      // 0 new, 0.5 full
    place(this.moonDir, H - phase * Math.PI * 2, 0.3 * Math.sin(phase * 6.7 + 1));
    this.moonLit = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    // the stars turn about the pole once a day
    _rot.makeRotationAxis(_pole, -H - this.days * 0.0172);
    (u.uSkyRot.value as THREE.Matrix3).setFromMatrix4(_rot);

    const sy = this.sunDir.y, S = THREE.MathUtils.smoothstep;
    const day = S(sy, -0.06, 0.32);
    const tw = Math.exp(-Math.pow((sy - 0.02) / 0.17, 2));
    const night = 1 - S(sy, -0.22, 0.02);
    const twPal = this.sunDir.x > 0 ? PAL.dawn : PAL.dusk;
    const gloom = this.gloom;
    this.daylight = day * (1 - gloom * 0.45);

    const mix3 = (out: THREE.Color, key: keyof typeof PAL.day) => {
      out.copy(PAL.night[key]).lerp(PAL.day[key], day).lerp(twPal[key], tw * 0.85 * (1 - gloom * 0.7));
    };
    mix3(u.uZenith.value, 'zenith');
    mix3(u.uHorizon.value, 'horizon');
    mix3(u.uSunCol.value, 'sun');
    mix3(u.uCloudLit.value, 'cloudLit');
    mix3(u.uCloudDark.value, 'cloudDark');
    mix3(u.uDeep.value, 'deep');
    mix3(u.uScatter.value, 'scatter');
    // heavy weather: a lid of dark cloud, a dim flat light, a leaden sea
    if (gloom > 0.001) {
      _grey.copy(u.uCloudDark.value).multiplyScalar(0.8);
      u.uZenith.value.lerp(_grey, gloom * 0.85);
      u.uHorizon.value.lerp(_grey, gloom * 0.55).multiplyScalar(1 - gloom * 0.25);
      u.uCloudLit.value.lerp(_grey, gloom * 0.75);
      u.uCloudDark.value.multiplyScalar(1 - gloom * 0.45);
      u.uScatter.value.multiplyScalar(1 - gloom * 0.5);
    }
    u.uCloudCover.value = 0.4 + gloom * 0.62;

    const moonUp = S(this.moonDir.y, -0.04, 0.12);
    u.uSunGlow.value = S(sy, -0.12, 0.05) * (1 - gloom * 0.8);
    u.uMoonGlow.value = night * moonUp * (0.12 + 0.88 * this.moonLit) * (1 - gloom * 0.8);
    u.uMoonVis.value = moonUp * (0.3 + 0.7 * night) * (1 - gloom);
    u.uStars.value = night * (1 - 0.45 * this.moonLit * moonUp) * (1 - gloom);

    // One light does for both. Each fades to nothing before the other takes over, so nothing ever pops:
    // the sun is gone by the time it is 7 degrees under; the moon only begins to count once it is properly dark.
    const sunI = (S(sy, -0.06, 0.25) * 5.2 + tw * 0.9 * S(sy, -0.12, -0.02)) * (1 - gloom * 0.72);
    const moonI = (0.1 + 1.0 * this.moonLit) * moonUp * (1 - S(sy, -0.22, -0.1)) * (1 - gloom * 0.8);
    const useSun = sunI >= moonI;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    if (this.lightDir.y < 0.06) { this.lightDir.y = 0.06; this.lightDir.normalize(); }
    const lc = u.uLightCol.value;
    if (useSun) lc.copy(u.uSunCol.value).multiplyScalar(sunI);
    else lc.set(0.55, 0.68, 0.9).multiplyScalar(moonI);

    // night is never pitch black (starlight), and a bright moon lifts it further
    const nightLift = night * (0.55 + 1.3 * this.moonLit * moonUp) * (1 - gloom * 0.4);
    u.uAmbient.value.copy(u.uZenith.value).lerp(u.uHorizon.value, 0.5).multiplyScalar(0.9 + nightLift);

    this.sun.color.copy(lc);
    this.sun.intensity = 1;
    // The shadow map follows the player in 3 m steps and is redrawn every other frame (and whenever it steps),
    // which halves its cost without the shadows visibly lagging.
    _snap.set(Math.round(focus.x / 3) * 3, Math.round(focus.y / 3) * 3, Math.round(focus.z / 3) * 3);
    const stepped = !_snap.equals(this.sun.target.position);
    this.sun.target.position.copy(_snap);
    this.sun.position.copy(_snap).addScaledVector(this.lightDir, 130);
    this.sun.shadow.autoUpdate = false;
    if (stepped || (this.frame++ & 1) === 0) this.sun.shadow.needsUpdate = true;
    this.hemi.color.copy(u.uZenith.value).lerp(u.uHorizon.value, 0.6);
    this.hemi.groundColor.copy(u.uDeep.value).lerp(u.uHorizon.value, 0.25);
    this.hemi.intensity = 0.8 + nightLift * 2.4 + gloom * 0.5;

    this.fog.color.copy(u.uHorizon.value);
    this.fog.density = u.uFogDensity.value;
    this.sky.position.copy(camPos);

    // air
    const a = this.air;
    a.fog.copy(u.uHorizon.value).multiplyScalar(0.92);
    a.sunDir.copy(this.lightDir);
    a.sun.copy(useSun ? u.uSunCol.value : lc).multiplyScalar(useSun ? 1 : 2.5);
    a.glow = useSun ? u.uSunGlow.value * Math.min(1, sunI / 0.5) : 0.5 * moonUp * this.moonLit * Math.min(1, moonI / 0.3);
    a.rays = useSun ? (0.28 + tw * 0.5) * u.uSunGlow.value * Math.min(1, sunI / 0.6) : 0.1 * moonUp * this.moonLit * Math.min(1, moonI / 0.3);
    a.density = u.uFogDensity.value * (1 + tw * 0.5 + night * 0.2 + gloom * 2.2);
    a.height = 170;
    a.daylight = day;
    a.enclosed = this.under.amount;

    const un = this.under;
    if (un.amount > 0.001) {
      a.fog.lerp(un.fog, un.amount);
      a.density += (un.density - a.density) * un.amount;
      a.height += (1e6 - a.height) * un.amount;
      a.glow *= 1 - un.amount; a.rays *= 1 - un.amount;
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
