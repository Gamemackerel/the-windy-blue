import * as THREE from 'three';
import { Environment, SKY_GLSL, NOISE_GLSL } from './env';
import { waveGLSL, calmZones, MAX_CALM, bumps, MAX_BUMPS, ampScale, steepScale, rogue, sea } from './waves';

const SEG = 320;      // grid resolution
const RADIUS = 4200;  // half-extent of the sea mesh (m)
const LINEAR = 0.014;
export const WAKE_N = 18; // share of the warp that is linear (sets the finest cell size)

export class Ocean {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene, env: Environment) {
    const geo = new THREE.PlaneGeometry(2, 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      ...env.uniforms,
      uCenter: { value: new THREE.Vector2() },
      uCamPos: { value: new THREE.Vector3() },
      uCalm: { value: Array.from({ length: MAX_CALM }, () => new THREE.Vector4(0, 0, -2, -1)) },
      uBump: { value: Array.from({ length: MAX_BUMPS }, () => new THREE.Vector4(0, 0, 0, 1)) },
      uBumpA: { value: new Float32Array(MAX_BUMPS) },
      uAmp: { value: ampScale }, uSteep: { value: steepScale }, uRogue: { value: new THREE.Vector4(0, 1, -1e7, 0) },
      uChop: { value: 1 }, uWhite: { value: 0 },
      uShoal: { value: new THREE.Vector4(0, 0, 1, 0) }, // x, z, lagoon radius, blue-hole radius
      uShoalCol: { value: new THREE.Color('#6f8f96') },
      uWake: { value: Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uShore0: { value: null }, uShore1: { value: null },
      uShoreRect0: { value: new THREE.Vector4(0, 0, 1, 0) }, uShoreRect1: { value: new THREE.Vector4(0, 0, 1, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uCenter;
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vCalm;
        varying vec3 vField;
        ${waveGLSL()}
        const float R = ${RADIUS.toFixed(1)};
        const float A = ${LINEAR.toFixed(4)};
        void main() {
          // dense near the centre, sparse toward the horizon
          vec2 g = position.xz;
          vec2 ag = abs(g);
          vec2 w = sign(g) * (A * ag + (1.0 - A) * ag * ag * ag) * R;
          vec2 dw = (A + (1.0 - A) * 3.0 * ag * ag) * R / ${(SEG / 2).toFixed(1)};
          float cell = max(dw.x, dw.y);
          vec2 rest = uCenter + w;
          vCalm = calmAt(rest);
          vField = seaField(rest, vCalm);
          vec3 d = waveDisp(rest, uTime, cell, vCalm);
          vec3 p = vec3(rest.x + d.x, d.y + vField.x, rest.y + d.z);
          vWorld = p;
          vRest = rest;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec3 uLightDir;
        uniform vec3 uLightCol;
        uniform vec3 uDeep;
        uniform vec3 uScatter;
        uniform vec3 uAmbient;
        uniform float uFogDensity;
        uniform vec4 uShoal;
        uniform vec3 uShoalCol;
        uniform sampler2D uShore0; uniform sampler2D uShore1;
        uniform vec4 uShoreRect0; uniform vec4 uShoreRect1;
        // height of the sea bed near land (metres, -6 = deep or unknown)
        float bedHeight(vec2 p) {
          float h = -6.0;
          vec2 a = (p - uShoreRect0.xy) / uShoreRect0.z + 0.5;
          if (uShoreRect0.w > 0.5 && a.x > 0.0 && a.x < 1.0 && a.y > 0.0 && a.y < 1.0) h = max(h, texture2D(uShore0, a).r * 8.0 - 6.0);
          vec2 b = (p - uShoreRect1.xy) / uShoreRect1.z + 0.5;
          if (uShoreRect1.w > 0.5 && b.x > 0.0 && b.x < 1.0 && b.y > 0.0 && b.y < 1.0) h = max(h, texture2D(uShore1, b).r * 8.0 - 6.0);
          return h;
        }
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vCalm;
        varying vec3 vField;
        uniform float uChop; uniform float uWhite;
        ${SKY_GLSL}
        ${NOISE_GLSL}
        float fbm3(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03 + 17.1) * 0.25 + vnoise(p * 4.1 + 3.7) * 0.25; }
        uniform vec4 uWake[${WAKE_N}];
        ${waveGLSL()}
        void main() {
          vec3 toCam = uCamPos - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;

          float px = max(length(fwidth(vRest)), 0.001);
          float fold; float h;
          vec3 n = waveNormal(vRest, uTime, px, vCalm, fold, h);
          n.xz -= vField.yz; h += vField.x; fold += length(vField.yz) * 0.55;
          n.y = 1.0 - fold;
          // fine structure only where a pixel is small enough to show it
          if (px < 1.6) n.xz += rippleSlope(vRest, uTime, px) * uChop;
          if (px < 1.2) {
            // wind chop from drifting noise, so the surface never settles into stripes
            vec2 q1 = vRest * 0.42 + uTime * vec2(0.11, 0.07);
            float e1 = 0.35, a0 = fbm3(q1);
            vec2 g1 = vec2(fbm3(q1 + vec2(e1, 0.0)) - a0, fbm3(q1 + vec2(0.0, e1)) - a0) / e1;
            n.xz -= g1 * 0.16 * uChop * clamp((2.4 / px - 2.0) / 4.0, 0.0, 1.0);
            if (px < 0.25) {
              vec2 q2 = vRest * 1.9 + uTime * vec2(-0.23, 0.17);
              float e2 = 0.12, b0 = fbm3(q2);
              vec2 g2 = vec2(fbm3(q2 + vec2(e2, 0.0)) - b0, fbm3(q2 + vec2(0.0, e2)) - b0) / e2;
              n.xz -= g2 * 0.07 * uChop * clamp((0.5 / px - 2.0) / 4.0, 0.0, 1.0);
            }
          }
          vec3 N = normalize(n);

          float ndv = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          // unresolved roughness in the distance lowers the effective reflectance
          F *= mix(1.0, 0.72, smoothstep(40.0, 900.0, dist));
          vec3 R = reflect(-V, N);
          // rough water reflects sky from well above the horizon
          R.y = abs(R.y) * 0.75 + 0.22;
          R = normalize(R);
          vec3 refl = skyBase(R);

          // sun / moon glitter
          vec3 H = normalize(V + uLightDir);
          float nh = max(dot(N, H), 0.0);
          float spec = pow(nh, 520.0) * 9.0 + pow(nh, 60.0) * 0.12;
          refl += uLightCol * spec;

          // body colour with light scattering through crests
          float sun = max(dot(N, uLightDir), 0.0);
          float through = pow(max(dot(V, -uLightDir) * 0.5 + 0.5, 0.0), 3.0);
          float crest = smoothstep(-0.2, 1.3, h);
          vec3 body = uDeep * (uAmbient * 2.0 + uLightCol * 0.25 * sun);
          body += uScatter * (crest * (0.22 + through * 1.3) * (uLightCol * 0.5 + uAmbient * 0.6));

          // pale shallows inside the atoll, with the dark eye of the blue hole in the middle
          float sd = distance(vRest, uShoal.xy);
          float shoal = smoothstep(uShoal.z * 1.08, uShoal.z * 0.9, sd) * smoothstep(uShoal.w * 0.85, uShoal.w * 1.35, sd);
          shoal *= 0.75 + 0.25 * fbm(vRest * 0.05);
          body = mix(body, uShoalCol * (uAmbient * 1.5 + uLightCol * 0.35), shoal * 0.8);
          F *= 1.0 - shoal * 0.35;

          // shallows over the sea bed, and a restless line of foam where the water meets land
          float depth = h - bedHeight(vWorld.xz);
          float shallow = smoothstep(3.2, 0.2, depth);
          body = mix(body, mix(uShoalCol, vec3(0.5, 0.48, 0.42), shallow) * (uAmbient * 1.4 + uLightCol * 0.35), shallow * 0.7);
          F *= 1.0 - shallow * 0.5;

          vec3 col = mix(body, refl, F);

          // the boat's wake: churned foam that spreads and fades behind it
          float wake = 0.0;
          if (dist < 160.0) {
            for (int i = 0; i < ${WAKE_N}; i++) {
              float wd = distance(vWorld.xz, uWake[i].xy);
              wake = max(wake, smoothstep(uWake[i].z, uWake[i].z * 0.35, wd) * uWake[i].w);
            }
            if (wake > 0.0) wake *= smoothstep(0.42, 0.72, fbm(vRest * 2.6 - uTime * vec2(0.05, 0.02)) + wake * 0.3) * 0.8;
          }

          float lap = sin(uTime * 0.8 + fbm(vRest * 0.25) * 7.0) * 0.25 + 0.3;
          float wash = smoothstep(lap + 0.75, lap, depth) * smoothstep(0.15, 0.55, fbm(vRest * 2.2 + uTime * vec2(0.07, 0.04)) + smoothstep(0.5, 0.0, depth) * 0.4);
          wash = max(wash, smoothstep(0.22, 0.02, depth));

          // whitecaps: on pinched crests always, and more and more freely as the wind gets up
          float foam = 0.0;
          if (dist < 900.0) {
            float nearF = 1.0 - smoothstep(250.0, 900.0, dist);
            float fn = fbm(vRest * 0.4 + uTime * vec2(0.05, 0.02));
            float thr = 0.42 - 0.2 * uWhite;
            foam = smoothstep(thr, thr + 0.16, fold + (fn - 0.5) * (0.3 + 0.25 * uWhite)) * nearF;
            if (foam > 0.0 && dist < 260.0) foam *= smoothstep(0.25, 0.6, fbm(vRest * 3.1 - uTime * vec2(0.08, 0.03)) + foam * 0.35);
            // spindrift: long streaks of foam lying down the wind in a gale
            foam = max(foam, smoothstep(0.62, 0.8, fbm3(vRest * vec2(0.035, 0.4) + uTime * vec2(0.01, 0.06))) * smoothstep(0.55, 1.0, uWhite) * 0.55 * nearF * vCalm);
            // the breaking crest of a great wave
            foam = max(foam, smoothstep(0.55, 0.95, vField.x / max(uRogue.w, 0.001)) * step(0.5, uRogue.w) * (0.5 + 0.5 * fn));
          }
          vec3 foamCol = vec3(0.86, 0.87, 0.84) * (uAmbient * 1.4 + uLightCol * 0.45 * (0.4 + sun));
          col = mix(col, foamCol, clamp(max(max(foam, wash * 0.9), wake), 0.0, 1.0) * 0.9);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** foam points left behind the boat: x, z, radius, strength */
  get wake() { return this.uniforms.uWake.value as THREE.Vector4[]; }
  private shores = 0;
  /** bake the sea bed around a piece of land so the water can show shallows and surf */
  addShore(cx: number, cz: number, size: number, height: (x: number, z: number) => number) {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = height(cx + ((i + 0.5) / N - 0.5) * size, cz + ((j + 0.5) / N - 0.5) * size);
      data[(j * N + i) * 4] = Math.max(0, Math.min(255, ((h + 6) / 8) * 255));
      data[(j * N + i) * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const k = this.shores++;
    this.uniforms['uShore' + k].value = tex;
    (this.uniforms['uShoreRect' + k].value as THREE.Vector4).set(cx, cz, size, 1);
  }

  setShoal(x: number, z: number, radius: number, hole: number) {
    (this.uniforms.uShoal.value as THREE.Vector4).set(x, z, radius, hole);
  }

  update(focus: THREE.Vector3, camPos: THREE.Vector3) {
    (this.uniforms.uCenter.value as THREE.Vector2).set(focus.x, focus.z);
    (this.uniforms.uCamPos.value as THREE.Vector3).copy(camPos);
    (this.uniforms.uRogue.value as THREE.Vector4).set(rogue.dx, rogue.dz, rogue.off, rogue.amp);
    this.uniforms.uChop.value = sea.chop; this.uniforms.uWhite.value = sea.white;
    const bu = this.uniforms.uBump.value as THREE.Vector4[], ba = this.uniforms.uBumpA.value as Float32Array;
    for (let i = 0; i < MAX_BUMPS; i++) { const b = bumps[i]; bu[i].set(b.x, b.z, b.r, Math.max(b.w, 0.01)); ba[i] = b.a; }
    const calm = this.uniforms.uCalm.value as THREE.Vector4[];
    for (let i = 0; i < MAX_CALM; i++) {
      const k = calmZones[i];
      if (k) calm[i].set(k.x, k.z, k.r0, k.r1); else calm[i].set(0, 0, -2, -1);
    }
  }
}
