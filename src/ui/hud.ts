import { PLAYER } from '../core/config';
import type { Game, GameEvent } from '../game/game';
import { MEDIA, MEDIUM_ORDER } from '../media/registry';

type Projector = (x: number, y: number, z: number) => { x: number; y: number };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** DOM で描く HUD（文字は日本語を含むため Canvas ではなく DOM） */
export class Hud {
  readonly root: HTMLDivElement;
  private hearts = el('div', 'hearts');
  private coins = el('div', 'coins');
  private score = el('div', 'score');
  private slots = el('div', 'slots');
  private stageLabel = el('div', 'stage-label');
  private boss = el('div', 'boss-bar');
  private msg = el('div', 'msg');
  private banner = el('div', 'banner');
  private floaters = el('div', 'floaters');
  private wheel = el('div', 'wheel');
  private title = el('div', 'screen title-screen');
  private clear = el('div', 'screen clear-screen');
  private pause = el('div', 'screen pause-screen', '<div class="big">PAUSE</div><p>Esc / P で再開</p>');
  private msgTimer = 0;
  private bannerTimer = 0;
  private lastSlots = '';

  constructor(private g: Game) {
    this.root = el('div', 'hud');
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-left');
    left.append(this.hearts, this.coins, this.score);
    const right = el('div', 'hud-right');
    right.append(this.slots, el('div', 'slot-help', 'K 切替 / 長押し ホイール'));
    top.append(left, this.stageLabel, right);
    this.title.innerHTML = `
      <div class="logo">BRIOMAROS</div>
      <div class="logo-sub">ブリオマロス</div>
      <p class="catch">ゲームの歴史を、能力に変える。</p>
      <div class="press">PRESS SPACE / ENTER</div>
      <table class="keys">
        <tr><td><kbd>←</kbd><kbd>→</kbd></td><td>移動</td></tr>
        <tr><td><kbd>↑</kbd><kbd>↓</kbd></td><td>奥行き移動（64N）</td></tr>
        <tr><td><kbd>Space</kbd></td><td>ジャンプ（長押しで高く）</td></tr>
        <tr><td><kbd>J</kbd></td><td>アクション（パンチ）</td></tr>
        <tr><td><kbd>K</kbd></td><td>媒体切替（長押しでホイール）</td></tr>
      </table>
      <p class="small">M 音のON/OFF ・ Esc ポーズ</p>`;
    this.root.append(top, this.boss, this.msg, this.banner, this.floaters, this.wheel, this.title, this.clear, this.pause);
    g.on((e) => this.onEvent(e));
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'hint':
        this.showMsg(e.text, 7);
        break;
      case 'deny':
        this.showMsg(e.text, 3, true);
        break;
      case 'banner':
        this.banner.className = `banner show ${e.kind}`;
        this.banner.innerHTML = `<div class="b-title">${e.title}</div><div class="b-sub">${e.sub}</div>`;
        this.bannerTimer = e.kind === 'unlock' ? 4.5 : 2.6;
        break;
      case 'state':
        if (e.state === 'clear') this.showClear();
        break;
    }
  }

  private showMsg(text: string, sec: number, warn = false): void {
    this.msg.textContent = text;
    this.msg.className = `msg show${warn ? ' warn' : ''}`;
    this.msgTimer = sec;
  }

  private showClear(): void {
    const g = this.g;
    const total = g.stage.coins.length + g.stage.index.all.filter((s) => s.kind === 'bump' || s.kind === 'used').length;
    const t = Math.floor(g.playTime);
    this.clear.innerHTML = `
      <div class="big">STAGE CLEAR!</div>
      <p>媒体を切り替えて、ここまで来た。</p>
      <table class="stats">
        <tr><td>SCORE</td><td>${g.score}</td></tr>
        <tr><td>COINS</td><td>${g.coins} / ${total}</td></tr>
        <tr><td>TIME</td><td>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</td></tr>
        <tr><td>MISS</td><td>${g.deaths}</td></tr>
        <tr><td>MEDIA</td><td>${g.media.list().join(' / ')}</td></tr>
      </table>
      <div class="press">PRESS SPACE で もう一度</div>`;
  }

  update(dt: number, project: Projector): void {
    const g = this.g;
    this.root.dataset.state = g.state;
    this.title.classList.toggle('show', g.state === 'title');
    this.clear.classList.toggle('show', g.state === 'clear');
    this.pause.classList.toggle('show', g.paused && g.state === 'play');
    // ハート
    const hp = Math.max(0, g.player.hp);
    let h = '';
    for (let i = 0; i < PLAYER.maxHp; i++) h += `<span class="heart${i < hp ? '' : ' empty'}"></span>`;
    if (this.hearts.innerHTML !== h) this.hearts.innerHTML = h;
    this.coins.textContent = `◆×${String(g.coins).padStart(2, '0')}`;
    this.score.textContent = String(g.score).padStart(7, '0');
    const sec = g.stage.sections[g.section];
    this.stageLabel.textContent = `${sec.label}　${sec.title}`;
    // 媒体スロット（10枠。未獲得は ?）
    const sig = `${g.medium}|${g.media.list().join(',')}`;
    if (sig !== this.lastSlots) {
      this.lastSlots = sig;
      this.slots.innerHTML = MEDIUM_ORDER.map((id, i) => {
        const owned = g.media.has(id);
        const cur = g.medium === id;
        return `<span class="slot${owned ? ' owned' : ''}${cur ? ' current' : ''}" title="${MEDIA[id].name}"><i>${String(i + 1).padStart(2, '0')}</i>${owned ? id : '?'}</span>`;
      }).join('');
    }
    // ボスHP
    const boss = g.activeBoss;
    if (boss) {
      this.boss.className = 'boss-bar show';
      this.boss.innerHTML = `<span class="bn">${boss.name}${boss.phase2 ? ' <em>第2形態</em>' : ''}</span><span class="bar"><span style="width:${(boss.hp / boss.maxHp) * 100}%"></span></span>`;
    } else this.boss.className = 'boss-bar';
    // メッセージ
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.className = 'msg';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.className = 'banner';
    }
    // 浮かぶ文字
    let fh = '';
    for (const f of g.floaters) {
      const p = project(f.x, f.y + f.t * 1.2, f.z);
      fh += `<span style="left:${p.x * 100}%;top:${p.y * 100}%;color:${f.color};opacity:${1 - f.t / 1.2}">${f.text}</span>`;
    }
    this.floaters.innerHTML = fh;
    // 媒体ホイール
    if (g.wheel.open) {
      const list = g.media.list();
      this.wheel.className = 'wheel show';
      this.wheel.innerHTML =
        `<div class="w-title">MEDIUM WHEEL</div><div class="w-items">` +
        list.map((id, i) => `<div class="w-item${i === g.wheel.index ? ' sel' : ''}"><b>${id}</b><small>${MEDIA[id].name}</small></div>`).join('') +
        `</div><div class="w-help">←→ で選択・K を離して決定</div>`;
    } else this.wheel.className = 'wheel';
  }
}
