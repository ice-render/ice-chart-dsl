---
name: ice-chart-dsl
description: Build interactive ice-chart charts from a JSON-first DSL — a table plus an encoding that binds columns to channels, with structured diagnostics for self-repair.
version: "0.2.3"
category: ux
platforms:
  - claude-code
  - codex-cli
  - copilot
  - cursor
  - gemini-cli
  - other
metadata:
  short-description: JSON-first DSL for ice-chart charts — data binding, intent defaults, and actionable validation.
---

# ice-chart-dsl

Use this skill when the user has data (a table, CSV rows, or a JSON array) and wants a chart
rendered by `ice-chart`, and the chart should be produced as **data** rather than imperative
configuration code.

## Capability boundary

This SKILL is the right choice for:

- business charts: line / area / bar / pie / scatter bubble
- tables with a second category dimension: radar (indicators), heatmap (row × column matrix)
- staged totals: waterfall (with a total row)
- flow tables: sankey (source / target / value)
- single-value cards: funnel / gauge / liquid
- math curves: `kind: "function"` (e.g. `sin(x)/x`, damped oscillation)
- charts that must be interactive afterwards (hover, zoom, brush, legend toggle, serialization)
- datasets where columns must be bound to channels instead of hand-built `series[].data`

Use something else when:

- the user wants a generic node/edge diagram (use the ice-render DSL family)
- the chart type is outside the compiled set and the caller already has a full `ChartOption`
  (the DSL still works — pass `series` through — but there is no added value)

## Install

```bash
npm install @damoqiongqiu/ice-chart-dsl @damoqiongqiu/ice-chart ice-render
```

## Document shape

```json
{
  "schemaVersion": 1,
  "kind": "line | area | bar | pie | scatter | violin | beeswarm | hexbin | function | (passthrough kinds)",
  "matrix": { "rows": 2, "columns": 3, "gap": 12 },
  "title": "可选",
  "data": { "columns": ["月份", "销量", "渠道"], "rows": [["1月", 120, "线上"]] },
  "encoding": { "x": "月份", "y": "销量", "series": "渠道" },
  "options": { "stack": true },
  "expression": "a*sin(x)/x",
  "domain": [-10, 10],
  "params": { "a": 1.5 }
}
```

- `data` accepts `{ columns, rows }` **or** an array of objects (`[{ "月份": "1月", "销量": 120 }]`).
- `encoding.y` accepts one column name or an array (each column becomes a series).
- `encoding.series` splits one `y` column into multiple series.
- `encoding.size` makes a bubble chart (`kind: "scatter"`).
- `encoding.name` + `encoding.value` are for `pie` / `funnel` / `gauge` / `liquid`;
  `waterfall` uses them plus an optional `encoding.total` column (non-zero marks the total row).
- `encoding.x` + `encoding.y` + `encoding.series` make a `radar` (x holds the indicator names).
- `encoding.x` + `encoding.y` (two category columns) + `encoding.value` make a `heatmap`.
- `encoding.source` + `encoding.target` + `encoding.value` make a `sankey`.
- `encoding.x` (group) + `encoding.y` (observations) make a `violin` (one density contour per
  group; extra `series` splits it into several distributions) or a `beeswarm` (one dot per
  observation, dodged inside its group). Both are plain "detail table" inputs — no hand-built arrays.
- `matrix` turns `encoding.series` (or several `y` columns) into **small multiples**: one panel per
  group, shared scales, hover/brush/zoom resolved per panel. Panel indexes are assigned by the
  compiler; warnings (`matrix-single-panel`, `matrix-too-few-panels`) tell you when faceting has
  nothing to split or too few panels.
- `encoding.x` + `encoding.y` (both numeric, optional `encoding.size` as weight) make a `hexbin`
  (hexagonal binning): the two-column point table is compiled as-is, the pointer interacts with
  **cells** (count / sum / mean / max), and xy crosshair is on. Tuning (radius, aggregation, colors)
  goes through the `series` passthrough.
- `kind: "function"` needs `expression` (+ optional `domain`, `params`) and no data.

## Annotations (goal lines / thresholds / target bands)

Business charts almost always need a **reference layer** on top of the series — a goal line,
an SLA threshold, an event marker, a target band. That is one field, not a new chart type:

```json
{
  "kind": "line",
  "data": { "columns": ["月份", "销量"], "rows": [["1月", 120], ["2月", 132]] },
  "encoding": { "x": "月份", "y": "销量" },
  "annotation": {
    "lines": [
      { "axis": "y", "value": 150, "text": "目标 150" },
      { "axis": "y", "value": 100, "text": "告警阈值", "color": "#dc3545" },
      { "axis": "x", "value": "2月", "text": "上线" }
    ],
    "points": [{ "x": "2月", "y": 132, "text": "异常点", "symbol": "diamond" }],
    "areas": [{ "axis": "y", "from": 0, "to": 100, "text": "达标区" }]
  }
}
```

- `value` / `from` / `to` / `x` / `y` are **data values**, not pixels: numbers on a numeric axis,
  category names (or indexes) on a category axis, timestamps or date strings on a time axis.
- Annotations live on the coordinate system, so they follow zoom / pan, stay out of the legend,
  do not occupy data indexes, and never steal hit-testing from the series.
- Only cartesian kinds (`line` / `area` / `bar` / `scatter` / `violin` / `beeswarm`) can host annotations; using them on
  `pie` / `radar` / `sankey` / … raises `annotation-non-cartesian` (those scenes have no x/y axes).
- Structural mistakes are **errors** (`missing-annotation-value`: missing `value`, or `from` without
  `to`); suspicious values are **warnings** (`annotation-unknown-category`,
  `annotation-value-type`, `annotation-empty-area`). Out-of-range values are simply not drawn —
  `chart.annotationDiagnostics()` gives the reason at runtime.

## API

```ts
import { validateChartDsl, compileChartDsl, renderChartDsl } from '@damoqiongqiu/ice-chart-dsl';

const { valid, errors, warnings } = validateChartDsl(dsl); // never throws
const option = compileChartDsl(dsl);                       // throws ChartDslCompileError on errors
const { chart, option } = renderChartDsl('canvas-id', dsl);
```

## Self-repair loop

1. Write the DSL.
2. Call `validateChartDsl`. Treat every `error` as a compile failure.
3. Read the message — it names the available columns, the numeric ratio, or the character
   position of a formula error — and fix that field.
4. Re-validate. Mention `warning`s to the user (e.g. pie with negative values, unused params).

Example feedback:

```
[错误] 列「销售额」不存在。可用列：月份 / 销量 / 渠道。（encoding.y）
[错误] 表达式错误：缺少右括号（位置 6）。（expression）
[警告] 参数「b」定义了但表达式没有用到。（expression）
```

## Reference

- package: `@damoqiongqiu/ice-chart-dsl` (npm)
- runtime peer dependencies: `@damoqiongqiu/ice-chart@^0.30.14`（分布组图 `violin` / `beeswarm`
  与面板矩阵 `matrix` 是 0.30.13 起，六边形分箱 `hexbin` 是 0.30.14 起；只画基础图用 0.30.1 也够）+
  `ice-render@^4.2.0`（家族当前引擎 `4.3.0`，建议直接装最新）
- schema: `src/schema/chart-dsl.schema.json`
