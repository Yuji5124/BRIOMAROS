import { DEPTH_MAX, DEPTH_MIN } from '../core/config';
import { SolidIndex } from '../core/physics';
import type { Solid, SolidKind } from '../core/types';
import type { MediumId } from '../media/registry';

/**
 * STAGE 01「最初の壁」→ STAGE 02「色の攻撃」を1本の横長ワールドとして定義する。
 * すべて共通座標（x 右, y 上, z 奥行き）。描画は媒体ごとのレンダラーが行う。
 */
export type EnemyType = 'kuribot' | 'spikuto' | 'thrower' | 'turret';
export type BossType = 'guardian' | 'fortress';

export interface EnemySpawn {
  type: EnemyType;
  x: number;
  y: number;
  z?: number;
  /** turret: 実験用（ダメージなし） / thrower: 投げる物 */
  variant?: 'lab' | 'iron' | 'mixed';
}

export interface BossSpawn {
  type: BossType;
  x: number;
  y: number;
  /** 戦闘開始の位置 */
  triggerX: number;
  /** 戦闘中のカメラ・移動制限 */
  arena: [number, number];
  /** 戦闘中に閉じる扉 */
  gates: number[];
  reward: MediumId;
}

export interface Coin {
  x: number;
  y: number;
  z: number;
  taken: boolean;
}

/** 赤い光の柵。色属性なので BG 媒体では無害。 */
export interface Laser {
  x: number;
  y0: number;
  y1: number;
}

export interface Hint {
  x: number;
  text: string;
  /** 条件（媒体を持っているときだけ等） */
  needs?: MediumId;
  lacks?: MediumId;
  shown?: boolean;
}

export interface Checkpoint {
  x: number;
  y: number;
  label: string;
}

export interface StageData {
  index: SolidIndex;
  coins: Coin[];
  enemies: EnemySpawn[];
  bosses: BossSpawn[];
  lasers: Laser[];
  hints: Hint[];
  checkpoints: Checkpoint[];
  /** 区間ラベル（x 以降が STAGE 02 など） */
  sections: { x: number; label: string; title: string }[];
  goalX: number;
  /** 2D のカメラが右へ進める限界 */
  endX: number;
  /** デバッグ用ワープ先 */
  warps: { label: string; x: number; y: number; media: MediumId[] }[];
}

