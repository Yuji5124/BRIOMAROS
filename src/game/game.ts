import { Audio } from '../core/audio';
import { PLAYER, TILE_PX, VIEW_W } from '../core/config';
import { Input } from '../core/input';
import { bodyBox, findSafeSpot } from '../core/physics';
import { approach, clamp, type Solid } from '../core/types';
import { MEDIA, MediumInventory, type MediumId, type MediumLaws } from '../media/registry';
import { buildStage, type Hint, type StageData } from '../world/stage';
import { createBoss, type Boss } from './bosses';
import { colorAffects, hitTest, isStomp, projBox, type Projectile } from './combat';
import { createEnemy, type Enemy } from './enemies';
import { Player } from './player';

export type ParticleKind = 'dust' | 'hit' | 'spark' | 'boom' | 'steam' | 'coin' | 'nullify' | 'switch';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
}

export interface Floater {
  text: string;
  x: number;
  y: number;
  z: number;
  t: number;
  color: string;
}

export interface Pickup {
  medium: MediumId;
  x: number;
  y: number;
  z: number;
  t: number;
  taken: boolean;
}

export interface Transition {
  from: MediumId;
  to: MediumId;
  t: number;
  dur: number;
}

export type GameState = 'title' | 'play' | 'clear';

type Listener = (e: GameEvent) => void;
export type GameEvent =
  | { type: 'medium'; from: MediumId; to: MediumId }
  | { type: 'banner'; title: string; sub: string; kind: 'stage' | 'unlock' | 'boss' | 'info' }
  | { type: 'hint'; text: string }
  | { type: 'state'; state: GameState }
  | { type: 'deny'; text: string };

/**
 * ゲーム本体。共通世界の状態（ステージ・主人公・敵・弾）だけを持ち、描画は持たない。
 * 媒体の違いは `laws`（世界の法則）と `move`（操作感）を通してだけ現れる。
 */
export class Game {
  readonly input: Input;
  readonly sfx = new Audio();
  readonly media = new MediumInventory();
  stage!: StageData;
  player = new Player();
  enemies: Enemy[] = [];
  bosses: Boss[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  pickups: Pickup[] = [];
  state: GameState = 'title';
  time = 0;
  score = 0;
  coins = 0;
  deaths = 0;
  playTime = 0;
  checkpoint = 0;
  section = 0;
  /** カメラ注視点（世界座標）。各レンダラーが共通で使う */
  cam = { x: 10, y: 4.6, shake: 0 };
  transition: Transition | null = null;
  /** 媒体ホイール（K 長押し） */
  wheel: { open: boolean; index: number } = { open: false, index: 0 };
  timeScale = 1;
  paused = false;
  dev = { enabled: false, god: false, hitboxes: false };
  private listeners: Listener[] = [];
  private acc = 0;
  private laserTouch = false;
  private buf = new Set<'jump' | 'action'>();

  /** 押した瞬間（ジャンプ・アクション） */
  pressed(a: 'jump' | 'action'): boolean {
    return this.buf.has(a);
  }

  constructor(input: Input) {
    this.input = input;
    this.reset();
  }

  on(l: Listener): void {
    this.listeners.push(l);
  }
  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  get medium(): MediumId {
    return this.media.current;
  }
  get laws(): MediumLaws {
    return MEDIA[this.media.current].laws;
  }
  get move() {
    return MEDIA[this.media.current].move;
  }
  get activeBoss(): Boss | null {
    return this.bosses.find((b) => b.active) ?? null;
  }

  reset(): void {
    this.stage = buildStage();
    this.enemies = this.stage.enemies.map(createEnemy);
    this.bosses = this.stage.bosses.map(createBoss);
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
    this.media.reset(['CF']);
    this.score = 0;
    this.coins = 0;
    this.deaths = 0;
    this.playTime = 0;
    this.checkpoint = 0;
    this.section = 0;
    this.transition = null;
    const cp = this.stage.checkpoints[0];
    this.player.reset(cp.x, cp.y);
    this.cam.x = this.clampCamX(cp.x + 6);
    this.cam.y = 4.6;
  }

  start(): void {
    this.sfx.ensure();
    this.reset();
    this.state = 'play';
    this.sfx.startMusic();
    this.emit({ type: 'state', state: 'play' });
    this.emit({ type: 'banner', title: 'STAGE 01', sub: '最初の壁', kind: 'stage' });
  }

  // ======================= メインループ =======================
  frame(realDt: number): void {
    const inp = this.input;
    if (inp.pressed('mute')) this.sfx.setMuted(!this.sfx.muted);
    if (inp.pressed('dev')) this.dev.enabled = !this.dev.enabled;
    if (this.state === 'title' || this.state === 'clear') {
      if (inp.pressed('start') || inp.pressed('jump')) this.start();
      this.time += realDt;
      inp.endFrame(realDt);
      return;
    }
    if (inp.pressed('pause')) {
      this.paused = !this.paused;
      this.sfx.ensure();
    }
    if (this.paused) {
      inp.endFrame(realDt);
      return;
    }
    this.handleMediumInput();
    if (this.dev.enabled && inp.digit !== null) this.devDigit(inp.digit);

    // 押した瞬間の入力は、シミュレーションの次の1ステップまで保持する（高リフレッシュレート対策）
    if (inp.pressed('jump')) this.buf.add('jump');
    if (inp.pressed('action')) this.buf.add('action');
    const STEP = 1 / 60;
    this.acc += Math.min(realDt, 0.1) * this.timeScale;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
      this.buf.clear();
    }
    inp.endFrame(realDt);
    // 演出（実時間で進める）
    if (this.transition) {
      this.transition.t += realDt;
      if (this.transition.t >= this.transition.dur) this.transition = null;
    }
    for (const f of this.floaters) f.t += realDt;
    this.floaters = this.floaters.filter((f) => f.t < 1.2);
  }

