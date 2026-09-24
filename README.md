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

| kind | 需要的通道 | 说明 |
| --- | --- | --- |
| `line` / `area` | `x` + `y`（+ `series`） | 数值 x 自动用数值轴 + `[x, y]` 数据点 |
| `bar` | `x` + `y`（+ `series`） | 堆叠用 `options.stack` |
| `scatter` | `x` + `y`（+ `size`） | 绑 `size` 即气泡图 |
| `beeswarm` | `x`（分组）+ `y`（观测值） | 逐点编成 `[组, 值]`，同一组内自动避让；提示框按数据项触发 |
| `violin` | `x`（分组）+ `y`（观测值） | 按组把观测值收成 `number[][]`，core 算密度轮廓；多组对比用 `series` 拆系列 |
| `pie` | `name` + `value` | 负值会被警告（饼图不表达负值） |
| `radar` | `x`（指标）+ `y`（数值）+ `series` | 指标名从 x 列推，上限自动取整到好看的刻度 |
| `heatmap` | `x` + `y`（两个类目列）+ `value` | 二维矩阵表直接画 |
| `waterfall` | `name` + `value`（+ `total`） | `total` 列非 0 的行当合计项 |
| `funnel` / `gauge` / `liquid` | `name` + `value` | 仪表盘/水位球只取第一行（多行会警告） |
| `sankey` | `source` + `target` + `value` | 一张「起点 / 终点 / 流量」的连线表 |
| `function` | `expression`（+ `domain` / `params`） | 不需要 data |

**直通**：`treemap` / `graph` / `parametric` / `boxplot` 等直接给 `series`（`options` 照常透传）。
**逃生舱**：`options` 里的键覆盖编译结果（`series` 除外），所以 DSL 跟不上核心演进时不会把人堵死。

**面板矩阵（数据驱动分面）**：顶层加 `matrix: { rows, columns, gap? }`，DSL 会把
`encoding.series` 拆出来的每个分组依次放进一块面板（多列 `y` 同理，每列一块）——
「一张表按渠道拆成六块」是**意图**，面板下标由编译器分配，用户不用自己数。

```json
{
  "kind": "line",
  "matrix": { "rows": 2, "columns": 3, "gap": 12 },
  "data": { "columns": ["月份", "销量", "渠道"], "rows": [["1月", 120, "线上"], ["1月", 90, "线下"]] },
  "encoding": { "x": "月份", "y": "销量", "series": "渠道" }
}
```

只有直角坐标的 kind 才有面板语义（其余场景会被警告并忽略）；只拆出一块面板、或分组数超过
面板数，都会给可执行的警告（`matrix-single-panel` / `matrix-too-few-panels`）。
分布组图的细调（`violin.bandwidth` / `beeswarm.spread` 等）走 `series` 直通 —— 那属于 ChartOption 的活。

## 标注：目标线 / 阈值线 / 异常点 / 目标区间

业务图上最高频的参考线不是「一种新图表」，而是一条配置 —— 顶层 `annotation`（与 `encoding` 平级）：

```json
{
  "schemaVersion": 1,
  "kind": "line",
  "title": "月度销量与目标",
  "data": { "columns": ["月份", "销量"], "rows": [["1月", 120], ["2月", 132], ["3月", 101]] },
  "encoding": { "x": "月份", "y": "销量" },
  "annotation": {
    "lines": [
      { "axis": "y", "value": 150, "text": "目标 150" },
      { "axis": "y", "value": 100, "text": "告警阈值", "color": "#dc3545" },
      { "axis": "x", "value": "2月", "text": "上线" }
    ],
    "points": [{ "x": "3月", "y": 101, "text": "异常点", "symbol": "diamond" }],
    "areas": [{ "axis": "y", "from": 0, "to": 100, "text": "达标区" }]
  }
}
```

- `lines[].value` / `areas[].from`、`to` / `points[].x`、`y` 都是**数据值**（不是像素）：
  数值轴写数字、类目轴写类目名或下标、时间轴写时间戳或日期串。
- 它挂在坐标系上，所以**跟着缩放 / 平移走**，不进图例、不占数据下标、不抢命中测试；
  越界的标注不画，原因由 ice-chart 的 `chart.annotationDiagnostics()` 给出。
- 只对直角坐标的 kind 有意义（`line` / `area` / `bar` / `scatter`）；
  给饼图 / 雷达 / 桑基等会被警告 `annotation-non-cartesian`。
- 编译期诊断：缺 `value` / 缺 `from`+`to` 是**错误**（带 `annotation.lines[0].value` 这样的路径），
  类目不存在（`annotation-unknown-category`）、数值轴写了非数字（`annotation-value-type`）、
  区间宽度为 0（`annotation-empty-area`）是**警告**。
- 逃生舱照常：`options.annotation` 能整体覆盖顶层 `annotation`。

## 主题：一条链路贯通图表与引擎

DSL 里的主题走图表的 `options.theme`（`'light'` / `'dark'` / `'auto'` / 部分主题片段），
**图表层再把它映射到引擎主题**（引擎 2.4 起）：图表实例里那些「引擎自己画的东西」
（引擎默认样式、选中框 / 手柄 / 插槽这些交互外壳、应用后加的自定义图元）会跟着一起换。

```json
{
  "kind": "line",
  "data": { "columns": ["月份", "销量"], "rows": [["1月", 120], ["2月", 132]] },
  "encoding": { "x": "月份", "y": "销量" },
  "options": {
    "theme": "dark"
  }
}
```

- `theme: 'auto'` = 跟随**引擎实例主题**（按引擎主题背景色的亮度判定明暗）——
  图表渲染在别人的暗色画布上时，写 `auto` 即可，不用自己判断。
- 需要品牌色就传片段：`"theme": { "colorPalette": ["#0d6efd", "#10b981"], "textColor": "#212529" }`
  （浅合并到亮色主题），映射到引擎的那一份会自动跟着算。
- 完整的映射表见 `ice-chart` 仓库的 `src/theme/chartEngineBridge.ts`。

## 诊断：给 agent 的自修复反馈

`validateChartDsl()` **不抛异常**，返回结构化诊断（`{ severity, code, message, path }`）：

```
[错误] 列「销售额」不存在。可用列：月份 / 销量 / 渠道。（encoding.y）
[错误] 列「渠道」不是数值列（数字占比 0%），不能当 y 用。（encoding.y）
[错误] 第 3 行有 2 个值，但列数是 3。（data.rows[2]）
[警告] 饼图 / 玫瑰图不适合表达负值，检测到 2 行负数。（encoding.value）
[错误] 表达式错误：缺少右括号（位置 6）… （expression）
[警告] 参数「b」定义了但表达式没有用到。（expression）
[错误] annotation.lines[0] 缺少 value（数值轴写数字、类目轴写类目名或下标）。（annotation.lines[0].value）
[警告] annotation.lines[1].value 的类目名「13月」不在 x 列里（该列有 3 个类目），这条标注不会画出来。（annotation.lines[1].value）
```

公式类会**采样一遍再诊断**：静态检查抓语法错误，运行层抓「整段开不出来」「输出恒定」——
这两种恰恰是"公式写错了但没报错"最常见的表现。

## API

| 导出 | 说明 |
| --- | --- |
| `CHART_DSL_SCHEMA_VERSION` / `CHART_DSL_KINDS` | 版本与支持的 kind |
| `CHART_DSL_COMPILED_KINDS` | 走 data/encoding 编译的 kind 清单 |
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
