// The image pipeline. The scene is drawn once in linear HDR with depth, then:
//   ambient occlusion  - contact darkening from the depth buffer
//   atmosphere         - distance and height haze that glows toward the sun
//   light shafts       - the sun (or moon) streaming past whatever blocks it
//   bloom              - bright things bleed
//   grade              - tone mapping, a little contrast, vignette and grain
import * as THREE from 'three';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DEPTH = /* glsl */ `
uniform sampler2D tDepth; uniform mat4 uProjInv;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}`;

export interface Atmosphere {
  fog: THREE.Color; sun: THREE.Color; sunDir: THREE.Vector3; density: number; height: number;
  glow: number; rays: number; daylight: number; enclosed: number;
}

export class Post {
  ao = true; rays = true; bloom = true;
  private samples = 4;
  private sceneRT!: THREE.WebGLRenderTarget;
  private half: THREE.WebGLRenderTarget[] = [];
  private quarter: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fs = new THREE.Scene();
  private mAO: THREE.ShaderMaterial; private mBlur: THREE.ShaderMaterial; private mBright: THREE.ShaderMaterial;
  private mRays: THREE.ShaderMaterial; private mFinal: THREE.ShaderMaterial;
  private w = 4; private h = 4;
  private white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private _v = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.white.needsUpdate = this.black.needsUpdate = true;
    const mk = (uniforms: Record<string, THREE.IUniform>, frag: string, toneMapped = false) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped });

    this.mAO = mk({ tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() } }, /* glsl */ `
      varying vec2 vUv; uniform mat4 uProj;
      ${DEPTH}
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec3 p = viewPos(vUv);
        float dist = -p.z;
        if (dist > 260.0) { gl_FragColor = vec4(1.0); return; }
        vec3 n = normalize(cross(dFdx(p), dFdy(p)));
        vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 b = cross(n, t);
        float rnd = hash(gl_FragCoord.xy) * 6.2832;
        // wider reach far away so buildings and cliffs still sit in the scene
        float radius = clamp(dist * 0.06, 0.35, 2.2);
        float occ = 0.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = rnd + fi * 2.39996;
          float r = radius * sqrt((fi + 0.5) / 12.0);
          vec3 s = p + (t * cos(a) + b * sin(a)) * r + n * (0.04 + r * 0.45 * fract(rnd * 7.0 + fi * 0.618));
          vec4 q = uProj * vec4(s, 1.0);
          vec2 suv = q.xy / q.w * 0.5 + 0.5;
          float sz = viewPos(suv).z;
          float diff = sz - s.z;                       // positive when something is in front of the sample
          occ += step(0.03, diff) * smoothstep(1.0, 0.0, diff / (radius * 2.0));
        }
        float ao = 1.0 - occ / 12.0;
        gl_FragColor = vec4(vec3(mix(1.0, ao, smoothstep(260.0, 120.0, dist))), 1.0);
      }`);

    this.mBlur = mk({ tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
        c += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.07;
        gl_FragColor = vec4(c, 1.0);
      }`);

    this.mBright = mk({ tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } }, /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          vec2 o = vec2(i < 2 ? -1.0 : 1.0, mod(float(i), 2.0) < 0.5 ? -1.0 : 1.0) * uTexel;
          c += min(texture2D(tDiffuse, vUv + o).rgb, vec3(40.0));
        }
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        if (!(l >= 0.0)) c = vec3(0.0);            // never let a bad pixel spread
        gl_FragColor = vec4(c * smoothstep(1.2, 3.0, max(l, 0.0)), 1.0);
      }`);

    this.mRays = mk({ tDiffuse: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } }, /* glsl */ `
      uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect; varying vec2 vUv;
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec2 d = (uSun - vUv);
        float len = length(d * vec2(uAspect, 1.0));
        vec2 stepv = d / 28.0 * min(1.0, 0.9 / max(len, 0.001));
        vec2 uv = vUv + stepv * hash(gl_FragCoord.xy);
        vec3 acc = vec3(0.0); float w = 1.0;
        for (int i = 0; i < 28; i++) {
          // only open sky near the light contributes: anything solid blocks the shaft
          float sky = step(0.99999, texture2D(tDepth, uv).x);
          float near = smoothstep(0.75, 0.0, length((uSun - uv) * vec2(uAspect, 1.0)));
          acc += min(texture2D(tDiffuse, uv).rgb, vec3(6.0)) * sky * near * near * w;
          w *= 0.955; uv += stepv;
        }
        gl_FragColor = vec4(acc / 28.0, 1.0);
      }`);

    this.mFinal = mk({
      tDiffuse: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tAO: { value: null }, tRays: { value: null },
      uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uBloom: { value: 0.5 }, uAO: { value: 0.85 }, uRays: { value: 0 },
      uFog: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
      uDensity: { value: 0.0007 }, uFogHeight: { value: 160 }, uGlow: { value: 1 }, uDay: { value: 1 }, uEnclosed: { value: 0 },
    }, /* glsl */ `
      uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform sampler2D tAO; uniform sampler2D tRays;
      uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uTime; uniform float uBloom; uniform float uAO; uniform float uRays;
      uniform vec3 uFog; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uDensity; uniform float uFogHeight; uniform float uGlow; uniform float uDay; uniform float uEnclosed;
      varying vec2 vUv;
      ${DEPTH}
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (!(c.r + c.g + c.b >= 0.0)) c = vec3(0.0);
        float depth = texture2D(tDepth, vUv).x;
        if (depth < 0.99999) {
          c *= mix(1.0, texture2D(tAO, vUv).r, uAO);
          // haze: thicker low down, and lit from within toward the light
          vec3 vp = viewPos(vUv);
          vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
          vec3 ray = wp - uCamPos;
          float dist = length(ray);
          vec3 dir = ray / max(dist, 0.001);
          float hmid = max(0.0, (wp.y + uCamPos.y) * 0.5);
          float amount = 1.0 - exp(-pow(dist * uDensity * exp(-hmid / uFogHeight), 1.3));
          float toward = max(dot(dir, uSunDir), 0.0);
          vec3 fogCol = uFog + uSunCol * uGlow * (pow(toward, 8.0) * 0.35 + pow(toward, 2.0) * 0.08);
          c = mix(c, fogCol, amount);
        }
        c += texture2D(tRays, vUv).rgb * uRays;
        c += texture2D(tBloom, vUv).rgb * uBloom;
        vec2 q = vUv - 0.5;
        c *= 1.0 - dot(q, q) * 0.6;                                    // vignette
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // grade: a little more contrast, cool shadows, slightly desaturated
        vec3 g = gl_FragColor.rgb;
        float l = dot(g, vec3(0.299, 0.587, 0.114));
        g = mix(g, g * g * (3.0 - 2.0 * g), 0.34);
        g = mix(vec3(l), g, 0.94);
        g += (1.0 - smoothstep(0.0, 0.45, l)) * vec3(-0.008, 0.0, 0.014) * (1.0 - uEnclosed);
        g += smoothstep(0.55, 1.0, l) * vec3(0.012, 0.004, -0.012) * uDay;
        float gr = hash(gl_FragCoord.xy * 0.7373 + fract(uTime * 7.31) * vec2(37.0, 91.0)) - 0.5;
        g += gr * 0.026 * (1.0 - abs(g.g * 2.0 - 1.0) * 0.6);
        gl_FragColor.rgb = g;
      }`, true);

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mFinal);
    this.quad.frustumCulled = false;
    this.fs.add(this.quad);
    this.build();
  }

  /** quality: 0 low (haze only), 1 medium (bloom, no multisampling), 2 high (everything) */
  setQuality(q: number) {
    this.ao = q >= 2; this.rays = q >= 1; this.bloom = q >= 1;
    const samples = q >= 2 ? 4 : 0;
    if (samples !== this.samples) { this.samples = samples; this.build(); this.setSize(this.w, this.h, 1); }
  }

  private build() {
    this.sceneRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: this.samples, depthBuffer: true });
    this.sceneRT.depthTexture = new THREE.DepthTexture(this.w, this.h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    const opts = { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false };
    if (!this.half.length) {
      this.half = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
      this.quarter = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(4, 4, opts));
    }
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.w = Math.max(2, Math.floor(w * pixelRatio)); this.h = Math.max(2, Math.floor(h * pixelRatio));
    this.sceneRT.setSize(this.w, this.h);
    for (const t of this.half) t.setSize(this.w >> 1, this.h >> 1);
    for (const t of this.quarter) t.setSize(this.w >> 2, this.h >> 2);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fs, this.cam);
  }
  private blur(src: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, spread: number) {
    this.mBlur.uniforms.tDiffuse.value = src.texture;
    this.mBlur.uniforms.uDir.value.set(spread / src.width, 0);
    this.pass(this.mBlur, tmp);
    this.mBlur.uniforms.tDiffuse.value = tmp.texture;
    this.mBlur.uniforms.uDir.value.set(0, spread / src.height);
    this.pass(this.mBlur, src);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, at: Atmosphere) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const depth = this.sceneRT.depthTexture, color = this.sceneRT.texture;
    const f = this.mFinal.uniforms;

    if (this.ao) {
      const u = this.mAO.uniforms;
      u.tDepth.value = depth; u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uProj.value.copy(camera.projectionMatrix);
      this.pass(this.mAO, this.half[0]);
      this.blur(this.half[0], this.half[1], 1.0);
      f.tAO.value = this.half[0].texture;
    } else f.tAO.value = this.white;

    if (this.bloom) {
      const [a, b] = this.quarter;
      this.mBright.uniforms.tDiffuse.value = color;
      this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      this.pass(this.mBright, a);
      this.blur(a, b, 1.0); this.blur(a, b, 2.6);
      f.tBloom.value = a.texture;
    } else f.tBloom.value = this.black;

    // where is the light on screen?
    const s = this._v.copy(at.sunDir).multiplyScalar(1e5).add(camera.position).project(camera);
    const inFront = s.z < 1 && at.rays > 0.01;
    if (this.rays && inFront && Math.abs(s.x) < 1.6 && Math.abs(s.y) < 1.6) {
      const u = this.mRays.uniforms;
      u.tDiffuse.value = color; u.tDepth.value = depth;
      u.uSun.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5); u.uAspect.value = this.w / this.h;
      this.pass(this.mRays, this.quarter[2]);
      this.blur(this.quarter[2], this.quarter[3], 1.5);
      f.tRays.value = this.quarter[2].texture;
      // fade as the light leaves the frame
      f.uRays.value = at.rays * (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(s.x), Math.abs(s.y)), 0.9, 1.6));
    } else { f.tRays.value = this.black; f.uRays.value = 0; }

    f.tDiffuse.value = color; f.tDepth.value = depth;
    f.uProjInv.value.copy(camera.projectionMatrixInverse);
    f.uCamWorld.value.copy(camera.matrixWorld);
    f.uCamPos.value.copy(camera.position);
    f.uTime.value = time;
    f.uFog.value.copy(at.fog); f.uSunCol.value.copy(at.sun); f.uSunDir.value.copy(at.sunDir);
    f.uDensity.value = at.density; f.uFogHeight.value = at.height; f.uGlow.value = at.glow; f.uDay.value = at.daylight; f.uEnclosed.value = at.enclosed;
    f.uAO.value = 0.8;
    this.pass(this.mFinal, null);
  }
}
