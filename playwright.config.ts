import { defineConfig } from '@playwright/test';

// Windows ではインストール済みの Edge を使う（ブラウザのダウンロード不要）。RANVORA の設定を踏襲。
// PW_CHANNEL=chrome で Chrome、PW_CHANNEL= （空）で Playwright の Chromium。
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5189',
    channel: channel || undefined,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx vite --port 5189 --strictPort',
    url: 'http://localhost:5189',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
