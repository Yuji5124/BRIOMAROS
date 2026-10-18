import { BASE_MOVE, type MoveParams } from '../core/config';

/**
 * 媒体（メディア）レジストリ。
 * 媒体は「見た目」だけでなく、世界の法則（laws）と操作感（move）を持つ。
 * 10媒体へ拡張するときは、ここに定義を足してレンダラー種別を割り当てる。
 */
export type MediumId = 'CF' | '64N' | 'BG' | 'WG' | 'SD' | 'CS' | '3SD' | 'UW' | 'IW' | 'SW';

export type RendererKind = 'pixel' | 'lowpoly';

export interface MediumLaws {
  /** 3D空間（奥行き方向へ移動でき、z=0 断面に縛られない） */
  spatial: boolean;
  /** 色属性の攻撃・仕掛けを無効化する */
  colorImmune: boolean;
}

export interface MediumDef {
  id: MediumId;
  name: string;
  /** 一言説明（UI用） */
  tagline: string;
  implemented: boolean;
  renderer: RendererKind;
  laws: MediumLaws;
  move: MoveParams;
  /** 2Dレンダラーで使うパレット名 */
  palette?: 'cf' | 'bg';
  /** UIテーマ色 */
  ui: { fg: string; bg: string; accent: string };
}

const DEFAULT_UI = { fg: '#fff', bg: '#222', accent: '#888' };

export const MEDIA: Record<MediumId, MediumDef> = {
  CF: {
    id: 'CF',
    name: 'クラシック2D',
    tagline: '8bit横スクロール。走る・跳ぶ・踏む。',
    implemented: true,
    renderer: 'pixel',
    palette: 'cf',
    laws: { spatial: false, colorImmune: false },
    move: { ...BASE_MOVE },
    ui: { fg: '#ffffff', bg: '#1d2b53', accent: '#ff004d' },
  },
  '64N': {
    id: '64N',
    name: 'ローポリ3D',
    tagline: '奥行きへ移動。壁の裏へ回り込む。',
    implemented: true,
    renderer: 'lowpoly',
    laws: { spatial: true, colorImmune: false },
    move: { ...BASE_MOVE, maxSpeed: 7.0, accel: 34, decel: 30, gravity: 36, jumpSpeed: 16.9, airControl: 0.8 },
    ui: { fg: '#ffffff', bg: '#0b3d2e', accent: '#2fd17a' },
  },
  BG: {
    id: 'BG',
    name: 'モノクロ2D',
    tagline: '4階調の液晶。色属性を無効化する。',
    implemented: true,
    renderer: 'pixel',
    palette: 'bg',
    laws: { spatial: false, colorImmune: true },
    move: { ...BASE_MOVE, maxSpeed: 6.8 },
    ui: { fg: '#0f380f', bg: '#9bbc0f', accent: '#306230' },
  },
  // ---- 今後の媒体（未実装。レジストリ上の枠のみ） ----
  WG: stub('WG', '固定位置の液晶', '固定位置のコマ飛ばし'),
  SD: stub('SD', '上下2画面', '画面間の移動'),
  CS: stub('CS', '多重スクロール', '背景と前景の入れ替え'),
  '3SD': stub('3SD', '立体視', '奥行きの分離'),
  UW: stub('UW', '非対称2画面', '別視点から弱点を操作'),
  IW: stub('IW', 'モーション操作', '振って攻撃を跳ね返す'),
  SW: stub('SW', '世界の分離と合体', 'すべての媒体を統合'),
};

function stub(id: MediumId, name: string, tagline: string): MediumDef {
  return {
    id,
    name,
    tagline,
    implemented: false,
    renderer: 'pixel',
    palette: 'cf',
    laws: { spatial: false, colorImmune: false },
    move: { ...BASE_MOVE },
    ui: DEFAULT_UI,
  };
}

/** 媒体の獲得順（ボスを倒すたびに次が解放される） */
export const MEDIUM_ORDER: MediumId[] = ['CF', '64N', 'BG', 'WG', 'SD', 'CS', '3SD', 'UW', 'IW', 'SW'];

/** 獲得済み媒体の管理。本編では未獲得の媒体を選べない。 */
export class MediumInventory {
  private owned = new Set<MediumId>(['CF']);
  current: MediumId = 'CF';

  has(id: MediumId): boolean {
    return this.owned.has(id);
  }

  unlock(id: MediumId): boolean {
    if (!MEDIA[id].implemented || this.owned.has(id)) return false;
    this.owned.add(id);
    return true;
  }

  list(): MediumId[] {
    return MEDIUM_ORDER.filter((id) => this.owned.has(id));
  }

  /** 次の（dir=-1 で前の）獲得済み媒体 */
  cycle(dir: 1 | -1 = 1): MediumId {
    const list = this.list();
    const i = list.indexOf(this.current);
    return list[(i + dir + list.length) % list.length];
  }

  /** 本編用の選択可否チェック */
  canSelect(id: MediumId, dev = false): boolean {
    if (!MEDIA[id].implemented) return false;
    return dev || this.owned.has(id);
  }

  reset(owned: MediumId[] = ['CF']): void {
    this.owned = new Set(owned);
    this.current = owned[0];
  }
}
