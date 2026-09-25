# Changelog

## Unreleased

> 下一个版本发布前，改动在这里累积。

## 0.6.5 - 2026-09-25

> 跟版 ice-chart 0.30.16：把它的两块新类型接进 DSL —— **日历热力**（`calendar`）与
> **多轴分类流**（`alluvial`）。两条都遵守本仓铁律：只加「数据绑定 + 意图级默认 + 可执行诊断」，
> 不做 ChartOption 的字段搬运。

### 新增

- **`calendar` 进编译清单**：`encoding.x` 是日期列、`encoding.y` 是数值列（一行一天），
  直接编成 core 要的 `{ date, value }` 明细。**日期不在 DSL 里解析** —— core 的归一化是唯一
  事实来源（按 UTC 的 Y/M/D 对齐格子、同一天多条取和），所以 `Date` 对象与 `2026-1-5`
  这类宽松写法都还能用。排布与配色走顶层 `calendar`（`weekStart` / `weekdayLabels` /
  `minColor` / `maxColor`…），`options.calendar` 仍可整体覆盖。
  校验补了一条 `calendar-unparseable-date`：读到不像日期的格子时给**警告**而不是报错
  （core 会跳过它们，图表不该因此编译不过），诊断里带行数并点名 `YYYY-MM-DD`。

- **`alluvial` 进编译清单**：`encoding.axes` 按顺序列出每个轴的**列名**（至少两个），
  `encoding.value` 是流量列（不绑就按每条记录算 1，跟 core 的缺省口径一致）。
  core 的 `alluvial.rows` 是**记录对象数组**，而用户手上是 `{ columns, rows }` 的表 ——
  这个转换放在编译期，用户和 agent 都不必自己把行拍成对象。
  排序 / 间距 / 配色走顶层 `alluvial`（`sort` / `spread` / `nodeWidth` / `ribbonOpacity`…）。

  校验是**可执行**的那一档：轴少于 2 个（`alluvial-axes-too-few`）、`axes` 写成单个列名
  （`invalid-axes`）、轴列不存在（`unknown-column`，带可用列名）都报错；
  单类目轴（`alluvial-single-category`："画出来是一条直线"）与行里缺轴值
  （`alluvial-missing-axis-value`）只是警告 —— 后者正是 core 会静默跳过的那批行。

### 依赖

- **跟版 ice-chart 0.30.16**（devDependency 与 peerDependency 同步）：`calendar` / `alluvial`
  都是 0.30.16 才有的类型。

## 0.6.4 - 2026-09-25

> 跟版 ice-chart 0.30.14：把**六边形分箱**（`hexbin`）接进 DSL。

### 新增

- **`hexbin` 进编译清单**：两列点表（`x` + `y`，都要数值）直接编成蜂窝分箱；
  可选的 `encoding.size` 就是权重（与散点的第三维同一个位置）。十字准星按 xy，
  提示框按格子（core 侧的交互单位是格子，不是原始点）。
  半径 / 聚合口径 / 配色仍走 `series` 直通或 `options` —— 不做 ChartOption 的马甲。

### 依赖

- **跟版 ice-chart 0.30.14**（devDependency 与 peerDependency 同步）：`hexbin` 是 0.30.14 才有的类型。

## 0.6.3 - 2026-09-24

> 跟版 ice-chart 0.30.13：把它的两块新能力接进 DSL —— **分布组图**（`violin` / `beeswarm`）
> 与**面板矩阵**（数据驱动分面）。两条都遵守本仓铁律：只加「数据绑定 + 意图级默认 + 可执行诊断」，
> 不做 ChartOption 的字段搬运。

### 新增

- **分布组图：`violin` / `beeswarm` 进编译清单**。一张「组 + 观测值」的明细表直接编译成
  core 要的数据形状：`violin` 按组把观测值收成 `number[][]`（多组对比给 `encoding.series`
  就拆成多个分布），`beeswarm` 逐点编成 `[组, 值]`。用户在两边都不必自己捏数组。
