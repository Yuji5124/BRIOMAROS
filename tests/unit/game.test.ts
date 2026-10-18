import { describe, expect, it } from 'vitest';
import { Input } from '../../src/core/input';
import { colorAffects } from '../../src/game/combat';
import { Game } from '../../src/game/game';
import { MEDIA, MediumInventory, MEDIUM_ORDER } from '../../src/media/registry';

/** ブラウザなしでゲームロジックだけを動かす */
function headless() {
  const input = new Input(new EventTarget() as unknown as Window);
  const g = new Game(input);
  g.state = 'play';
  const run = (sec: number) => {
    for (let i = 0; i < Math.round(sec * 60); i++) g.frame(1 / 60);
  };
  return { g, input, run };
}

describe('媒体レジストリ', () => {
  it('10媒体分の枠があり、実装済みは CF / 64N / BG', () => {
    expect(MEDIUM_ORDER).toHaveLength(10);
    expect(MEDIUM_ORDER.filter((id) => MEDIA[id].implemented)).toEqual(['CF', '64N', 'BG']);
  });

  it('最初は CF のみ。未獲得・未実装の媒体は選べない', () => {
    const inv = new MediumInventory();
    expect(inv.list()).toEqual(['CF']);
    expect(inv.canSelect('64N')).toBe(false);
    expect(inv.canSelect('64N', true)).toBe(true); // 開発者機能
    expect(inv.unlock('SW')).toBe(false);
    expect(inv.canSelect('SW', true)).toBe(false);
    inv.unlock('64N');
    inv.unlock('BG');
    expect(inv.cycle(1)).toBe('64N');
    inv.current = 'BG';
    expect(inv.cycle(1)).toBe('CF');
  });

  it('色属性: BG だけが赤い攻撃を無効化する', () => {
    expect(colorAffects('red', MEDIA.CF.laws.colorImmune)).toBe(true);
    expect(colorAffects('red', MEDIA['64N'].laws.colorImmune)).toBe(true);
    expect(colorAffects('red', MEDIA.BG.laws.colorImmune)).toBe(false);
    expect(colorAffects('none', MEDIA.BG.laws.colorImmune)).toBe(true);
  });
});

describe('ゲーム進行', () => {
  it('走ってジャンプできる', () => {
    const { g, input, run } = headless();
    input.simulate('right', true);
    run(1);
    expect(g.player.body.x).toBeGreaterThan(6);
    input.simulate('jump', true);
    run(0.25);
    expect(g.player.body.y).toBeGreaterThan(2);
    input.simulate('jump', false);
    input.simulate('right', false);
    run(1);
    expect(g.player.body.onGround).toBe(true);
  });

  it('本編では未獲得の媒体に切り替えられない', () => {
    const { g } = headless();
    expect(g.requestMedium('64N')).toBe(false);
    expect(g.medium).toBe('CF');
  });

  it('媒体切替で HP・位置・スコアなどの共通状態は維持される', () => {
    const { g, run } = headless();
    g.media.unlock('64N');
    g.media.unlock('BG');
    g.player.body.x = 20;
    run(0.2);
    g.player.hp = 2;
    g.score = 1234;
    const x = g.player.body.x;
    expect(g.requestMedium('64N')).toBe(true);
    expect(g.requestMedium('BG')).toBe(true);
    expect(g.player.hp).toBe(2);
    expect(g.score).toBe(1234);
    expect(g.player.body.x).toBeCloseTo(x);
    expect(g.media.list()).toEqual(['CF', '64N', 'BG']);
  });

  it('巨大な壁: CF では越えられず、64N では奥へ回り込んで越えられる', () => {
    const { g, input, run } = headless();
    g.warp(2); // 巨大な壁の手前（CF, 64N 獲得済み）
    g.requestMedium('CF');
    input.simulate('right', true);
    run(3);
    expect(g.player.body.x).toBeLessThan(120);
    g.requestMedium('64N');
    input.simulate('right', false);
    input.simulate('up', true);
    run(0.6);
    input.simulate('up', false);
    input.simulate('right', true);
    run(1.5);
    expect(g.player.body.x).toBeGreaterThan(123);
  });

  it('BG では赤い光の柵を通れるが、CF では押し戻される', () => {
    const { g, input, run } = headless();
    g.warp(5);
    g.requestMedium('CF');
    g.player.body.x = 239;
    input.simulate('right', true);
    run(1.5);
    expect(g.player.body.x).toBeLessThan(241);
    const hpAfterCF = g.player.hp;
    expect(hpAfterCF).toBeLessThan(4);
    g.requestMedium('BG');
    g.player.invuln = 0;
    run(1.5);
    expect(g.player.body.x).toBeGreaterThan(242);
    expect(g.player.hp).toBe(hpAfterCF);
  });

  it('赤い弾は BG で無効、鉄球は BG でも当たる', () => {
    const { g, run } = headless();
    g.warp(5);
    g.requestMedium('BG');
    run(0.1);
    const b = g.player.body;
    g.spawnProjectile({ kind: 'orb', x: b.x + 2, y: b.y + 0.5, z: 0, vx: -6, vy: 0, vz: 0, r: 0.3, color: 'red', gravity: 0, damage: 1 });
    run(0.6);
    expect(g.player.hp).toBe(4);
    g.spawnProjectile({ kind: 'iron', x: b.x + 2, y: b.y + 0.5, z: 0, vx: -6, vy: 0, vz: 0, r: 0.3, color: 'none', gravity: 0, damage: 1 });
    run(0.6);
    expect(g.player.hp).toBe(3);
  });

  it('ボス1を倒すと 64N が解放される', () => {
    const { g, run } = headless();
    g.dev.god = true;
    g.warp(1);
    g.player.body.x = 100;
    run(0.5);
    const boss = g.bosses[0];
    expect(boss.active).toBe(true);
    for (let i = 0; i < 60 && !boss.defeated; i++) {
      const p = g.player.body;
      p.x = boss.body.x;
      p.y = boss.body.y + boss.body.h + 0.4;
      p.vy = -3;
      run(0.7);
    }
    run(2.5);
    expect(boss.defeated).toBe(true);
    expect(g.media.has('64N')).toBe(true);
  });
});
