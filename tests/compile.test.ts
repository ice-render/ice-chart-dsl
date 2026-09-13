import { normalizeOption } from '@damoqiongqiu/ice-chart';
import { compileChartDsl, ChartDslCompileError } from '../src/index';

describe('compileChartDsl：encoding → ChartOption', () => {
  it('类目 x + 单 y → 类目轴 + 一个系列', () => {
    const option: any = compileChartDsl({
      kind: 'bar',
      title: '月度销量',
      data: { columns: ['月份', '销量'], rows: [['1月', 120], ['2月', 132], ['3月', 101]] },
      encoding: { x: '月份', y: '销量' },
    });
    expect(option.title).toEqual({ text: '月度销量' });
    expect(option.xAxis).toEqual({ type: 'category', name: '月份', data: ['1月', '2月', '3月'] });
    expect(option.series).toHaveLength(1);
    expect(option.series[0]).toMatchObject({ type: 'bar', name: '销量', data: [120, 132, 101] });
    expect(option.legend.show).toBe(false);
    expect(option.tooltip.trigger).toBe('axis');
  });

  it('多 y 列 → 多个系列；分组列 → 按分组拆系列', () => {
    const multi: any = compileChartDsl({
      kind: 'line',
      data: { columns: ['月份', '销量', '利润'], rows: [['1月', 120, 30], ['2月', 132, 40]] },
      encoding: { x: '月份', y: ['销量', '利润'] },
    });
    expect(multi.series.map((s: any) => s.name)).toEqual(['销量', '利润']);
    expect(multi.legend.show).toBe(true);

    const grouped: any = compileChartDsl({
      kind: 'line',
      data: {
        columns: ['月份', '销量', '渠道'],
        rows: [['1月', 120, '线上'], ['2月', 132, '线上'], ['1月', 90, '线下']],
      },
      encoding: { x: '月份', y: '销量', series: '渠道' },
    });
    expect(grouped.series.map((s: any) => s.name)).toEqual(['线上', '线下']);
    expect(grouped.series[0].data).toEqual([120, 132]);
    expect(grouped.series[1].data).toEqual([90, null]);
  });

  it('数值 x → 数值轴 + [x, y] 数据点；scatter 支持第三维尺寸', () => {
    const line: any = compileChartDsl({
      kind: 'line',
      data: { columns: ['t', 'v'], rows: [[0, 1], [1, 3], [2, 2]] },
      encoding: { x: 't', y: 'v' },
    });
    expect(line.xAxis.type).toBe('value');
    expect(line.series[0].data).toEqual([[0, 1], [1, 3], [2, 2]]);

    const bubble: any = compileChartDsl({
      kind: 'scatter',
      data: { columns: ['x', 'y', 'size'], rows: [[1, 2, 30], [3, 4, 60]] },
      encoding: { x: 'x', y: 'y', size: 'size' },
    });
    expect(bubble.series[0].data).toEqual([[1, 2, 30], [3, 4, 60]]);
    expect(bubble.tooltip.trigger).toBe('item');
  });

  it('pie：name + value → [{ name, value }]', () => {
    const option: any = compileChartDsl({
      kind: 'pie',
      data: { columns: ['渠道', '金额'], rows: [['线上', 120], ['线下', 90]] },
      encoding: { name: '渠道', value: '金额' },
    });
    expect(option.series[0].data).toEqual([{ name: '线上', value: 120 }, { name: '线下', value: 90 }]);
    expect(option.tooltip.trigger).toBe('item');
  });

  it('function：表达式 / 参数 / 区间直接进系列', () => {
    const option: any = compileChartDsl({
      kind: 'function',
      expression: 'a*sin(x)/x',
      domain: [-10, 10],
      params: { a: 1.5 },
    });
    expect(option.series[0]).toMatchObject({ type: 'function', expression: 'a*sin(x)/x', domain: [-10, 10], params: { a: 1.5 } });
  });

  it('逃生舱：series 直通、options 覆盖编译结果', () => {
    const passthrough: any = compileChartDsl({
      kind: 'radar',
      series: [{ type: 'radar', name: 'A', data: [80, 90] }],
      options: { radar: { indicators: [{ name: 'x', max: 100 }, { name: 'y', max: 100 }] } },
    });
    expect(passthrough.series).toHaveLength(1);
    expect(passthrough.radar.indicators).toHaveLength(2);

    const overridden: any = compileChartDsl({
      kind: 'bar',
      data: { columns: ['a', 'b'], rows: [['x', 1]] },
      encoding: { x: 'a', y: 'b' },
      options: { theme: 'dark', legend: { show: true }, crosshair: { show: false } },
    });
    expect(overridden.theme).toBe('dark');
    expect(overridden.legend).toEqual({ show: true });
    expect(overridden.crosshair).toEqual({ show: false });
  });

  it('校验不通过时抛 ChartDslCompileError，并把诊断带出来', () => {
    try {
      compileChartDsl({ kind: 'line', data: { columns: ['月份', '销量'], rows: [['1月', 1]] }, encoding: { x: '月份', y: '利润' } });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChartDslCompileError);
      expect((error as ChartDslCompileError).diagnostics.map((d) => d.code)).toContain('unknown-column');
    }
  });
});

describe('编译产物必须能被核心消费', () => {
  const cases: Array<[string, any]> = [
    ['line', { kind: 'line', data: { columns: ['m', 'v'], rows: [['1月', 1], ['2月', 2]] }, encoding: { x: 'm', y: 'v' } }],
    ['分组 bar', { kind: 'bar', data: { columns: ['m', 'v', 'g'], rows: [['1月', 1, 'A'], ['1月', 2, 'B']] }, encoding: { x: 'm', y: 'v', series: 'g' }, options: { stack: true } }],
    ['数值 x 的 scatter', { kind: 'scatter', data: { columns: ['x', 'y'], rows: [[1, 2], [3, 4]] }, encoding: { x: 'x', y: 'y' } }],
    ['pie', { kind: 'pie', data: { columns: ['n', 'v'], rows: [['A', 1], ['B', 2]] }, encoding: { name: 'n', value: 'v' } }],
    ['function', { kind: 'function', expression: 'sin(x)/x', domain: [-5, 5] }],
  ];

  it.each(cases)('%s：normalizeOption 能吃下且系列数正确', (_name, dsl) => {
    const option = compileChartDsl(dsl);
    const norm: any = normalizeOption(option);
    expect(norm.series.length).toBeGreaterThan(0);
    expect(norm.xAxis.domain.length).toBeGreaterThan(0);
    for (const series of norm.series) expect(series.points.length).toBeGreaterThan(0);
  });
});
