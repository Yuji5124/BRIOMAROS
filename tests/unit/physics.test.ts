import { describe, expect, it } from 'vitest';
import { findSafeSpot, moveBody, SolidIndex, type Body } from '../../src/core/physics';
import type { Solid } from '../../src/core/types';

const solid = (id: number, kind: Solid['kind'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid => ({
  id, kind, x0, x1, y0, y1, z0, z1, active: true,
});

const body = (x: number, y: number, z = 0): Body => ({ x, y, z, w: 0.7, h: 1, d: 0.7, vx: 0, vy: 0, vz: 0, onGround: false });

describe('媒体ごとの衝突判定', () => {
  it('厚み0のドット足場は 2D では乗れ、3D ではすり抜ける', () => {
    const idx = new SolidIndex();
    idx.add(solid(0, 'flat', 0, 4, 0, 1, 0, 0));
    const b2 = body(2, 1.5);
    b2.vy = -10;
    for (let i = 0; i < 30; i++) moveBody(idx, b2, 1 / 60, false);
    expect(b2.y).toBeCloseTo(1);
    expect(b2.onGround).toBe(true);

    const b3 = body(2, 1.5);
    b3.vy = -10;
    for (let i = 0; i < 30; i++) moveBody(idx, b3, 1 / 60, true);
    expect(b3.y).toBeLessThan(0);
  });

  it('2D では z=0 断面にある壁に止められ、3D では奥へ回り込める', () => {
    const idx = new SolidIndex();
    idx.add(solid(0, 'ground', -10, 30, -8, 0, -3.4, 1.4));
    idx.add(solid(1, 'wall', 10, 13, 0, 14, -1.3, 2));
    const b = body(8, 0);
    b.vx = 7;
    for (let i = 0; i < 120; i++) {
      b.vx = 7;
      moveBody(idx, b, 1 / 60, false);
    }
    expect(b.x).toBeLessThan(10);

    const c = body(8, 0, -2.4);
    for (let i = 0; i < 120; i++) {
      c.vx = 7;
      moveBody(idx, c, 1 / 60, true);
    }
    expect(c.x).toBeGreaterThan(13);
    expect(c.z).toBeCloseTo(-2.4);
  });

  it('2D では z が 0 に固定される', () => {
    const idx = new SolidIndex();
    const b = body(0, 0, -2);
    b.vz = -5;
    moveBody(idx, b, 1 / 60, false);
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });

  it('3D→2D 切替で壁の中に埋まる場合は近くの安全な位置を探す', () => {
    const idx = new SolidIndex();
    idx.add(solid(0, 'ground', -10, 30, -8, 0, -3.4, 1.4));
    idx.add(solid(1, 'wall', 10, 13, 0, 14, -1.3, 2));
    const b = body(10.5, 0, -2.4); // 壁の裏
    const spot = findSafeSpot(idx, b, false);
    expect(spot).not.toBeNull();
    expect(spot!.z).toBe(0);
    expect(spot!.x < 10 - 0.35 || spot!.x > 13 + 0.35).toBe(true);
  });

  it('安全な位置が見つからなければ null（切替を拒否）', () => {
    const idx = new SolidIndex();
    idx.add(solid(0, 'stone', -10, 10, -10, 10, -1, 1));
    expect(findSafeSpot(idx, body(0, 0, -2), false)).toBeNull();
  });
});
