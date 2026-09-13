import type { ChartDslCell, ChartDslDataset, ChartDslDocument } from '../types';

export interface ResolvedDataset {
  columns: string[];
  rows: ChartDslCell[][];
}

/** 把两种数据集写法归一成 `{ columns, rows }`；拿不到有效数据返回 null。 */
export function resolveDataset(dsl: ChartDslDocument | null | undefined): ResolvedDataset | null {
  const data = dsl && dsl.data;
  if (!data) return null;
  if (Array.isArray(data)) {
    const rows = data.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    if (!rows.length) return { columns: [], rows: [] };
    const columns: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
    }
    return { columns, rows: rows.map((row) => columns.map((key) => row[key])) };
  }
  if (typeof data !== 'object') return null;
  const columns = Array.isArray((data as any).columns) ? (data as any).columns.map((c: any) => String(c)) : [];
  const rows = Array.isArray((data as any).rows) ? (data as any).rows : [];
  if (!columns.length) return null;
  return { columns, rows: rows.map((row: any) => (Array.isArray(row) ? row : [])) };
}

export function columnIndex(dataset: ResolvedDataset | null, name: string | undefined): number {
  if (!dataset || !name) return -1;
  return dataset.columns.indexOf(name);
}

export function isNumericCell(value: ChartDslCell): boolean {
  if (typeof value === 'number') return isFinite(value);
  if (typeof value === 'string' && value.trim() !== '') return isFinite(Number(value));
  return false;
}

/** 一列里「非空值的数字占比」，用来判断这列是不是数值列。 */
export function numericRatio(dataset: ResolvedDataset, index: number): number {
  let filled = 0;
  let numeric = 0;
  for (const row of dataset.rows) {
    const value = row[index];
    if (value === null || value === undefined || value === '') continue;
    filled += 1;
    if (isNumericCell(value)) numeric += 1;
  }
  return filled ? numeric / filled : 0;
}

/** 一列是否有任何非空值。 */
export function hasValue(dataset: ResolvedDataset, index: number): boolean {
  return dataset.rows.some((row) => {
    const value = row[index];
    return value !== null && value !== undefined && value !== '';
  });
}

export function toNumber(value: ChartDslCell): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return isFinite(n) ? n : null;
  }
  return null;
}

export function toLabel(value: ChartDslCell): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** `y` 允许写一个列名或一组列名。 */
export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v) : [value];
}

/** 把一个数值向上取整到「好看的刻度」（1 / 2 / 5 × 10^k），给雷达图的指标上限用。 */
export function niceCeil(value: number): number {
  if (!isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** 去重并保持首次出现的顺序。 */
export function unique<T>(values: T[]): T[] {
  const out: T[] = [];
  for (const value of values) if (!out.some((item) => item === value)) out.push(value);
  return out;
}

/** `y` 这种「单列或一组列」的通道，取它当单列用时的那一列。 */
export function firstColumn(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
