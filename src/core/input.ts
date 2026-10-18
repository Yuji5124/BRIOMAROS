/**
 * キーボード入力。ゲームの基本操作は最後まで固定:
 * ←→ 移動 / ↑↓ 奥行き（3D媒体） / Space ジャンプ / J アクション / K 媒体切替
 */
export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'action' | 'medium' | 'start' | 'pause' | 'mute' | 'dev';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Space: 'jump',
  KeyJ: 'action',
  KeyK: 'medium',
  Enter: 'start',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
  Backquote: 'dev',
};

export class Input {
  private down = new Set<Action>();
  private pressedQ = new Set<Action>();
  private releasedQ = new Set<Action>();
  /** 押しっぱなしの時間（秒） */
  private held = new Map<Action, number>();
  /** 開発者用の数字キー */
  digit: number | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Digit')) this.digit = Number(e.code.slice(5));
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.down.has(a)) {
        this.down.add(a);
        this.pressedQ.add(a);
        this.held.set(a, 0);
      }
    });
    target.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.down.delete(a);
      this.releasedQ.add(a);
    });
    target.addEventListener('blur', () => {
      for (const a of this.down) this.releasedQ.add(a);
      this.down.clear();
    });
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }
  pressed(a: Action): boolean {
    return this.pressedQ.has(a);
  }
  released(a: Action): boolean {
    return this.releasedQ.has(a);
  }
  heldTime(a: Action): number {
    return this.held.get(a) ?? 0;
  }
  axisX(): number {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }
  /** 奥行き軸: ↑ で奥（-z）へ */
  axisZ(): number {
    return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
  }

  /** フレームの最後に呼ぶ */
  endFrame(dt: number): void {
    for (const a of this.down) this.held.set(a, (this.held.get(a) ?? 0) + dt);
    this.pressedQ.clear();
    this.releasedQ.clear();
    this.digit = null;
  }

  /** テスト・デバッグ用に疑似的にキーを押す */
  simulate(a: Action, isDown: boolean): void {
    if (isDown && !this.down.has(a)) {
      this.down.add(a);
      this.pressedQ.add(a);
      this.held.set(a, 0);
    } else if (!isDown && this.down.has(a)) {
      this.down.delete(a);
      this.releasedQ.add(a);
    }
  }
}
