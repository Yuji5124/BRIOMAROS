# 調査レポート（Phase 0）

調査日: 2026-10-18 / 調査方法: `gh api` で GitHub 上の実ファイルを取得して確認（推測なし）

## 1. Yuji5124 のリポジトリ（関連するもの）

| リポジトリ | 内容（実際に確認したファイル） | ライセンス | 判断 |
| --- | --- | --- | --- |
| [visual-effect-library](https://github.com/Yuji5124/visual-effect-library) | Three.js 0.186 / Vite 7 / TS 5.9。`src/effects/source/e025-ps1-warp.ts`（頂点スナップ＋アフィン補間＋15bitディザ）、`src/effects/post/e027-palette-limit.ts`（パレット量子化＋4×4ベイヤー）、`src/effects/post/e029-dot-matrix.ts`、`src/lab/framework/random.ts`（mulberry32） | **MIT** (LICENSE 確認) | **採用**：64N の頂点スナップ／15bit量子化シェーダー、BG の4階調量子化の考え方、シード付き乱数を移植 |
| [RANVORA](https://github.com/Yuji5124/RANVORA) | Vite + Three.js + Playwright 構成。`playwright.config.ts`（Windows では msedge チャンネル利用）、`.github/workflows/pages.yml`、`vite.config.ts`（`base: './'`） | 表記なし（同一作者） | **採用**：ビルド・E2E・GitHub Pages の構成を踏襲 |
| [ROAD-DRIVER](https://github.com/Yuji5124/ROAD-DRIVER) | Three.js 0.180 + Vite。`src/game-logic.ts` をテストから分離する設計 | 表記なし | 参考：ロジックと描画の分離方針 |
| [monster-quest-0](https://github.com/Yuji5124/monster-quest-0) | Phaser 3.90 + Three 0.186 | 表記なし | 不採用：Phaser は今回の「共通世界＋媒体別レンダラー」構成では二重管理になるため Canvas2D を直接使う |
| [soundvault](https://github.com/Yuji5124/soundvault) | `data/sounds.json` の全音源が `license: "UNKNOWN"`、`scripts/generate-demo-audio.mjs` はサイン波のデモWAV生成のみ | 表記なし | 不採用（音源ファイル）：ライセンス未確定のため。代わりに Web Audio API で効果音を実行時合成 |
| [pixvault](https://github.com/Yuji5124/pixvault) | `sharp` による画像アセット変換パイプライン | 表記なし | 今回は不使用（スプライトはすべてコード生成） |
| Blender-test / Three.test | README.md のみ | — | 実装なし |
| nexus | 3Dアセットハブ（GLB検索・MCP） | 表記なし | 今回は不使用（ローポリはプログラム生成）。将来の 3D モデル差し替え候補 |

参照画像：リポジトリ内に主人公の画像は存在しなかったため、チャットで提示されたコンセプトシートの配色（茶髪・黄色ヘッドギア・ティール／クリーム／黄色の衣装・グローブ・大きいブーツ・腰の装置）を基準に、ドット絵とローポリをコードで生成した。

## 2. 採用技術

| 技術 | バージョン | ライセンス | 用途 |
| --- | --- | --- | --- |
| Vite | 7.x | MIT | 開発サーバー・ビルド |
| TypeScript | 5.9 | Apache-2.0 | 全コード |
| three.js | 0.186 | MIT | 64N 媒体のローポリ3D描画 |
| Canvas 2D | ブラウザ標準 | — | CF / BG 媒体のドット描画 |
| Web Audio API | ブラウザ標準 | — | 効果音・BGMの実行時合成 |
| Vitest | 3.x | MIT | ロジックの単体テスト |
| Playwright | 1.64 | Apache-2.0 | ブラウザE2Eテスト・スクリーンショット |

外部APIや有料サービスは使っていない。画像・音声ファイルは一切同梱せず、全素材をコードで生成している。

## 3. 2D⇔3D 切替の技術検証の結論

- 世界は **x（右）・y（上）・z（奥行き、手前が +）** の共通3D座標（1単位＝1タイル）で持つ。
- 2D 媒体は「z=0 の断面」を見る。衝突判定は `z0 ≤ 0 ≤ z1` を満たす箱だけを使う（厚み0の“ドット足場”も含む）。
- 3D 媒体は箱同士の通常の3D交差。厚み0の箱は交差しないので自動的にすり抜ける。
- 3D→2D に戻るときは z=0 に移せるか判定し、埋まる場合は近くの安全位置を探し、なければ切替を拒否する（`src/core/physics.ts` の `findSafeSpot`）。
- 2D 描画はピクセル座標 `px = (x - camX) * 16`、`py = H - (y - camY) * 16`、3D は世界座標をそのまま Three.js に渡す（`src/core/coords.ts`）。
