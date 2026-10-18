import { DEPTH_MAX, DEPTH_MIN } from './config';
import type { Box, Solid } from './types';

/**
 * 媒体の法則に応じた衝突判定。
 * - 2D媒体: z=0 の断面だけを見る。z0 ≤ 0 ≤ z1 の箱が固体（厚み0の“ドット足場”も含む）。
 * - 3D媒体: 通常の3D交差。厚み0の箱は交差しないので自動的にすり抜ける。
 */
export interface Body {
  x: number; // 足元中央
  y: number; // 足元
  z: number; // 奥行き中央
  w: number;
  h: number;
  d: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

export const bodyBox = (b: Body): Box => ({
  x0: b.x - b.w / 2,
  x1: b.x + b.w / 2,
  y0: b.y,
  y1: b.y + b.h,
  z0: b.z - b.d / 2,
  z1: b.z + b.d / 2,
});

export function solidBlocks(s: Solid, b: Box, spatial: boolean): boolean {
  if (!s.active) return false;
  if (!(b.x0 < s.x1 && s.x0 < b.x1 && b.y0 < s.y1 && s.y0 < b.y1)) return false;
  if (spatial) {
    if (s.kind === 'flat') return false;
    return b.z0 < s.z1 && s.z0 < b.z1;
  }
  return s.z0 <= 0 && 0 <= s.z1;
}

/** x方向のバケットで固体を引く簡易空間分割 */
export class SolidIndex {
  private buckets = new Map<number, Solid[]>();
  readonly all: Solid[] = [];
  private static readonly SIZE = 8;

  add(s: Solid): void {
    this.all.push(s);
    const a = Math.floor(s.x0 / SolidIndex.SIZE);
    const z = Math.floor((s.x1 - 1e-6) / SolidIndex.SIZE);
    for (let i = a; i <= z; i++) {
      let list = this.buckets.get(i);
      if (!list) this.buckets.set(i, (list = []));
      list.push(s);
    }
  }

  query(x0: number, x1: number, out: Solid[] = []): Solid[] {
    out.length = 0;
    const a = Math.floor(x0 / SolidIndex.SIZE);
    const z = Math.floor(x1 / SolidIndex.SIZE);
    for (let i = a; i <= z; i++) {
      const list = this.buckets.get(i);
      if (!list) continue;
      for (const s of list) if (!out.includes(s)) out.push(s);
    }
    return out;
  }
}

const tmp: Solid[] = [];

export function overlapsAny(index: SolidIndex, b: Box, spatial: boolean): Solid | null {
  for (const s of index.query(b.x0 - 1, b.x1 + 1, tmp)) if (solidBlocks(s, b, spatial)) return s;
  return null;
}

export interface MoveResult {
  hitCeiling: Solid | null;
  hitWallX: boolean;
  landed: boolean;
}

/** 軸ごとに移動して押し戻す。戻り値で天井・壁・着地を知らせる。 */
export function moveBody(index: SolidIndex, body: Body, dt: number, spatial: boolean): MoveResult {
  const res: MoveResult = { hitCeiling: null, hitWallX: false, landed: false };
  if (!spatial) {
    body.z = 0;
    body.vz = 0;
  }
  // X
  body.x += body.vx * dt;
  let bb = bodyBox(body);
  for (const s of index.query(bb.x0 - 1, bb.x1 + 1, tmp)) {
    if (!solidBlocks(s, bb, spatial)) continue;
    if (body.vx > 0) body.x = s.x0 - body.w / 2 - 1e-4;
    else if (body.vx < 0) body.x = s.x1 + body.w / 2 + 1e-4;
    else body.x = body.x < (s.x0 + s.x1) / 2 ? s.x0 - body.w / 2 - 1e-4 : s.x1 + body.w / 2 + 1e-4;
    body.vx = 0;
    res.hitWallX = true;
    bb = bodyBox(body);
  }
  // Z（3Dのみ）
  if (spatial) {
    body.z += body.vz * dt;
    const lo = DEPTH_MIN + body.d / 2;
    const hi = DEPTH_MAX - body.d / 2;
    if (body.z < lo) body.z = lo;
    if (body.z > hi) body.z = hi;
    bb = bodyBox(body);
    for (const s of index.query(bb.x0 - 1, bb.x1 + 1, tmp)) {
      if (!solidBlocks(s, bb, spatial)) continue;
      if (body.vz > 0) body.z = s.z0 - body.d / 2 - 1e-4;
      else body.z = s.z1 + body.d / 2 + 1e-4;
      body.vz = 0;
      bb = bodyBox(body);
    }
  }
  // Y
  const wasGround = body.onGround;
  body.onGround = false;
  body.y += body.vy * dt;
  bb = bodyBox(body);
  for (const s of index.query(bb.x0 - 1, bb.x1 + 1, tmp)) {
    if (!solidBlocks(s, bb, spatial)) continue;
    if (body.vy <= 0) {
      body.y = s.y1;
      body.onGround = true;
      if (!wasGround) res.landed = true;
    } else {
      body.y = s.y0 - body.h - 1e-4;
      res.hitCeiling = s;
    }
    body.vy = 0;
    bb = bodyBox(body);
  }
  // 接地の確認（速度0で立っているとき）
  if (!body.onGround && body.vy === 0) {
    const probe = { ...bb, y0: bb.y0 - 0.02, y1: bb.y0 };
    if (overlapsAny(index, probe, spatial)) body.onGround = true;
  }
  return res;
}

/**
 * 媒体切替時の埋まり込み防止。
 * 指定の媒体法則で body が固体に重ならない最寄りの位置を探す。見つからなければ null。
 */
export function findSafeSpot(
  index: SolidIndex,
  body: Body,
  spatial: boolean,
): { x: number; y: number; z: number } | null {
  const z = spatial ? body.z : 0;
  const test = (x: number, y: number) => !overlapsAny(index, bodyBox({ ...body, x, y, z }), spatial);
  if (test(body.x, body.y)) return { x: body.x, y: body.y, z };
  // 上方向を優先し、次に左右へ（最大 2.5 タイル）
  const step = 0.125;
  for (let r = step; r <= 2.5; r += step) {
    const cands: [number, number][] = [
      [body.x, body.y + r],
      [body.x - r, body.y],
      [body.x + r, body.y],
      [body.x - r, body.y + r],
      [body.x + r, body.y + r],
    ];
    for (const [x, y] of cands) if (test(x, y)) return { x, y, z };
  }
  return null;
}
