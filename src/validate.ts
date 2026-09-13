import { diagnoseExpression, evaluateExpression } from '@damoqiongqiu/ice-chart';
import {
  CHART_DSL_KINDS,
  CHART_DSL_SCHEMA_VERSION,
  type ChartDslDiagnostic,
  type ChartDslDocument,
  type ChartDslKind,
  type ChartDslValidationResult,
} from './types';
import { columnIndex, hasValue, numericRatio, resolveDataset, toArray } from './internal/dataset';

const ROOT_FIELDS = [
  'schemaVersion',
  'kind',
  'data',
  'encoding',
  'title',
  'expression',
  'domain',
  'params',
  'options',
  'series',
];

const ENCODING_FIELDS = ['x', 'y', 'series', 'size', 'color', 'name', 'value'];

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
  if (passthrough) return finish(errors, warnings);

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

  if (kind === 'pie') {
    needColumn(encoding.name, 'encoding.name', true);
    const valueIndex = needNumeric(encoding.value, 'encoding.value', true);
    if (valueIndex >= 0) {
      const negative = dataset.rows.filter((row) => {
        const n = Number(row[valueIndex]);
        return isFinite(n) && n < 0;
      });
      if (negative.length) {
        warn('pie-negative-value', `饼图 / 玫瑰图不适合表达负值，检测到 ${negative.length} 行负数。`, 'encoding.value');
      }
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
