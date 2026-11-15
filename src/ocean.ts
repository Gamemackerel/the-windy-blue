import * as THREE from 'three';
import { Environment, SKY_GLSL, NOISE_GLSL } from './env';
import { waveGLSL } from './waves';

const SEG = 320;      // grid resolution
const RADIUS = 4200;  // half-extent of the sea mesh (m)
const LINEAR = 0.014; // share of the warp that is linear (sets the finest cell size)

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
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uCenter;
        varying vec3 vWorld;
        varying vec2 vRest;
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
          vec3 d = waveDisp(rest, uTime, cell);
          vec3 p = vec3(rest.x + d.x, d.y, rest.y + d.z);
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
        varying vec3 vWorld;
        varying vec2 vRest;
        ${SKY_GLSL}
        ${NOISE_GLSL}
        ${waveGLSL()}
        void main() {
          vec3 toCam = uCamPos - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;

          float px = max(length(fwidth(vRest)), 0.001);
          float fold; float h;
          vec3 n = waveNormal(vRest, uTime, px, fold, h);
          n.xz += rippleSlope(vRest, uTime, px);
          // drifting fine chop
          vec2 q = vRest * 1.3 + uTime * vec2(0.21, 0.13);
          float e = 0.3;
          float n0 = vnoise(q);
          vec2 grad = vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e;
          n.xz -= grad * 0.05 * clamp((0.8 / px - 2.0) / 4.0, 0.0, 1.0);
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

          vec3 col = mix(body, refl, F);

          // foam on pinched crests, broken up at two scales
          float nearF = 1.0 - smoothstep(150.0, 700.0, dist);
          float fn = fbm(vRest * 0.4 + uTime * vec2(0.05, 0.02));
          float ft = fbm(vRest * 3.1 - uTime * vec2(0.08, 0.03));
          float foam = smoothstep(0.40, 0.56, fold + (fn - 0.5) * 0.3) * nearF;
          foam *= smoothstep(0.25, 0.6, ft + foam * 0.35);
          vec3 foamCol = vec3(0.86, 0.87, 0.84) * (uAmbient * 1.4 + uLightCol * 0.45 * (0.4 + sun));
          col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.9);

          // distance haze into the sky colour at the horizon
          vec3 fd = normalize(vec3(-V.x, 0.015, -V.z));
          float fogF = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
          col = mix(col, skyBase(fd), fogF);

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

  update(focus: THREE.Vector3, camPos: THREE.Vector3) {
    (this.uniforms.uCenter.value as THREE.Vector2).set(focus.x, focus.z);
    (this.uniforms.uCamPos.value as THREE.Vector3).copy(camPos);
  }
}
