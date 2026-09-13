# Changelog

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
