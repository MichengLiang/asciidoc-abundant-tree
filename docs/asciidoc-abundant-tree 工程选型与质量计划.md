# asciidoc-abundant-tree 在 myts 中的正式工程方案

我已经重新探索了 `myts` 环境、根配置、模板、质量门禁和你创建的新目录。现在的结论是：这个项目应该从原来的“viewer 小脚本”升级成 `myts` workspace 里的 Node CLI + 可复用 TypeScript library 包。名字 `asciidoc-abundant-tree` 是准确的：它不是只能 viewer，它产出一棵信息丰富、可被下游消费的单文件 AsciiDoc abundant tree。

## 1. 当前环境事实

`myts` 是从 `ts-foundry-template` 实例化出来的 TypeScript monorepo。根工具链是：

- pnpm workspace + catalog。
- Turborepo 任务编排。
- TypeScript strict。
- Biome lint/format。
- Vitest + v8 coverage。
- tsdown 构建 ESM 和类型声明。
- Knip + syncpack 依赖治理。
- publint + arethetypeswrong package boundary check。

`GUIDE.md` 明确说 CLI 项目应该从 `templates/node-cli` 出发。该模板使用 Node 24、TypeScript、tsx、tsdown、Vitest，正好适合当前对象。`ts-lib` 模板也有价值，但当前项目既有 CLI，又要导出下游可复用 API，因此更像“Node CLI 包，内部暴露 library API”，而不是纯 library。

你创建的目录：

```text
myts/projects/asciidoc-abundant-tree
```

当前只有：

```text
docs/AsciiDoc AST Viewer 正式开工前规约.md
```

它还不是 workspace package。根 `pnpm-workspace.yaml` 当前只包含：

```text
apps/*
packages/*
templates/*
experiments/*
```

根 `vitest.workspace.ts` 和 `deps:check` 也没有覆盖 `projects/*`。所以如果直接在 `projects/asciidoc-abundant-tree` 放 package，但不改根配置，它会变成旁路项目，不能被 root `pnpm check`、Turbo、syncpack、Knip 正式治理。这不符合“换到有工具链的环境”的目的。

## 2. 工程定位

我建议把 `projects/asciidoc-abundant-tree` 定义为 workspace project，而不是 experiment。

原因：

- 它已经有明确长期对象，不是一次性实验。
- 它会产出 CLI 和可消费 API。
- 它面向后续图投影、lint、解释器等下游，不只是临时验证。
- 你已经把它放在 `projects/`，这表达了“比 experiments 更成形”的意图。

因此需要把 `projects/*` 纳入 myts 的 workspace 治理。

计划修改根配置：

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "templates/*"
  - "experiments/*"
  - "projects/*"
