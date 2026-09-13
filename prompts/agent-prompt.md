# Agent prompt: 用 ice-chart-dsl 画图

当用户给了一份数据（表格 / CSV / JSON 数组）并想看图表时，**不要自己拼 `ChartOption`**，
用 `ice-chart-dsl` 的 DSL 描述意图，编译器会把它翻成 ice-chart 的配置。

## 步骤

1. 先看数据：列名、每列是数字还是文本。
2. 选 `kind`：比较用 `bar`，趋势用 `line` / `area`，构成用 `pie`，两个数值列的关系用 `scatter`，
   数学公式用 `function`。
3. 写 `data`（`columns` + `rows`，或对象数组）与 `encoding`：
   - `x` 放类目 / 时间 / 数值列；
   - `y` 放要比较的数值列（多个列名 = 多个系列）；
   - 同一横轴上要分组时用 `series` 指定分组列；
   - 气泡图再加 `size`；饼图用 `name` + `value`。
4. 需要时用 `options` 覆盖默认值（`theme` / `legend` / `tooltip` / `interaction` / `stack` …）。
5. **把 `validateChartDsl` 的诊断当成编译错误来对待**：有 `[错误]` 就按提示改（它会给可用列名），
   有 `[警告]` 就在回答里提一句（例如"饼图里有负值，已按绝对值口径说明"）。

## 输出约定

- 只输出合法 JSON，不要注释、不要尾逗号。
- `schemaVersion` 固定写 `1`。
- 数字列不要把数字写成字符串；空值用 `null`。

## 例子

```json
{
  "schemaVersion": 1,
  "kind": "bar",
  "title": "各区域收入（堆叠）",
  "data": {
    "columns": ["区域", "收入", "业务线"],
    "rows": [["华东", 320, "SaaS"], ["华东", 180, "硬件"], ["华南", 260, "SaaS"]]
  },
  "encoding": { "x": "区域", "y": "收入", "series": "业务线" },
  "options": { "stack": true, "theme": "dark" }
}
```

公式图（不需要 `data`）：

```json
{ "schemaVersion": 1, "kind": "function", "expression": "a*sin(x)/x", "domain": [-10, 10], "params": { "a": 1.5 } }
```

写错时你会拿到这样的反馈，照着改即可：

```
[错误] 列「销售额」不存在。可用列：月份 / 销量 / 渠道。（encoding.y）
[错误] 表达式错误：缺少右括号（位置 6）。（expression）
```
