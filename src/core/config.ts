/**
 * 操作感の調整パラメータ。媒体ごとに上書きできる。
 * 開発者パネル（`?dev=1` または ` キー）から実行中に変更可能。
 */
export interface MoveParams {
  /** 最高速度（タイル/秒） */
  maxSpeed: number;
  /** 地上の加速度 */
  accel: number;
  /** 地上の減速度（入力なし） */
  decel: number;
  /** 切り返し時の減速度 */
  turnDecel: number;
  /** 空中での加減速の倍率 */
  airControl: number;
  /** 重力 */
  gravity: number;
  /** 下降中の重力倍率（ふわっと上がってストンと落ちる） */
  fallGravityMul: number;
  /** ジャンプ初速 */
  jumpSpeed: number;
  /** ボタンを早く離したときに上昇速度に掛ける倍率（小ジャンプ） */
  jumpCut: number;
  /** 最大落下速度 */
  maxFall: number;
  /** 足場から落ちた後もジャンプできる猶予（秒） */
  coyoteTime: number;
  /** 着地前のジャンプ入力を覚えておく時間（秒） */
  jumpBuffer: number;
  /** 奥行き移動の最高速度（3D媒体のみ） */
  depthSpeed: number;
  /** 踏みつけ時の跳ね返り速度 */
  stompBounce: number;
}

export const BASE_MOVE: MoveParams = {
  maxSpeed: 7.2,
  accel: 42,
  decel: 38,
  turnDecel: 70,
  airControl: 0.7,
  gravity: 40,
  fallGravityMul: 1.35,
  jumpSpeed: 17.6,
  jumpCut: 0.45,
  maxFall: 22,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  depthSpeed: 6.2,
  stompBounce: 12.5,
};

export const PLAYER = {
  width: 0.7,
  height: 1.0,
  depth: 0.7,
  maxHp: 4,
  invulnTime: 1.4,
  punch: { duration: 0.26, activeFrom: 0.04, activeTo: 0.18, cooldown: 0.32, reach: 0.95, lunge: 3.5 },
};

/** 3D 媒体で動ける奥行きの範囲 */
export const DEPTH_MIN = -3.4;
export const DEPTH_MAX = 1.4;
/** 落下死の高さ */
export const KILL_Y = -6;

export const TILE_PX = 16;
export const VIEW_W = 320;
export const VIEW_H = 180;