  private step(dt: number): void {
    this.time += dt;
    this.playTime += dt;
    const p = this.player;
    p.update(this, dt);
    for (const e of this.enemies) if (Math.abs(e.body.x - this.cam.x) < 22 || e.dying > 0) e.update(this, dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const b of this.bosses) if (!b.defeated) b.update(this, dt);
    this.updateBossTriggers();
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    if (!p.dead) {
      this.combat();
      this.collect();
      this.hazards();
      this.progress();
    } else if (p.deadT > 1.8) {
      this.respawn();
    }
    this.updateCamera(dt);
    for (const s of this.stage.index.all) if (s.bumpT) s.bumpT = Math.max(0, s.bumpT - dt);
  }

  // ======================= 媒体切替 =======================
  private handleMediumInput(): void {
    const inp = this.input;
    const list = this.media.list();
    if (inp.isDown('medium') && inp.heldTime('medium') > 0.28 && !this.wheel.open && list.length > 1) {
      this.wheel.open = true;
      this.wheel.index = list.indexOf(this.medium);
      this.timeScale = 0.3;
      this.sfx.play('select');
    }
    if (this.wheel.open) {
      if (inp.pressed('left') || inp.pressed('up')) {
        this.wheel.index = (this.wheel.index - 1 + list.length) % list.length;
        this.sfx.play('select');
      }
      if (inp.pressed('right') || inp.pressed('down')) {
        this.wheel.index = (this.wheel.index + 1) % list.length;
        this.sfx.play('select');
      }
      if (inp.released('medium')) {
        this.wheel.open = false;
        this.timeScale = 1;
        this.requestMedium(list[this.wheel.index]);
      }
      return;
    }
    if (inp.released('medium')) {
      if (list.length <= 1) {
        this.sfx.play('deny');
        this.emit({ type: 'deny', text: 'まだほかの媒体を持っていない。ボスを倒して手に入れよう。' });
      } else {
        this.requestMedium(this.media.cycle(1));
      }
    }
  }

