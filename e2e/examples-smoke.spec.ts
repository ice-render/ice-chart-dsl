import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 示例页冒烟（目录驱动，不写死清单）。
 *
 * 判据：① 无 console error / pageerror；② 无 4xx（示例页要取 `../dist` 与 `../node_modules` 下的 UMD）；
 * ③ 画布**真有落墨** —— "canvas 元素存在"不等于"画出来了"。
 *
 * ⚠️ 画布背景透明（底色由页面 CSS 给）：统计落墨必须排除 alpha≈0 的像素。
 */
const EXAMPLES_DIR = path.resolve(__dirname, '..', 'examples');
const pages = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((file) => file.endsWith('.html') && file !== 'index.html')
  .sort();

/** 画布落墨像素数：只数 alpha > 10 的像素（页面底色由 CSS 给，画布本身是透明的）。 */
const paintedPixels = (page: Page): Promise<number> =>
  page.evaluate(() => {
    let painted = 0;
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) continue;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 10) painted++;
        }
      } catch (error) {
        /* 跨域画布读不了，跳过 */
      }
    }
    return painted;
  });

test.describe('示例页冒烟', () => {
  test('至少收录了示例页（防止目录改名后这套冒烟静默空转）', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const file of pages) {
    test(`${file}：无报错且画布有内容`, async ({ page }) => {
      const errors: string[] = [];
      const badResponses: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('response', (response) => {
        if (response.status() >= 400) {
          badResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.goto(`/examples/${file}`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);

      const ink = await paintedPixels(page);

      expect(errors, `console/pageerror：${errors.join(' | ')}`).toEqual([]);
      expect(badResponses, `坏响应：${badResponses.join(' | ')}`).toEqual([]);
      expect(ink, '画布落墨像素数').toBeGreaterThan(2000);
    });
  }
});

/**
 * 预设逐个冒烟（2026-09-25 补）。
 *
 * 「页面能打开」不等于「每个预设都能画」：DSL 的价值全在 kind 与通道上，
 * 而一个 preset 写错（列名、通道、类型）在页面上只表现为**一块空白画布**。
 * 所以这里按工具栏的 `data-preset` 逐个点过去，逐个量落墨。
 *
 * 故意会失败的预设（错误示例）用 `data-expect="error"` 标出来：那两个只验**诊断与状态行**
 * （页面在校验不通过时故意保留上一张图，画布上还有旧墨迹，所以「有没有落墨」对它们没有意义）——
 * 按属性分辨比在测试里写死预设名更抗改名。
 */
test.describe('示例页预设冒烟', () => {
  test('每个预设都画得出来（错误预设只验诊断）', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto('/examples/chart-dsl.html', { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const presets = await page.$$eval('[data-preset]', (nodes) =>
      nodes.map((node) => ({
        name: (node as HTMLElement).dataset.preset as string,
        expectError: (node as HTMLElement).dataset.expect === 'error',
      }))
    );
    // 自检：一条预设都没扫到说明这条测试已经空转了
    expect(presets.length).toBeGreaterThanOrEqual(15);
    expect(presets.some((preset) => preset.expectError), '至少要有一个错误预设').toBe(true);

    const problems: string[] = [];
    for (const preset of presets) {
      await page.click(`[data-preset="${preset.name}"]`);
      // 入场动画默认 520ms：等过去再量，否则量到的是半路状态
      await page.waitForTimeout(700);
      const ink = await paintedPixels(page);
      const diagnostics = (await page.textContent('#diagnostics')) || '';
      const meta = (await page.textContent('#meta')) || '';
      if (preset.expectError) {
        if (!diagnostics.includes('[错误]')) problems.push(`${preset.name}：错误预设却没有报错`);
        // 不断言落墨：校验不通过时页面**故意保留上一张图**（只换诊断），
        // 所以画布上还有上一个预设的墨迹 —— 那是行为，不是 bug。
        if (!meta.includes('校验不通过')) problems.push(`${preset.name}：错误预设没有把状态行切成「校验不通过」`);
      } else if (ink <= 2000) {
        problems.push(`${preset.name}：只落了 ${ink} 像素`);
      }
    }

    expect(errors, `console/pageerror：${errors.join(' | ')}`).toEqual([]);
    expect(problems, problems.join(' | ')).toEqual([]);
  });
});