export function buildStage(): StageData {
  const index = new SolidIndex();
  let id = 0;
  const add = (kind: SolidKind, x0: number, x1: number, y0: number, y1: number, z0 = DEPTH_MIN, z1 = DEPTH_MAX) => {
    const s: Solid = { id: id++, kind, x0, x1, y0, y1, z0, z1, active: kind !== 'gate' };
    index.add(s);
    return s;
  };
  const ground = (x0: number, x1: number, top = 0) => add('ground', x0, x1, -8, top);
  const block = (kind: SolidKind, x: number, y: number) => add(kind, x, x + 1, y, y + 1, -0.5, 0.5);
  /** 2D媒体でだけ乗れる厚み0の足場 */
  const flat = (x0: number, x1: number, y: number) => add('flat', x0, x1, y, y + 1, 0, 0);

  const coins: Coin[] = [];
  const coin = (x: number, y: number, z = 0) => coins.push({ x, y, z, taken: false });
  const coinRow = (x0: number, n: number, y: number, z = 0, dx = 1) => {
    for (let i = 0; i < n; i++) coin(x0 + i * dx, y, z);
  };

  // ================= STAGE 01 — 最初の壁 =================
  ground(-2, 34);
  add('stone', -2, 0, 0, 14); // 左端の柱
  block('bump', 9, 4);
  for (let x = 13; x < 18; x++) block(x === 15 ? 'bump' : 'brick', x, 4);
  coinRow(13.5, 5, 6);
  add('stone', 26, 28, 0, 2);
  coinRow(30, 3, 2.5);
  ground(37, 58);
  coinRow(34.5, 3, 3.5);
  add('stone', 49, 50, 0, 1);
  add('stone', 50, 51, 0, 2);
  add('stone', 51, 52, 0, 3);
  add('stone', 52, 54, 0, 4);
  coinRow(55, 3, 5.5);
  ground(61, 142);
  coinRow(58.5, 3, 4);
  for (let x = 64; x < 69; x++) block('brick', x, 4);
  block('bump', 66, 7);
  block('bump', 75, 4);
  add('stone', 80, 82, 0, 2);
  coinRow(83, 3, 1.5);
  // ボス1の部屋（扉）
  const g1a = add('gate', 91, 92, 0, 14);
  // 巨大な壁: 2Dでは越えられない。奥（z<-1.3）には通路がある。
  add('wall', 120, 123, 0, 14, -1.3, DEPTH_MAX + 0.6);
  // 壁の裏の通路にコイン（64Nでだけ見える／取れる）
  coinRow(118, 7, 0.6, -2.4, 1.1);

  // ================= STAGE 02 — 色の攻撃 =================
  // 巨大な穴に“ドット足場”: 3Dでは厚みがないのですり抜ける
  flat(144, 146, 1);
  flat(148, 150, 2.5);
  flat(152, 154, 3);
  flat(155.5, 157, 1.5);
  coinRow(144.5, 2, 3);
  coinRow(148.5, 2, 4.5);
  coinRow(152.5, 2, 5);
  ground(158, 190);
  coinRow(160, 4, 1.5);
  // 2つめの壁: 今度は奥がふさがっていて、手前（z>0.45）が空いている
  add('wall', 176, 179, 0, 12, DEPTH_MIN, 0.45);
  coinRow(175.5, 4, 0.6, 1.0, 1.1);
  block('bump', 184, 4);
  ground(193, 262);
  add('stone', 186, 188, 0, 1.5);
  // ボス2の部屋
  const g2a = add('gate', 195, 196, 0, 14);
  const g2b = add('gate', 224, 225, 0, 14);
  // 実験場の先
  coinRow(244, 4, 2);
  add('stone', 258, 260, 0, 2);
  ground(265, 300); // 262..265 は穴
  add('stone', 298, 300, 0, 14);
  coinRow(266, 3, 3);

  const lasers: Laser[] = [
    { x: 241, y0: 0, y1: 12 },
    { x: 271, y0: 0, y1: 12 },
  ];
  add('stone', 240.5, 241.5, 12, 14); // 柵の上を塞ぐ
  add('stone', 270.5, 271.5, 12, 14);

  return {
    index,
    coins,
    enemies: [
      { type: 'kuribot', x: 21, y: 0 },
      { type: 'kuribot', x: 43, y: 0 },
      { type: 'kuribot', x: 46, y: 0 },
      { type: 'spikuto', x: 71, y: 0 },
      { type: 'kuribot', x: 77, y: 0 },
      { type: 'kuribot', x: 163, y: 0 },
      { type: 'kuribot', x: 168, y: 0 },
      { type: 'spikuto', x: 183, y: 0 },
      { type: 'turret', x: 237, y: 0, variant: 'lab' },
      { type: 'thrower', x: 252, y: 0, variant: 'iron' },
      { type: 'thrower', x: 280, y: 0, variant: 'mixed' },
      { type: 'kuribot', x: 285, y: 0 },
    ],
    bosses: [
      { type: 'guardian', x: 110, y: 0, triggerX: 95, arena: [91, 120], gates: [g1a.id], reward: '64N' },
      { type: 'fortress', x: 214, y: 5.5, triggerX: 199, arena: [195, 225], gates: [g2a.id, g2b.id], reward: 'BG' },
    ],
    lasers,
    hints: [
      { x: 2, text: '←→ で移動、Space でジャンプ。長押しで高く跳べる。' },
      { x: 18, text: '敵は上から踏みつけるか、J でパンチ！' },
      { x: 66, text: 'トゲが出ているスパイクトは踏めない。トゲが引っ込んだ瞬間か、J のパンチで倒そう。' },
      { x: 92, text: 'ウォールガーディアン出現！ 叩きつけの衝撃波はジャンプでかわせ。着地後のスキがチャンス。' },
      { x: 113, text: '巨大な壁…… CF では越えられない。', lacks: '64N' },
      { x: 113, text: 'K で 64N に切り替えて、↑ で奥へ回り込め！', needs: '64N' },
      { x: 126, text: '媒体を変えるだけで通れた！ 3D→2D に戻すときは K。' },
      { x: 139, text: 'この先の“ドット足場”は2D媒体でしか乗れない。CFに戻して渡ろう。' },
      { x: 170, text: '今度の壁は奥がふさがっている。64N で手前（↓）から回り込め。' },
      { x: 197, text: 'カラーフォートレス！ 赤いエネルギー弾は 64N なら奥行きでかわせる。降りてきたら反撃！' },
      { x: 227, text: 'BG では色が消える。赤い攻撃（色属性）は BG で無効！ 砲台の弾で試そう（ここは安全）。' },
      { x: 238, text: '赤い光の柵も色属性。BG なら通り抜けられる。' },
      { x: 246, text: '注意：灰色の鉄球は“物理攻撃”。BG でも防げない！' },
    ],
    checkpoints: [
      { x: 2, y: 0, label: 'START' },
      { x: 86, y: 0, label: 'BOSS 1' },
      { x: 131, y: 0, label: 'STAGE 02' },
      { x: 194, y: 0, label: 'BOSS 2' },
      { x: 227, y: 0, label: 'BG LAB' },
    ],
    sections: [
      { x: 0, label: 'STAGE 01', title: '最初の壁' },
      { x: 128, label: 'STAGE 02', title: '色の攻撃' },
    ],
    goalX: 292,
    endX: 300,
    warps: [
      { label: 'START', x: 2, y: 0, media: ['CF'] },
      { label: 'BOSS 1', x: 88, y: 0, media: ['CF'] },
      { label: '巨大な壁', x: 116, y: 0, media: ['CF', '64N'] },
      { label: 'STAGE 02', x: 131, y: 0, media: ['CF', '64N'] },
      { label: 'BOSS 2', x: 194, y: 0, media: ['CF', '64N'] },
      { label: 'BG LAB', x: 228, y: 0, media: ['CF', '64N', 'BG'] },
      { label: 'GOAL前', x: 284, y: 0, media: ['CF', '64N', 'BG'] },
    ],
  };
}