- **面板矩阵（数据驱动分面）：顶层 `matrix: { rows, columns, gap? }`**。按 `encoding.series`
  拆出来的每个分组（或多列 `y`）依次落进一块面板，面板下标由编译器分配 ——
  这是「一张表按渠道拆成六块」那种**意图级**的能力，所以放在 DSL 这一层。
  诊断照旧可执行：`matrix-single-panel`（没东西可分）、`matrix-too-few-panels`（分组比面板多）、
  `matrix-ignored`（非直角坐标场景）。

### 依赖

- **跟版 ice-chart 0.30.13**（`^0.30.4` → `^0.30.13`，devDependency 与 peerDependency 同步）：
  分布组图与面板矩阵都是 0.30.13 才有的能力，下限跟着抬。

## 0.6.2 - 2026-09-22

### 依赖

- **跟版 ice-chart 0.30.1**（`^0.29.1` → `^0.30.1`，devDependency 与 peerDependency 同步）：
  0.x 的 caret 锁的是 minor，`^0.29.1` **吃不到 0.30.x** —— 装了本包的应用会被顶回 0.29，
  0.30 的滚动窗口增量（环形写入 4.26ms → 0.13ms）一起丢掉。范围抬到 `^0.30.1` 后与家族当前版本对齐。
- 技能卡的运行时引用同步（`@damoqiongqiu/ice-chart@^0.20.0` / `ice-render@^2.3.0` 是两年前的写法）。

## 0.6.1 - 2026-09-22

### 依赖

- **跟版 ice-chart 0.29.1**（`^0.29.0` → `^0.29.1`，devDependency 与 peerDependency 同步）：
  0.29 带来列存（虚拟）系列这一整条线；0.29.1 修掉了类目轴上万时的 `O(n²)`
  （10 万类目时坐标轴一次渲染 3716ms → 0ms）。本包只编译 option，不吃这条性能修复，
  但把下限提到 0.29.1 可以让「装了本包的应用」默认拿到它。

## 0.6.0 - 2026-09-21

### 变更（破坏性：移除 `candlestick` kind）

上游 `ice-chart` 已不再承载金融交易类图表（交易能力迁往同族新包 `ice-trading-chart`），
本包与之对齐，把 K 线从 DSL 里整体摘掉：

- **`kind: 'candlestick'` 不再合法**：从 `CHART_DSL_KINDS` / `CHART_DSL_COMPILED_KINDS` /
  JSON Schema 的 enum 三处清单移除，校验时按「不支持的 kind」明确报错（并列出可用类型）。
- 删除四列 OHLC 的语义校验与它专有的 `ohlc-needs-four-columns` 诊断
  （这个诊断只在 candlestick 下出现，摘掉它不会影响其它 kind 的诊断质量）。
- 删除 `compileCandlestick` 编译分支。
- 示例页 `examples/chart-dsl.html` 去掉 K 线预设；README / agent-prompt / SKILL 文档同步。
- **peer 下限抬到 `@damoqiongqiu/ice-chart@^0.28.0`**：那一版删了内置 `candlestick` 系列，
  装旧版会得到 npm 的 peer 冲突提示 —— 有意的。

### 其它

- 需要 K 线 DSL 的场景请等待配套的 `ice-trading-dsl`（本包不承接交易语义）。

## 0.5.0 - 2026-09-19

### 变更

- **peer 下限抬到 `ice-render@^2.18.0`**：那一版是**事件系统改版**（事件沿组件树冒泡、
  `ICEEvent` 的 W3C 方法真生效、事件名类型化）。本包编译出来的图/线最终由引擎绘制，
  事件语义与渲染语义必须同版。

  仍停在 2.14~2.17 的宿主装本版本会得到 npm 的 peer 冲突提示 —— 有意的。
## 0.4.0 - 2026-09-19

