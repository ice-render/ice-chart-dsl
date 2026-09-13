import type { ChartOption } from '@damoqiongqiu/ice-chart';
import type { ChartDslDiagnostic, ChartDslDocument, ChartDslKind } from '../types';
import {
  columnIndex,
  numericRatio,
  resolveDataset,
  toArray,
  toLabel,
  toNumber,
  type ResolvedDataset,
} from '../internal/dataset';
import { validateChartDsl } from '../validate';

/** 编译失败时抛出：`diagnostics` 就是校验结果，调用方可以直接拿去做自修复提示。 */
export class ChartDslCompileError extends Error {
  public diagnostics: ChartDslDiagnostic[];
  constructor(diagnostics: ChartDslDiagnostic[]) {
    super(`[ice-chart-dsl] DSL 校验不通过：\n${diagnostics.map((d) => `- ${d.message}`).join('\n')}`);
    this.name = 'ChartDslCompileError';
    this.diagnostics = diagnostics;
  }
}

/**
 * DSL → ChartOption（纯 JSON，可直接喂给 `ICEChart.createChart`）。
 *
 * 显式写的永远优先：`options` 里的键会覆盖编译结果，`series` 直通时完全跳过编译。
 */
export function compileChartDsl(dsl: ChartDslDocument): ChartOption {
  const result = validateChartDsl(dsl);
  if (!result.valid) throw new ChartDslCompileError(result.errors);

  const kind = dsl.kind as ChartDslKind;
  const option: any = {
    title: normalizeTitle(dsl),
    theme: 'light',
    animation: { enter: { duration: 520, easing: 'easeOutCubic' } },
    series: [],
  };

  if (Array.isArray(dsl.series) && dsl.series.length) {
    option.series = dsl.series;
  } else if (kind === 'function' || kind === 'parametric') {
    option.legend = { show: false };
    option.tooltip = { trigger: 'item' };
    option.crosshair = { show: true, axis: 'x', showAxisLabel: true };
    option.xAxis = { type: 'value', name: 'x' };
    option.yAxis = { name: 'y' };
    option.series = [
      {
        id: 'curve',
        type: kind,
        name: dsl.title && typeof dsl.title === 'object' ? dsl.title.text : String(dsl.title || (kind === 'function' ? 'f(x)' : 'curve')),
        expression: dsl.expression,
        domain: dsl.domain,
        params: dsl.params,
        lineWidth: 2,
      },
    ];
  } else {
    const dataset = resolveDataset(dsl) as ResolvedDataset;
    if (kind === 'pie') {
      Object.assign(option, compilePie(dsl, dataset));
    } else {
      Object.assign(option, compileCartesian(dsl, dataset, kind));
    }
  }

  if (dsl.options && typeof dsl.options === 'object') {
    for (const key of Object.keys(dsl.options)) {
      const value = (dsl.options as any)[key];
      if (value === undefined) continue;
      if (key === 'series') continue; // series 只认 DSL 顶层的直通字段，避免半替换
      option[key] = value;
    }
  }
  return option as ChartOption;
}

function normalizeTitle(dsl: ChartDslDocument): any {
  if (!dsl.title) return undefined;
  return typeof dsl.title === 'string' ? { text: dsl.title } : dsl.title;
}

/** 直角坐标四类：line / area / bar / scatter。 */
function compileCartesian(dsl: ChartDslDocument, dataset: ResolvedDataset, kind: ChartDslKind): Record<string, any> {
  const encoding = dsl.encoding || {};
  const xIndex = columnIndex(dataset, encoding.x);
  const yNames = toArray(encoding.y);
  const numericX = xIndex >= 0 && numericRatio(dataset, xIndex) > 0.9;
  const sizeIndex = encoding.size ? columnIndex(dataset, encoding.size) : -1;
  const seriesIndex = encoding.series ? columnIndex(dataset, encoding.series) : -1;

  const xValues: Array<string | number> = [];
  const pushX = (value: string | number) => {
    if (!xValues.some((v) => v === value)) xValues.push(value);
  };

  let series: any[];
  if (seriesIndex >= 0) {
    // 分组列：每个分组一个系列，按 x 首次出现的顺序取值
    const groups = new Map<string, Map<string | number, number | null>>();
    const yIndex = columnIndex(dataset, yNames[0]);
    for (const row of dataset.rows) {
      const xValue: string | number = numericX ? (toNumber(row[xIndex]) as number) : toLabel(row[xIndex]);
      if (xValue === '' || xValue === null) continue;
      pushX(xValue);
      const groupName = toLabel(row[seriesIndex]) || '（空）';
      if (!groups.has(groupName)) groups.set(groupName, new Map());
      groups.get(groupName)!.set(xValue, toNumber(row[yIndex]));
    }
    series = [...groups.entries()].map(([name, values], index) => ({
      id: `series-${index + 1}`,
      type: kind,
      name,
      data: xValues.map((x) => (numericX ? [x, values.get(x) ?? null] : values.get(x) ?? null)),
    }));
  } else {
    series = yNames.map((name, index) => {
      const yIndex = columnIndex(dataset, name);
      const data = dataset.rows
        .map((row) => {
          const xValue: string | number = numericX ? (toNumber(row[xIndex]) as number) : toLabel(row[xIndex]);
          const yValue = toNumber(row[yIndex]);
          if (xValue === '' || xValue === null || yValue === null) return null;
          pushX(xValue);
          if (sizeIndex >= 0) {
            const size = toNumber(row[sizeIndex]);
            return [xValue, yValue, size === null ? 8 : size];
          }
          return numericX ? [xValue, yValue] : yValue;
        })
        .filter((item) => item !== null);
      return { id: `series-${index + 1}`, type: kind, name, data };
    });
  }

  const option: Record<string, any> = {
    legend: { show: series.length > 1 },
    tooltip: { trigger: kind === 'scatter' ? 'item' : 'axis' },
    series,
  };
  if (kind === 'scatter') {
    option.crosshair = { show: true, axis: 'xy', showAxisLabel: true };
  } else {
    option.crosshair = { show: true, axis: 'x', showAxisLabel: true };
  }
  option.xAxis = numericX
    ? { type: 'value', name: encoding.x }
    : { type: 'category', name: encoding.x, data: xValues as string[] };
  option.yAxis = { name: yNames.length === 1 ? yNames[0] : undefined };
  return option;
}

/** 饼图 / 玫瑰图：name + value 两列。 */
function compilePie(dsl: ChartDslDocument, dataset: ResolvedDataset): Record<string, any> {
  const encoding = dsl.encoding || {};
  const nameIndex = columnIndex(dataset, encoding.name);
  const valueIndex = columnIndex(dataset, encoding.value);
  const data = dataset.rows
    .map((row) => ({ name: toLabel(row[nameIndex]), value: toNumber(row[valueIndex]) as number }))
    .filter((item) => item.name !== '' && isFinite(item.value));
  return {
    legend: { show: true },
    tooltip: { trigger: 'item' },
    series: [{ id: 'pie', type: 'pie', name: encoding.value, data }],
  };
}

/** 把 DSL 直接编译成 JSON 字符串（存盘 / 进日志 / 给别的进程用）。 */
export function chartDslToJsonString(dsl: ChartDslDocument): string {
  return JSON.stringify(compileChartDsl(dsl));
}
