import type { MoveParams } from '../core/config';
import type { Game } from '../game/game';
import { MEDIA, type MediumId } from '../media/registry';

/**
 * 開発者パネル（`?dev=1` または ` キーで表示）。
 * 本編では未獲得媒体を選べないが、ここからは直接選択できる。
 * 数字キー: 1/2/3 = CF/64N/BG 強制, 9 = 全媒体獲得, 0 = 無敵, 8 = 当たり判定表示
 */
const SLIDERS: [keyof MoveParams, number, number, number][] = [
  ['maxSpeed', 3, 14, 0.1],
  ['accel', 5, 120, 1],
  ['decel', 5, 120, 1],
  ['turnDecel', 5, 160, 1],
  ['airControl', 0.1, 1.5, 0.05],
  ['gravity', 10, 90, 1],
  ['fallGravityMul', 0.5, 3, 0.05],
  ['jumpSpeed', 6, 30, 0.1],
  ['jumpCut', 0, 1, 0.05],
  ['coyoteTime', 0, 0.3, 0.01],
  ['jumpBuffer', 0, 0.3, 0.01],
  ['depthSpeed', 1, 14, 0.1],
];

export class DevPanel {
  readonly root = document.createElement('div');
  private info = document.createElement('pre');
  private sliderBox = document.createElement('div');
  private builtFor: MediumId | null = null;
  private fps = 60;

  constructor(private g: Game) {
    this.root.className = 'dev-panel';
    const media = (['CF', '64N', 'BG'] as MediumId[])
      .map((id) => `<button data-medium="${id}">${id}</button>`)
      .join('');
    const warps = g.stage.warps.map((w, i) => `<button data-warp="${i}">${w.label}</button>`).join('');
    this.root.innerHTML = `
      <div class="dev-h">DEV <small>(\` で閉じる)</small></div>
      <div class="dev-row"><span>媒体（強制）</span>${media}</div>
      <div class="dev-row"><button data-act="unlock">全媒体獲得</button><button data-act="god">無敵</button><button data-act="hit">当たり判定</button></div>
      <div class="dev-row wrap"><span>ワープ</span>${warps}</div>`;
    this.root.append(this.sliderBox, this.info);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.medium) g.requestMedium(t.dataset.medium as MediumId, true);
      if (t.dataset.warp) g.warp(Number(t.dataset.warp));
      if (t.dataset.act === 'unlock') (['64N', 'BG'] as MediumId[]).forEach((m) => g.media.unlock(m));
      if (t.dataset.act === 'god') g.dev.god = !g.dev.god;
      if (t.dataset.act === 'hit') g.dev.hitboxes = !g.dev.hitboxes;
      (t as HTMLButtonElement).blur?.();
    });
  }

  private buildSliders(): void {
    const id = this.g.medium;
    this.builtFor = id;
    const mv = MEDIA[id].move;
    this.sliderBox.innerHTML = `<div class="dev-sub">操作感パラメータ（${id}）</div>`;
    for (const [k, min, max, step] of SLIDERS) {
      const row = document.createElement('label');
      row.className = 'dev-slider';
      row.innerHTML = `<span>${k}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${mv[k]}"><b>${mv[k]}</b>`;
      const input = row.querySelector('input')!;
      const out = row.querySelector('b')!;
      input.addEventListener('input', () => {
        mv[k] = Number(input.value);
        out.textContent = input.value;
      });
      input.addEventListener('keydown', (e) => e.preventDefault());
      this.sliderBox.append(row);
    }
  }

  update(dt: number): void {
    const g = this.g;
    this.root.classList.toggle('show', g.dev.enabled);
    if (!g.dev.enabled) return;
    if (this.builtFor !== g.medium) this.buildSliders();
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const b = g.player.body;
    this.info.textContent =
      `fps ${this.fps.toFixed(0)}  medium ${g.medium}  laws ${JSON.stringify(g.laws)}\n` +
      `pos ${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}  vel ${b.vx.toFixed(1)}, ${b.vy.toFixed(1)}, ${b.vz.toFixed(1)}\n` +
      `ground ${b.onGround}  hp ${g.player.hp}  god ${g.dev.god}  enemies ${g.enemies.length}  proj ${g.projectiles.length}\n` +
      `boss ${g.bosses.map((x) => `${x.type}:${x.state}:${x.hp}`).join(' ')}`;
  }
}
