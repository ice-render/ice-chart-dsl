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
import { firstColumn, niceCeil } from '../internal/dataset';
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
    // 每种类型的数据形状差别很大（category-hue / 三维 / 分层…），
    // 所以按 kind 分派到专门的编译器，而不是硬塞进一个通用路径。
    Object.assign(option, compileByKind(dsl, dataset, kind));
  }

  // 标注图层：原样交给 ice-chart（它的 normalizeAnnotation 负责收拢形状、解析层负责定位）。
  // 放在逃生舱之前，所以 `options.annotation` 依然能整体覆盖它。
  if (dsl.annotation && typeof dsl.annotation === 'object') {
    option.annotation = dsl.annotation;
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

function compileByKind(dsl: ChartDslDocument, dataset: ResolvedDataset, kind: ChartDslKind): Record<string, any> {
  switch (kind) {
    case 'pie':
    case 'funnel':
    case 'gauge':
    case 'liquid':
      return compileNameValue(dsl, dataset, kind);
    case 'radar':
      return compileRadar(dsl, dataset);
    case 'heatmap':
      return compileHeatmap(dsl, dataset);
    case 'waterfall':
      return compileWaterfall(dsl, dataset);
    case 'sankey':
      return compileSankey(dsl, dataset);
    default:
      return compileCartesian(dsl, dataset, kind);
  }
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

/** 饼图 / 玫瑰图 / 漏斗 / 仪表盘 / 水位球：都是 name + value 两列。 */
function compileNameValue(dsl: ChartDslDocument, dataset: ResolvedDataset, kind: ChartDslKind): Record<string, any> {
  const encoding = dsl.encoding || {};
  const nameIndex = columnIndex(dataset, encoding.name);
  const valueIndex = columnIndex(dataset, encoding.value);
  const data = dataset.rows
    .map((row) => ({ name: toLabel(row[nameIndex]), value: toNumber(row[valueIndex]) as number }))
    .filter((item) => item.name !== '' && isFinite(item.value));
  const isSingleValue = kind === 'gauge' || kind === 'liquid';
  return {
    legend: { show: kind === 'pie' || kind === 'funnel' },
    tooltip: { trigger: 'item' },
    series: [{ id: kind, type: kind, name: encoding.value, data: isSingleValue ? data.slice(0, 1) : data }],
  };
}

/** 雷达图：x 列是指标，y 列是数值，series 列把数据拆成多个多边形。 */
function compileRadar(dsl: ChartDslDocument, dataset: ResolvedDataset): Record<string, any> {
  const encoding = dsl.encoding || {};
  const indicatorIndex = columnIndex(dataset, encoding.x);
  const valueIndex = columnIndex(dataset, firstColumn(encoding.y));
  const groupIndex = columnIndex(dataset, encoding.series);

  const indicators: string[] = [];
  const byGroup = new Map<string, Map<string, number>>();
  for (const row of dataset.rows) {
    const indicator = toLabel(row[indicatorIndex]);
    const value = toNumber(row[valueIndex]);
    if (!indicator || value === null) continue;
    if (!indicators.includes(indicator)) indicators.push(indicator);
    const groupName = groupIndex >= 0 ? toLabel(row[groupIndex]) || '（空）' : String(firstColumn(encoding.y));
    if (!byGroup.has(groupName)) byGroup.set(groupName, new Map());
    byGroup.get(groupName)!.set(indicator, value);
  }
  const maxByIndicator = indicators.map((name) => {
    let max = 0;
    for (const values of byGroup.values()) max = Math.max(max, Math.abs(values.get(name) ?? 0));
    return niceCeil(max);
  });
  return {
    legend: { show: byGroup.size > 1 },
    tooltip: { trigger: 'item' },
    radar: {
      indicators: indicators.map((name, index) => ({ name, max: maxByIndicator[index] })),
      splitNumber: 4,
    },
    series: [...byGroup.entries()].map(([name, values], index) => ({
      id: `radar-${index + 1}`,
      type: 'radar',
      name,
      data: indicators.map((indicator) => values.get(indicator) ?? 0),
    })),
  };
}

/** 热力图：x / y 两个类目列 + value 数值列。 */
function compileHeatmap(dsl: ChartDslDocument, dataset: ResolvedDataset): Record<string, any> {
  const encoding = dsl.encoding || {};
  const xIndex = columnIndex(dataset, encoding.x);
  const yIndex = columnIndex(dataset, firstColumn(encoding.y));
  const valueIndex = columnIndex(dataset, encoding.value || encoding.color);
  const xs: string[] = [];
  const ys: string[] = [];
  const data: Array<[string, string, number]> = [];
  for (const row of dataset.rows) {
    const x = toLabel(row[xIndex]);
    const y = toLabel(row[yIndex]);
    const value = toNumber(row[valueIndex]);
    if (!x || !y || value === null) continue;
    if (!xs.includes(x)) xs.push(x);
    if (!ys.includes(y)) ys.push(y);
    data.push([x, y, value]);
  }
  return {
    legend: { show: false },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', name: encoding.x, data: xs },
    yAxis: { type: 'category', name: encoding.y },
    grid: { x: false, y: false },
    series: [{ id: 'heatmap', type: 'heatmap', name: encoding.value, data }],
  };
}

/** 瀑布图：name + value（正负），可选的 total 列标记合计项。 */
function compileWaterfall(dsl: ChartDslDocument, dataset: ResolvedDataset): Record<string, any> {
  const encoding = dsl.encoding || {};
  const nameIndex = columnIndex(dataset, encoding.name);
  const valueIndex = columnIndex(dataset, encoding.value);
  const totalIndex = columnIndex(dataset, encoding.total);
  const data = dataset.rows
    .map((row) => {
      const name = toLabel(row[nameIndex]);
      const value = toNumber(row[valueIndex]);
      const totalRaw = totalIndex >= 0 ? row[totalIndex] : undefined;
      const total = totalRaw !== undefined && totalRaw !== null && totalRaw !== '' && totalRaw !== false && Number(totalRaw) !== 0;
      return total ? { name, value: isFinite(value as number) ? value : 0, total: true } : { name, value };
    })
    .filter((item) => item.name !== '' && (item.value === null || isFinite(item.value as number)));
  return {
    legend: { show: false },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', name: encoding.name },
    yAxis: { name: encoding.value },
    series: [{ id: 'waterfall', type: 'waterfall', name: encoding.value, barWidth: 0.55, data }],
  };
}

/** 桑基图：一张「起点 / 终点 / 流量」的连线表。 */
function compileSankey(dsl: ChartDslDocument, dataset: ResolvedDataset): Record<string, any> {
  const encoding = dsl.encoding || {};
  const sourceIndex = columnIndex(dataset, encoding.source);
  const targetIndex = columnIndex(dataset, encoding.target);
  const valueIndex = columnIndex(dataset, encoding.value);
  const nodes: Array<{ name: string }> = [];
  const links: Array<{ source: string; target: string; value: number }> = [];
  for (const row of dataset.rows) {
    const source = toLabel(row[sourceIndex]);
    const target = toLabel(row[targetIndex]);
    const value = toNumber(row[valueIndex]);
    if (!source || !target || value === null || value <= 0) continue;
    if (!nodes.some((node) => node.name === source)) nodes.push({ name: source });
    if (!nodes.some((node) => node.name === target)) nodes.push({ name: target });
    links.push({ source, target, value });
  }
  return {
    legend: { show: false },
    tooltip: { trigger: 'item' },
    sankey: { nodes, links, nodeWidth: 12, nodePadding: 8, linkOpacity: 0.5 },
    series: [{ id: 'sankey', type: 'sankey', name: '流向' }],
  };
}

/** 把 DSL 直接编译成 JSON 字符串（存盘 / 进日志 / 给别的进程用）。 */
export function chartDslToJsonString(dsl: ChartDslDocument): string {
  return JSON.stringify(compileChartDsl(dsl));
}
