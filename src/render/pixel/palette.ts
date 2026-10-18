/**
 * CF の限定パレット（オリジナル配色）と、BG の4階調への自動変換。
 * BG は各色の輝度を4段階に量子化する（visual-effect-library e027 パレット制限の考え方を CPU 側で適用）。
 */
export const CF: Record<string, string> = {
  // 空・背景
  sky: '#64b4ff', skyLow: '#9cd4ff', cloud: '#ffffff', cloudShade: '#c4e2ff',
  hillFar: '#7cc8a0', hillFarDark: '#5aa884', hill: '#38a048', hillDark: '#1f7034', bush: '#2fb048',
  // 地形
  grass: '#52d04a', grassDark: '#2c8c34', dirt: '#c8743c', dirtDark: '#86441e', dirtLight: '#e09a5c',
  brick: '#c05a2c', brickDark: '#6a2810', brickLight: '#ea8a56',
  stone: '#9c9cb0', stoneDark: '#5c5c70', stoneLight: '#d4d4e2',
  wall: '#7c6c94', wallDark: '#4a3c60', wallLight: '#a898c0', moss: '#4caa50',
  bump: '#f4b830', bumpDark: '#a8640c', bumpLight: '#fff0a0',
  used: '#946c50', usedDark: '#5c3c28',
  flat: '#ff6ec8', flatDark: '#b02c88', flatLight: '#ffd0f0',
  gate: '#4c4c60', gateLight: '#8c8ca4',
  // 物
  coin: '#ffd23a', coinDark: '#c88a10', coinLight: '#fff6c0',
  red: '#ff2a3c', redLight: '#ffb0b0', redDark: '#a00018',
  iron: '#5c5c68', ironLight: '#a8a8b8', rock: '#9a6a44', rockDark: '#5a3a20',
  black: '#101018', white: '#ffffff', shadow: '#000000',
  // 主人公
  h: '#6b3410', H: '#a8561e', Y: '#f5c22a', y: '#c08a10', G: '#7fe8e8', S: '#f6c38e', s: '#d8946a', E: '#1a1a2a',
  T: '#1fa39b', t: '#136e6a', C: '#f3e7c6', W: '#ffd84a', K: '#2d2f3d', D: '#ff9b2a', P: '#5a3a24', B: '#3a3446', b: '#f3e7c6',
  // 敵
  R: '#b5652b', r: '#7a3c14', A: '#ffd23a', a: '#9c9cb0', g: '#6c6c80', w: '#ffffff', e: '#1a1a2a',
  V: '#8a4fd8', v: '#5a2ca0', X: '#f4e8ff',
  N: '#4a78c8', n: '#2c4a8c', O: '#ff9b2a',
};

const BG_SHADES = ['#1e3420', '#3f6c3c', '#8cad4c', '#c9dd94'];

/** BG で明るさを指定したい色 */
const BG_OVERRIDE: Record<string, number> = {
  sky: 3, skyLow: 3, cloud: 3, cloudShade: 2, hillFar: 2, hillFarDark: 2, hill: 2, hillDark: 1, bush: 1,
  red: 1, redLight: 2, redDark: 0, flat: 2, flatDark: 1, flatLight: 3, coin: 3, coinDark: 1, coinLight: 3,
  G: 3, W: 3, Y: 3, S: 3, b: 3, C: 3, T: 1, t: 0, P: 1, D: 2, E: 0, K: 0, B: 0, h: 0, H: 1, s: 2,
  w: 3, e: 0, R: 1, r: 0, A: 3, V: 1, v: 0, X: 3, N: 1, n: 0, O: 2,
};

function luma(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const BG: Record<string, string> = Object.fromEntries(
  Object.entries(CF).map(([k, hex]) => {
    const l = luma(hex);
    const i = BG_OVERRIDE[k] ?? (l < 0.28 ? 0 : l < 0.5 ? 1 : l < 0.74 ? 2 : 3);
    return [k, BG_SHADES[i]];
  }),
);

export const BG_SHADE = BG_SHADES;

export type PaletteName = 'cf' | 'bg';
export const PALETTES: Record<PaletteName, Record<string, string>> = { cf: CF, bg: BG };
