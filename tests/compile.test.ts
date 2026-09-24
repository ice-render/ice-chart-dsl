import { normalizeOption } from '@damoqiongqiu/ice-chart';
import { compileChartDsl, ChartDslCompileError } from '../src/index';

describe('compileChartDsl：encoding → ChartOption', () => {
  it('annotation 原样进 option（标注是图层，不是系列）', () => {
    const annotation = {
      lines: [{ axis: 'y', value: 300, text: '目标 300' }],
      points: [{ x: '2月', y: 132, text: '异常点' }],
      areas: [{ axis: 'y', from: 0, to: 100, text: '达标区' }],
    };
    const option: any = compileChartDsl({
      kind: 'line',
      data: { columns: ['月份', '销量'], rows: [['1月', 120], ['2月', 132], ['3月', 101]] },
      encoding: { x: '月份', y: '销量' },
      annotation,
    });
    expect(option.annotation).toEqual(annotation);
    // 标注不是系列：系列数不变，图例 / 数据下标都不受影响
    expect(option.series).toHaveLength(1);
    // 归一化之后仍然在（标注要能进快照 / DSL 往返）
    expect((normalizeOption(option) as any).option.annotation).toEqual(annotation);
  });

  it('逃生舱 options.annotation 能整体覆盖顶层 annotation', () => {
    const option: any = compileChartDsl({
      kind: 'line',
      data: { columns: ['月份', '销量'], rows: [['1月', 120], ['2月', 132]] },
      encoding: { x: '月份', y: '销量' },
      annotation: { lines: [{ axis: 'y', value: 1 }] },
      options: { annotation: { lines: [{ axis: 'y', value: 2, text: '覆盖' }] } },
    });
    expect(option.annotation.lines[0]).toMatchObject({ value: 2, text: '覆盖' });
  });

  it('series 直通时 annotation 也照常带上', () => {
    const option: any = compileChartDsl({
      kind: 'line',
      series: [{ type: 'line', data: [1, 2, 3] }],
      annotation: { lines: [{ axis: 'y', value: 2 }] },
    } as any);
    expect(option.series).toHaveLength(1);
    expect(option.annotation).toEqual({ lines: [{ axis: 'y', value: 2 }] });
  });

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
    [
      'radar',
      {
        kind: 'radar',
        data: {
          columns: ['指标', '得分', '机房'],
          rows: [['算力', 90, 'A'], ['存储', 70, 'A'], ['网络', 80, 'A'], ['算力', 60, 'B'], ['存储', 85, 'B'], ['网络', 65, 'B']],
        },
        encoding: { x: '指标', y: '得分', series: '机房' },
      },
    ],
    [
      'heatmap',
      {
        kind: 'heatmap',
        data: { columns: ['时段', '区域', '负载'], rows: [['T1', '华东', 40], ['T1', '华北', 55], ['T2', '华东', 62]] },
        encoding: { x: '时段', y: '区域', value: '负载' },
      },
    ],
    [
      'waterfall',
      {
        kind: 'waterfall',
        data: {
          columns: ['项目', '金额', '合计'],
          rows: [['收入', 4200, 0], ['成本', -1860, 0], ['净利润', 0, 1]],
        },
        encoding: { name: '项目', value: '金额', total: '合计' },
      },
    ],
    [
      'sankey',
      {
        kind: 'sankey',
        data: { columns: ['来源', '去向', '流量'], rows: [['搜索', '首页', 420], ['信息流', '首页', 300], ['首页', '下单', 260]] },
        encoding: { source: '来源', target: '去向', value: '流量' },
      },
    ],
    ['gauge', { kind: 'gauge', data: { columns: ['名称', '值'], rows: [['负载', 73]] }, encoding: { name: '名称', value: '值' } }],
  ];

  it.each(cases)('%s：normalizeOption 能吃下且系列数正确', (_name, dsl) => {
    const option = compileChartDsl(dsl);
    const norm: any = normalizeOption(option);
    expect(norm.series.length).toBeGreaterThan(0);
    expect(norm.xAxis.domain.length).toBeGreaterThan(0);
    for (const series of norm.series) expect(series.points.length).toBeGreaterThan(0);
  });
});

