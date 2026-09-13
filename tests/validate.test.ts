import { validateChartDsl, formatDiagnostics, CHART_DSL_SCHEMA_VERSION } from '../src/index';

const LINE = {
  schemaVersion: 1,
  kind: 'line',
  data: {
    columns: ['月份', '销量', '渠道'],
    rows: [
      ['1月', 120, '线上'],
      ['2月', 132, '线上'],
      ['1月', 90, '线下'],
    ],
  },
  encoding: { x: '月份', y: '销量', series: '渠道' },
};

describe('validateChartDsl', () => {
  it('通过的 DSL 返回 valid 且没有诊断', () => {
    const result = validateChartDsl(LINE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('接受对象数组写法的数据集', () => {
    const result = validateChartDsl({
      kind: 'bar',
      data: [{ 月份: '1月', 销量: 120 }, { 月份: '2月', 销量: 132 }],
      encoding: { x: '月份', y: '销量' },
    });
    expect(result.valid).toBe(true);
  });

  it('任何乱七八糟的输入都不抛异常', () => {
    for (const input of [null, undefined, 42, 'x', [], {}, { kind: 'nope' }]) {
      expect(() => validateChartDsl(input as any)).not.toThrow();
      expect(validateChartDsl(input as any).valid).toBe(false);
    }
  });

  it('报告不支持的 schemaVersion 与 kind', () => {
    const result = validateChartDsl({ ...LINE, schemaVersion: 99, kind: 'sunburst' });
    expect(result.errors.map((e) => e.code)).toEqual(['unsupported-schema-version', 'unsupported-kind']);
    expect(result.errors[1].message).toContain('line');
  });

  it('列不存在时把可用列名一起报出来（agent 靠这句话改）', () => {
    const result = validateChartDsl({ ...LINE, encoding: { x: '月份', y: '销售额' } });
    expect(result.valid).toBe(false);
    const error = result.errors.find((e) => e.code === 'unknown-column')!;
    expect(error.path).toBe('encoding.y');
    expect(error.message).toContain('销量');
  });

  it('y 绑到非数值列时报错', () => {
    const result = validateChartDsl({ ...LINE, encoding: { x: '月份', y: '渠道' } });
    expect(result.errors.map((e) => e.code)).toContain('non-numeric-column');
  });

  it('空数据 / 行长度不匹配 / 整列空值都会被点出来', () => {
    expect(validateChartDsl({ ...LINE, data: { columns: ['a', 'b'], rows: [] } }).errors.map((e) => e.code)).toContain('empty-data');
    expect(
      validateChartDsl({ ...LINE, data: { columns: ['月份', '销量'], rows: [['1月', 1, 2]] } }).errors.map((e) => e.code)
    ).toContain('row-length-mismatch');
    expect(
      validateChartDsl({ ...LINE, data: { columns: ['月份', '销量'], rows: [[null, null]] }, encoding: { x: '月份', y: '销量' } })
        .errors.map((e) => e.code)
    ).toContain('empty-column');
  });

  it('pie 的负值只是警告（能画，但多半不是本意）', () => {
    const result = validateChartDsl({
      kind: 'pie',
      data: { columns: ['渠道', '金额'], rows: [['线上', 120], ['退货', -30]] },
      encoding: { name: '渠道', value: '金额' },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('pie-negative-value');
  });

  it('表达式错误带位置透出：sin(x 缺右括号 / 未定义变量 / 常量输出', () => {
    const syntax = validateChartDsl({ kind: 'function', expression: 'sin(x' });
    expect(syntax.valid).toBe(false);
    const error = syntax.errors.find((e) => e.code.startsWith('expression-'))!;
    expect(error.path).toBe('expression');
    expect(error.message).toMatch(/缺少|括号|右括号/);

    const unknown = validateChartDsl({ kind: 'function', expression: 'a*sin(x)' });
    expect(unknown.errors.map((e) => e.message).join()).toContain('a');

    const constant = validateChartDsl({ kind: 'function', expression: 'sin(0)' });
    expect(constant.valid).toBe(true);
    expect(constant.warnings.map((w) => w.code)).toContain('expression-constant-value');
  });

  it('未知字段给警告而不是报错（别把 agent 堵死）', () => {
    const result = validateChartDsl({ ...LINE, colour: 'red' } as any);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('unknown-field');
  });

  it('series 直通时不再要求 data / encoding', () => {
    const result = validateChartDsl({
      kind: 'radar',
      series: [{ type: 'radar', data: [80, 90], name: 'A' }],
      options: { radar: { indicators: [{ name: 'x', max: 100 }, { name: 'y', max: 100 }] } },
    });
    expect(result.valid).toBe(true);
  });

  it('formatDiagnostics 给出人类可读的多行文本', () => {
    const text = formatDiagnostics(validateChartDsl({ kind: 'line' }));
    expect(text).toContain('[错误]');
    expect(formatDiagnostics(validateChartDsl(LINE))).toContain('✓');
  });

  it('导出的 schemaVersion 是 1', () => {
    expect(CHART_DSL_SCHEMA_VERSION).toBe(1);
  });
});
