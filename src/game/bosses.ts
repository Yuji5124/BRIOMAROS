import { moveBody, type Body } from '../core/physics';
import { approach, clamp } from '../core/types';
import type { BossSpawn, BossType } from '../world/stage';
import type { Game } from './game';

/**
 * ボス。強さは HP だけでなく「攻撃方法の変化」で表す（HP 半分で第2形態）。
 * すべての攻撃に予備動作があり、媒体の法則を使えば避けられる。
 */
export abstract class Boss {
  abstract readonly type: BossType;
  abstract readonly name: string;
  body: Body;
  maxHp = 6;
  hp = 6;
  state = 'dormant';
  t = 0;
  facing: 1 | -1 = -1;
  invuln = 0;
  flash = 0;
  defeated = false;
  /** 撃破演出の経過 */
  dyingT = 0;
  attackCount = 0;
  /** 予告マーカー（描画用）: 地面の位置 */
  markers: { x: number; z: number }[] = [];
  /** 照準線（描画用） */
  aims: { x: number; y: number; z: number }[] = [];
  readonly spawn: BossSpawn;

  constructor(s: BossSpawn, w: number, h: number) {
    this.spawn = s;
    this.body = { x: s.x, y: s.y, z: 0, w, h, d: 1.8, vx: 0, vy: 0, vz: 0, onGround: false };
  }

  get phase2(): boolean {
    return this.hp <= this.maxHp / 2;
  }
  get active(): boolean {
    return this.state !== 'dormant' && !this.defeated;
  }
  get dying(): boolean {
    return this.state === 'dying';
  }

  setState(s: string): void {
    this.state = s;
    this.t = 0;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.body.x = this.spawn.x;
    this.body.y = this.spawn.y;
    this.body.vx = this.body.vy = 0;
    this.markers = [];
    this.aims = [];
    this.attackCount = 0;
    this.setState('dormant');
  }

  /** 踏みつけ・パンチを受け付けるか */
  abstract vulnerable(): boolean;
  /** 触れたときのダメージ */
  abstract contactDamage(): number;
  abstract think(g: Game, dt: number): void;
  /** 被ダメージ量（スタン中は倍など） */
  damageFor(): number {
    return 1;
  }

  update(g: Game, dt: number): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    if (this.state === 'dying') {
      this.dyingT += dt;
      if (Math.random() < dt * 14) {
        const b = this.body;
        g.burst(b.x + (Math.random() - 0.5) * b.w, b.y + Math.random() * b.h, b.z, 'boom', 6, { speed: 4, life: 0.5 });
        g.sfx.play('boom');
      }
      if (this.dyingT > 1.8) {
        this.defeated = true;
        g.onBossDefeated(this);
      }
      return;
    }
    if (this.state === 'dormant') return;
    this.think(g, dt);
  }

  hit(g: Game): boolean {
    if (!this.vulnerable() || this.invuln > 0) {
      g.sfx.play('clink');
      return false;
    }
    const dmg = this.damageFor();
    const wasP2 = this.phase2;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.6;
    this.flash = 0.6;
    g.sfx.play('bossHit');
    g.shake(0.3);
    g.burst(this.body.x, this.body.y + this.body.h * 0.7, this.body.z, 'spark', 14, { speed: 6, life: 0.5 });
    if (dmg > 1) g.floater('CRITICAL!', this.body.x, this.body.y + this.body.h + 0.6, this.body.z, '#ffd23a');
    if (this.hp <= 0) {
      this.setState('dying');
      this.markers = [];
      this.aims = [];
      g.score += 2000;
      g.sfx.play('bossDown');
      g.shake(0.8);
    } else if (!wasP2 && this.phase2) {
      g.floater('攻撃パターン変化！', this.body.x, this.body.y + this.body.h + 1, this.body.z, '#ff77a8');
      g.sfx.play('roar');
    }
    return true;
  }
}

