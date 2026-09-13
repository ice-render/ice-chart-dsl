# ice-chart-dsl

JSON-first DSL for AI agents to build charts with [`@damoqiongqiu/ice-chart`](https://www.npmjs.com/package/@damoqiongqiu/ice-chart).

ice-chart 的 `ChartOption` 本来就是纯 JSON（`toJSON()` / `fromJSONString()`），所以这个包**不是把 option 换个写法**。
它补的是 option 不做、而模型最容易写错的三件事：

| | ChartOption | ice-chart-dsl |
| --- | --- | --- |
| 输入 | 自己把数据拍成 `series[].data` | **一张表 + `encoding`**：`{ x: '月份', y: '销量', series: '渠道' }` |
| 默认值 | 逐项自己写 | 轴类型 / 图例显隐 / 提示框触发方式按类型自动定，显式写的优先 |
| 出错时 | 画出来是空的，只能自己猜 | **结构化诊断**：列不存在（带可用列名）、类型不匹配、空数据、公式错误（带字符位置） |

编译产物就是普通的 `ChartOption` —— 悬停、缩放、框选、序列化、跨图联动全部照旧。

## Install

```bash
npm install @damoqiongqiu/ice-chart-dsl @damoqiongqiu/ice-chart ice-render
```

## 30 秒

```json
{
  "schemaVersion": 1,
  "kind": "line",
  "title": "月度销量",
  "data": {
    "columns": ["月份", "销量", "渠道"],
    "rows": [["1月", 120, "线上"], ["1月", 86, "线下"], ["2月", 142, "线上"], ["2月", 92, "线下"]]
  },
  "encoding": { "x": "月份", "y": "销量", "series": "渠道" }
}
```

```ts
import { renderChartDsl, validateChartDsl, compileChartDsl } from '@damoqiongqiu/ice-chart-dsl';

const { chart, option, diagnostics } = renderChartDsl('canvas-id', dsl);

// 或者只要配置：编译出来的就是 ChartOption
const option = compileChartDsl(dsl);

// 或者只要诊断（validate 不抛异常，任何输入都能吃）
const result = validateChartDsl(dsl);
if (!result.valid) console.log(result.errors.map((e) => e.message).join('\n'));
```

浏览器直接用（UMD，注意顺序）：

```html
<canvas id="chart" width="900" height="480"></canvas>
<script src="https://unpkg.com/ice-render/dist/index.umd.js"></script>
<script src="https://unpkg.com/@damoqiongqiu/ice-chart/dist/index.umd.js"></script>
<script src="https://unpkg.com/@damoqiongqiu/ice-chart-dsl/dist/index.umd.js"></script>
<script>
  ICEChartDSL.renderChartDsl('chart', { kind: 'line', data: {...}, encoding: { x: '月份', y: '销量' } });
</script>
```

## 数据集两种写法

```json
{ "columns": ["月份", "销量"], "rows": [["1月", 120], ["2月", 132]] }
```

```json
[{ "月份": "1月", "销量": 120 }, { "月份": "2月", "销量": 132 }]
```

对象数组是模型最常吐的形态，两种都收；`columns` 按对象 key 首次出现顺序推出来。

## kind 与覆盖范围

- **带 `data`/`encoding` 编译**：`line` / `area` / `bar` / `pie` / `scatter` / `function`
  （`bar` 用 `options.stack` 出堆叠；`scatter` 绑 `encoding.size` 出气泡；数值 x 自动用数值轴 + `[x, y]` 数据点）
- **直通**：其余类型（`radar` / `heatmap` / `sankey` / `treemap` / `gauge` / `boxplot` / `waterfall` /
  `funnel` / `graph` / `candlestick` / `parametric` / `liquid`）直接给 `series`，`options` 照常透传
- **逃生舱**：`options` 里的键覆盖编译结果（`series` 除外），所以 DSL 跟不上核心演进时不会把人堵死

## 诊断：给 agent 的自修复反馈

`validateChartDsl()` **不抛异常**，返回结构化诊断（`{ severity, code, message, path }`）：

```
[错误] 列「销售额」不存在。可用列：月份 / 销量 / 渠道。（encoding.y）
[错误] 列「渠道」不是数值列（数字占比 0%），不能当 y 用。（encoding.y）
[错误] 第 3 行有 2 个值，但列数是 3。（data.rows[2]）
[警告] 饼图 / 玫瑰图不适合表达负值，检测到 2 行负数。（encoding.value）
[错误] 表达式错误：缺少右括号（位置 6）… （expression）
[警告] 参数「b」定义了但表达式没有用到。（expression）
```

公式类会**采样一遍再诊断**：静态检查抓语法错误，运行层抓「整段开不出来」「输出恒定」——
这两种恰恰是"公式写错了但没报错"最常见的表现。

## API

| 导出 | 说明 |
| --- | --- |
| `CHART_DSL_SCHEMA_VERSION` / `CHART_DSL_KINDS` | 版本与支持的 kind |
| `validateChartDsl(dsl)` | 结构 + 语义校验，返回 `{ valid, errors, warnings }` |
| `formatDiagnostics(result)` | 诊断 → 多行文本 |
| `compileChartDsl(dsl)` | DSL → `ChartOption`（不合法时抛 `ChartDslCompileError`，`.diagnostics` 带原因） |
| `chartDslToJsonString(dsl)` | 直接拿编译产物的 JSON 字符串 |
| `renderChartDsl(target, dsl, chartOptions?)` | 编译并渲染，返回 `{ chart, option, diagnostics }` |
| `resolveDataset` / `columnIndex` / `numericRatio` | 数据集工具（自建通道映射时用得上） |

JSON Schema：[`src/schema/chart-dsl.schema.json`](./src/schema/chart-dsl.schema.json)。

## Example

```bash
npm install
npm run build
# 起一个静态服务打开 examples/chart-dsl.html
```

左边写 DSL，右边实时渲染，下面是诊断面板（含「错误示例」预设，可以直接看到列名纠错长什么样）。

## Agent discovery

- npm 包导出（`validateChartDsl` / `compileChartDsl` / `renderChartDsl`）
- [`skills/ice-chart-dsl/SKILL.md`](./skills/ice-chart-dsl/SKILL.md)
- [`prompts/agent-prompt.md`](./prompts/agent-prompt.md)

## License

MIT