describe('新增类型的编译细节', () => {
  it('radar：指标从 x 列推，上限取整到好看的刻度；series 拆多边形', () => {
    const option: any = compileChartDsl({
      kind: 'radar',
      data: {
        columns: ['指标', '得分', '机房'],
        rows: [['算力', 90, 'A'], ['存储', 70, 'A'], ['网络', 80, 'A'], ['算力', 62, 'B'], ['存储', 85, 'B'], ['网络', 66, 'B']],
      },
      encoding: { x: '指标', y: '得分', series: '机房' },
    });
    expect(option.radar.indicators.map((i: any) => i.name)).toEqual(['算力', '存储', '网络']);
    expect(option.radar.indicators[0].max).toBe(100); // 90 → 100
    expect(option.series.map((s: any) => s.name)).toEqual(['A', 'B']);
    expect(option.series[0].data).toEqual([90, 70, 80]);
  });

  it('heatmap：x / y 两个类目列 + value 数值列', () => {
    const option: any = compileChartDsl({
      kind: 'heatmap',
      data: { columns: ['时段', '区域', '负载'], rows: [['T1', '华东', 40], ['T1', '华北', 55], ['T2', '华东', 62]] },
      encoding: { x: '时段', y: '区域', value: '负载' },
    });
    expect(option.xAxis.data).toEqual(['T1', 'T2']);
    expect(option.yAxis.type).toBe('category');
    expect(option.series[0].data).toEqual([['T1', '华东', 40], ['T1', '华北', 55], ['T2', '华东', 62]]);
  });

  it('waterfall：total 列标记合计项', () => {
    const option: any = compileChartDsl({
      kind: 'waterfall',
      data: { columns: ['项目', '金额', '合计'], rows: [['收入', 4200, 0], ['成本', -1860, 0], ['净利润', 0, 1]] },
      encoding: { name: '项目', value: '金额', total: '合计' },
    });
    expect(option.series[0].data[2]).toEqual({ name: '净利润', value: 0, total: true });
    expect(option.series[0].data[0].total).toBeUndefined();
  });

  it('sankey：连线表 → nodes + links（非正数流量跳过）', () => {
    const option: any = compileChartDsl({
      kind: 'sankey',
      data: { columns: ['来源', '去向', '流量'], rows: [['搜索', '首页', 420], ['首页', '下单', 260], ['首页', '流失', 0]] },
      encoding: { source: '来源', target: '去向', value: '流量' },
    });
    expect(option.sankey.nodes.map((n: any) => n.name)).toEqual(['搜索', '首页', '下单']);
    expect(option.sankey.links).toHaveLength(2);
  });

  /**
   * 分布组图：一张「组 + 观测值」的表，应该直接编译成 violin / beeswarm 的数据形状
   * —— 用户不该自己去把同一个组的值捏成一个数组（那是 ChartOption 的活，不是 DSL 的活）。
   */
  it('violin：按组把观测值收成 number[][]，并过一遍 core 的归一化', () => {
    const option: any = compileChartDsl({
      kind: 'violin',
      data: {
        columns: ['渠道', '响应'],
        rows: [
          ['甲', 120],
          ['乙', 200],
          ['甲', 140],
          ['乙', 260],
          ['甲', 160],
        ],
      },
      encoding: { x: '渠道', y: '响应' },
    });
    const series = option.series[0];
    expect(series.type).toBe('violin');
    // 组按首次出现排序，组内保持原顺序
    expect(series.data).toEqual([
      [120, 140, 160],
      [200, 260],
    ]);
    expect(option.xAxis).toMatchObject({ type: 'category', data: ['甲', '乙'] });
    expect(option.tooltip).toMatchObject({ trigger: 'item' });

    // 集成断言：编译产物必须能被 core 吃下（密度轮廓真的算出来了）
    const norm: any = normalizeOption(option);
    expect(norm.xAxis.categoryDomain ?? norm.xAxis.domain).toBeTruthy();
    const profile = norm.series[0].pointAt(0).violin;
    expect(profile.values).toEqual([120, 140, 160]);
    expect(profile.grid.length).toBeGreaterThan(16);
    expect(norm.series[0].pointAt(0).y).toBe(140);
  });

  it('beeswarm：逐点编成 [组, 值]，命中仍是逐个观测', () => {
    const option: any = compileChartDsl({
      kind: 'beeswarm',
      data: {
        columns: ['渠道', '响应'],
        rows: [
          ['甲', 120],
          ['甲', 140],
          ['乙', 200],
        ],
      },
      encoding: { x: '渠道', y: '响应' },
    });
    expect(option.series[0].type).toBe('beeswarm');
    // 每个点都带着自己的分组（类别轴下也要成对给，避让要靠它分组）
    expect(option.series[0].data).toEqual([
      ['甲', 120],
      ['甲', 140],
      ['乙', 200],
    ]);
    expect(option.tooltip).toMatchObject({ trigger: 'item' });

    const norm: any = normalizeOption(option);
    expect(norm.series[0].pointCount).toBe(3);
    expect(norm.series[0].pointAt(0).xValue).toBe('甲');
  });

  /**
   * 面板矩阵：DSL 是「一张表 + encoding」的那一层，所以**数据驱动分面**归它 ——
   * 按 `series` 列拆出来的每个系列各占一块面板，用户不用自己算 panel 下标。
   */
  it('matrix：按 series 列分面，每个系列一个 panel', () => {
    const option: any = compileChartDsl({
      kind: 'line',
      matrix: { rows: 1, columns: 3, gap: 10 },
      data: {
        columns: ['月份', '销量', '渠道'],
        rows: [
          ['1月', 120, '线上'],
          ['1月', 90, '线下'],
          ['2月', 132, '线上'],
          ['2月', 96, '线下'],
        ],
      },
      encoding: { x: '月份', y: '销量', series: '渠道' },
    });
    expect(option.matrix).toEqual({ rows: 1, columns: 3, gap: 10 });
    expect(option.series.map((s: any) => s.name)).toEqual(['线上', '线下']);
    expect(option.series.map((s: any) => s.panel)).toEqual([0, 1]);

    const norm: any = normalizeOption(option);
    expect(norm.matrix.panelCount).toBe(3);
    expect(norm.series.map((s: any) => s.panel)).toEqual([0, 1]);
  });

  it('matrix 配多列 y：每列一个面板', () => {
    const option: any = compileChartDsl({
      kind: 'line',
      matrix: { rows: 1, columns: 2 },
      data: {
        columns: ['月份', '线上', '线下'],
        rows: [
          ['1月', 120, 90],
          ['2月', 132, 96],
        ],
      },
      encoding: { x: '月份', y: ['线上', '线下'] },
    });
    expect(option.series.map((s: any) => s.panel)).toEqual([0, 1]);
    expect(option.matrix).toMatchObject({ rows: 1, columns: 2 });
  });

  it('violin + series 列：每个系列一组分布，且都与 x 类目对齐', () => {
    const option: any = compileChartDsl({
      kind: 'violin',
      data: {
        columns: ['渠道', '响应', '版本'],
        rows: [
          ['甲', 120, 'v1'],
          ['乙', 200, 'v1'],
          ['甲', 140, 'v2'],
          ['乙', 260, 'v2'],
          ['甲', 160, 'v2'],
        ],
      },
      encoding: { x: '渠道', y: '响应', series: '版本' },
    });
    expect(option.series.map((s: any) => s.name)).toEqual(['v1', 'v2']);
    // 两个系列都以同一份 x 类目表为准：没有观测的那组给空数组（不是缺位错位）
    expect(option.xAxis.data).toEqual(['甲', '乙']);
    expect(option.series[0].data).toEqual([[120], [200]]);
    expect(option.series[1].data).toEqual([[140, 160], [260]]);

    const norm: any = normalizeOption(option);
    expect(norm.series[1].pointAt(0).violin.values).toEqual([140, 160]);
    expect(norm.series[0].pointAt(1).violin.values).toEqual([200]);
  });

});

function compileChartDslSafe(dsl: any): { option?: any; error?: any } {
  try {
    return { option: compileChartDsl(dsl) };
  } catch (error) {
    return { error };
  }
}
