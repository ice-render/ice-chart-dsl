# Skill PR: ice-chart-dsl

## Title

Add `ice-chart-dsl` skill for building business charts and math curves from a JSON DSL.

## Summary

`ice-chart-dsl` lets AI Agents turn a table plus an `encoding` into an interactive `ice-chart`
chart without hand-writing `ChartOption`, and gives them actionable diagnostics to self-repair.

## Skill path

```text
skills/ice-chart-dsl/SKILL.md
```

## What it adds over the chart option

- **Data binding** — bind columns to channels (`x` / `y` / `series` / `size` / `name` / `value`)
  instead of hand-building `series[].data`.
- **Intent defaults** — axis type, legend visibility and tooltip trigger are chosen per chart kind;
  anything written explicitly wins.
- **Structured diagnostics** — unknown column (with the list of available columns), non-numeric
  column (with the numeric ratio), empty data, row length mismatch, and formula errors with the
  character position. `validateChartDsl` never throws.

## Supported kinds

- compiled from data + encoding: `line`, `area`, `bar`, `pie`, `scatter`, `function`
- passthrough (bring your own `series`): `radar`, `candlestick`, `heatmap`, `sankey`, `treemap`,
  `gauge`, `boxplot`, `waterfall`, `funnel`, `graph`, `parametric`, `liquid`

## Example

```json
{
  "schemaVersion": 1,
  "kind": "line",
  "data": {
    "columns": ["月份", "销量", "渠道"],
    "rows": [["1月", 120, "线上"], ["1月", 86, "线下"], ["2月", 142, "线上"]]
  },
  "encoding": { "x": "月份", "y": "销量", "series": "渠道" }
}
```

## Install command

```bash
skill-installer install ice-chart-dsl
```