  /**
   * 媒体の切替。新しい法則で主人公が地形に埋まらないかを確認し、
   * 埋まる場合は近くの安全な位置へずらす。見つからなければ切替を拒否する。
   */
  requestMedium(id: MediumId, force = false): boolean {
    if (id === this.medium) return true;
    if (!this.media.canSelect(id, force || (this.dev.enabled && this.dev.god))) {
      this.sfx.play('deny');
      this.emit({ type: 'deny', text: `${id} はまだ獲得していない。` });
      return false;
    }
    const laws = MEDIA[id].laws;
    const b = this.player.body;
    const spot = findSafeSpot(this.stage.index, b, laws.spatial);
    if (!spot) {
      this.sfx.play('deny');
      this.emit({ type: 'deny', text: 'ここでは切り替えられない（地形に埋まってしまう）。' });
      return false;
    }
    b.x = spot.x;
    b.y = spot.y;
    b.z = spot.z;
    if (!laws.spatial) b.vz = 0;
    const from = this.medium;
    this.media.current = id;
    this.sfx.setTimbre(id === '64N' ? 'n64' : id === 'BG' ? 'bg' : 'cf');
    this.sfx.play('switch');
    this.transition = { from, to: id, t: 0, dur: MEDIA[from].laws.spatial !== laws.spatial ? 0.9 : 0.45 };
    this.burst(b.x, b.y + 0.5, b.z, 'switch', 16, { speed: 5, life: 0.5 });
    this.emit({ type: 'medium', from, to: id });
    return true;
  }

  unlock(id: MediumId): void {
    if (this.media.unlock(id)) {
      this.sfx.play('unlock');
      this.emit({ type: 'banner', title: `NEW MEDIUM: ${id}`, sub: `${MEDIA[id].name} — ${MEDIA[id].tagline}　K で切替`, kind: 'unlock' });
    }
  }

  private devDigit(d: number): void {
    const map: Record<number, MediumId> = { 1: 'CF', 2: '64N', 3: 'BG' };
    if (map[d]) this.requestMedium(map[d], true);
    if (d === 9) for (const id of ['64N', 'BG'] as MediumId[]) this.media.unlock(id);
    if (d === 0) this.dev.god = !this.dev.god;
    if (d === 8) this.dev.hitboxes = !this.dev.hitboxes;
  }

  warp(i: number): void {
    const w = this.stage.warps[i];
    if (!w) return;
    for (const m of w.media) this.media.unlock(m);
    const b = this.player.body;
    b.x = w.x;
    b.y = w.y + 0.01;
    b.z = 0;
    b.vx = b.vy = b.vz = 0;
    this.player.safe = { x: w.x, y: w.y, z: 0 };
    if (!w.media.includes(this.medium)) this.media.current = 'CF';
    // ボスを倒した扱いにする（ワープ先より手前のボス）
    for (const boss of this.bosses) {
      if (boss.spawn.triggerX < w.x && !boss.defeated) {
        boss.defeated = true;
        for (const gid of boss.spawn.gates) this.solidById(gid).active = false;
      }
    }
    this.checkpoint = Math.max(0, this.stage.checkpoints.findIndex((c) => c.x > w.x) - 1);
    if (this.checkpoint < 0) this.checkpoint = this.stage.checkpoints.length - 1;
    this.projectiles = [];
    this.cam.x = this.clampCamX(b.x + 4);
    if (this.state !== 'play') {
      this.state = 'play';
      this.emit({ type: 'state', state: 'play' });
    }
  }