```

```ts
// vitest.workspace.ts
export default [
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
  "templates/*/vitest.config.ts",
  "experiments/*/vitest.config.ts",
  "projects/*/vitest.config.ts",
];
```

根 `package.json` 的 `deps:check` 也要把 `projects/*/package.json` 纳入 syncpack source。`knip.json` 的 entry 也要增加：

```json
"projects/*/src/index.ts",
"projects/*/src/cli.ts"
```

这属于根工程配置变更，所以完成时至少要跑与根相关的检查；如果时间允许，应该跑 `pnpm check`，并单独跑 `pnpm deps:check`。`check:full` 包含 e2e 和 smoke，成本更高，但根 workspace 配置改变后它是最强证据。

## 3. Package 命名

建议 package 名称：

```text
@ts-foundry-project/asciidoc-abundant-tree
```

理由：

- `@ts-foundry-experiment/*` 已经用于 experiments。
- `@ts-foundry-template/*` 用于 templates。
- `@ts-foundry/*` 用于稳定 packages/apps。
- 当前目录是 `projects/*`，用 `@ts-foundry-project/*` 最清楚。
- 包是 private，不涉及 npm 发布命名风险。

CLI bin 名称：

```text
asciidoc-abundant-tree
```

开发时可以运行：

```bash
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree dev -- samples/资料1.adoc
```

构建后可以运行：

```bash
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree build
node projects/asciidoc-abundant-tree/dist/cli.mjs samples/资料1.adoc
```

如果需要短命令，后续可以再加别名 `adoc-tree`，但第一版不需要增加额外公共入口。

## 4. 技术选型

### 4.1 Runtime

Node 24，ESM only。

理由：myts 根已经固定 Node >=24、pnpm 10、ESM。项目不需要 CommonJS，不引入兼容层。

### 4.2 Language

TypeScript strict。

使用 `@ts-foundry/tsconfig/node`，继承 myts 的严格类型策略。实现中避免 `any` 扩散；Asciidoctor 的 Opal 对象类型如果不完整，集中在 adapter 层封装，不让动态对象污染全项目。

### 4.3 Parser

AsciiDoc parser：

```text
@asciidoctor/core@3.0.4
```

用途：单文件 load、section tree、block model、refs catalog、official inline conversion result。

HTML fragment parser：

```text
parse5@8.0.1
```

用途：结构化解析 `block.getContent()`，提取 official `<a>` href/reftext。

### 4.4 Build

tsdown。

输出 ESM：

```text
dist/index.mjs
dist/index.d.mts
dist/cli.mjs
dist/cli.d.mts
```

`index.ts` 导出 library API；`cli.ts` 是 bin 入口。

### 4.5 Testing

Vitest，Node environment，v8 coverage。

测试按功能切分：

- CLI 参数和输出测试。
- `samples/资料1.adoc` 结构恢复测试。
- xref occurrence scanner 测试。
- Asciidoctor binding extractor 测试。
- source span enhancer 测试。
- 跨文档 xref fixture 测试。
- pformat renderer 快照或关键片段测试。

不使用 Jest，不使用 Node 内置 test runner，因为 myts 的默认门禁是 Vitest。

### 4.6 Lint/Format

Biome。

遵守根配置：tab 缩进、双引号、分号、organize imports、no unused imports/variables。

### 4.7 依赖治理

新增依赖必须写入 root catalog：

```yaml
catalog:
  "@asciidoctor/core": "^3.0.4"
  "parse5": "^8.0.1"
```

项目 package.json 中使用：

```json
"dependencies": {
  "@asciidoctor/core": "catalog:",
  "parse5": "catalog:"
}
```

开发依赖使用模板默认：

```json
"@ts-foundry/tsconfig": "workspace:*",
"@types/node": "catalog:",
"tsdown": "catalog:",
"tsx": "catalog:",
"typescript": "catalog:",
"vitest": "catalog:",
"publint": "catalog:",
"@arethetypeswrong/cli": "catalog:"
```

## 5. 项目目录结构

建议落地结构：

```text
projects/asciidoc-abundant-tree/
├── docs/
│   └── AsciiDoc AST Viewer 正式开工前规约.md
├── samples/
│   ├── reference-links.adoc
│   └── interdocument-xref.adoc
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── load-asciidoc.ts
│   ├── source-lines.ts
│   ├── source-spans.ts
│   ├── xref-occurrences.ts
│   ├── asciidoctor-bindings.ts
│   ├── abundant-tree.ts
│   └── pformat.ts
├── test/
│   ├── fixtures.ts
│   ├── reference-links.test.ts
│   ├── interdocument-xref.test.ts
│   ├── xref-occurrences.test.ts
│   ├── source-spans.test.ts
│   ├── pformat.test.ts
│   └── cli.test.ts
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── vitest.config.ts
```

我不会把测试全部塞进 `src/index.test.ts`。这个项目的对象比 hello world CLI 大，拆 `test/` 更容易看清行为边界。

## 6. API 设计

`src/index.ts` 暴露可复用 API：

```ts
export type ParseAbundantTreeOptions = {
  sourcePath: string;
};

export type AbundantDocument = {
  sourcePath: string;
  parser: "@asciidoctor/core";
  parserVersion: string;
  mode: "single-file";
  title?: TitleNode;
  sections: SectionNode[];
  targets: TargetNode[];
};

export function parseAbundantTree(options: ParseAbundantTreeOptions): AbundantDocument;
export function formatAbundantTree(document: AbundantDocument): string;
```

CLI 只是薄壳：

```ts
runCli(args) -> { code, output }
```

这样下游可以不经过 CLI，直接 import library API。

## 7. CLI 行为

第一版 CLI：

```bash
asciidoc-abundant-tree <file.adoc>
```

可选：

```bash
asciidoc-abundant-tree --help
```

默认输出 pformat tree 到 stdout。

错误规则：

- 未传文件：exit code 1，输出用法。
- 文件不存在：exit code 1，输出明确错误。
- 内部 extraction invariant 失败：exit code 1，输出内部错误摘要。

不做 JSON 输出。当前公共投影就是 pformat tree。JSON 可以后续加，但不是第一版必要对象。

## 8. 样例迁移

旧 viewer 项目的 `samples/资料1.adoc` 内容应该复制到新项目，建议命名更稳定：

```text
samples/reference-links.adoc
```

原因：`资料1.adoc` 对人可读，但作为长期测试 fixture，英文稳定文件名更适合包内测试和 CI。raw 内容里的中文保留。

同时新增：

```text
samples/interdocument-xref.adoc
```

内容覆盖：

```asciidoc
= 单文件跨文档引用样例

== 本文件标题

这个本地引用指向 <<local-target, 本文件目标>>。

[#local-target]
== 本文件目标

这个跨文档引用指向 xref:other.adoc#remote-target[远程目标]。

这个跨文档短写引用指向 <<other.adoc#remote-target, 远程目标短写>>。
```

测试锁定：

- 本地引用绑定到 `local-target`。
- `xref:other.adoc#remote-target[远程目标]` 输出 `scope="external"`。
- official href 是 `other.html#remote-target`。
- shorthand external 也保留 raw target 和 official href。
- 工具不读取 `other.adoc`。

## 9. Abundant tree 字段原则

节点字段分两层。

source layer：

```text
raw
line
span
source_span
syntax
target
label
ids
names
id_origin
metadata_span
content_span
```

asciidoctor layer：

```text
asciidoctor_href
asciidoctor_resolved_id
asciidoctor_resolved_type
asciidoctor_reftext
asciidoctor_context
asciidoctor_node
```

字段命名必须让下游知道来源。官方解释结果不能冒充 raw 事实，raw 事实也不能冒充官方解释结果。

## 10. 质量保证计划

开发过程按 TDD：先写失败测试，再实现。

局部门禁：

```bash
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree test
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree typecheck
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree build
pnpm --filter @ts-foundry-project/asciidoc-abundant-tree pack:check
```

根门禁：

```bash
pnpm lint
pnpm deps:check
pnpm check
```

由于要改 root workspace 配置，最强完成证据是：

```bash
pnpm check:full
```

但它可能输出很长，按 GUIDE 要写入 `tmp/logs`，再用 `tail` 和 `rg` 摘要。如果时间或环境不允许完整跑，我会明确告诉你实际跑了哪些门禁，不会泛称“全部通过”。

## 11. 需要修改的 root 配置

为了让 `projects/asciidoc-abundant-tree` 真正进入 myts 工具链，计划修改：

```text
myts/pnpm-workspace.yaml
myts/vitest.workspace.ts
myts/package.json
myts/knip.json
```

可能修改 docs：

```text
myts/GUIDE.md
myts/README.md
myts/docs/工程治理约定.md
```

是否更新 docs 取决于我们是否把 `projects/*` 作为 myts 长期目录类别。如果只是这一个项目使用 `projects/*`，我仍建议至少在 README/GUIDE 的 layout 里补一句，避免 root 配置和文档不一致。

## 12. 决策理由

为什么不是继续放旧 `notes/关于AsciiDoc/asciidoc-ast-viewer`：

- 旧位置更像笔记实验，不适合长期 TypeScript 包质量门禁。
- 新名字 `asciidoc-abundant-tree` 更准确。
- 下游消费需要 library API，不只是 viewer CLI。

为什么不是只做 ts-lib：

- 你明确需要可直接运行查看输出。
- CLI 是当前核心交互面。
- library API 同时导出即可，不需要拆两个 package。

为什么要纳入 workspace：

- 使用 catalog 依赖。
- 使用 root Biome/Vitest/Turbo/Knip/syncpack。
- 避免旁路工程腐烂。
- 让 `pnpm check` 能真正覆盖它。

为什么保留 docs 规约：

- 这是当前对象的设计依据。
- 后续实现和测试需要回到这个边界。
- 但文档标题应从 `AsciiDoc AST Viewer` 改为 `asciidoc-abundant-tree` 或新增新版规约，避免名字漂移。

## 13. 开工后的执行顺序

如果你批准，我会这样做：

1. 更新/整理项目规约文档标题，把 viewer 旧名改成 abundant tree 语义。
2. 写 package scaffold，基于 node-cli 模板但拆出 `cli.ts` 和 library API。
3. 更新 workspace 配置，把 `projects/*` 纳入 pnpm、vitest、deps check、knip。
4. 加 catalog 依赖 `@asciidoctor/core` 和 `parse5`。
5. 添加 samples。
6. 写失败测试：先锁 `reference-links.adoc` 与 `interdocument-xref.adoc` 输出关键片段。
7. 实现 loader、span、xref scanner、official binding、pformat。
8. 跑局部门禁。
9. 跑 root 相关门禁。
10. 完成后按你的要求用弹窗汇报：改了哪些文件、测试跑了什么、结果是什么、剩余边界是什么。

## 14. 我需要你确认的一点

我建议把 `projects/*` 正式纳入 myts workspace。这会修改 root 工程配置。你的新目录已经叫 `projects/asciidoc-abundant-tree`，所以这是最一致的做法。

如果你批准，我就按这个方案开工。

请回复：

```text
批准，纳入 projects workspace 并开工
```

如果你不想动 root workspace，那我会退而求其次，在该目录做独立 package，但那会失去 myts 的 catalog/Turbo/check 一体化，我不推荐。
