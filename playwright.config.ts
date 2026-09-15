import { defineConfig } from '@playwright/test';

/**
 * 示例页真机冒烟（目录驱动）。
 *
 * 前置：`npm run build` —— 示例页加载 `../dist/index.umd.js`（本包）、
 * `../node_modules/ice-render/dist/index.umd.js` 与 `../node_modules/@damoqiongqiu/ice-chart/dist/index.umd.js`。
 *
 * 为什么要有它：本仓此前**连 playwright 配置都没有**，`examples/chart-dsl.html` 从未被浏览器跑过
 * （2026-09-15 补上；同批还给 ice-entity-designer-dsl 补了，那边第一次跑就抓到一页真的打不开）。
 *
 * 家族端口分配（见 ice-render 仓 AGENTS）：8090 引擎 / 8091 实体设计器 / 8092 smart-water /
 * 8093 ice-web-components / 8094 ice-render-dsl / 8095 react-demo / **8096 本仓** /
 * 8097 ice-entity-designer-dsl / 8098 ice-game。
 * `reuseExistingServer: false`：端口被别的服务占着时**响亮失败**。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  webServer: {
    command: 'npx http-server . -p 8096 -c-1 --silent',
    port: 8096,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8096',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
});