  // ======================= 戦闘 =======================
  private combat(): void {
    const p = this.player;
    const pb = bodyBox(p.body);
    const spatial = this.laws.spatial;
    const punch = p.punchBox();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const eb = bodyBox(e.body);
      if (punch && !p.punchHits.has(e) && hitTest(punch, eb, spatial)) {
        p.punchHits.add(e);
        this.burst((punch.x0 + punch.x1) / 2, p.body.y + 0.5, p.body.z, 'hit', 6, { speed: 4, life: 0.25 });
        e.damage(this, 1, 'punch');
        continue;
      }
      if (!hitTest(pb, eb, spatial)) continue;
      if (isStomp(p.body, e.body) && e.canStomp()) {
        e.damage(this, 1, 'stomp');
        p.bounce(this);
      } else if (isStomp(p.body, e.body) && e.type === 'turret') {
        p.bounce(this);
        e.damage(this, 0, 'stomp');
      } else if (e.contactDamage() > 0) {
        p.hurt(this, e.contactDamage(), e.body.x);
      }
    }
    for (const boss of this.bosses) {
      if (!boss.active || boss.dying) continue;
      const bb = bodyBox(boss.body);
      if (punch && !p.punchHits.has(boss) && hitTest(punch, bb, spatial)) {
        p.punchHits.add(boss);
        boss.hit(this);
        continue;
      }
      if (!hitTest(pb, bb, spatial)) continue;
      if (isStomp(p.body, boss.body)) {
        boss.hit(this);
        p.bounce(this);
        p.body.vx = (p.body.x < boss.body.x ? -1 : 1) * 5;
      } else if (boss.contactDamage() > 0) {
        p.hurt(this, boss.contactDamage(), boss.body.x);
      }
    }
  }

  spawnProjectile(p: Omit<Projectile, 't' | 'life'> & { life?: number }): void {
    this.projectiles.push({ life: 6, ...p, t: 0 });
  }

  private updateProjectiles(dt: number): void {
    const pl = this.player;
    const spatial = this.laws.spatial;
    const immune = this.laws.colorImmune;
    const pb = bodyBox(pl.body);
    for (const pr of this.projectiles) {
      pr.t += dt;
      pr.vy -= pr.gravity * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      if (pr.t > pr.life) pr.dead = true;
      const box = projBox(pr);
      // 地形との衝突（衝撃波は地面を這う）
      if (pr.kind === 'wave') {
        const ahead = { ...box, y0: box.y0 + 0.2 };
        if (this.solidAt(ahead, false)) pr.dead = true;
        if (Math.random() < dt * 30) this.particles.push(this.mk('dust', pr.x, pr.y + 0.2, pr.z, -pr.vx * 0.1, 2, 0, 0.3, 0.25));
      } else if (this.solidAt(box, spatial) && pr.t > 0.05) {
        pr.dead = true;
        this.burst(pr.x, pr.y, pr.z, pr.color === 'red' ? 'spark' : 'dust', 6, { speed: 3, life: 0.3 });
        if (pr.kind === 'bomb') this.sfx.play('boom');
      }
      if (pr.dead || pl.dead) continue;
      if (!hitTest(box, pb, spatial)) continue;
      if (!colorAffects(pr.color, immune)) {
        // BG の法則: 色属性の攻撃は素通りする
        if (!pr.nullified) {
          pr.nullified = true;
          this.floater('無効！', pl.body.x, pl.body.y + 1.4, pl.body.z, '#e0f8d0');
          this.burst(pl.body.x, pl.body.y + 0.6, pl.body.z, 'nullify', 8, { speed: 3, life: 0.5 });
          this.sfx.play('nullify');
        }
        continue;
      }
      if (pr.harmless) {
        if (pl.invuln <= 0) {
          this.floater('テスト弾（ダメージなし）', pl.body.x, pl.body.y + 1.4, pl.body.z, '#ff8080');
          pl.body.vx = Math.sign(pr.vx || 1) * 5;
          pl.invuln = 0.6;
          this.sfx.play('hit');
        }
        pr.dead = true;
        continue;
      }
      if (pl.hurt(this, pr.damage, pr.x - pr.vx)) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private solidAt(b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }, spatial: boolean): Solid | null {
    for (const s of this.stage.index.query(b.x0 - 1, b.x1 + 1)) {
      if (!s.active) continue;
      if (!(b.x0 < s.x1 && s.x0 < b.x1 && b.y0 < s.y1 && s.y0 < b.y1)) continue;
      if (spatial) {
        if (s.kind !== 'flat' && b.z0 < s.z1 && s.z0 < b.z1) return s;
      } else if (s.z0 <= 0 && 0 <= s.z1) return s;
    }
    return null;
  }

  private solidById(id: number): Solid {
    return this.stage.index.all.find((s) => s.id === id)!;
  }

  // ======================= ボス戦 =======================
  private updateBossTriggers(): void {
    const p = this.player.body;
    for (const boss of this.bosses) {
      if (boss.state === 'dormant' && !boss.defeated && p.x > boss.spawn.triggerX && !this.player.dead) {
        boss.setState('intro');
        for (const gid of boss.spawn.gates) this.solidById(gid).active = true;
        this.emit({ type: 'banner', title: boss.name, sub: 'BOSS', kind: 'boss' });
      }
    }
    // 安全装置: ボス戦中に万一部屋の外へ出たら部屋の中へ戻す
    const active = this.activeBoss;
    if (active && !this.player.dead) {
      const [a0, a1] = active.spawn.arena;
      if (p.x < a0 + 0.5 || p.x > a1 + 0.5) {
        p.x = clamp(p.x, a0 + 1.5, a1 - 0.5);
        p.vx = 0;
      }
    }
    for (const pk of this.pickups) {
      pk.t += 1 / 60;
      if (pk.taken) continue;
      const near = Math.abs(p.x - pk.x) < 0.9 && Math.abs(p.y + 0.5 - pk.y) < 1.2 && (!this.laws.spatial || Math.abs(p.z - pk.z) < 1);
      if (near) {
        pk.taken = true;
        this.unlock(pk.medium);
        this.burst(pk.x, pk.y, pk.z, 'switch', 24, { speed: 6, life: 0.8 });
      }
    }
  }

  onBossDefeated(boss: Boss): void {
    for (const gid of boss.spawn.gates) this.solidById(gid).active = false;
    this.projectiles = [];
    this.pickups.push({ medium: boss.spawn.reward, x: boss.body.x, y: 1.4, z: 0, t: 0, taken: false });
    this.emit({ type: 'banner', title: 'BOSS DEFEATED!', sub: `${boss.name} を倒した！ メディアカートリッジを取ろう`, kind: 'info' });
  }

  // ======================= 収集・仕掛け・進行 =======================
  onHeadBump(s: Solid): void {
    if (s.kind === 'bump') {
      s.kind = 'used';
      s.bumpT = 0.2;
      this.coins++;
      this.score += 200;
      this.sfx.play('coin');
      this.particles.push(this.mk('coin', (s.x0 + s.x1) / 2, s.y1 + 0.5, 0, 0, 10, 0, 0.5, 0.5, 25));
    } else if (s.kind === 'brick' || s.kind === 'used') {
      s.bumpT = 0.15;
      this.sfx.play('bump');
    }
  }

  private collect(): void {
    const p = this.player.body;
    const spatial = this.laws.spatial;
    for (const c of this.stage.coins) {
      if (c.taken) continue;
      if (c.z !== 0 && !spatial) continue; // 奥・手前のコインは 3D 媒体でだけ存在する
      if (Math.abs(c.x + 0.5 - p.x) < 0.65 && c.y + 0.5 > p.y - 0.1 && c.y + 0.5 < p.y + p.h + 0.4 && (!spatial || Math.abs(c.z - p.z) < 0.8)) {
        c.taken = true;
        this.coins++;
        this.score += 100;
        this.sfx.play('coin');
        this.burst(c.x + 0.5, c.y + 0.5, c.z, 'coin', 4, { speed: 2, life: 0.3 });
      }
    }
  }

  private hazards(): void {
    const pl = this.player;
    const p = pl.body;
    let touching = false;
    for (const l of this.stage.lasers) {
      if (Math.abs(p.x - l.x) < p.w / 2 + 0.15 && p.y < l.y1 && p.y + p.h > l.y0) {
        touching = true;
        if (this.laws.colorImmune) {
          if (!this.laserTouch) {
            this.floater('無効！', p.x, p.y + 1.4, p.z, '#e0f8d0');
            this.sfx.play('nullify');
          }
        } else {
          // 無敵時間中でも通り抜けられないよう、必ず押し戻す
          const side = p.x < l.x ? -1 : 1;
          pl.hurt(this, 1, l.x);
          p.x = l.x + side * (p.w / 2 + 0.16);
          p.vx = side * 7;
        }
      }
    }
    this.laserTouch = touching;
  }

  private progress(): void {
    const p = this.player.body;
    const st = this.stage;
    // チェックポイント
    for (let i = this.checkpoint + 1; i < st.checkpoints.length; i++) {
      if (p.x >= st.checkpoints[i].x) {
        this.checkpoint = i;
        this.sfx.play('checkpoint');
        this.floater('CHECKPOINT', p.x, p.y + 1.6, p.z, '#ffd23a');
      }
    }
    // 区間
    for (let i = this.section + 1; i < st.sections.length; i++) {
      if (p.x >= st.sections[i].x) {
        this.section = i;
        this.sfx.section = i;
        this.emit({ type: 'banner', title: st.sections[i].label, sub: st.sections[i].title, kind: 'stage' });
      }
    }
    // ヒント
    for (const h of st.hints) {
      if (h.shown || p.x < h.x || p.x > h.x + 12) continue;
      if (!this.hintAllowed(h)) continue;
      h.shown = true;
      this.emit({ type: 'hint', text: h.text });
    }
    if (p.x >= st.goalX && this.state === 'play') {
      this.state = 'clear';
      this.sfx.play('clear');
      this.emit({ type: 'state', state: 'clear' });
    }
  }

  private hintAllowed(h: Hint): boolean {
    if (h.needs && !this.media.has(h.needs)) return false;
    if (h.lacks && this.media.has(h.lacks)) return false;
    return true;
  }

  onFall(): void {
    const pl = this.player;
    if (pl.dead) return;
    this.sfx.play('fall');
    pl.hp -= 1;
    if (pl.hp <= 0 || this.dev.god) {
      if (this.dev.god) pl.hp = Math.max(pl.hp, 1);
      else return this.onPlayerDeath();
    }
    const b = pl.body;
    b.x = pl.safe.x;
    b.y = pl.safe.y + 0.01;
    b.z = this.laws.spatial ? pl.safe.z : 0;
    b.vx = b.vy = b.vz = 0;
    pl.invuln = PLAYER.invulnTime;
  }

  onPlayerDeath(): void {
    const pl = this.player;
    pl.dead = true;
    pl.deadT = 0;
    pl.body.vy = 12;
    this.deaths++;
    this.sfx.play('hurt');
  }

  private respawn(): void {
    const cp = this.stage.checkpoints[this.checkpoint];
    this.player.reset(cp.x, cp.y);
    this.projectiles = [];
    for (const boss of this.bosses) {
      if (boss.active && !boss.dying) {
        boss.reset();
        for (const gid of boss.spawn.gates) this.solidById(gid).active = false;
      }
    }
    // 2D に戻れない位置ではないのでそのまま（媒体は維持）
    const spot = findSafeSpot(this.stage.index, this.player.body, this.laws.spatial);
    if (spot) Object.assign(this.player.body, spot);
    this.cam.x = this.clampCamX(cp.x + 4);
  }

  // ======================= カメラ =======================
  private clampCamX(x: number): number {
    const half = VIEW_W / TILE_PX / 2;
    let lo = half - 0.5;
    let hi = this.stage.endX - half;
    const boss = this.activeBoss;
    if (boss) {
      lo = Math.max(lo, boss.spawn.arena[0] + half - 0.3);
      hi = Math.min(hi, boss.spawn.arena[1] - half + 0.3);
      if (lo > hi) lo = hi = (boss.spawn.arena[0] + boss.spawn.arena[1]) / 2;
    }
    return clamp(x, lo, hi);
  }

  private updateCamera(dt: number): void {
    const p = this.player.body;
    const target = this.clampCamX(p.x + this.player.facing * 1.6);
    this.cam.x = approach(this.cam.x, target, Math.max(4, Math.abs(target - this.cam.x) * 5) * dt);
    const ty = Math.max(4.6, p.y + 1.2);
    this.cam.y = approach(this.cam.y, ty, Math.max(2, Math.abs(ty - this.cam.y) * 4) * dt);
    this.cam.shake = Math.max(0, this.cam.shake - dt);
  }

  shake(a: number): void {
    this.cam.shake = Math.max(this.cam.shake, a);
  }

  // ======================= 演出 =======================
  private mk(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, gravity = 12): Particle {
    return { kind, x, y, z, vx, vy, vz, life, max: life, size, gravity };
  }

  burst(x: number, y: number, z: number, kind: ParticleKind, n: number, o: { speed?: number; up?: number; life?: number } = {}): void {
    const sp = o.speed ?? 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.4 + Math.random() * 0.6);
      const g = kind === 'steam' || kind === 'nullify' || kind === 'switch' ? -2 : kind === 'dust' ? 4 : 14;
      this.particles.push(
        this.mk(kind, x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.8 + (o.up ?? 0), (Math.random() - 0.5) * s, (o.life ?? 0.4) * (0.6 + Math.random() * 0.6), 0.12 + Math.random() * 0.12, g),
      );
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  floater(text: string, x: number, y: number, z: number, color: string): void {
    this.floaters.push({ text, x, y, z, t: 0, color });
  }
}
