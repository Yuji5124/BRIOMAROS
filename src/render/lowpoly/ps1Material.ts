import * as THREE from 'three';

/**
 * 初期3D機風のマテリアル。
 * 移植元: Yuji5124/visual-effect-library src/effects/source/e025-ps1-warp.ts (MIT)
 *  - 頂点をクリップ空間で低解像度の格子へ丸める（頂点のガタつき）
 *  - 頂点単位のランバート（グーローシェーディング）
 *  - 各色5bit（15bitカラー）へ量子化＋4×4ベイヤーディザ
 * BRIOMAROS 向けに頂点カラー・ワールド座標のチェッカー模様・フォグ・不透明度を追加した。
 */
const VERT = /* glsl */ `
uniform vec2 uSnap;
uniform vec3 uLightDir;
varying vec3 vCol;
varying float vLight;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  ndc = floor(ndc * uSnap + 0.5) / uSnap;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vLight = 0.42 + 0.72 * max(dot(n, normalize(uLightDir)), 0.0) + 0.12 * max(n.z, 0.0);
#ifdef USE_COLOR
  vCol = color;
#else
  vCol = vec3(1.0);
#endif
  vDepth = -mv.z;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uChecker;
uniform float uEmissive;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform float uFlash;
varying vec3 vCol;
varying float vLight;
varying vec3 vWorld;
varying float vDepth;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
  return 0.0;
}
void main() {
  vec3 c = uColor * vCol * mix(vLight, 1.0, uEmissive);
  if (uChecker > 0.0) {
    vec3 w = floor(vWorld + 0.001);
    float ch = mod(w.x + w.y + w.z, 2.0);
    c *= 1.0 - uChecker * 0.13 * ch;
  }
  float f = clamp((vDepth - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  c = mix(c, uFogColor, f * f);
  c = mix(c, vec3(1.0), uFlash);
  c += bayer4(gl_FragCoord.xy) / 31.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, uOpacity);
}
`;

export const SHARED = {
  uSnap: { value: new THREE.Vector2(240, 135) },
  uLightDir: { value: new THREE.Vector3(0.45, 1, 0.55) },
  uFogColor: { value: new THREE.Color(0x9fd6ff) },
  uFog: { value: new THREE.Vector2(26, 70) },
};

export interface Ps1Opts {
  checker?: number;
  emissive?: number;
  opacity?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
}

export function ps1Material(color: number | string, o: Ps1Opts = {}): THREE.ShaderMaterial {
  const transparent = (o.opacity ?? 1) < 1;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: o.vertexColors ?? false,
    transparent,
    depthWrite: !transparent,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      uSnap: SHARED.uSnap,
      uLightDir: SHARED.uLightDir,
      uFogColor: SHARED.uFogColor,
      uFog: SHARED.uFog,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: o.opacity ?? 1 },
      uChecker: { value: o.checker ?? 0 },
      uEmissive: { value: o.emissive ?? 0 },
      uFlash: { value: 0 },
    },
  });
}

const cache = new Map<string, THREE.ShaderMaterial>();
/** 同じ色・設定のマテリアルを共有する */
export function mat(color: number | string, o: Ps1Opts = {}): THREE.ShaderMaterial {
  const key = `${color}|${o.checker ?? 0}|${o.emissive ?? 0}|${o.opacity ?? 1}|${o.vertexColors ?? false}|${o.side ?? 0}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = ps1Material(color, o)));
  return m;
}
