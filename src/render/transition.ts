import { VIEW_H, VIEW_W } from '../core/config';
import { hash2 } from '../core/rng';
import type { Game } from '../game/game';
import { MEDIA } from '../media/registry';

/**
 * 媒体切替エフェクト。切替直前の画面を写し取り、ブロック状にモザイク化しながら崩して新しい媒体を見せる。
 * （visual-effect-library e021 ピクセル化 / e172 ワイプの考え方を 2D Canvas で実装）
 * ゲームの進行は止めない。
 */
export class TransitionOverlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private snap: HTMLCanvasElement;
  private mosaic: HTMLCanvasElement;
  private has = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.canvas.className = 'view view-fx';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.snap = document.createElement('canvas');
    this.snap.width = VIEW_W;
    this.snap.height = VIEW_H;
    this.mosaic = document.createElement('canvas');
    this.mosaic.width = VIEW_W / 8;
    this.mosaic.height = Math.ceil(VIEW_H / 8);
  }

  /** 切替直前の画面を保存 */
  capture(src: HTMLCanvasElement): void {
    const s = this.snap.getContext('2d')!;
    s.imageSmoothingEnabled = false;
    s.clearRect(0, 0, VIEW_W, VIEW_H);
    try {
      s.drawImage(src, 0, 0, VIEW_W, VIEW_H);
      const m = this.mosaic.getContext('2d')!;
      m.imageSmoothingEnabled = true;
      m.drawImage(this.snap, 0, 0, this.mosaic.width, this.mosaic.height);
      this.has = true;
    } catch {
      this.has = false;
    }
  }

  render(g: Game): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const tr = g.transition;
    if (!tr) {
      this.canvas.style.visibility = 'hidden';
      return;
    }
    this.canvas.style.visibility = 'visible';
    const k = tr.t / tr.dur;
    const to = MEDIA[tr.to];
    // 旧画面のブロックが崩れていく
    if (this.has) {
      const cols = VIEW_W / 8;
      const rows = Math.ceil(VIEW_H / 8);
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const th = hash2(cx, cy) * 0.55 + (cx / cols) * 0.35;
          if (k > th) continue;
          if (k > th * 0.5) {
            ctx.drawImage(this.mosaic, cx, cy, 1, 1, cx * 8, cy * 8, 8, 8);
          } else {
            ctx.drawImage(this.snap, cx * 8, cy * 8, 8, 8, cx * 8, cy * 8, 8, 8);
          }
        }
      }
    }
    // スキャンするバー
    const x = Math.round(k * (VIEW_W + 40)) - 20;
    ctx.fillStyle = to.ui.accent;
    ctx.fillRect(x - 3, 0, 3, VIEW_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, 0, 1, VIEW_H);
    // 媒体名
    if (k > 0.08 && k < 0.92) {
      const a = Math.min(1, (k - 0.08) * 8, (0.92 - k) * 8);
      ctx.globalAlpha = a;
      ctx.font = 'bold 36px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(to.id, VIEW_W / 2 + 3, VIEW_H / 2 + 3);
      ctx.fillStyle = to.ui.accent;
      ctx.fillText(to.id, VIEW_W / 2, VIEW_H / 2);
      ctx.font = '10px "DotGothic16", monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(to.name, VIEW_W / 2, VIEW_H / 2 + 30);
      ctx.globalAlpha = 1;
    }
  }
}
