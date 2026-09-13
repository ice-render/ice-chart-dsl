# AGENTS.md — ice-chart-dsl

## 这是什么

ice-chart 的 **agent 友好层**：一张表 + `encoding` → `ChartOption` → 渲染，外加给模型自修复用的结构化诊断。

核心包（`../ice-chart`）负责"图表怎么画、怎么交互"；本包只负责"把 JSON 意图翻译成 core 的配置，并说清哪里写错了"。

## 铁律

1. **不做 ChartOption 的马甲**。core 的 option 本来就是纯 JSON，本包必须守住三条增量：
   数据绑定（`encoding`）、意图级默认、结构化诊断。任何"把 option 字段换个名字"的改动都要拒绝。
2. **`validateChartDsl` 永不抛异常**（null / 数组 / 乱七八糟的对象都要能吃），
   它是 agent 的反馈通道；只有 `compileChartDsl` 在**有 error 时**抛 `ChartDslCompileError`。
3. **诊断必须可执行**：报"列不存在"要顺带列出可用列名；报"不是数值列"要给出数字占比；
   报表达式错要带字符位置。只说"无效"的诊断等于没报。
4. **逃生舱不能堵**：`options` 覆盖编译结果（`series` 除外 —— 半替换会产出四不像），
   `series` 直通时完全跳过 data/encoding。core 加了新类型，DSL 没跟上时用户仍有路可走。
5. **显式写的永远优先**：编译只做保守推断（轴类型、图例显隐、提示框触发方式），
   用户写进 `options` 的一律覆盖，不搞"猜图表类型"那种魔法。
6. **peer 依赖**：`@damoqiongqiu/ice-chart` 与 `ice-render` 都是 peer（同一页面上多张图要共享引擎实例池）。
   本地联调时把 devDependencies 换成 `file:../ice-chart`。

## 发布

- npm：`npm publish --access public`（`prepublishOnly` 会跑 `npm run verify`）
- skill：`npx @skills-hub-ai/cli publish skills/ice-chart-dsl/SKILL.md --tags chart,dsl`
  （新版本用 `npx @skills-hub-ai/cli version ice-chart-dsl skills/ice-chart-dsl/SKILL.md`）

## 结构

- `src/types.ts`：DSL 类型 + kind 清单
- `src/internal/dataset.ts`：两种数据集写法归一、列工具
- `src/validate.ts`：结构 + 语义校验（含表达式采样诊断）
- `src/compiler/chartDslToOption.ts`：DSL → ChartOption
- `src/runtime/renderChartDsl.ts`：编译 + 渲染
- `tests/`：校验与编译用例；**编译产物必须过一遍 core 的 `normalizeOption`**（集成断言）
