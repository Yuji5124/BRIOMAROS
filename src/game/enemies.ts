import { moveBody, overlapsAny, type Body } from '../core/physics';
import { approach } from '../core/types';
import type { EnemySpawn, EnemyType } from '../world/stage';
import type { Game } from './game';

/**
 * 通常敵。行動はすべてプログラムのステートマシン。
 * 攻撃の前には必ず予備動作（anticipation）を入れて、避けられるようにする。
 */
export abstract class Enemy {
  abstract readonly type: EnemyType;
  body: Body;
  hp = 1;
  state = 'idle';
  t = 0;
  facing: 1 | -1 = -1;
  dead = false;
  /** 撃破演出の残り時間（>0 で演出中） */
  dying = 0;
  flash = 0;
  /** 踏まれて潰れた（描画用） */
  squashed = false;
  /** 撃破されない（実験場の砲台など） */
  invincible = false;
  /** 3D媒体での奥行き追跡を覚えたか（媒体が増えるほど敵も強くなる） */
  evolved = false;
  readonly spawn: EnemySpawn;

  constructor(s: EnemySpawn, w: number, h: number) {
    this.spawn = s;
    this.body = { x: s.x, y: s.y, z: s.z ?? 0, w, h, d: 0.8, vx: 0, vy: 0, vz: 0, onGround: false };
  }

  get alive(): boolean {
    return !this.dead && this.dying <= 0;
  }

  /** 上から踏めるか */
  canStomp(): boolean {
    return true;
  }
  /** 触れたときのダメージ */
  contactDamage(): number {
    return 1;
  }

  setState(s: string): void {
    this.state = s;
    this.t = 0;
  }

  abstract think(g: Game, dt: number): void;

  update(g: Game, dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    if (this.dying > 0) {
      this.dying -= dt;
      if (!this.squashed) {
        this.body.vy -= 30 * dt;
        this.body.y += this.body.vy * dt;
        this.body.x += this.body.vx * dt;
      }
      if (this.dying <= 0) this.dead = true;
      return;
    }
    this.t += dt;
    this.think(g, dt);
    this.body.vy = Math.max(-20, this.body.vy - 34 * dt);
    const spatial = g.laws.spatial && this.evolved;
    moveBody(g.stage.index, this.body, dt, spatial);
    if (this.body.y < -6) this.dead = true;
  }

  damage(g: Game, amount: number, how: 'stomp' | 'punch'): void {
    if (this.invincible) {
      this.flash = 0.15;
      g.sfx.play('clink');
      return;
    }
    this.hp -= amount;
    this.flash = 0.2;
    if (this.hp > 0) {
      g.sfx.play('hit');
      this.body.vx = (this.body.x < g.player.body.x ? -1 : 1) * 4;
      return;
    }
    g.score += 100;
    g.floater('+100', this.body.x, this.body.y + this.body.h + 0.3, this.body.z, '#fff');
    if (how === 'stomp') {
      this.squashed = true;
      this.dying = 0.45;
      g.sfx.play('stomp');
    } else {
      this.dying = 0.9;
      this.body.vy = 9;
      this.body.vx = (this.body.x < g.player.body.x ? -1 : 1) * 5;
      g.sfx.play('kick');
    }
    g.burst(this.body.x, this.body.y + this.body.h / 2, this.body.z, 'spark', 10, { speed: 5, life: 0.4 });
  }

  protected distToPlayer(g: Game): number {
    return Math.abs(g.player.body.x - this.body.x);
  }

  /** 前方の足元に地面があるか（崖で引き返す） */
  protected groundAhead(g: Game, dir: number): boolean {
    const b = this.body;
    const x = b.x + dir * (b.w / 2 + 0.1);
    const probe = { x0: x - 0.05, x1: x + 0.05, y0: b.y - 0.3, y1: b.y - 0.05, z0: b.z - 0.1, z1: b.z + 0.1 };
    return !!overlapsAny(g.stage.index, probe, g.laws.spatial && this.evolved);
  }
}

/** クリボット: 歩き回り、プレイヤーに気づくと追いかける。STAGE 02 では 3D 媒体で奥行きも追う。 */
export class Kuribot extends Enemy {
  readonly type = 'kuribot' as const;
  constructor(s: EnemySpawn) {
    super(s, 0.8, 0.8);
    this.evolved = s.x > 128;
    this.state = 'walk';
  }
  think(g: Game, dt: number): void {
    const b = this.body;
    const p = g.player.body;
    const near = this.distToPlayer(g) < 6 && Math.abs(p.y - b.y) < 2.5 && !g.player.dead;
    switch (this.state) {
      case 'walk':
        b.vx = this.facing * 1.4;
        if (!this.groundAhead(g, this.facing) || this.blocked(g)) this.facing = -this.facing as 1 | -1;
        if (near && this.t > 0.5) {
          this.setState('notice');
          g.sfx.play('notice');
          if (b.onGround) b.vy = 5;
        }
        break;
      case 'notice':
        b.vx = 0;
        this.facing = p.x < b.x ? -1 : 1;
        if (this.t > 0.4) this.setState('chase');
        break;
      case 'chase': {
        this.facing = p.x < b.x ? -1 : 1;
        const speed = this.groundAhead(g, this.facing) ? 2.7 : 0;
        b.vx = approach(b.vx, this.facing * speed, 12 * dt);
        if (this.evolved && g.laws.spatial) b.vz = approach(b.vz, Math.sign(p.z - b.z) * 1.8, 8 * dt);
        else b.vz = 0;
        if (!near && this.t > 1.5) this.setState('walk');
        break;
      }
    }
  }
  private blocked(g: Game): boolean {
    const b = this.body;
    const x = b.x + this.facing * (b.w / 2 + 0.06);
    return !!overlapsAny(
      g.stage.index,
      { x0: x - 0.03, x1: x + 0.03, y0: b.y + 0.1, y1: b.y + b.h - 0.1, z0: b.z - 0.1, z1: b.z + 0.1 },
      g.laws.spatial && this.evolved,
    );
  }
}

