import { Input } from './core/input';
import { autoplay } from './dev/autoplay';
import { Game } from './game/game';
import { MEDIA } from './media/registry';
import { LowPolyRenderer } from './render/lowpoly/renderer3d';
import { PixelRenderer } from './render/pixel/renderer2d';
import { TransitionOverlay } from './render/transition';
import { DevPanel } from './ui/devPanel';
import { Hud } from './ui/hud';
import './styles.css';

const app = document.getElementById('app')!;
const screen = document.createElement('div');
screen.className = 'screen-box';
app.append(screen);

const input = new Input();
const game = new Game(input);
const pixel = new PixelRenderer();
const lowpoly = new LowPolyRenderer();
const fx = new TransitionOverlay();
const hud = new Hud(game);
const dev = new DevPanel(game);
const lcd = document.createElement('div');
lcd.className = 'lcd-overlay';
screen.append(pixel.canvas, lowpoly.canvas, lcd, fx.canvas, hud.root);
app.append(dev.root);

if (new URLSearchParams(location.search).has('dev')) game.dev.enabled = true;
if (!lowpoly.ok) console.warn('WebGL が使えないため 64N 媒体は表示できません');

/** 媒体に応じてレンダラーを切り替える（世界の状態はそのまま） */
function applyMedium(): void {
  const def = MEDIA[game.medium];
  const is3D = def.renderer === 'lowpoly';
  pixel.canvas.style.display = is3D ? 'none' : 'block';
  lowpoly.canvas.style.display = is3D ? 'block' : 'none';
  if (def.palette) pixel.setPalette(def.palette);
  app.dataset.medium = def.id;
}

let lastCanvas: HTMLCanvasElement = pixel.canvas;
game.on((e) => {
  if (e.type === 'medium') {
    fx.capture(lastCanvas);
    if (MEDIA[e.to].renderer === 'lowpoly') lowpoly.enter(MEDIA[e.from].laws.spatial);
    applyMedium();
  }
  if (e.type === 'state' && e.state === 'play') applyMedium();
});
applyMedium();

function fit(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / 16, h / 9);
  screen.style.width = `${Math.floor(scale * 16)}px`;
  screen.style.height = `${Math.floor(scale * 9)}px`;
}
window.addEventListener('resize', fit);
fit();

// 最初のキー入力で音を有効化（ブラウザの自動再生制限）
window.addEventListener('keydown', () => game.sfx.ensure(), { once: true });
screen.addEventListener('pointerdown', () => {
  game.sfx.ensure();
  if (game.state !== 'play') game.start();
});

function tick(dt: number, draw = true): void {
  game.frame(dt);
  if (!draw) return;
  const is3D = MEDIA[game.medium].renderer === 'lowpoly';
  if (is3D && lowpoly.ok) {
    lowpoly.render(game, dt);
    lastCanvas = lowpoly.canvas;
  } else {
    pixel.render(game);
    lastCanvas = pixel.canvas;
  }
  fx.render(game);
  hud.update(dt, (x, y, z) => (is3D ? lowpoly.project(x, y, z) : pixel.project(game, x, y)));
  dev.update(dt);
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/** テスト用: 実時間に関係なく seconds 秒ぶんゲームを進める */
function advance(seconds: number, fps = 60, draw = true): void {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) tick(1 / fps, draw && i === n - 1);
  last = performance.now();
}

// テスト・デバッグ用
(window as unknown as { __BRIO: unknown }).__BRIO = {
  game,
  input,
  pixel,
  lowpoly,
  advance,
  autoplay: (seconds?: number) => autoplay(game, input, (dt) => advance(dt, 60, false), seconds),
};
