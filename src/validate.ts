import { diagnoseExpression, evaluateExpression } from '@damoqiongqiu/ice-chart';
import {
  CHART_DSL_KINDS,
  CHART_DSL_SCHEMA_VERSION,
  type ChartDslDiagnostic,
  type ChartDslDocument,
  type ChartDslKind,
  type ChartDslValidationResult,
} from './types';
import { columnIndex, hasValue, numericRatio, resolveDataset, toArray, type ResolvedDataset } from './internal/dataset';

const ROOT_FIELDS = [
  'schemaVersion',
  'kind',
  'data',
  'encoding',
  'annotation',
  'title',
  'expression',
  'domain',
  'params',
  'options',
  'series',
];

const ENCODING_FIELDS = ['x', 'y', 'series', 'size', 'color', 'name', 'value', 'total', 'source', 'target'];

/** 有 x / y 坐标系的 kind —— 标注只对这些有意义。 */
const CARTESIAN_KINDS: ChartDslKind[] = ['line', 'area', 'bar', 'scatter'];

/** 标注里「有没有给值」的判断：`0` 与 `''` 是两种不同情况，前者是合法值。 */
function hasAnnotationValue(value: any): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * 结构 + 语义校验。**任何输入都不抛异常**（包括 null / 数组 / 乱七八糟的对象），
 * 因为它是给 agent 做自修复用的反馈通道。
 */