/** スパイクト: しゃがみ（予兆）→ トゲを出してジャンプ → 着地後しばらくトゲを引っ込める */
export class Spikuto extends Enemy {
  readonly type = 'spikuto' as const;
  /** 0..1 トゲの出具合 */
  spikes = 0;
  constructor(s: EnemySpawn) {
    super(s, 0.85, 0.85);
    this.evolved = s.x > 128;
  }
  canStomp(): boolean {
    return this.spikes < 0.3;
  }
  think(g: Game, dt: number): void {
    const b = this.body;
    const p = g.player.body;
    const target = this.state === 'crouch' || this.state === 'jump' || this.state === 'land' ? 1 : 0;
    this.spikes = approach(this.spikes, target, dt * 6);
    switch (this.state) {
      case 'idle':
        b.vx = approach(b.vx, 0, 10 * dt);
        this.facing = p.x < b.x ? -1 : 1;
        if (this.t > 1.3 && this.distToPlayer(g) < 8) this.setState('crouch');
        break;
      case 'crouch':
        if (this.t > 0.55) {
          b.vy = 11;
          b.vx = this.facing * Math.min(3.2, this.distToPlayer(g) * 0.8);
          if (this.evolved && g.laws.spatial) b.vz = Math.sign(p.z - b.z) * Math.min(2, Math.abs(p.z - b.z));
          this.setState('jump');
          g.sfx.play('spring');
        }
        break;
      case 'jump':
        if (b.onGround && this.t > 0.1) {
          b.vz = 0;
          this.setState('land');
        }
        break;
      case 'land':
        b.vx = approach(b.vx, 0, 14 * dt);
        if (this.t > 0.4) this.setState('idle');
        break;
    }
  }
}

/** アイアンスロワー: 振りかぶり（予兆）→ 鉄球（物理）または赤い弾（色属性）を投げる */
export class Thrower extends Enemy {
  readonly type = 'thrower' as const;
  /** 次に投げる物 */
  nextShot: 'iron' | 'red' = 'iron';
  constructor(s: EnemySpawn) {
    super(s, 0.9, 1.3);
    this.hp = 2;
  }
  think(g: Game, dt: number): void {
    const b = this.body;
    const p = g.player.body;
    b.vx = approach(b.vx, 0, 10 * dt);
    this.facing = p.x < b.x ? -1 : 1;
    switch (this.state) {
      case 'idle':
        if (this.t > 1.3 && this.distToPlayer(g) < 11 && !g.player.dead) {
          this.setState('windup');
          g.sfx.play('windup');
        }
        break;
      case 'windup':
        if (this.t > 0.65) {
          const sx = b.x + this.facing * 0.5;
          const sy = b.y + 1.4;
          if (this.nextShot === 'iron') {
            // 放物線で着地点がプレイヤーになるように
            const T = 0.9;
            const gr = 22;
            g.spawnProjectile({
              kind: 'iron', x: sx, y: sy, z: b.z, r: 0.32, color: 'none', gravity: gr, damage: 1,
              vx: (p.x - sx) / T, vy: (p.y + 0.4 - sy + 0.5 * gr * T * T) / T, vz: g.laws.spatial ? (p.z - b.z) / T : 0,
            });
          } else {
            const dx = p.x - sx, dy = p.y + 0.5 - sy, dz = g.laws.spatial ? p.z - b.z : 0;
            const len = Math.hypot(dx, dy, dz) || 1;
            g.spawnProjectile({
              kind: 'orb', x: sx, y: sy, z: b.z, r: 0.3, color: 'red', gravity: 0, damage: 1,
              vx: (dx / len) * 6.5, vy: (dy / len) * 6.5, vz: (dz / len) * 6.5,
            });
          }
          g.sfx.play(this.nextShot === 'iron' ? 'throw' : 'laser');
          if (this.spawn.variant === 'mixed') this.nextShot = this.nextShot === 'iron' ? 'red' : 'iron';
          this.setState('recover');
        }
        break;
      case 'recover':
        if (this.t > 0.35) this.setState('idle');
        break;
    }
  }
}

/** 実験場の砲台: 赤い弾を撃つ。ダメージはなく、BG で無効化される様子を試せる */
export class Turret extends Enemy {
  readonly type = 'turret' as const;
  constructor(s: EnemySpawn) {
    super(s, 1, 1.2);
    this.invincible = true;
    this.facing = -1;
  }
  contactDamage(): number {
    return 0;
  }
  canStomp(): boolean {
    return false;
  }
  think(g: Game): void {
    const b = this.body;
    b.vx = 0;
    switch (this.state) {
      case 'idle':
        if (this.t > 1.2 && this.distToPlayer(g) < 14) this.setState('charge');
        break;
      case 'charge':
        if (this.t > 0.5) {
          g.spawnProjectile({
            kind: 'orb', x: b.x - 0.6, y: b.y + 0.65, z: g.player.body.z, r: 0.3, color: 'red', gravity: 0,
            damage: 0, harmless: true, vx: -5.5, vy: 0, vz: 0,
          });
          g.sfx.play('laser');
          this.setState('idle');
        }
        break;
    }
  }
}

export function createEnemy(s: EnemySpawn): Enemy {
  switch (s.type) {
    case 'kuribot':
      return new Kuribot(s);
    case 'spikuto':
      return new Spikuto(s);
    case 'thrower':
      return new Thrower(s);
    case 'turret':
      return new Turret(s);
  }
}