/** ボス1: ウォールガーディアン（CF）。叩きつけ→衝撃波、岩投げ。叩きつけ後はスタンして弱点が露出する。 */
export class Guardian extends Boss {
  readonly type = 'guardian' as const;
  readonly name = 'ウォールガーディアン';
  constructor(s: BossSpawn) {
    super(s, 2.2, 2.8);
  }
  vulnerable(): boolean {
    return this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'slamJump';
  }
  contactDamage(): number {
    return this.state === 'stunned' ? 0 : 1;
  }
  damageFor(): number {
    return this.state === 'stunned' ? 2 : 1;
  }
  think(g: Game, dt: number): void {
    const b = this.body;
    const p = g.player.body;
    const [a0, a1] = this.spawn.arena;
    if (this.state !== 'slamJump') this.facing = p.x < b.x ? -1 : 1;
    switch (this.state) {
      case 'intro':
        b.vx = 0;
        if (this.t < 0.05) g.sfx.play('roar');
        if (this.t > 1.3) this.setState('idle');
        break;
      case 'idle':
        b.vx = approach(b.vx, this.facing * 1.3, 6 * dt);
        if (this.t > (this.phase2 ? 0.7 : 1.1)) {
          b.vx = 0;
          this.attackCount++;
          this.setState(this.attackCount % 2 === 1 ? 'slamWind' : 'throwWind');
        }
        break;
      case 'slamWind':
        b.vx = 0;
        if (this.t > 0.75) {
          b.vy = 16;
          b.vx = clamp((p.x - b.x) * 0.95, -7, 7);
          this.setState('slamJump');
          g.sfx.play('jumpBig');
        }
        break;
      case 'slamJump':
        if (b.onGround && this.t > 0.15) {
          b.vx = 0;
          g.shake(0.6);
          g.sfx.play('slam');
          const sp = this.phase2 ? 9 : 7;
          for (const dir of [-1, 1]) {
            g.spawnProjectile({ kind: 'wave', x: b.x + dir * 1.2, y: b.y, z: 0, vx: dir * sp, vy: 0, vz: 0, r: 0.4, color: 'none', gravity: 0, damage: 1, life: 4 });
          }
          g.burst(b.x, b.y, b.z, 'dust', 16, { speed: 6, up: 2, life: 0.6 });
          this.setState('stunned');
        }
        break;
      case 'stunned':
        b.vx = 0;
        if (this.phase2 && this.t > 0.45 && this.t - dt <= 0.45) {
          // 第2形態: 遅れて2発目の衝撃波
          for (const dir of [-1, 1]) {
            g.spawnProjectile({ kind: 'wave', x: b.x + dir * 1.2, y: b.y, z: 0, vx: dir * 6, vy: 0, vz: 0, r: 0.4, color: 'none', gravity: 0, damage: 1, life: 4 });
          }
          g.sfx.play('slam');
        }
        if (this.t > (this.phase2 ? 1.1 : 1.5)) this.setState('idle');
        break;
      case 'throwWind':
        b.vx = 0;
        if (this.t > 0.65) {
          const flights = this.phase2 ? [0.75, 1.0, 1.3] : [1.0];
          const sx = b.x + this.facing * 0.6;
          const sy = b.y + b.h + 0.4;
          const gr = 20;
          flights.forEach((T, i) => {
            const tx = p.x + (i - (flights.length - 1) / 2) * 1.6;
            g.spawnProjectile({
              kind: 'rock', x: sx, y: sy, z: 0, r: 0.45, color: 'none', gravity: gr, damage: 1,
              vx: (tx - sx) / T, vy: (p.y + 0.4 - sy + 0.5 * gr * T * T) / T, vz: 0,
            });
          });
          g.sfx.play('throw');
          this.setState('throwRecover');
        }
        break;
      case 'throwRecover':
        if (this.t > 0.5) this.setState('idle');
        break;
    }
    b.vy = Math.max(-24, b.vy - 34 * dt);
    moveBody(g.stage.index, b, dt, false);
    b.x = clamp(b.x, a0 + 1 + b.w / 2, a1 - 0.2 - b.w / 2);
  }
}