export function validateChartDsl(dsl: ChartDslDocument | any): ChartDslValidationResult {
  const errors: ChartDslDiagnostic[] = [];
  const warnings: ChartDslDiagnostic[] = [];
  const fail = (code: string, message: string, path?: string) => errors.push({ severity: 'error', code, message, path });
  const warn = (code: string, message: string, path?: string) => warnings.push({ severity: 'warning', code, message, path });

  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl)) {
    fail('invalid-root', 'DSL 根节点必须是一个对象。');
    return finish(errors, warnings);
  }
  if (dsl.schemaVersion !== undefined && dsl.schemaVersion !== CHART_DSL_SCHEMA_VERSION) {
    fail('unsupported-schema-version', `不支持的 schemaVersion：${dsl.schemaVersion}（当前是 ${CHART_DSL_SCHEMA_VERSION}）。`, 'schemaVersion');
  }
  if (!dsl.kind) {
    fail('missing-kind', `缺少 kind。可用类型：${CHART_DSL_KINDS.join(' / ')}。`, 'kind');
  } else if (!CHART_DSL_KINDS.includes(dsl.kind as ChartDslKind)) {
    fail('unsupported-kind', `不支持的 kind「${dsl.kind}」。可用类型：${CHART_DSL_KINDS.join(' / ')}。`, 'kind');
  }
  for (const key of Object.keys(dsl)) {
    if (!ROOT_FIELDS.includes(key)) warn('unknown-field', `未知字段「${key}」会被忽略。`, key);
  }

  const kind = dsl.kind as ChartDslKind;
  const passthrough = Array.isArray(dsl.series) && dsl.series.length > 0;
  if (passthrough && dsl.data) {
    warn('series-overrides-data', '同时给了 series 和 data：按 series 直通，data / encoding 会被忽略。', 'series');
  }

  // 表达式类：把核心的表达式诊断（带字符位置）原样透出 —— 这是 agent 最需要的一类反馈
  if (kind === 'function' || kind === 'parametric') {
    const expression = String(dsl.expression || '');
    if (!expression.trim()) {
      fail('missing-expression', `kind「${kind}」需要 expression，例如 "sin(x)/x"。`, 'expression');
    } else {
      const variable = kind === 'function' ? 'x' : 't';
      const params = (dsl.params && typeof dsl.params === 'object' ? dsl.params : {}) as Record<string, number>;
      // 采样一遍再诊断：静态检查能抓语法错误，但「整段开方开不出来」「输出恒定」这两类
      // 只有真算过才知道 —— 而它们恰恰是「公式写错了但没报错」最常见的表现。
      const values = sampleExpression(expression, variable, params, dsl.domain, kind);
      for (const item of diagnoseExpression(expression, { variable, params, values })) {
        const diagnostic: ChartDslDiagnostic = {
          severity: item.severity,
          code: `expression-${item.code}`,
          message: item.message,
          path: 'expression',
        };
        (item.severity === 'error' ? errors : warnings).push(diagnostic);
      }
    }
    return finish(errors, warnings);
  }

  // 直通类：结构上只要求 series 存在
  if (passthrough) {
    // 直通时没有 data/encoding 可参照，只做结构性校验
    validateAnnotation(dsl.annotation, { kind, dataset: null, xIndex: -1, numericX: false }, fail, warn);
    return finish(errors, warnings);
  }

  const dataset = resolveDataset(dsl);
  if (dsl.data === undefined) {
    fail('missing-data', `kind「${kind}」需要 data（列名 + 行）或直接给 series 直通。`, 'data');
    return finish(errors, warnings);
  }
  if (!dataset) {
    fail('invalid-data', 'data 需要 { columns, rows } 或 [{ 列名: 值 }, ...] 两种写法之一。', 'data');
    return finish(errors, warnings);
  }
  if (!dataset.columns.length) {
    fail('missing-columns', 'data.columns 不能为空。', 'data.columns');
    return finish(errors, warnings);
  }
  if (!dataset.rows.length) {
    fail('empty-data', 'data.rows 是空的，没有可绘制的数据。', 'data.rows');
    return finish(errors, warnings);
  }
  dataset.rows.forEach((row, index) => {
    if (row.length !== dataset.columns.length) {
      fail(
        'row-length-mismatch',
        `第 ${index + 1} 行有 ${row.length} 个值，但列数是 ${dataset.columns.length}（columns：${dataset.columns.join(' / ')}）。`,
        `data.rows[${index}]`
      );
    }
  });

  const encoding = dsl.encoding && typeof dsl.encoding === 'object' ? dsl.encoding : {};
  if (!dsl.encoding) {
    fail('missing-encoding', `kind「${kind}」需要 encoding 把列绑到通道上，例如 { "x": "${dataset.columns[0]}", "y": "${dataset.columns[1] || dataset.columns[0]}" }。`, 'encoding');
  }
  for (const key of Object.keys(encoding)) {
    if (!ENCODING_FIELDS.includes(key)) warn('unknown-encoding', `encoding 里的未知通道「${key}」会被忽略。`, `encoding.${key}`);
  }

  // 标注：结构性错误挡在编译前（缺 value / 缺 from-to），值类型与类目存在性给提示。
  // 放在这里是因为通道校验还没开始，但 x 列是不是数值列已经能确定 —— 而标注正是靠它判断
  // 「value 该写数字还是写类目名」。
  const annotationXIndex = encoding.x ? columnIndex(dataset, encoding.x) : -1;
  validateAnnotation(
    dsl.annotation,
    {
      kind,
      dataset,
      xIndex: annotationXIndex,
      numericX: annotationXIndex >= 0 && numericRatio(dataset, annotationXIndex) > 0.9,
    },
    fail,
    warn
  );

  const needColumn = (name: string | undefined, path: string, required: boolean): number => {
    if (!name) {
      if (required) fail('missing-encoding-channel', `${path} 是必填的。可用列：${dataset.columns.join(' / ')}。`, path);
      return -1;
    }
    const index = columnIndex(dataset, name);
    if (index < 0) {
      fail('unknown-column', `列「${name}」不存在。可用列：${dataset.columns.join(' / ')}。`, path);
      return -1;
    }
    if (!hasValue(dataset, index)) {
      fail('empty-column', `列「${name}」整列都是空值。`, path);
      return -1;
    }
    return index;
  };
  const needNumeric = (name: string | undefined, path: string, required: boolean): number => {
    const index = needColumn(name, path, required);
    if (index < 0) return -1;
    const ratio = numericRatio(dataset, index);
    if (ratio < 0.6) {
      fail('non-numeric-column', `列「${name}」不是数值列（数字占比 ${(ratio * 100).toFixed(0)}%），不能当 ${path.split('.')[1]} 用。`, path);
      return -1;
    }
    if (ratio < 1) warn('partly-non-numeric', `列「${name}」有 ${Math.round((1 - ratio) * 100)}% 的值不是数字，这些点会被当作空缺。`, path);
    return index;
  };

  // name + value 家族：饼图 / 漏斗 / 仪表盘 / 水位球
  if (kind === 'pie' || kind === 'funnel' || kind === 'gauge' || kind === 'liquid') {
    needColumn(encoding.name, 'encoding.name', kind === 'pie' || kind === 'funnel');
    const valueIndex = needNumeric(encoding.value, 'encoding.value', true);
    if (valueIndex >= 0 && kind === 'pie') {
      const negative = dataset.rows.filter((row) => {
        const n = Number(row[valueIndex]);
        return isFinite(n) && n < 0;
      });
      if (negative.length) {
        warn('pie-negative-value', `饼图 / 玫瑰图不适合表达负值，检测到 ${negative.length} 行负数。`, 'encoding.value');
      }
    }
    if (valueIndex >= 0 && (kind === 'gauge' || kind === 'liquid') && dataset.rows.length > 1) {
      warn('single-value-kind', `kind「${kind}」只画一个值，${dataset.rows.length} 行数据里只有第一行会被用到。`, 'data.rows');
    }
    return finish(errors, warnings);
  }

  // 雷达图：x 列是指标、y 列是数值、series 列把数据拆成多个多边形
  if (kind === 'radar') {
    const indicatorIndex = needColumn(encoding.x, 'encoding.x', true);
    const valueIndex = needNumeric(toArray(encoding.y)[0], 'encoding.y', true);
    const groupIndex = encoding.series ? needColumn(encoding.series, 'encoding.series', false) : -1;
    if (toArray(encoding.y).length > 1) {
      warn('radar-single-y', '雷达图的 y 只取第一个列名；多组数据请用 encoding.series 指定分组列。', 'encoding.y');
    }
    if (indicatorIndex >= 0 && valueIndex >= 0) {
      const indicators = new Set(dataset.rows.map((row) => String(row[indicatorIndex])));
      const groups = new Set(dataset.rows.map((row) => (groupIndex >= 0 ? String(row[groupIndex]) : '—')));
      const present = dataset.rows.filter((row) => isFinite(Number(row[valueIndex]))).length;
      const expected = indicators.size * groups.size;
      if (indicators.size < 3) warn('radar-too-few-indicators', `只有 ${indicators.size} 个指标，雷达图至少要 3 个才成形。`, 'encoding.x');
      if (present < expected) {
        warn('radar-missing-value', `有 ${expected - present} 个「指标 × 分组」组合没有数据，会按 0 处理。`, 'data.rows');
      }
    }
    return finish(errors, warnings);
  }

  // 热力图：两个类目列 + 一个数值列
  if (kind === 'heatmap') {
    needColumn(encoding.x, 'encoding.x', true);
    needColumn(encoding.y, 'encoding.y', true);
    needNumeric(encoding.value || encoding.color, encoding.value ? 'encoding.value' : 'encoding.color', true);
    return finish(errors, warnings);
  }

  // 瀑布图：项目 + 增减值，可选的合计标记列
  if (kind === 'waterfall') {
    needColumn(encoding.name, 'encoding.name', true);
    needNumeric(encoding.value, 'encoding.value', true);
    if (encoding.total) needColumn(encoding.total, 'encoding.total', false);
    return finish(errors, warnings);
  }

  // 桑基图：起点 / 终点 / 流量 三列
  if (kind === 'sankey') {
    needColumn(encoding.source, 'encoding.source', true);
    needColumn(encoding.target, 'encoding.target', true);
    const valueIndex = needNumeric(encoding.value, 'encoding.value', true);
    if (valueIndex >= 0) {
      const invalid = dataset.rows.filter((row) => {
        const n = Number(row[valueIndex]);
        return isFinite(n) && n <= 0;
      }).length;
      if (invalid) warn('sankey-non-positive', `${invalid} 行流量不是正数，这些连线会被跳过。`, 'encoding.value');
    }
    return finish(errors, warnings);
  }

  if (kind === 'line' || kind === 'area' || kind === 'bar' || kind === 'scatter') {
    if (kind === 'scatter' && encoding.size) needNumeric(encoding.size, 'encoding.size', false);
    const yNames = toArray(encoding.y);
    if (!yNames.length) {
      fail('missing-encoding-channel', `encoding.y 是必填的（一个列名或一组列名）。可用列：${dataset.columns.join(' / ')}。`, 'encoding.y');
    }
    if (yNames.length > 8) {
      warn('too-many-series', `y 绑定了 ${yNames.length} 列，图例会非常挤，建议先筛选。`, 'encoding.y');
    }
    needColumn(encoding.x, 'encoding.x', true);
    for (const name of yNames) needNumeric(name, 'encoding.y', true);
    if (encoding.series) needColumn(encoding.series, 'encoding.series', false);
    return finish(errors, warnings);
  }

  // 其余编译型之外的 kind（此处当前不可达，保留兜底）
  warn('passthrough-kind', `kind「${kind}」暂不支持 data/encoding 编译，请用 series 直通。`, 'kind');
  return finish(errors, warnings);
}

