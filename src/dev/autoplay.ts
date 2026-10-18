import type { Input } from '../core/input';
import { overlapsAny } from '../core/physics';
import type { Game } from '../game/game';

/**
 * テスト用の自動操作ボット。ゲームの内部状態は書き換えず、キー入力だけで STAGE 01 → GOAL まで進める。
 * 「スタートからゴールまで進めるか」を E2E テストで確認するために使う。
 */
export function autoplay(g: Game, input: Input, step: (dt: number) => void, seconds = 300) {
  const log: string[] = [];
  let jumpHold = 0;
  const press = (a: Parameters<Input['simulate']>[0], v: boolean) => input.simulate(a, v);
  const jumpAt = (x: number, list: number[]) => list.some((jx) => x > jx - 0.15 && x < jx + 0.45);
  const want = (id: '64N' | 'CF' | 'BG') => {
    if (g.medium !== id && g.media.has(id) && !g.transition) {
      // 本編と同じ K キー操作で切り替える（短押しで次の媒体へ）
      press('medium', true);
      step(1 / 60);
      press('medium', false);
    }
  };

  const frame = () => {
    const p = g.player.body;
    const boss = g.activeBoss;
    const m = g.medium;
    let right = true;
    let left = false;
    let jump = false;
    let up = false;
    let down = false;
    let act = false;
    if (boss) {
      const b = boss.body;
      const dx = b.x - p.x;
      if (boss.type === 'guardian') {
        const vuln = boss.state === 'stunned' || boss.state === 'throwRecover';
        if (vuln && Math.abs(dx) < 7) {
          right = dx > 0;
          left = dx < 0;
          if (Math.abs(dx) < 2.6 && p.onGround) jump = true;
        } else {
          right = dx > 7;
          left = dx < 5.5;
        }
        for (const pr of g.projectiles) {
          const toward = Math.sign(p.x - pr.x) === Math.sign(pr.vx);
          if (pr.kind === 'wave' && toward && Math.abs(pr.x - p.x) < 1.9 && p.onGround) jump = true;
          if (pr.kind === 'rock' && Math.abs(pr.x - p.x) < 2.5 && pr.vy < 0) {
            right = pr.x < p.x;
            left = !right;
          }
        }
      } else {
        // 64N に切り替えて奥行きで弾をかわし、着地したら踏む
        want('64N');
        if (boss.state === 'grounded') {
          right = dx > 0.3;
          left = dx < -0.3;
          up = p.z > 0.2;
          down = p.z < -0.2;
          if (Math.abs(dx) < 2.6 && Math.abs(p.z) < 0.6 && p.onGround) jump = true;
        } else {
          right = dx > 4;
          left = dx < -4;
          const dodgeZ = Math.floor(g.time / 2) % 2 ? -2.6 : 0.9;
          up = p.z > dodgeZ + 0.2;
          down = p.z < dodgeZ - 0.2;
        }
      }
    } else if (p.x < 113) {
      want('CF');
      jump = p.onGround && jumpAt(p.x, [24.5, 32.6, 48.2, 56.6, 78.4]);
    } else if (p.x < 127) {
      // 巨大な壁: 64N で奥へ回り込む
      want('64N');
      if (m === '64N') {
        up = p.z > -2.4;
        if (p.x > 118.6 && p.z > -1.75) right = false;
      }
    } else if (p.x < 160) {
      // ドット足場: CF に戻して渡る
      if (p.x < 133 && m === '64N') down = p.z < -0.1;
      if (Math.abs(p.z) < 0.2 || m !== '64N') want('CF');
      if (p.x > 138 && m !== 'CF' && m !== 'BG') right = false;
      jump = p.onGround && jumpAt(p.x, [141.5, 145.6, 149.6, 153.9]);
    } else if (p.x < 181) {
      // 2つめの壁: 64N で手前へ
      if (p.x > 168) {
        want('64N');
        if (m === '64N') {
          down = p.z < 0.95;
          if (p.x > 175.3 && p.z < 0.78) right = false;
        } else right = false;
      }
    } else if (p.x < 225) {
      if (m === '64N') up = p.z > 0.05;
      if (m === '64N' && Math.abs(p.z) < 0.1) want('CF');
      jump = p.onGround && jumpAt(p.x, [185.2, 189.4]);
    } else {
      // BG で色属性を無効化して進む
      want('BG');
      jump = p.onGround && jumpAt(p.x, [256.9, 261.3]);
    }
    // 足元の先に地面がなければジャンプ（穴）
    if (!boss && right && p.onGround && m !== '64N') {
      const x = p.x + 0.9;
      const probe = { x0: x - 0.1, x1: x + 0.1, y0: p.y - 3, y1: p.y - 0.05, z0: -0.1, z1: 0.1 };
      if (!overlapsAny(g.stage.index, probe, false)) jump = true;
    }
    // 段差に引っかかったらジャンプ（人間がやるのと同じ）
    if (!boss && right && p.onGround && Math.abs(p.vx) < 0.3 && m !== '64N') jump = true;
    for (const e of g.enemies) {
      if (e.alive && !e.invincible && Math.abs(e.body.x - p.x) < 1.5 && Math.abs(e.body.y - p.y) < 1.2) act = true;
    }
    press('right', right && !left);
    press('left', left);
    press('up', up);
    press('down', down);
    if (jump) {
      press('jump', true);
      jumpHold = 0.4;
    } else if (jumpHold > 0) {
      jumpHold -= 1 / 60;
      if (jumpHold <= 0) press('jump', false);
    }
    press('action', act && !input.isDown('action'));
    if (!act) press('action', false);
  };

  let t = 0;
  let next = 0;
  while (t < seconds && g.state === 'play') {
    frame();
    step(1 / 60);
    t += 1 / 60;
    if (t >= next) {
      next += 5;
      const b = g.activeBoss;
      log.push(`${t.toFixed(0)}s x=${g.player.body.x.toFixed(1)} z=${g.player.body.z.toFixed(1)} ${g.medium} hp=${g.player.hp}${b ? ` ${b.type}:${b.state}:${b.hp}` : ''}`);
    }
  }
  for (const a of ['right', 'left', 'up', 'down', 'jump', 'action'] as const) press(a, false);
  return { state: g.state, seconds: Number(t.toFixed(1)), x: g.player.body.x, deaths: g.deaths, media: g.media.list(), coins: g.coins, log };
}