/** ボス2: カラーフォートレス（64N）。赤い（色属性）弾の連射と爆撃。オーバーヒートで着地したら反撃のチャンス。 */
export class Fortress extends Boss {
  readonly type = 'fortress' as const;
  readonly name = 'カラーフォートレス';
  private hoverY: number;
  constructor(s: BossSpawn) {
    super(s, 2.6, 2.2);
    this.hoverY = s.y;
  }
  vulnerable(): boolean {
    return this.state === 'grounded';
  }
  contactDamage(): number {
    return this.state === 'grounded' || this.state === 'descend' ? 0 : 1;
  }
  think(g: Game, dt: number): void {
    const b = this.body;
    const p = g.player.body;
    const spatial = g.laws.spatial;
    this.facing = p.x < b.x ? -1 : 1;
    const hover = () => {
      const tx = clamp(p.x + Math.sin(g.time * 0.9) * 4, this.spawn.arena[0] + 3, this.spawn.arena[1] - 3);
      b.x = approach(b.x, tx, 2.2 * dt);
      b.y = approach(b.y, this.hoverY + Math.sin(g.time * 2.4) * 0.35, 4 * dt);
    };
    switch (this.state) {
      case 'intro':
        b.y = approach(b.y, this.hoverY, 4 * dt);
        if (this.t < 0.05) g.sfx.play('roar');
        if (this.t > 1.4) this.setState('hover');
        break;
      case 'hover':
        hover();
        if (this.t > (this.phase2 ? 0.7 : 1.1)) {
          this.attackCount++;
          if (this.attackCount % 3 === 0) {
            this.setState('descend');
          } else {
            this.setState(this.attackCount % 3 === 1 ? 'volleyWind' : 'rainWind');
            g.sfx.play('charge');
          }
        }
        break;
      case 'volleyWind': {
        hover();
        // 照準: プレイヤーの現在位置を追う（発射直前に固定）
        if (this.t < 0.55) {
          const n = this.phase2 ? 5 : 3;
          this.aims = [];
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * (this.phase2 ? 1.3 : 1.6);
            this.aims.push({ x: p.x + off, y: p.y + 0.5, z: spatial ? p.z : 0 });
          }
        }
        if (this.t > 0.9) {
          const sx = b.x, sy = b.y + 0.6, sz = 0;
          for (const a of this.aims) {
            const dx = a.x - sx, dy = a.y - sy, dz = a.z - sz;
            const len = Math.hypot(dx, dy, dz) || 1;
            const sp = this.phase2 ? 8 : 7;
            g.spawnProjectile({ kind: 'orb', x: sx, y: sy, z: sz, r: 0.32, color: 'red', gravity: 0, damage: 1, vx: (dx / len) * sp, vy: (dy / len) * sp, vz: (dz / len) * sp });
          }
          this.aims = [];
          g.sfx.play('laser');
          this.setState('hover');
        }
        break;
      }
      case 'rainWind':
        hover();
        if (this.t < 0.05) {
          const n = this.phase2 ? 5 : 3;
          this.markers = [];
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * 2.2;
            this.markers.push({ x: clamp(p.x + off, this.spawn.arena[0] + 1.5, this.spawn.arena[1] - 1.5), z: spatial ? p.z : 0 });
          }
        }
        if (this.t > 1.0) {
          for (const m of this.markers) {
            g.spawnProjectile({ kind: 'bomb', x: m.x, y: 12, z: m.z, r: 0.4, color: 'red', gravity: 0, damage: 1, vx: 0, vy: -14, vz: 0 });
          }
          this.markers = [];
          g.sfx.play('laser');
          this.setState('hover');
        }
        break;
      case 'descend':
        b.x = approach(b.x, clamp(b.x, this.spawn.arena[0] + 3, this.spawn.arena[1] - 3), 3 * dt);
        b.y = approach(b.y, 0, 10 * dt);
        if (b.y <= 0) {
          g.shake(0.4);
          g.sfx.play('slam');
          g.burst(b.x, 0, b.z, 'steam', 14, { speed: 3, up: 3, life: 0.8 });
          this.setState('grounded');
        }
        break;
      case 'grounded':
        if (Math.random() < dt * 8) g.burst(b.x + (Math.random() - 0.5) * 2, b.y + b.h, b.z, 'steam', 1, { speed: 1, up: 3, life: 0.8 });
        if (this.t > (this.phase2 ? 1.9 : 2.6)) {
          this.setState('ascend');
          g.sfx.play('charge');
        }
        break;
      case 'ascend':
        b.y = approach(b.y, this.hoverY, 6 * dt);
        if (this.t > 0.8) this.setState('hover');
        break;
    }
  }
}

export function createBoss(s: BossSpawn): Boss {
  return s.type === 'guardian' ? new Guardian(s) : new Fortress(s);
}
