import { TILE_PX, VIEW_H, VIEW_W } from './config';

/**
 * 2D ⇔ 3D の座標変換を1か所にまとめる。
 * 世界座標: x 右, y 上, z 奥行き（手前 +）。1単位 = 1タイル = 16px（2D）= 1 three.js 単位（3D）。
 * 2D 媒体は z=0 の断面を、y を反転して画面に写す。
 */
export function viewOrigin2D(camX: number, camY: number) {
  const left = camX - VIEW_W / TILE_PX / 2;
  const bottom = camY - VIEW_H / TILE_PX / 2;
  return { left, bottom, px: Math.round(left * TILE_PX), py: Math.round(bottom * TILE_PX) };
}

/** 世界座標 (x, y) → 2D 画面ピクセル。ox, oy は viewOrigin2D の px, py */
export function toScreen2D(x: number, y: number, ox: number, oy: number): { x: number; y: number } {
  return { x: Math.round(x * TILE_PX) - ox, y: VIEW_H - (Math.round(y * TILE_PX) - oy) };
}

/** 世界座標 → three.js 座標（同じ軸・同じ単位。明示のために関数にしている） */
export function toThree(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}
