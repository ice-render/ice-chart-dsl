---
name: ice-chart-dsl
description: Build interactive ice-chart charts from a JSON-first DSL — a table plus an encoding that binds columns to channels, with structured diagnostics for self-repair.
version: "0.0.1"
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
  "kind": "line | area | bar | pie | scatter | function | (passthrough kinds)",
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
- `encoding.name` + `encoding.value` are for `pie`.
- `kind: "function"` needs `expression` (+ optional `domain`, `params`) and no data.

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
- runtime dependency: `@damoqiongqiu/ice-chart` + `ice-render`
- schema: `src/schema/chart-dsl.schema.json`
