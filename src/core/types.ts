/** 共通世界の座標系: x=右, y=上, z=奥行き（手前が +）。1単位 = 1タイル。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 軸平行の箱（中心ではなく最小・最大で持つ） */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export type SolidKind =
  | 'ground' // 地面（土＋草）
  | 'brick' // レンガ
  | 'stone' // 石柱・岩
  | 'wall' // 巨大な壁
  | 'bump' // 叩くとコインが出るメディアブロック
  | 'used' // 叩いた後のブロック
  | 'flat' // 厚み0の“ドット足場”: 2D媒体でだけ乗れる
  | 'gate'; // ボス部屋の扉（戦闘中だけ出現）

export interface Solid extends Box {
  id: number;
  kind: SolidKind;
  /** 有効かどうか（扉の開閉など） */
  active: boolean;
  /** 叩かれたときの揺れ演出 */
  bumpT?: number;
}

/** 色属性。BG 媒体では 'red' などの色属性攻撃が無効になる */
export type ColorAttr = 'none' | 'red';

export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({
  x0,
  x1,
  y0,
  y1,
  z0,
  z1,
});

export function overlap1(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return overlap1(a.x0, a.x1, b.x0, b.x1) && overlap1(a.y0, a.y1, b.y0, b.y1) && overlap1(a.z0, a.z1, b.z0, b.z1);
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
