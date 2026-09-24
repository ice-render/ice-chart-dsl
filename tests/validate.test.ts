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
  it('annotation：合法的标注不产生诊断', () => {
    const result = validateChartDsl({
      ...LINE,
      annotation: {
        lines: [{ axis: 'y', value: 300, text: '目标 300' }, { axis: 'x', value: '2月', text: '上线' }],
        points: [{ x: '1月', y: 120 }],
        areas: [{ axis: 'y', from: 0, to: 100 }],
      },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('annotation：缺 value / 缺 from+to 是错误，且带精确路径', () => {
    const missingValue = validateChartDsl({
      ...LINE,
      annotation: { lines: [{ axis: 'y', text: '忘了写值' }] },
    });
    expect(missingValue.valid).toBe(false);
    expect(missingValue.errors[0].code).toBe('missing-annotation-value');
    expect(missingValue.errors[0].path).toBe('annotation.lines[0].value');

    const missingTo = validateChartDsl({
      ...LINE,
      annotation: { areas: [{ axis: 'y', from: 0 }] },
    });
    expect(missingTo.errors.map((e) => e.path)).toContain('annotation.areas[0].to');

    const missingPointY = validateChartDsl({
      ...LINE,
      annotation: { points: [{ x: '1月' }] },
    });
    expect(missingPointY.errors[0].path).toBe('annotation.points[0].y');

    const wrongShape = validateChartDsl({ ...LINE, annotation: { lines: { value: 1 } } });
    expect(wrongShape.errors[0].code).toBe('invalid-annotation-list');
  });

  it('annotation：值可能对不上时给警告（不阻塞编译）', () => {
    // 数值 y 轴写了非数字
    const yString = validateChartDsl({ ...LINE, annotation: { lines: [{ axis: 'y', value: '高峰' }] } });
    expect(yString.valid).toBe(true);
    expect(yString.warnings.map((w) => w.code)).toContain('annotation-value-type');

    // 类目 x 轴写了一个不存在的类目
    const unknownCategory = validateChartDsl({ ...LINE, annotation: { lines: [{ axis: 'x', value: '13月' }] } });
    expect(unknownCategory.valid).toBe(true);
    expect(unknownCategory.warnings[0].code).toBe('annotation-unknown-category');
    expect(unknownCategory.warnings[0].message).toContain('13月');

    // 宽度为 0 的区间
    const emptyArea = validateChartDsl({ ...LINE, annotation: { areas: [{ axis: 'y', from: 100, to: 100 }] } });
    expect(emptyArea.warnings.map((w) => w.code)).toContain('annotation-empty-area');
  });

  it('annotation：非直角坐标的 kind 会被警告（那里没有坐标系放标注）', () => {
    const result = validateChartDsl({
      kind: 'pie',
      data: [{ 名称: 'A', 数值: 3 }, { 名称: 'B', 数值: 5 }],
      encoding: { name: '名称', value: '数值' },
      annotation: { lines: [{ axis: 'y', value: 1 }] },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('annotation-non-cartesian');
  });

  it('annotation：未知字段会被忽略并提示', () => {
    const result = validateChartDsl({ ...LINE, annotation: { marks: [], lines: [] } });
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('unknown-annotation-field');
  });

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

  describe('分布组图与面板矩阵', () => {
    const DIST = {
      schemaVersion: 1,
      kind: 'violin',
      data: {
        columns: ['渠道', '响应'],
        rows: [
          ['甲', 120],
          ['甲', 140],
          ['乙', 200],
        ],
      },
      encoding: { x: '渠道', y: '响应' },
    };

    it('violin / beeswarm 是已知 kind，缺 y 时报可执行的错误', () => {
      expect(validateChartDsl(DIST).valid).toBe(true);
      expect(validateChartDsl({ ...DIST, kind: 'beeswarm' }).valid).toBe(true);

      const missingY = validateChartDsl({ ...DIST, encoding: { x: '渠道' } });
      expect(missingY.valid).toBe(false);
      expect(missingY.errors[0].code).toBe('missing-encoding-channel');
      // 诊断必须可执行：把可用列名带上
      expect(missingY.errors[0].message).toContain('渠道');
      expect(missingY.errors[0].message).toContain('响应');
    });

    it('violin 的 y 只认一列（多列时给警告而不是静默丢掉）', () => {
      const result = validateChartDsl({ ...DIST, encoding: { x: '渠道', y: ['响应', '渠道'] } });
      expect(result.valid).toBe(true);
      expect(result.warnings.map((w) => w.code)).toContain('violin-single-y');
    });

    it('matrix：缺 rows / columns 是错误，路径指到字段上', () => {
      const result = validateChartDsl({ ...LINE, matrix: { columns: 2 } } as any);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('invalid-matrix');
      expect(result.errors[0].path).toBe('matrix.rows');
    });

    it('matrix：只有一块面板 / 用在非直角场景，都只是警告', () => {
      const single = validateChartDsl({ ...LINE, matrix: { rows: 1, columns: 1 } } as any);
      expect(single.valid).toBe(true);
      // 1×1 装 2 个分组：报的是「面板不够」，比笼统说一句「无效」有用
      expect(single.warnings.map((w) => w.code)).toContain('matrix-too-few-panels');

      // 只有一个系列时，矩阵没有任何可分的东西
      const noFacet = validateChartDsl({
        ...LINE,
        encoding: { x: '月份', y: '销量' },
        matrix: { rows: 2, columns: 2 },
      } as any);
      expect(noFacet.warnings.map((w) => w.code)).toContain('matrix-single-panel');

      const pie = validateChartDsl({
        ...LINE,
        kind: 'pie',
        encoding: { name: '月份', value: '销量' },
        matrix: { rows: 2, columns: 2 },
      } as any);
      expect(pie.warnings.map((w) => w.code)).toContain('matrix-ignored');
    });
  });
});
