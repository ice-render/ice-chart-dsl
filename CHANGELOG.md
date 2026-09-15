# Changelog

## Unreleased

### 变更

- **补上示例页真机冒烟**：本仓此前**连 playwright 配置都没有**，`examples/chart-dsl.html`
  从未被浏览器跑过。现在有 `playwright.config.ts`（端口 8096，家族端口表已登记）与目录驱动的
  `e2e/examples-smoke.spec.ts`（判据：无 console/pageerror、无 4xx、画布**真有落墨**），
  并用 `npm run verify:full` 串起类型检查 → jest → build → e2e。
- 纯开发期基建，**运行时行为未变**，故不发版。

## 0.2.6 - 2026-09-15

### 变更

- **peer / dev 依赖对齐当前发布**：`@damoqiongqiu/ice-chart ^0.23.0 → ^0.23.2`、
  `ice-render ^2.8.0 → ^2.10.0`。本包是编译器（产出 ChartOption），只需要声明范围对齐；
  验证：tsc + jest 45/45 + build，编译产物再过一遍 core 的 `normalizeOption`（集成断言）。

## 0.2.5 - 2026-09-15

### 变更

- **peer 依赖对齐 `ice-render ^2.8.0`**：引擎 2.8.0 起布局机制对齐 Swing。本包是编译器
  （产出场景数据），仅声明范围对齐。

### 验证

- `npm run verify`（tsc + build + jest 45/45）。

## 0.2.2

### 文档：主题链路写清楚（无代码改动）

- README 补《主题：一条链路贯通图表与引擎》一节：DSL 的 `options.theme`（`light` / `dark` / `auto` /
  片段）→ 图表主题 → 引擎主题（引擎 2.4 起，`ice-chart@0.21.0` 的 `chartEngineBridge`）。
  说明 `auto` = 跟随引擎实例主题，以及品牌色片段怎么写。

### 依赖

- devDependency 对齐 **@damoqiongqiu/ice-chart `^0.21.0`**、**ice-render `^2.4.0`**（peer 范围不变）。

## 0.2.1

### 变更：依赖对齐家族新版本（无代码改动）

- devDependency 对齐 **ice-render `^2.4.0`** 与 **@damoqiongqiu/ice-chart `^0.20.1`**，
  并在新引擎上重跑门禁（单测 45 个全绿）。
- peer 范围不动：`ice-render ^2.3.0` 与 `@damoqiongqiu/ice-chart ^0.20.0` 本身就被新版本满足
  —— 本包只产出 option / DSL，不直接调用引擎的主题 API。

## 0.2.0

### 新增：标注 `annotation`（目标线 / 阈值线 / 异常点 / 目标区间）

业务里最高频的「目标线 / SLA 阈值 / 达标区 / 异常点」以前只能要么加一个系列、要么自己往
`options` 里塞配置。现在它是 DSL 的**一等字段**，与 `encoding` 平级：

```json
{
  "kind": "line",
  "data": { "columns": ["月份", "销量"], "rows": [["1月", 120], ["2月", 132]] },
  "encoding": { "x": "月份", "y": "销量" },
  "annotation": {
    "lines": [{ "axis": "y", "value": 150, "text": "目标 150" }],
    "points": [{ "x": "2月", "y": 132, "text": "异常点", "symbol": "diamond" }],
    "areas": [{ "axis": "y", "from": 0, "to": 100, "text": "达标区" }]
  }
}
```

- **值用数据值，不是像素**：数值轴写数字、类目轴写类目名（或下标）、时间轴写时间戳 / 日期串。
  定位由 ice-chart 按比例尺算，所以标注跟着缩放 / 平移走，不进图例、不占数据下标、不抢命中。
- 编译产物里 `annotation` 原样交给 ice-chart（`normalizeAnnotation` + `resolveAnnotation` 负责
  收拢与定位）；`options.annotation` 逃生舱依然能整体覆盖。
- 标注只对**直角坐标**的 kind 有意义（`line` / `area` / `bar` / `scatter`），
  给 `pie` / `radar` / `sankey` 等会被警告 `annotation-non-cartesian`。

### 新增：标注的编译期诊断

- **错误**（一定画不出来，必须改）：`missing-annotation-value`（缺 `value` / `from` / `to` / `x` / `y`）、
  `invalid-annotation-list`（`lines` / `points` / `areas` 不是数组）、`invalid-annotation-item`（元素不是对象）。