### 变更

- **peer 下限抬到 `ice-render@^2.17.0`**：那一版把 `zIndex` 的默认值改成 **`'auto'` 哨兵**
  （排序当 0、同层平手按**加入顺序**；显式正数是"应用自己钉的浮层"），补了四个 z 序 API，
  并把**序列化格式升到 v2**（旧文档载入时自动迁移，绘制次序逐项不变）。

  仍停在 2.14 / 2.15 / 2.16 的宿主装本版本会得到 npm 的 peer 冲突提示 —— 有意的：
  宁可响亮失败，也不要让它在"新旧两套叠放/序列化语义"之间看着能跑、行为却对不上。

## 0.3.0 - 2026-09-18

### 变更

- **peer 下限抬到 `ice-render@^2.16.0`**：本包编译出来的图/线最终都由引擎绘制，2.16.0 修的是「连线横穿图面里的其他图元」。

  仍停在 2.14 / 2.15 的宿主装本版本会得到 npm 的 peer 冲突提示 —— 有意的：
  宁可响亮失败，也不要让它悄悄用老路由画出一堆穿线。

## 0.2.9 - 2026-09-17

### 变更

- **示例页改成家族统一的「一页一个类」写法**（`examples/chart-dsl.html`）。构造期建好 DOM 引用与
  事件；`PRESETS` 变 `static` 常量、当前图表实例收进 `this.chart`（重渲前先 destroy）；
  预设与渲染按钮接线集中到 `__wireToolbar()`。这页的"变化"是**用户驱动**的（改 JSON / 换预设后
  点渲染），不是宿主推数据，所以按约定不加 `onUpdate()`。示例页不在 npm 包里（`files: ["dist"]`），
  **不含运行时功能变更**。
- 门禁：types / jest / build / 真机冒烟 2/2；画布截图前后 sha256 完全相同（0 像素差异）。

### 其它

- **补上示例页真机冒烟**：本仓此前**连 playwright 配置都没有**，`examples/chart-dsl.html`
  从未被浏览器跑过。现在有 `playwright.config.ts`（端口 8096，家族端口表已登记）与目录驱动的
  `e2e/examples-smoke.spec.ts`（判据：无 console/pageerror、无 4xx、画布**真有落墨**），
  并用 `npm run verify:full` 串起类型检查 → jest → build → e2e。
- 纯开发期基建，**运行时行为未变**，故不发版。

## 0.2.8 - 2026-09-15

### 变更

- **dev 依赖对齐**：`@damoqiongqiu/ice-chart` → `^0.23.4`、`ice-render` → `^2.12.0`。
  peer 范围不动（chart `^0.23.2`、引擎 `^2.10.0`）—— 两个范围本来就已经允许新版本。
  引擎 2.12.0 含 2.11.3 的连线命中语义修正；本包只编译 option，**不含功能变更**。
- 门禁（在 chart 0.23.4 + 引擎 2.12.0 上重跑）：`types:check` ✅、jest 45/45 ✅、build ✅、
  示例页 e2e 冒烟（chart-dsl.html 无报错且画布有内容）✅。

## 0.2.7 - 2026-09-15

### 变更

- **dev 依赖对齐**：`ice-render` → `^2.11.2`、`@damoqiongqiu/ice-chart` → `^0.23.3`。
  peer 范围不动（`ice-render ^2.10.0`、`@damoqiongqiu/ice-chart ^0.23.2`）—— 两个范围本来就已经允许新版本。
  本包只把「一张表 + encoding」编译成图表 option，引擎这次改的是对齐引导的候选目标范围，
  对本包是空操作，**不含功能变更**。
- 门禁（在 chart 0.23.3 + 引擎 2.11.2 上重跑）：`types:check` ✅、jest 45/45 ✅、build ✅、
  示例页 e2e 冒烟（chart-dsl.html 无报错且画布有内容）✅。

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