function finish(errors: ChartDslDiagnostic[], warnings: ChartDslDiagnostic[]): ChartDslValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

interface AnnotationContext {
  kind: ChartDslKind;
  /** 直通路径下没有数据集（只做结构性校验）。 */
  dataset: ResolvedDataset | null;
  xIndex: number;
  /** x 列是不是数值列 —— 决定标注的 `value` 该写数字还是写类目名。 */
  numericX: boolean;
}

/**
 * 校验标注图层。
 *
 * 分工：**结构问题报错**（缺 `value` / 缺 `from`+`to` / 容器不是数组 —— 这些一定画不出来），
 * **值的问题报警告**（类型可能对不上、类目可能不存在、区间宽度为 0 —— 这些要么能用、
 * 要么 ice-chart 自己会在 `annotationDiagnostics()` 里再兜一层）。宁可少报，不可误报。
 */
function validateAnnotation(
  annotation: any,
  ctx: AnnotationContext,
  fail: (code: string, message: string, path?: string) => void,
  warn: (code: string, message: string, path?: string) => void
): void {
  if (annotation === undefined || annotation === null) return;
  if (typeof annotation !== 'object' || Array.isArray(annotation)) {
    fail('invalid-annotation', 'annotation 必须是一个对象，形如 { lines, points, areas }。', 'annotation');
    return;
  }
  for (const key of Object.keys(annotation)) {
    if (key !== 'lines' && key !== 'points' && key !== 'areas') {
      warn('unknown-annotation-field', `annotation 里的未知字段「${key}」会被忽略（只有 lines / points / areas）。`, `annotation.${key}`);
    }
  }
  const cartesian = CARTESIAN_KINDS.includes(ctx.kind);
  if (!cartesian) {
    warn(
      'annotation-non-cartesian',
      `kind「${ctx.kind}」没有 x / y 坐标系，annotation 画不出来（标注只对 ${CARTESIAN_KINDS.join(' / ')} 有意义）。`,
      'annotation'
    );
  }

  const listOf = (key: 'lines' | 'points' | 'areas'): any[] => {
    const value = (annotation as any)[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      fail('invalid-annotation-list', `annotation.${key} 必须是数组。`, `annotation.${key}`);
      return [];
    }
    return value;
  };

  /** 按轴类型提示 value 的写法（数值轴该写数字、类目轴该写类目名）。 */
  const checkValue = (value: any, axis: 'x' | 'y', path: string): void => {
    if (!cartesian || !ctx.dataset) return;
    if (axis === 'y') {
      if (typeof value === 'string' && value.trim() !== '' && !isFinite(Number(value))) {
        warn('annotation-value-type', `${path} 是数值轴的定位值，建议写数字（收到字符串「${value}」）。`, path);
      }
      return;
    }
    if (ctx.numericX) {
      if (typeof value === 'string' && value.trim() !== '' && !isFinite(Number(value))) {
        warn('annotation-value-type', `${path} 落在数值 x 轴上，建议写数字（收到字符串「${value}」）。`, path);
      }
      return;
    }
    if (ctx.xIndex >= 0 && typeof value === 'string') {
      const labels = ctx.dataset.rows.map((row) => String(row[ctx.xIndex]));
      if (labels.length && !labels.includes(value)) {
        warn(
          'annotation-unknown-category',
          `${path} 的类目名「${value}」不在 x 列里（该列有 ${new Set(labels).size} 个类目），这条标注不会画出来。`,
          path
        );
      }
    }
  };

  listOf('lines').forEach((line, index) => {
    const path = `annotation.lines[${index}]`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      fail('invalid-annotation-item', `${path} 必须是对象。`, path);
      return;
    }
    if (!hasAnnotationValue(line.value)) {
      fail('missing-annotation-value', `${path} 缺少 value（数值轴写数字、类目轴写类目名或下标）。`, `${path}.value`);
      return;
    }
    checkValue(line.value, line.axis === 'x' ? 'x' : 'y', `${path}.value`);
  });

  listOf('points').forEach((point, index) => {
    const path = `annotation.points[${index}]`;
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      fail('invalid-annotation-item', `${path} 必须是对象。`, path);
      return;
    }
    if (!hasAnnotationValue(point.x)) fail('missing-annotation-value', `${path} 缺少 x。`, `${path}.x`);
    else checkValue(point.x, 'x', `${path}.x`);
    if (!hasAnnotationValue(point.y)) fail('missing-annotation-value', `${path} 缺少 y。`, `${path}.y`);
    else checkValue(point.y, 'y', `${path}.y`);
  });

  listOf('areas').forEach((area, index) => {
    const path = `annotation.areas[${index}]`;
    if (!area || typeof area !== 'object' || Array.isArray(area)) {
      fail('invalid-annotation-item', `${path} 必须是对象。`, path);
      return;
    }
    const axis: 'x' | 'y' = area.axis === 'x' ? 'x' : 'y';
    if (!hasAnnotationValue(area.from)) fail('missing-annotation-value', `${path} 缺少 from（区间起点）。`, `${path}.from`);
    else checkValue(area.from, axis, `${path}.from`);
    if (!hasAnnotationValue(area.to)) fail('missing-annotation-value', `${path} 缺少 to（区间终点）。`, `${path}.to`);
    else checkValue(area.to, axis, `${path}.to`);
    if (hasAnnotationValue(area.from) && hasAnnotationValue(area.to) && String(area.from) === String(area.to)) {
      warn('annotation-empty-area', `${path} 的 from 与 to 相同，区间宽度为 0，画出来看不见。`, path);
    }
  });
}

