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

/** 支持的图表类型。见 `CHART_DSL_COMPILED_KINDS`：没进编译清单的走直通（直接给 `series`）。 */
export const CHART_DSL_KINDS = [
  'line',
  'area',
  'bar',
  'pie',
  'scatter',
  'function',
  'radar',
  'heatmap',
  'sankey',
  'treemap',
  'gauge',
  'boxplot',
  'violin',
  'beeswarm',
  'waterfall',
  'funnel',
  'graph',
  'parametric',
  'liquid',
] as const;

export type ChartDslKind = (typeof CHART_DSL_KINDS)[number];

/** 有 data/encoding → option 编译路径的类型（其余直通）。 */
export const CHART_DSL_COMPILED_KINDS: ChartDslKind[] = [
  // 直角坐标
  'line',
  'area',
  'bar',
  'scatter',
  'waterfall',
  'heatmap',
  // 分布组图（一张「组 + 观测值」的表 → 密度轮廓 / 逐点避让）
  'violin',
  'beeswarm',
  // 关系 / 分层
  'sankey',
  // 极坐标与单体
  'pie',
  'radar',
  'funnel',
  'gauge',
  'liquid',
  // 函数
  'function',
];

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
  /** 瀑布图：标记「合计」行的列（该行取值非空且不是 false / 0 即视为合计项）。 */
  total?: string;
  /** 桑基图：连线起点列。 */
  source?: string;
  /** 桑基图：连线终点列。 */
  target?: string;
}

/** 标注的定位轴：`'y'`（默认）画水平线，`'x'` 画垂直线。 */
export type ChartDslAnnotationAxis = 'x' | 'y';

/**
 * 标注线：目标线 / 阈值线 / 告警线。
 *
 * `value` 是**数据值**，不是像素：数值轴写数字，类目轴写类目名（或下标）。
 * 定位由 ice-chart 按坐标轴比例尺算，因此缩放 / 平移后线会跟着走。
 */
export interface ChartDslAnnotationLine {
  axis?: ChartDslAnnotationAxis;
  value: number | string;
  text?: string;
  color?: string;
  /** 是否虚线，默认 true。 */
  dashed?: boolean;
  /** 文字沿线的位置，默认 `'end'`。 */
  textPosition?: 'start' | 'center' | 'end';
}

/** 标注点：异常点 / 事件点。`x` 与 `y` 都是数据值。 */
export interface ChartDslAnnotationPoint {
  x: number | string;
  y: number;
  text?: string;
  color?: string;
  symbol?: 'circle' | 'rect' | 'diamond' | 'triangle';
  textPosition?: 'top' | 'bottom' | 'left' | 'right';
}

/** 标注区间：达标区 / 维护窗口。`from` / `to` 是同一根轴上的两个数据值。 */
export interface ChartDslAnnotationArea {
  axis?: ChartDslAnnotationAxis;
  from: number | string;
  to: number | string;
  color?: string;
  text?: string;
  textPosition?: 'start' | 'center' | 'end';
}

/**
 * 标注图层（目标线 / 阈值线 / 异常点 / 目标区间）。
 *
 * 它是**挂在坐标系上的一个图层**，不是新的图表类型：不进图例、不占数据下标，
 * 也不参与命中测试。越界的标注不会被画出来（ice-chart 会在
 * `chart.annotationDiagnostics()` 里给出原因，本包在编译期就把明显写错的挡下来）。
 */
export interface ChartDslAnnotation {
  lines?: ChartDslAnnotationLine[];
  points?: ChartDslAnnotationPoint[];
  areas?: ChartDslAnnotationArea[];
}

export interface ChartDslDocument {
  schemaVersion?: number;
  kind: ChartDslKind;
  data?: ChartDslDataset;
  encoding?: ChartDslEncoding;
  /**
   * 面板矩阵（小倍数）：把按 `encoding.series` 拆出来的每个系列各放进一块面板。
   *
   * 这是**数据驱动分面**在 DSL 这一层的样子 —— 「一张表按渠道拆成六块」是意图，
   * 不是 ChartOption 的字段搬运；面板下标由编译器分配，用户不用自己算。
   * 只对直角坐标的 kind 有意义（其余场景会被警告并忽略）。
   */
  matrix?: { rows: number | number[]; columns: number | number[]; gap?: number };
  /**
   * 标注图层：目标线 / 阈值线 / 异常点 / 目标区间。
   *
   * 只对**直角坐标**的 kind 有意义（line / area / bar / scatter）；给饼图 / 雷达 / 桑基等
   * 会被警告（那些场景没有 x/y 坐标系，标准无处可放）。
   */
  annotation?: ChartDslAnnotation;
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
