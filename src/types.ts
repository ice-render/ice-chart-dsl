/**
 * 图表 DSL 的类型定义。
 *
 * 设计前提：ice-chart 的 `ChartOption` **本来就是纯 JSON**（`toJSON()` / `fromJSONString()`
 * 已经吃掉了序列化契约），所以这个 DSL 不是「把 option 换个写法」，它补的是三件 option 不做的事：
 *
 * 1. **数据绑定**：给一张表（列名 + 行）和 `encoding`（x / y / 分组列），编译出 option；
 * 2. **意图级默认**：轴类型、图例显隐、提示框触发方式按图表类型自动定，显式写的永远优先；
 * 3. **结构化诊断**：列不存在 / 类型不匹配 / 空数据 / 表达式写错，都能带着位置返回给调用方去自修复。
 */

export const CHART_DSL_SCHEMA_VERSION = 1;

/** 支持的图表类型。带 `data`/`encoding` 编译的是前六种，其余走直通（直接给 `series`）。 */
export const CHART_DSL_KINDS = [
  'line',
  'area',
  'bar',
  'pie',
  'scatter',
  'function',
  'radar',
  'candlestick',
  'heatmap',
  'sankey',
  'treemap',
  'gauge',
  'boxplot',
  'waterfall',
  'funnel',
  'graph',
  'parametric',
  'liquid',
] as const;

export type ChartDslKind = (typeof CHART_DSL_KINDS)[number];

/** 有 data/encoding → option 编译路径的类型。 */
export const CHART_DSL_COMPILED_KINDS: ChartDslKind[] = ['line', 'area', 'bar', 'pie', 'scatter', 'function'];

export type ChartDslCell = string | number | boolean | null | undefined;

/**
 * 表格式数据集。两种写法都收：
 * - `{ columns: ['月份', '销量'], rows: [['1月', 120]] }`
 * - `[{ 月份: '1月', 销量: 120 }]`（JSON 对象数组 —— 模型最常吐的形态）
 */
export type ChartDslDataset =
  | { columns: string[]; rows: ChartDslCell[][] }
  | Array<Record<string, ChartDslCell>>;

/** 列名 → 视觉通道的绑定。 */
export interface ChartDslEncoding {
  /** 横轴：类目列、时间列或数值列（数值列自动用数值轴 + [x, y] 数据点）。 */
  x?: string;
  /** 纵轴：一个列名或一组列名，每个列名编译成一个系列。 */
  y?: string | string[];
  /** 分组列：同一个 x 上的取值拆成多个系列。 */
  series?: string;
  /** 第三维：气泡大小。 */
  size?: string;
  /** 逐项配色 / 热力图数值列。 */
  color?: string;
  /** 名称列（饼图 / 漏斗 / 桑基等按名称分项的类型）。 */
  name?: string;
  /** 数值列（饼图 / 漏斗 / 仪表盘 / 水位球等单值类型）。 */
  value?: string;
}

export interface ChartDslDocument {
  schemaVersion?: number;
  kind: ChartDslKind;
  data?: ChartDslDataset;
  encoding?: ChartDslEncoding;
  /** 标题：字符串等价于 `{ text }`。 */
  title?: string | { text?: string; subtext?: string };
  /** `kind: 'function'` 的表达式与参数（y = f(x)）。 */
  expression?: string;
  domain?: [number, number];
  params?: Record<string, number>;
  /** 逃生舱：直接并进 ChartOption 顶层（同名键覆盖编译结果）。 */
  options?: Record<string, any>;
  /** 逃生舱：直接给 `option.series`（给了它就不再走 data/encoding）。 */
  series?: any[];
}

export interface ChartDslDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** 出问题的位置，如 `encoding.y` / `data.rows[3]` / `expression`。 */
  path?: string;
}

export interface ChartDslValidationResult {
  valid: boolean;
  errors: ChartDslDiagnostic[];
  warnings: ChartDslDiagnostic[];
}
