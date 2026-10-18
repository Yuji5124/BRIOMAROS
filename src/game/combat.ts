import { bodyBox, type Body } from '../core/physics';
import { overlap1, type Box, type ColorAttr } from '../core/types';

/** 媒体の法則に従った重なり判定（2D媒体では z を無視） */
export function hitTest(a: Box, b: Box, spatial: boolean): boolean {
  if (!(overlap1(a.x0, a.x1, b.x0, b.x1) && overlap1(a.y0, a.y1, b.y0, b.y1))) return false;
  return spatial ? overlap1(a.z0, a.z1, b.z0, b.z1) : true;
}

/** 踏みつけ判定: 落下中で、足元が相手の上部にある */
export function isStomp(player: Body, target: Body): boolean {
  const pb = bodyBox(player);
  const tb = bodyBox(target);
  return player.vy < 0 && pb.y0 > tb.y0 + (tb.y1 - tb.y0) * 0.45;
}

export type ProjectileKind = 'orb' | 'rock' | 'iron' | 'wave' | 'bomb';

export interface Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  /** 色属性: 'red' は BG 媒体で無効 */
  color: ColorAttr;
  gravity: number;
  life: number;
  damage: number;
  /** 実験場の弾（ダメージなし） */
  harmless?: boolean;
  /** 「無効」の表示を一度だけ出す */
  nullified?: boolean;
  dead?: boolean;
  t: number;
}

export function projBox(p: Projectile): Box {
  if (p.kind === 'wave') return { x0: p.x - 0.4, x1: p.x + 0.4, y0: p.y, y1: p.y + 0.8, z0: p.z - 1, z1: p.z + 1 };
  return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z - p.r, z1: p.z + p.r };
}

/** 色属性の攻撃が今の媒体で効くか */
export function colorAffects(color: ColorAttr, colorImmune: boolean): boolean {
  return color === 'none' || !colorImmune;
}
