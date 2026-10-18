/**
 * mulberry32: 32bit シードから再現可能な一様乱数 [0,1)
 * 出典: Yuji5124/visual-effect-library src/lab/framework/random.ts (MIT)
 */
export function makeRng(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 整数座標から決定的な 0..1 を返すハッシュ（タイル模様などに使う） */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
