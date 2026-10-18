import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SHOTS = 'docs/screenshots';

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(m.text());
  });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as any).__BRIO?.game, null, { timeout: 30_000 });
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__BRIO.game;
    const b = g.player.body;
    return { x: b.x, y: b.y, z: b.z, medium: g.medium, hp: g.player.hp, state: g.state, media: g.media.list() as string[] };
  });

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('起動してタイトルが表示され、エラーが出ない', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('.title-screen')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-title.png` });
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('キーボードで走る・ジャンプする（CF）', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  const s0 = await state(page);
  await hold(page, 'ArrowRight', 700);
  const s1 = await state(page);
  expect(s1.x).toBeGreaterThan(s0.x + 2);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  const s2 = await state(page);
  await page.keyboard.up('Space');
  expect(s2.y).toBeGreaterThan(1.5);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/02-cf-stage01.png` });
  expect((await state(page)).y).toBeCloseTo(0, 1);
});

test('未獲得の媒体には切り替えられない', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(200);
  expect((await state(page)).medium).toBe('CF');
  await expect(page.locator('.msg.show')).toContainText('まだほかの媒体');
});

test('64N: 2D では越えられない壁を奥行きで回り込む', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await page.evaluate(() => (window as any).__BRIO.game.warp(2));
  await hold(page, 'ArrowRight', 2200);
  const blocked = await state(page);
  expect(blocked.x).toBeLessThan(120);
  await page.screenshot({ path: `${SHOTS}/03-cf-giant-wall.png` });
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/04-switch-effect.png` });
  await page.waitForTimeout(700);
  expect((await state(page)).medium).toBe('64N');
  await expect(page.locator('canvas.view-3d')).toBeVisible();
  await hold(page, 'ArrowUp', 500);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/05-64n-behind-wall.png` });
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  const passed = await state(page);
  expect(passed.x).toBeGreaterThan(123);
  expect(passed.z).toBeLessThan(-1.5);
  // 3D から 2D へ戻すと z=0 に戻り、地形に埋まらない
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(300);
  const back = await state(page);
  expect(back.medium).toBe('CF');
  expect(back.z).toBe(0);
});

test('K 長押しで媒体ホイールが開く', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await page.evaluate(() => (window as any).__BRIO.game.warp(5));
  await page.keyboard.down('KeyK');
  await page.waitForTimeout(500);
  await expect(page.locator('.wheel.show')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.screenshot({ path: `${SHOTS}/06-medium-wheel.png` });
  await page.keyboard.up('KeyK');
  await page.waitForTimeout(200);
  await expect(page.locator('.wheel.show')).toHaveCount(0);
  expect((await state(page)).medium).not.toBe('CF');
});

test('BG: 赤い攻撃は無効、物理攻撃は有効', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const g = (window as any).__BRIO.game;
    g.warp(5);
    g.requestMedium('BG');
  });
  await hold(page, 'ArrowRight', 900);
  await page.waitForTimeout(2500);
  const s = await state(page);
  expect(s.hp).toBe(4);
  await page.screenshot({ path: `${SHOTS}/07-bg-lab.png` });
  const r = await page.evaluate(() => {
    const B = (window as any).__BRIO;
    const g = B.game;
    const b = g.player.body;
    g.spawnProjectile({ kind: 'orb', x: b.x + 2, y: b.y + 0.5, z: 0, vx: -6, vy: 0, vz: 0, r: 0.3, color: 'red', gravity: 0, damage: 1 });
    B.advance(0.6);
    const afterRed = g.player.hp;
    g.spawnProjectile({ kind: 'iron', x: b.x + 2, y: b.y + 0.5, z: 0, vx: -6, vy: 0, vz: 0, r: 0.3, color: 'none', gravity: 0, damage: 1 });
    B.advance(0.6);
    return { afterRed, afterIron: g.player.hp };
  });
  expect(r.afterRed).toBe(4);
  expect(r.afterIron).toBe(3);
});

test('ボス戦の画面（CF / 64N）', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await page.evaluate(() => (window as any).__BRIO.game.warp(1));
  await hold(page, 'ArrowRight', 1600);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}/08-boss1-guardian.png` });
  await page.evaluate(() => {
    const g = (window as any).__BRIO.game;
    g.warp(4);
    g.requestMedium('64N');
  });
  await hold(page, 'ArrowRight', 1500);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}/09-boss2-fortress-64n.png` });
});

test('スタートからゴールまでキー入力だけで到達できる（自動操作ボット）', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('Enter');
  const r = await page.evaluate(() => (window as any).__BRIO.autoplay(300));
  console.log(r.log.join('\n'));
  expect(r.state).toBe('clear');
  expect(r.media).toEqual(['CF', '64N', 'BG']);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/10-clear.png` });
  expect(errors).toEqual([]);
});
