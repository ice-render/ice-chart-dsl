import { createChart, type ChartOption, type ICEChart } from '@damoqiongqiu/ice-chart';
import type { ChartDslDocument, ChartDslValidationResult } from '../types';
import { compileChartDsl } from '../compiler/chartDslToOption';
import { validateChartDsl } from '../validate';

export interface RenderChartDslResult {
  chart: ICEChart;
  /** 编译出来的 ChartOption：可以直接 `chart.toJSON()` 存盘，或再喂给别的画布。 */
  option: ChartOption;
  /** 校验结果（含 warning）：编译能过但值得提醒的地方都在这里。 */
  diagnostics: ChartDslValidationResult;
}

/**
 * 渲染 DSL。校验不通过会抛 `ChartDslCompileError`（带结构化诊断），
 * 想「先看诊断再决定要不要画」就先调 `validateChartDsl`。
 */
export function renderChartDsl(
  target: string | HTMLCanvasElement,
  dsl: ChartDslDocument,
  chartOptions?: Record<string, any>
): RenderChartDslResult {
  const diagnostics = validateChartDsl(dsl);
  const option = compileChartDsl(dsl);
  const chart = createChart(target as any, option, chartOptions);
  return { chart, option, diagnostics };
}
