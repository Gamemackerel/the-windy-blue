// A small post-processing chain: the scene is drawn in linear HDR, bright
// areas bloom, then a restrained vignette and film grain are laid over it
// and the result is tone mapped to the screen.
import * as THREE from 'three';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  enabled = true;
  private sceneRT: THREE.WebGLRenderTarget;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fs = new THREE.Scene();
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private final: THREE.ShaderMaterial;

  constructor(private renderer: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.a = new THREE.WebGLRenderTarget(4, 4, opts);
    this.b = new THREE.WebGLRenderTarget(4, 4, opts);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: false,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i < 2 ? -1.0 : 1.0, mod(float(i), 2.0) < 0.5 ? -1.0 : 1.0) * uTexel;
            c += min(texture2D(tDiffuse, vUv + o).rgb, vec3(40.0));
          }
          c *= 0.25;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(1.1, 2.6, l), 1.0);
        }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: false,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
          c += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.07;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.final = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, uTime: { value: 0 }, uBloom: { value: 0.55 } },
      vertexShader: VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uTime; uniform float uBloom; varying vec2 vUv;
        float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * 0.55;                                   // vignette
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          float g = hash(gl_FragCoord.xy * 0.7373 + fract(uTime * 7.31) * vec2(37.0, 91.0)) - 0.5;       // grain, strongest in the mid-tones
          gl_FragColor.rgb += g * 0.028 * (1.0 - abs(gl_FragColor.g * 2.0 - 1.0) * 0.6);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.fs.add(this.quad);
  }

  setSize(w: number, h: number, pixelRatio: number) {
    const W = Math.max(2, Math.floor(w * pixelRatio)), H = Math.max(2, Math.floor(h * pixelRatio));
    this.sceneRT.setSize(W, H);
    this.a.setSize(W >> 2, H >> 2);
    this.b.setSize(W >> 2, H >> 2);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fs, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number) {
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const w = this.a.width, h = this.a.height;
    this.bright.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.bright.uniforms.uTexel.value.set(1 / (w * 4), 1 / (h * 4));
    this.pass(this.bright, this.a);
    for (let i = 0; i < 2; i++) {
      const s = 1 + i * 1.6;
      this.blur.uniforms.tDiffuse.value = this.a.texture;
      this.blur.uniforms.uDir.value.set(s / w, 0);
      this.pass(this.blur, this.b);
      this.blur.uniforms.tDiffuse.value = this.b.texture;
      this.blur.uniforms.uDir.value.set(0, s / h);
      this.pass(this.blur, this.a);
    }
    this.final.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.final.uniforms.tBloom.value = this.a.texture;
    this.final.uniforms.uTime.value = time;
    this.pass(this.final, null);
  }
}