/**
 * 在声明的区间里采一遍值，交给 `diagnoseExpression` 做「运行层」检查。
 * 采不出来（语法错）就返回空数组，让静态层去报错，避免级联噪音。
 */
function sampleExpression(
  expression: string,
  variable: string,
  params: Record<string, number>,
  domain: [number, number] | undefined,
  kind: string
): number[] {
  const fallback: [number, number] = kind === 'function' ? [-10, 10] : [0, Math.PI * 2];
  const from = Array.isArray(domain) && isFinite(Number(domain[0])) ? Number(domain[0]) : fallback[0];
  const to = Array.isArray(domain) && isFinite(Number(domain[1])) ? Number(domain[1]) : fallback[1];
  if (!(to > from)) return [];
  const values: number[] = [];
  const steps = 64;
  try {
    for (let i = 0; i <= steps; i++) {
      const at = from + ((to - from) * i) / steps;
      const scope: Record<string, number> = { ...params, [variable]: at };
      const value = evaluateExpression(expression, scope);
      values.push(typeof value === 'number' ? value : NaN);
    }
  } catch (err) {
    return [];
  }
  return values;
}

/** 把诊断渲染成人类 / agent 都能读的多行文本。 */
export function formatDiagnostics(result: ChartDslValidationResult): string {
  const lines = [...result.errors, ...result.warnings].map((item) => {
    const tag = item.severity === 'error' ? '错误' : '警告';
    const at = item.path ? `（${item.path}）` : '';
    return `[${tag}] ${item.message}${at}`;
  });
  return lines.length ? lines.join('\n') : '✓ DSL 校验通过';
}
