import { KILL_Y, PLAYER } from '../core/config';
import { bodyBox, moveBody, overlapsAny, type Body } from '../core/physics';
import { approach, type Box } from '../core/types';
import type { Game } from './game';

/**
 * 主人公。位置・HP・進行状態は媒体に依存せず共通で持つ。
 * 媒体が変わるのは「操作感パラメータ」と「世界の法則」だけ。
 */
export class Player {
  body: Body = { x: 2, y: 0, z: 0, w: PLAYER.width, h: PLAYER.height, d: PLAYER.depth, vx: 0, vy: 0, vz: 0, onGround: false };
  hp = PLAYER.maxHp;
  facing: 1 | -1 = 1;
  invuln = 0;
  punchT = 0;
  punchCd = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private jumpCutDone = true;
  /** アニメーション用 */
  runPhase = 0;
  airTime = 0;
  landT = 0;
  hurtT = 0;
  dead = false;
  deadT = 0;
  /** 最後に安全に立っていた位置（穴に落ちたときの復帰先） */
  safe = { x: 2, y: 0, z: 0 };
  /** パンチがすでに当たった相手（1回の攻撃で多段ヒットさせない） */
  punchHits = new Set<object>();

  reset(x: number, y: number): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = 0;
    b.vx = b.vy = b.vz = 0;
    this.hp = PLAYER.maxHp;
    this.invuln = 1;
    this.dead = false;
    this.deadT = 0;
    this.hurtT = 0;
    this.punchT = 0;
    this.safe = { x, y, z: 0 };
  }

  get punching(): boolean {
    return this.punchT > 0;
  }

  /** パンチの当たり判定（有効フレーム中のみ） */
  punchBox(): Box | null {
    const p = PLAYER.punch;
    const t = p.duration - this.punchT;
    if (this.punchT <= 0 || t < p.activeFrom || t > p.activeTo) return null;
    const b = this.body;
    const x0 = this.facing > 0 ? b.x : b.x - b.w / 2 - p.reach;
    return { x0, x1: x0 + b.w / 2 + p.reach, y0: b.y + 0.15, y1: b.y + 0.9, z0: b.z - 0.6, z1: b.z + 0.6 };
  }

  update(g: Game, dt: number): void {
    const b = this.body;
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT < 0.5) return;
      b.vy -= 30 * dt;
      b.y += b.vy * dt;
      return;
    }
    const m = g.move;
    const spatial = g.laws.spatial;
    const inp = g.input;
    this.invuln = Math.max(0, this.invuln - dt);
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landT = Math.max(0, this.landT - dt);

    // ---- 横移動 ----
    const ax = this.hurtT > 0.25 ? 0 : inp.axisX();
    const ctrl = b.onGround ? 1 : m.airControl;
    if (ax !== 0) {
      const turning = Math.sign(b.vx) !== ax && b.vx !== 0;
      const rate = (turning ? m.turnDecel : m.accel) * ctrl;
      b.vx = approach(b.vx, ax * m.maxSpeed, rate * dt);
      if (!this.punching) this.facing = ax as 1 | -1;
    } else {
      b.vx = approach(b.vx, 0, m.decel * ctrl * dt);
    }
    // ---- 奥行き移動（3D媒体の法則） ----
    if (spatial) {
      const az = this.hurtT > 0.25 ? 0 : inp.axisZ();
      b.vz = approach(b.vz, az * m.depthSpeed, (az ? m.accel : m.decel) * ctrl * dt);
    } else {
      b.vz = 0;
    }

    // ---- ジャンプ（コヨーテタイム＋先行入力＋可変高さ） ----
    this.coyote = b.onGround ? m.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuf = g.pressed('jump') ? m.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) {
      b.vy = m.jumpSpeed;
      b.onGround = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.jumpCutDone = false;
      g.sfx.play('jump');
    }
    if (!this.jumpCutDone && b.vy > 0 && !inp.isDown('jump')) {
      b.vy *= m.jumpCut;
      this.jumpCutDone = true;
    }
    if (b.vy <= 0) this.jumpCutDone = true;

    // ---- アクション（パンチ） ----
    if (g.pressed('action') && this.punchCd <= 0 && this.hurtT <= 0.25) {
      this.punchT = PLAYER.punch.duration;
      this.punchCd = PLAYER.punch.cooldown;
      this.punchHits.clear();
      b.vx += this.facing * PLAYER.punch.lunge;
      g.sfx.play('punch');
    }
    this.punchT = Math.max(0, this.punchT - dt);

    // ---- 重力 ----
    const grav = m.gravity * (b.vy < 0 ? m.fallGravityMul : 1);
    b.vy = Math.max(-m.maxFall, b.vy - grav * dt);

    const res = moveBody(g.stage.index, b, dt, spatial);
    if (res.hitCeiling) g.onHeadBump(res.hitCeiling);
    if (res.landed) {
      this.landT = 0.12;
      if (this.airTime > 0.25) g.burst(b.x, b.y, b.z, 'dust', 5, { speed: 2, up: 1.5, life: 0.35 });
    }
    this.airTime = b.onGround ? 0 : this.airTime + dt;
    if (b.onGround && Math.abs(b.vx) > 0.5) this.runPhase += Math.abs(b.vx) * dt * 1.6;
    if (b.onGround && Math.abs(b.vx) < 0.5) this.runPhase = 0;

    // 安全な足場の記録（両足の下に地面があるとき）
    if (b.onGround && this.hurtT <= 0) {
      const bb = bodyBox(b);
      const l = { ...bb, x1: bb.x0 + 0.05, y0: bb.y0 - 0.1, y1: bb.y0 };
      const r = { ...bb, x0: bb.x1 - 0.05, y0: bb.y0 - 0.1, y1: bb.y0 };
      if (overlapsAny(g.stage.index, l, spatial) && overlapsAny(g.stage.index, r, spatial)) {
        this.safe = { x: b.x, y: b.y, z: b.z };
      }
    }

    // 落下
    if (b.y < KILL_Y) g.onFall();
  }

  /** ダメージ。戻り値はダメージが入ったかどうか */
  hurt(g: Game, amount: number, fromX: number, knock = 1): boolean {
    if (this.invuln > 0 || this.dead || g.dev.god) return false;
    this.hp -= amount;
    this.invuln = PLAYER.invulnTime;
    this.hurtT = 0.4;
    const dir = this.body.x < fromX ? -1 : 1;
    this.body.vx = dir * 6 * knock;
    this.body.vy = 7 * knock;
    this.body.onGround = false;
    g.sfx.play('hurt');
    g.shake(0.25);
    g.burst(this.body.x, this.body.y + 0.5, this.body.z, 'hit', 10, { speed: 5, life: 0.4 });
    if (this.hp <= 0) g.onPlayerDeath();
    return true;
  }

  /** 踏みつけ後の跳ね返り */
  bounce(g: Game): void {
    this.body.vy = g.move.stompBounce * (g.input.isDown('jump') ? 1.25 : 1);
    this.body.onGround = false;
    this.jumpCutDone = !g.input.isDown('jump');
  }
}
