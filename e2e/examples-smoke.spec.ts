import { expect, test } from '@playwright/test';
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

      const ink = await page.evaluate(() => {
        let painted = 0;
        for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
          try {
            const ctx = canvas.getContext('2d');
            if (!ctx || !canvas.width || !canvas.height) {
              continue;
            }
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 10) {
                painted++;
              }
            }
          } catch (e) {
            /* 跨域画布读不了，跳过 */
          }
        }
        return painted;
      });

      expect(errors, `console/pageerror：${errors.join(' | ')}`).toEqual([]);
      expect(badResponses, `坏响应：${badResponses.join(' | ')}`).toEqual([]);
      expect(ink, '画布落墨像素数').toBeGreaterThan(2000);
    });
  }
});
