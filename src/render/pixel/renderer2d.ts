import { TILE_PX, VIEW_H, VIEW_W } from '../../core/config';
import { toScreen2D, viewOrigin2D } from '../../core/coords';
import { hash2 } from '../../core/rng';
import type { Solid } from '../../core/types';
import type { Boss } from '../../game/bosses';
import type { Enemy, Spikuto, Thrower } from '../../game/enemies';
import type { Game } from '../../game/game';
import { PALETTES, type PaletteName } from './palette';
import { CARTRIDGE, CART_KEYS, COIN, COIN_KEYS, HERO, KURIBOT } from './sprites';

/**
 * CF / BG 用の 2D ドット描画。320×180 の内部解像度で描き、CSS で拡大（ニアレストネイバー）する。
 * 世界の z=0 断面だけを描く（2D 媒体の法則）。
 */
export class PixelRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pal: Record<string, string> = PALETTES.cf;
  private palName: PaletteName = 'cf';
  private cache = new Map<string, HTMLCanvasElement>();
  private ox = 0;
  private oy = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.canvas.className = 'view view-pixel';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  setPalette(p: PaletteName): void {
    this.palName = p;
    this.pal = PALETTES[p];
  }

  private c(key: string): string {
    return this.pal[key] ?? key;
  }

  // ---------------- スプライト ----------------
  private sprite(name: string, rows: string[], flip = false, keys?: Record<string, string>, flipY = false): HTMLCanvasElement {
    const id = `${this.palName}|${name}|${flip ? 1 : 0}|${flipY ? 1 : 0}`;
    let cv = this.cache.get(id);
    if (cv) return cv;
    const w = Math.max(...rows.map((r) => r.length));
    const h = rows.length;
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d')!;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        cx.fillStyle = this.c(keys?.[ch] ?? ch);
        cx.fillRect(flip ? w - 1 - x : x, flipY ? h - 1 - y : y, 1, 1);
      }
    }
    this.cache.set(id, cv);
    return cv;
  }

  /** 16×16 のタイル（プログラム生成） */
  private tile(kind: string, variant: number): HTMLCanvasElement {
    const id = `${this.palName}|tile|${kind}|${variant}`;
    let cv = this.cache.get(id);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = TILE_PX;
    const x = cv.getContext('2d')!;
    const px = (key: string, a: number, b: number, w = 1, h = 1) => {
      x.fillStyle = this.c(key);
      x.fillRect(a, b, w, h);
    };
    const speckle = (key: string, n: number, seed: number) => {
      for (let i = 0; i < n; i++) px(key, Math.floor(hash2(seed, i) * 16), Math.floor(hash2(i, seed) * 16));
    };
    switch (kind) {
      case 'groundTop':
        px('dirt', 0, 0, 16, 16);
        speckle('dirtDark', 10, variant + 3);
        speckle('dirtLight', 5, variant + 7);
        px('grass', 0, 0, 16, 5);
        px('grassDark', 0, 5, 16, 1);
        for (let i = 0; i < 16; i += 3) px('grassDark', i + (variant % 3), 5, 1, 1 + ((i + variant) % 2));
        for (let i = 1; i < 16; i += 4) px('white', i, 1, 1, 1);
        break;
      case 'ground':
        px('dirt', 0, 0, 16, 16);
        speckle('dirtDark', 12, variant + 11);
        speckle('dirtLight', 4, variant + 5);
        break;
      case 'brick':
        px('brickDark', 0, 0, 16, 16);
        for (const [bx, by, bw] of [[1, 1, 14], [0, 9, 7], [9, 9, 7]] as const) {
          px('brick', bx, by, bw, 6);
          px('brickLight', bx, by, bw, 1);
        }
        break;
      case 'stone':
        px('stoneDark', 0, 0, 16, 16);
        px('stone', 1, 1, 14, 14);
        px('stoneLight', 1, 1, 14, 2);
        px('stoneLight', 1, 1, 2, 14);
        speckle('stoneDark', 6, variant + 2);
        break;
      case 'wall': {
        px('wallDark', 0, 0, 16, 16);
        const off = variant % 2 ? 8 : 0;
        for (const bx of [-8 + off, off, 8 + off]) {
          px('wall', bx + 1, 1, 7, 6);
          px('wallLight', bx + 1, 1, 7, 1);
        }
        for (const bx of [-4 + off, 4 + off, 12 + off]) {
          px('wall', bx + 1, 9, 7, 6);
          px('wallLight', bx + 1, 9, 7, 1);
        }
        if (variant % 5 === 0) speckle('moss', 6, variant);
        break;
      }
      case 'bump':
        px('bumpDark', 0, 0, 16, 16);
        px('bump', 1, 1, 14, 14);
        px('bumpLight', 1, 1, 14, 1);
        for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px('bumpDark', a, b);
        // ◆ のマーク
        for (let i = 0; i < 4; i++) px('bumpLight', 7 - i, 4 + i, 2 + i * 2, 1);
        for (let i = 0; i < 4; i++) px('bumpLight', 4 + i, 8 + i, 8 - i * 2, 1);
        if (variant % 2) px('white', 7, 5, 2, 1);
        break;
      case 'used':
        px('usedDark', 0, 0, 16, 16);
        px('used', 1, 1, 14, 14);
        for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px('usedDark', a, b);
        break;
      case 'flat':
        // “ドット足場”: 2D でしか存在しない点描ブロック
        for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
          if ((xx + yy) % 2 === 0) px(xx === 0 || yy === 0 || xx === 15 || yy === 15 ? 'flatDark' : 'flat', xx, yy);
        }
        px('flatLight', 2, 2, 3, 1);
        px('flatLight', 2, 2, 1, 3);
        break;
      case 'gate':
        px('gate', 0, 0, 16, 16);
        for (let i = 2; i < 16; i += 5) px('gateLight', i, 0, 2, 16);
        px('black', 0, 7, 16, 2);
        break;
    }
    this.cache.set(id, cv);
    return cv;
  }

  // ---------------- 描画 ----------------
  render(g: Game): void {
    const ctx = this.ctx;
    const o = viewOrigin2D(g.cam.x, g.cam.y);
    const sh = g.cam.shake > 0 ? Math.round((Math.random() - 0.5) * g.cam.shake * 10) : 0;
    this.ox = o.px + sh;
    this.oy = o.py + (g.cam.shake > 0 ? Math.round((Math.random() - 0.5) * g.cam.shake * 6) : 0);
    this.drawBackground();
    const left = o.left - 1;
    const right = o.left + VIEW_W / TILE_PX + 1;
    for (const s of g.stage.index.query(left, right)) this.drawSolid(s, o.bottom);
    this.drawLasers(g);
    this.drawCheckpoints(g);
    this.drawGoal(g);
    for (const c of g.stage.coins) {
      if (c.taken || c.z !== 0 || c.x < left || c.x > right) continue;
      const f = Math.floor(g.time * 8 + c.x) % 4;
      const rows = COIN[f === 3 ? 1 : f];
      const p = this.sp(c.x + 0.5, c.y + 0.5);
      ctx.drawImage(this.sprite(`coin${f}`, rows, false, COIN_KEYS), p.x - 4, p.y - 5);
    }
    for (const pk of g.pickups) {
      if (pk.taken) continue;
      const p = this.sp(pk.x, pk.y + Math.sin(pk.t * 4) * 0.2);
      if (Math.floor(g.time * 10) % 2) {
        ctx.fillStyle = this.c('coinLight');
        ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
      }
      ctx.drawImage(this.sprite('cart', CARTRIDGE, false, CART_KEYS), p.x - 6, p.y - 6);
    }
    for (const e of g.enemies) if (e.body.x > left - 2 && e.body.x < right + 2) this.drawEnemy(e, g);
    for (const b of g.bosses) if (!b.defeated) this.drawBoss(b, g);
    this.drawPlayer(g);
    this.drawProjectiles(g);
    this.drawParticles(g);
    if (g.dev.hitboxes) this.drawHitboxes(g);
  }

  /** 世界座標 → 画面ピクセル */
  private sp(x: number, y: number): { x: number; y: number } {
    return toScreen2D(x, y, this.ox, this.oy);
  }

  /** HUD 用: 世界座標 → 画面上の割合 (0..1) */
  project(g: Game, x: number, y: number): { x: number; y: number } {
    const o = viewOrigin2D(g.cam.x, g.cam.y);
    const p = toScreen2D(x, y, o.px, o.py);
    return { x: p.x / VIEW_W, y: p.y / VIEW_H };
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.c('sky');
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 地平線付近の帯（ディザで2色を混ぜる）
    ctx.fillStyle = this.c('skyLow');
    for (let y = 96; y < 120; y += 2) for (let x = (y / 2) % 2; x < VIEW_W; x += 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(0, 120, VIEW_W, 60);
    const camPx = this.ox;
    const vy = this.oy;
    // 雲（視差 0.3）
    for (let i = -1; i < 8; i++) {
      const base = Math.floor((camPx * 0.3) / 120) + i;
      const cx = Math.round(base * 120 - camPx * 0.3 + hash2(base, 1) * 50);
      const cy = 20 + Math.floor(hash2(base, 2) * 40) + Math.round(vy * 0.1);
      this.cloud(cx, cy, 2 + Math.floor(hash2(base, 3) * 3));
    }
    // 遠い山（視差 0.25）
    const horizon = 130 + Math.round(vy * 0.25);
    for (let x = 0; x < VIEW_W; x++) {
      const wx = x + camPx * 0.25;
      const h = 34 + Math.sin(wx * 0.021) * 14 + Math.sin(wx * 0.053 + 1) * 7;
      const top = Math.round(horizon - h);
      ctx.fillStyle = this.c('hillFarDark');
      ctx.fillRect(x, top, 1, VIEW_H - top);
      ctx.fillStyle = this.c('hillFar');
      ctx.fillRect(x, top + 1, 1, VIEW_H - top);
      // 尾根の木立（小さな点）
      if (Math.floor(wx) % 11 < 2 && hash2(Math.floor(wx / 11), 9) > 0.5) {
        ctx.fillStyle = this.c('hillFarDark');
        ctx.fillRect(x, top - 2, 1, 3);
      }
    }
    // 近い丘（視差 0.55）
    const near = 150 + Math.round(vy * 0.55);
    for (let x = 0; x < VIEW_W; x++) {
      const wx = x + camPx * 0.55;
      const k = Math.floor(wx / 90);
      const local = wx - k * 90;
      const r = 26 + hash2(k, 7) * 18;
      const d = local - 45;
      const h = Math.abs(d) < r ? Math.sqrt(r * r - d * d) : 0;
      if (h <= 0) continue;
      const top = Math.round(near - h);
      ctx.fillStyle = this.c('hill');
      ctx.fillRect(x, top, 1, VIEW_H - top);
      ctx.fillStyle = this.c('hillDark');
      ctx.fillRect(x, top, 1, 1);
      if ((Math.floor(wx) + Math.floor(top / 5)) % 9 === 0) ctx.fillRect(x, top + 8, 1, 2);
    }
  }

  private cloud(x: number, y: number, n: number): void {
    const ctx = this.ctx;
    const disc = (cx: number, cy: number, r: number, key: string) => {
      ctx.fillStyle = this.c(key);
      for (let yy = -r; yy <= r; yy++) {
        const w = Math.floor(Math.sqrt(r * r - yy * yy));
        ctx.fillRect(cx - w, cy + yy, w * 2 + 1, 1);
      }
    };
    for (let i = 0; i < n; i++) disc(x + i * 12, y + 3, 9, 'cloudShade');
    for (let i = 0; i < n; i++) disc(x + i * 12, y, 9 - (i % 2) * 2, 'cloudShade');
    for (let i = 0; i < n; i++) disc(x + i * 12, y, 8 - (i % 2) * 2, 'cloud');
  }

  private drawSolid(s: Solid, bottom: number): void {
    if (!s.active) return;
    if (!(s.z0 <= 0 && 0 <= s.z1)) return; // z=0 断面に無いものは 2D では見えない
    const ctx = this.ctx;
    const bump = s.bumpT ? Math.sin((s.bumpT / 0.2) * Math.PI) * 0.25 : 0;
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    const j0 = Math.max(0, Math.floor(bottom - 1 - s.y0));
    const j1 = Math.min(Math.ceil(h), Math.ceil(bottom + VIEW_H / TILE_PX + 1 - s.y0));
    for (let j = j0; j < j1; j++) {
      const ty = s.y0 + j;
      for (let i = 0; i < Math.ceil(w); i++) {
        const tx = s.x0 + i;
        const p = this.sp(tx, ty + 1 + bump);
        if (p.x > VIEW_W || p.x < -16 || p.y > VIEW_H || p.y < -16) continue;
        let kind: string = s.kind;
        if (s.kind === 'ground') kind = j === Math.ceil(h) - 1 ? 'groundTop' : 'ground';
        const v = Math.floor(hash2(Math.floor(tx), Math.floor(ty)) * 8);
        const tw = Math.min(1, s.x1 - tx);
        const t = this.tile(kind, kind === 'wall' ? Math.floor(ty) + Math.floor(hash2(Math.floor(tx), 3) * 5) * 2 : v);
        ctx.drawImage(t, 0, 0, Math.round(tw * 16), 16, p.x, p.y, Math.round(tw * 16), 16);
      }
    }
  }

  private drawLasers(g: Game): void {
    const ctx = this.ctx;
    for (const l of g.stage.lasers) {
      const top = this.sp(l.x, l.y1);
      const bot = this.sp(l.x, l.y0);
      if (top.x < -10 || top.x > VIEW_W + 10) continue;
      const harmless = g.laws.colorImmune;
      const flick = Math.floor(g.time * 20) % 2;
      if (harmless) {
        ctx.fillStyle = this.c('red');
        for (let y = top.y; y < bot.y; y += 4) ctx.fillRect(top.x - 1, y, 2, 2);
      } else {
        ctx.fillStyle = this.c('redDark');
        ctx.fillRect(top.x - 3, top.y, 6, bot.y - top.y);
        ctx.fillStyle = this.c(flick ? 'red' : 'redLight');
        ctx.fillRect(top.x - 2, top.y, 4, bot.y - top.y);
        ctx.fillStyle = this.c('white');
        ctx.fillRect(top.x - (flick ? 0 : 1), top.y, 1 + (flick ? 0 : 1), bot.y - top.y);
      }
      // 発射口
      ctx.fillStyle = this.c('stoneDark');
      ctx.fillRect(bot.x - 5, bot.y - 3, 10, 3);
    }
  }

  private drawCheckpoints(g: Game): void {
    const ctx = this.ctx;
    g.stage.checkpoints.forEach((cp, i) => {
      if (i === 0) return;
      const p = this.sp(cp.x, cp.y);
      if (p.x < -10 || p.x > VIEW_W + 10) return;
      ctx.fillStyle = this.c('stoneDark');
      ctx.fillRect(p.x, p.y - 24, 2, 24);
      ctx.fillStyle = this.c(i <= g.checkpoint ? 'coin' : 'stone');
      ctx.fillRect(p.x + 2, p.y - 24, 8, 6);
    });
  }

  private drawGoal(g: Game): void {
    const ctx = this.ctx;
    const p = this.sp(g.stage.goalX, 0);
    if (p.x < -40 || p.x > VIEW_W + 40) return;
    ctx.fillStyle = this.c('stoneLight');
    ctx.fillRect(p.x, p.y - 96, 3, 96);
    ctx.fillStyle = this.c('coin');
    ctx.fillRect(p.x - 1, p.y - 100, 5, 5);
    const wave = Math.round(Math.sin(g.time * 5) * 2);
    ctx.fillStyle = this.c('T');
    ctx.fillRect(p.x + 3, p.y - 94 + wave, 18, 12);
    ctx.fillStyle = this.c('W');
    ctx.fillRect(p.x + 9, p.y - 91 + wave, 6, 6);
  }

  private drawPlayer(g: Game): void {
    const pl = g.player;
    const b = pl.body;
    if (pl.invuln > 0 && !pl.dead && Math.floor(g.time * 16) % 2 === 0) return;
    let frame: string[] = HERO.idle;
    let name = 'idle';
    if (pl.dead) {
      frame = HERO.jump;
      name = 'jump';
    } else if (pl.punching) {
      frame = b.onGround ? HERO.punch : HERO.punchAir;
      name = b.onGround ? 'punch' : 'punchAir';
    } else if (!b.onGround) {
      frame = HERO.jump;
      name = 'jump';
    } else if (Math.abs(b.vx) > 0.5) {
      const seq = ['runA', 'runB', 'runC', 'runB'] as const;
      name = seq[Math.floor(pl.runPhase) % 4];
      frame = HERO[name as keyof typeof HERO];
    }
    const p = this.sp(b.x, b.y);
    const img = this.sprite(`hero-${name}`, frame, pl.facing < 0, undefined, pl.dead);
    this.ctx.drawImage(img, p.x - 6, p.y - 16);
    // パンチのエフェクト
    if (pl.punchBox()) {
      const fx = p.x + pl.facing * 12;
      this.ctx.fillStyle = this.c('white');
      this.ctx.fillRect(fx - 2, p.y - 10, 4, 4);
      this.ctx.fillRect(fx - 4 * pl.facing - 1, p.y - 9, 2, 2);
    }
  }

  private drawEnemy(e: Enemy, g: Game): void {
    const ctx = this.ctx;
    const b = e.body;
    const p = this.sp(b.x, b.y);
    const flipY = e.dying > 0 && !e.squashed;
    if (e.flash > 0 && Math.floor(g.time * 30) % 2 === 0) return;
    switch (e.type) {
      case 'kuribot': {
        if (e.squashed) {
          ctx.drawImage(this.sprite('kuri-sq', KURIBOT.squash), p.x - 7, p.y - 6);
          break;
        }
        const f = Math.floor(g.time * (e.state === 'chase' ? 10 : 6)) % 2 ? 'walkA' : 'walkB';
        ctx.drawImage(this.sprite(`kuri-${f}`, KURIBOT[f], e.facing > 0, undefined, flipY), p.x - 7, p.y - 12 - (e.state === 'notice' ? 1 : 0));
        if (e.state === 'notice') {
          ctx.fillStyle = this.c('white');
          ctx.fillRect(p.x - 1, p.y - 22, 2, 5);
          ctx.fillRect(p.x - 1, p.y - 16, 2, 2);
        }
        break;
      }
      case 'spikuto':
        this.drawSpikuto(e as Spikuto, p, flipY, e.squashed);
        break;
      case 'thrower':
        this.drawThrower(e as Thrower, p, flipY);
        break;
      case 'turret': {
        const charging = e.state === 'charge';
        ctx.fillStyle = this.c('stoneDark');
        ctx.fillRect(p.x - 8, p.y - 12, 16, 12);
        ctx.fillStyle = this.c('stone');
        ctx.fillRect(p.x - 7, p.y - 11, 14, 5);
        ctx.fillStyle = this.c('iron');
        ctx.fillRect(p.x - 16, p.y - 11, 10, 6);
        ctx.fillStyle = this.c(charging && Math.floor(g.time * 20) % 2 ? 'white' : 'red');
        ctx.fillRect(p.x - 2, p.y - 18, 4, 6);
        ctx.fillRect(p.x - 17, p.y - 10, 2, 4);
        break;
      }
    }
  }

  private drawSpikuto(e: Spikuto, p: { x: number; y: number }, flipY: boolean, squashed: boolean): void {
    const ctx = this.ctx;
    const lvl = Math.round(e.spikes * 4);
    const crouch = e.state === 'crouch' ? 2 + (Math.floor(e.t * 30) % 2) : 0;
    const cy = p.y - 7 + crouch + (squashed ? 3 : 0);
    const r = squashed ? 4 : 6;
    const key = `spk-${lvl}-${squashed}`;
    let cv = this.cache.get(this.palName + key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = 26;
      const x = cv.getContext('2d')!;
      const c = 13;
      // トゲ
      if (lvl > 0) {
        x.fillStyle = this.c('X');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          for (let k = 0; k < lvl * 1.5 + 1; k++) {
            const rr = r + k;
            x.fillRect(Math.round(c + Math.cos(a) * rr), Math.round(c + Math.sin(a) * rr), 1, 1);
          }
        }
      }
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const d = xx * xx + yy * yy;
        if (d > r * r) continue;
        x.fillStyle = this.c(d > (r - 1) * (r - 1) ? 'v' : yy < -2 && xx < 0 ? 'X' : 'V');
        if (yy < -2 && xx < -1 && d < (r - 2) * (r - 2)) x.fillStyle = this.c('V');
        x.fillRect(c + xx, c + yy, 1, 1);
      }
      x.fillStyle = this.c('w');
      x.fillRect(c - 3, c - 2, 2, 3);
      x.fillRect(c + 1, c - 2, 2, 3);
      x.fillStyle = this.c('e');
      x.fillRect(c - 2, c - 1, 1, 2);
      x.fillRect(c + 2, c - 1, 1, 2);
      this.cache.set(this.palName + key, cv);
    }
    ctx.save();
    if (flipY) {
      ctx.translate(p.x, cy);
      ctx.scale(1, -1);
      ctx.drawImage(cv, -13, -13);
    } else ctx.drawImage(cv, p.x - 13, cy - 13);
    ctx.restore();
  }

  private drawThrower(e: Thrower, p: { x: number; y: number }, flipY: boolean): void {
    const ctx = this.ctx;
    const f = e.facing;
    const y = flipY ? p.y - 4 : p.y;
    const r = (key: string, x: number, yy: number, w: number, h: number) => {
      ctx.fillStyle = this.c(key);
      const xx = f > 0 ? p.x + x : p.x - x - w;
      ctx.fillRect(xx, y + yy, w, h);
    };
    r('n', -6, -20, 12, 8); // ヘルメット
    r('N', -5, -19, 10, 3);
    r('G', 0, -15, 5, 2); // バイザー
    r('n', -6, -12, 12, 9); // 胴体
    r('N', -5, -11, 10, 4);
    r('K', -5, -3, 4, 3);
    r('K', 1, -3, 4, 3);
    if (e.state === 'windup') {
      r('n', -2, -26, 3, 8); // 振り上げた腕
      r(e.nextShot === 'iron' ? 'iron' : 'red', -4, -31, 7, 7);
      r(e.nextShot === 'iron' ? 'ironLight' : 'redLight', -3, -30, 2, 2);
    } else if (e.state === 'recover') {
      r('n', 5, -11, 6, 3);
    } else {
      r('n', 4, -11, 3, 7);
    }
  }

  private drawBoss(b: Boss, g: Game): void {
    const ctx = this.ctx;
    const body = b.body;
    const p = this.sp(body.x, body.y);
    const hitFlash = b.flash > 0 && Math.floor(g.time * 24) % 2 === 0;
    const dyingShake = b.dying ? Math.round((Math.random() - 0.5) * 4) : 0;
    const r = (key: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = hitFlash ? this.c('white') : this.c(key);
      const xx = b.facing > 0 ? p.x + x : p.x - x - w;
      ctx.fillRect(xx + dyingShake, p.y + y, w, h);
    };
    if (b.dying && b.dyingT > 1.4) return;
    if (b.type === 'guardian') {
      const crouch = b.state === 'slamWind' ? 5 + (Math.floor(b.t * 30) % 2) : b.state === 'stunned' ? 3 : 0;
      const top = -45 + crouch;
      // 脚
      r('rockDark', -14, -10, 10, 10);
      r('rockDark', 4, -10, 10, 10);
      // 胴体（岩のブロック）
      r('stoneDark', -18, top + 14, 36, 24 - crouch);
      r('stone', -16, top + 15, 32, 20 - crouch);
      r('stoneLight', -16, top + 15, 32, 2);
      r('rock', -10, top + 22, 8, 6);
      r('rock', 4, top + 26, 9, 5);
      // 頭
      r('stoneDark', -11, top, 22, 16);
      r('stone', -10, top + 1, 20, 13);
      r('moss', -10, top + 1, 20, 2);
      const eye = b.state === 'stunned' ? 'black' : b.state === 'dormant' ? 'stoneDark' : 'O';
      r(eye, 1, top + 6, 5, 3);
      r(eye, -6, top + 6, 5, 3);
      // 腕
      if (b.state === 'throwWind') {
        r('stoneDark', 10, top - 6, 7, 20);
        r('rock', 4, top - 18, 16, 14);
        r('rockDark', 6, top - 8, 12, 3);
      } else if (b.state === 'slamWind') {
        r('stoneDark', -24, top + 4, 7, 16);
        r('stoneDark', 17, top + 4, 7, 16);
      } else {
        r('stoneDark', -24, top + 16, 7, 18);
        r('stoneDark', 17, top + 16, 7, 18);
      }
      if (b.state === 'stunned') {
        for (let i = 0; i < 3; i++) {
          const a = g.time * 6 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = this.c('coin');
          ctx.fillRect(Math.round(p.x + Math.cos(a) * 12) - 1, Math.round(p.y + top - 6 + Math.sin(a) * 3) - 1, 3, 3);
        }
      }
    } else {
      const grounded = b.state === 'grounded' || b.state === 'descend';
      // 脚（着地時のみ）
      if (grounded) {
        r('n', -16, -6, 6, 6);
        r('n', 10, -6, 6, 6);
      }
      r('n', -21, -34, 42, 28);
      r('N', -19, -33, 38, 22);
      r('white', -19, -33, 38, 1);
      // 赤いコア（エネルギー源）
      const charging = b.state === 'volleyWind' || b.state === 'rainWind';
      const coreKey = charging && Math.floor(g.time * 16) % 2 ? 'redLight' : 'red';
      r('redDark', -7, -27, 14, 14);
      r(coreKey, -6, -26, 12, 12);
      r('white', -4, -24, 3, 3);
      // 砲台
      r('iron', -27, -26, 7, 9);
      r('iron', 20, -26, 7, 9);
      r('red', -28, -23, 2, 3);
      r('red', 26, -23, 2, 3);
      // スラスター
      if (!grounded) {
        const fl = Math.floor(g.time * 20) % 2 ? 6 : 4;
        r('O', -14, -6, 6, fl);
        r('O', 8, -6, 6, fl);
      } else {
        r('stoneLight', -21, -36, 42, 2); // 放熱
      }
    }
    // 予告マーカー（地面の赤い印）
    for (const m of b.markers) {
      const mp = this.sp(m.x, 0);
      if (Math.floor(g.time * 12) % 2) {
        ctx.fillStyle = this.c('red');
        ctx.fillRect(mp.x - 7, mp.y - 2, 14, 2);
        ctx.fillRect(mp.x - 1, mp.y - 12, 2, 6);
        ctx.fillRect(mp.x - 1, mp.y - 5, 2, 2);
      }
    }
    // 照準線（点線）
    for (const a of b.aims) {
      const from = this.sp(body.x, body.y + 0.6);
      const to = this.sp(a.x, a.y);
      const n = 14;
      ctx.fillStyle = this.c('red');
      for (let i = 1; i < n; i++) {
        if ((i + Math.floor(g.time * 20)) % 2) continue;
        ctx.fillRect(Math.round(from.x + ((to.x - from.x) * i) / n), Math.round(from.y + ((to.y - from.y) * i) / n), 2, 2);
      }
    }
  }

  private drawProjectiles(g: Game): void {
    const ctx = this.ctx;
    for (const pr of g.projectiles) {
      const p = this.sp(pr.x, pr.y);
      switch (pr.kind) {
        case 'orb':
        case 'bomb': {
          const flick = Math.floor(g.time * 20 + pr.t * 10) % 2;
          const R = pr.kind === 'bomb' ? 5 : 4;
          ctx.fillStyle = this.c(flick ? 'redDark' : 'red');
          ctx.fillRect(p.x - R, p.y - R + 1, R * 2, R * 2 - 2);
          ctx.fillRect(p.x - R + 1, p.y - R, R * 2 - 2, R * 2);
          ctx.fillStyle = this.c('redLight');
          ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
          if (pr.kind === 'bomb') {
            ctx.fillStyle = this.c('red');
            ctx.fillRect(p.x - 1, p.y - R - 6, 2, 5);
          }
          break;
        }
        case 'rock':
          ctx.fillStyle = this.c('rockDark');
          ctx.fillRect(p.x - 7, p.y - 6, 14, 12);
          ctx.fillStyle = this.c('rock');
          ctx.fillRect(p.x - 6, p.y - 5, 11, 9);
          ctx.fillStyle = this.c('stoneLight');
          ctx.fillRect(p.x - 4, p.y - 4, 3, 2);
          break;
        case 'iron':
          ctx.fillStyle = this.c('black');
          ctx.fillRect(p.x - 5, p.y - 4, 10, 8);
          ctx.fillRect(p.x - 4, p.y - 5, 8, 10);
          ctx.fillStyle = this.c('iron');
          ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
          ctx.fillStyle = this.c('ironLight');
          ctx.fillRect(p.x - 3, p.y - 3, 2, 2);
          break;
        case 'wave': {
          ctx.fillStyle = this.c('dirtLight');
          for (let i = 0; i < 4; i++) {
            const hh = 4 + ((Math.floor(g.time * 30) + i * 3) % 9);
            ctx.fillRect(p.x - 6 + i * 3, p.y - hh, 3, hh);
          }
          ctx.fillStyle = this.c('white');
          ctx.fillRect(p.x - 4, p.y - 3, 8, 1);
          break;
        }
      }
    }
  }

  private drawParticles(g: Game): void {
    const ctx = this.ctx;
    const colors: Record<string, string[]> = {
      dust: ['dirtLight', 'stoneLight'], hit: ['white', 'coinLight'], spark: ['coin', 'white'], boom: ['red', 'coin', 'O'],
      steam: ['white', 'cloudShade'], coin: ['coin', 'coinLight'], nullify: ['white', 'flatLight'], switch: ['flat', 'white', 'G'],
    };
    for (const pt of g.particles) {
      const p = this.sp(pt.x, pt.y);
      const list = colors[pt.kind];
      ctx.fillStyle = this.c(list[Math.floor(pt.life * 20) % list.length]);
      const s = pt.kind === 'coin' && pt.size > 0.4 ? 0 : Math.max(1, Math.round(pt.size * 16 * (pt.life / pt.max)));
      if (s === 0) {
        ctx.drawImage(this.sprite('coin0', COIN[0], false, COIN_KEYS), p.x - 4, p.y - 5);
      } else ctx.fillRect(p.x - (s >> 1), p.y - (s >> 1), s, s);
    }
  }

  private drawHitboxes(g: Game): void {
    const ctx = this.ctx;
    const rect = (x0: number, y0: number, x1: number, y1: number, col: string) => {
      const a = this.sp(x0, y1);
      const b = this.sp(x1, y0);
      ctx.strokeStyle = col;
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x - 1, b.y - a.y - 1);
    };
    const pb = g.player.body;
    rect(pb.x - pb.w / 2, pb.y, pb.x + pb.w / 2, pb.y + pb.h, '#0f0');
    const pu = g.player.punchBox();
    if (pu) rect(pu.x0, pu.y0, pu.x1, pu.y1, '#ff0');
    for (const e of g.enemies) rect(e.body.x - e.body.w / 2, e.body.y, e.body.x + e.body.w / 2, e.body.y + e.body.h, '#f00');
    for (const b of g.bosses) if (b.active) rect(b.body.x - b.body.w / 2, b.body.y, b.body.x + b.body.w / 2, b.body.y + b.body.h, '#f0f');
  }
}