- **警告**（能编译，但可能不是你要的）：`annotation-unknown-category`（类目名不在 x 列里，
  会带上「该列有几个类目」）、`annotation-value-type`（数值轴写了非数字）、
  `annotation-empty-area`（`from` 与 `to` 相同，宽度为 0）、`unknown-annotation-field`。
- 诊断路径精确到条目：`annotation.lines[0].value`，agent 可以直接定位改哪一行。
- 越界（值在可视域外）不在编译期判：它取决于运行时的缩放窗口，
  由 ice-chart 的 `chart.annotationDiagnostics()` 在运行时给出原因（线不画、但说明为什么）。

### 变更：依赖范围

- peer / dev 升到 **@damoqiongqiu/ice-chart `^0.20.0`**（标注是 0.20.0 起的能力）+ ice-render `^2.3.0`。

### 验证

- 单测 37 → **45 个**：编译（`annotation` 进 option、逃生舱覆盖、`series` 直通也带上）、
  校验（结构错误的路径、四种警告、非直角坐标警告）、以及编译产物必须能过核心的 `normalizeOption`。
- 文档：README 字段表与示例、SKILL（agent 用）、`prompts/agent-prompt.md`、
  `src/schema/chart-dsl.schema.json` 同步。

## 0.1.3

### 变更：依赖范围对齐家族新版本（无代码改动）

- peer / dev 依赖升到 **@damoqiongqiu/ice-chart `^0.19.0`** + **ice-render `^2.3.0`**。
  0.x 的 caret 不放宽次版本（`^0.18.0` 等价于 `>=0.18.0 <0.19.0`），
  所以 chart 发 0.19.0 之后本包若不同步，会与上游**硬冲突**——这次一并修掉。

## 0.1.2

### 变更：跟随上游升级（无代码改动）

- 依赖升到 **@damoqiongqiu/ice-chart `^0.18.0`** + **ice-render `^2.0.0`**：上游把图元类型标识
  统一成 `namespace:Type`（`ice-chart:PlotArea` 等），并把重复注册从「静默吞掉」改成**明确抛错**。
  本包只产出 option / DSL，不直接注册类型，因此代码无需改动，仅同步依赖范围与文档表述。

## 0.1.0

### 新增：把直通类型补成编译类型

上一版只有 `line` / `area` / `bar` / `pie` / `scatter` / `function` 走「表 + encoding」编译，
其余类型要自己写 `series`。这一版把常见的表格形态都补上了：

| kind | 通道 | 编译结果 |
| --- | --- | --- |
| `radar` | `x`（指标）+ `y`（数值）+ `series`（分组） | 指标从 x 列推、上限自动取整到 1/2/5×10^k；每个分组一个多边形 |
| `heatmap` | `x` + `y`（两个类目列）+ `value` | `[[x, y, value]]` + 双类目轴 |
| `candlestick` | `x` + `y`＝四列 `[开, 收, 低, 高]` | `[[o, c, l, h]]`；列数不对会报 `ohlc-needs-four-columns` |
| `waterfall` | `name` + `value`（+ `total`） | `total` 列非 0 的行标记合计项 |
| `funnel` / `gauge` / `liquid` | `name` + `value` | 复用 pie 的 name+value 通道；仪表盘/水位球只取第一行并给出警告 |
| `sankey` | `source` + `target` + `value` | 连线表 → `nodes` + `links`（非正数流量跳过并警告） |

新增通道：`encoding.total` / `encoding.source` / `encoding.target`。

### 诊断增强

- 雷达图：指标少于 3 个、「指标 × 分组」缺数据（会按 0 处理）都会给警告
- 桑基图：非正数流量会跳过并提示行数
- 仪表盘 / 水位球：多行数据只取第一行时提示
- K 线：列数不是 4 时直接给错误（顺序 `[开, 收, 低, 高]` 是有约定的）

### 验证

- 单测 25 → **37 个**；每种新类型都有一致性断言：编译产物必须过一遍核心的 `normalizeOption` 且系列有点
- 示例页新增 5 个预设（雷达 / 热力图 / K 线 / 瀑布 / 桑基），真浏览器跑 11 个预设 0 控制台错误

## 0.0.1

- 首个版本：`validateChartDsl` / `compileChartDsl` / `renderChartDsl`，
  数据集两种写法（`{columns, rows}` 与对象数组）、`encoding` 数据绑定、结构化诊断。
