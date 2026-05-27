# asciidoc-abundant-tree 解析器健康化完整设计方案

这份方案的目标不是“补几个 case”，而是把当前解析器从“正则先猜结构，官方 AST 后配对”的脆弱模型，迁移为“官方 AST 是结构权威，源码文本是证据与坐标补充”的健康模型。下一位开发者拿着这份设计和当前代码，应当能够按任务顺序完成实现、补齐测试、提高覆盖率并把门禁收紧到解析器应有的标准。

## 0. 总目标

目标一句话：让 `asciidoc-abundant-tree` 的 block/section/table/listing/pass-through/fenced-code 等结构事实只来自 Asciidoctor 官方 AST，源码扫描只负责 raw、metadata、列级 sourceSpan、局部 fallback，不再允许全文件正则创造结构。

最终必须达到：

- section discovery 由 official AST 驱动，正则不再全文件扫描 section heading。
- listing/table/pass/open/literal/fenced block 的扫描边界由 official AST block context 和 source location 驱动。
- inline xref/anchor 只在语义允许的 official block 区间中扫描。
- table cell、fenced code、pass-through、literal cell 中的歧义 delimiter 不再污染全局结构。
- 所有已复现的问题进入红测，并在实现后变绿。
- `pnpm test:coverage` statements、lines 至少 90%；建议 branch 逐步提升，第一轮不低于 80%，后续拉到 90%。
- coverage threshold 写进 `vitest.config.ts`，低于阈值直接失败。
- `pnpm check` 通过。
- 若运行根工作区门禁，至少项目相关配置不破坏根检查。

## 1. 架构原则

当前实现最大的问题不是“使用正则”，而是“正则承担结构权威”。解析器仍然需要读源码，因为官方 AST 不暴露所有 raw surface，也不一定给出列级 sourceSpan。新的原则是分权：

- 官方 AST 决定“有什么结构”。包括 section、paragraph、listing、table、pass、open、literal 等 block identity 和父子关系。
- 源码文本决定“这个结构在源文件里怎样呈现”。包括 metadata 行、title 行列号、raw token、sourceSpan、contentSpan。
- fallback 只能局部化。任何 fallback 都必须以 official AST block 为锚点，不能回到全文件扫描创造新 section 或新 block。
- 不能静默吞掉不一致。若 official AST 有 block 但 source resolver 无法确定完整 span，应保留结构节点，并通过 `toolDiagnostics` 或测试可观察字段暴露降级，而不是用错误 span 假装完整。

## 2. 新文件与职责

建议新增和修改这些文件。

### 新增 `src/official-block-walker.ts`

职责：递归遍历官方 AST，产生稳定的内部 block surface，不做 source text 扫描。

核心类型：

```ts
import type { AsciidoctorBlock } from "./asciidoctor-adapter";

export type OfficialBlockSurface = {
  block: AsciidoctorBlock;
  context: string | undefined;
  nodeName: string | undefined;
  level: number | undefined;
  title: string | undefined;
  id: string | undefined;
  sourceLine: number | undefined;
  parent?: OfficialBlockSurface;
  children: OfficialBlockSurface[];
  indexInParent: number;
};

export function walkOfficialBlocks(
  officialDocument: AsciidoctorBlock,
): OfficialBlockSurface[];
```

要求：

- document 自身可以不作为 output node，但 children 必须保留父子关系。
- `sourceLine` 只读取 `block.getSourceLocation?.()?.getLineNumber?.()`。
- 不调用 `lineText()`，不扫描 delimiter。
- 对 `getBlocks()` 缺失的 block 返回空 children。

### 新增 `src/source-interval-resolver.ts`

职责：把 official block surface 映射到源码区间。它不发现 block，只解析已有 block 的源码证据。

核心类型：

```ts
import type { LineSpan, SourceSpan, ToolDiagnostic } from "./model";
import type { LineTable } from "./source-lines";
import type { MetadataSurface } from "./metadata-parser";
import type { OfficialBlockSurface } from "./official-block-walker";

export type SourceInterval = {
  blockStartLine: number;
  metadata: MetadataSurface[];
  metadataSpan?: LineSpan;
  contentSpan?: LineSpan;
  span: LineSpan;
  sourceSpan?: SourceSpan;
  titleSpan?: SourceSpan;
  diagnostics: ToolDiagnostic[];
};

export function resolveSourceInterval(
  surface: OfficialBlockSurface,
  lineTable: LineTable,
): SourceInterval | undefined;
```

实现规则：

- `blockStartLine` 优先用 `surface.sourceLine`。
- metadata 用现有 `collectPrecedingMetadata(lineTable, blockStartLine)`。
- `span.startLine = metadata.at(0)?.line ?? blockStartLine`。
- `span.endLine` 优先用同父级下一个 official sibling 的 metadata start/sourceLine 减一。
- 若没有下一个 sibling，则用父 block span 的 end；顶层无父则用文件末行。
- listing/table 的 delimiter 只能在 official context 已确认为 listing/table 后，用于局部校验和 contentSpan 定位，不能全文件找。
- fenced listing 要识别 opening line 是 ````` 或 `----`，不能固定 `----`。
- pass-through 要识别 `++++`，但 inline scanner 默认不扫描 pass 内容。
- 若无法确定 endLine，返回保守 span 并附 diagnostic，不要制造不存在的结构。

### 修改 `src/source-surfaces.ts`

现状是 `scanSourceSurfaces(lineTable)`。新签名应改为：

```ts
export function projectSourceSurfaces(options: {
  officialDocument: AsciidoctorBlock;
  lineTable: LineTable;
}): SourceSurfaces;
```

它应调用：

- `walkOfficialBlocks(officialDocument)` 得到官方 block surfaces。
- `resolveSourceInterval(surface, lineTable)` 给每个 block 补源码区间。
- `buildSectionSurfaces()` 从 official section surfaces 构造 section nodes。
- `scanInlineOccurrencesInOfficialBlocks()` 按 block context 扫描 xref/anchor。

删除或降级旧的：

- `scanSections(lineTable, ranges)` 不再作为主路径。
- `scanSourceRanges(lineTable)` 不再作为 inline scanner 的主输入。
- `isLineInListing()` / `isLineInTableStructure()` 可暂时保留给旧测试或 fallback，但不能参与新主流程。

### 修改 `src/parser.ts`

当前：

```ts
const sourceSurfaces = scanSourceSurfaces(lineTable);
const officialProjection = projectOfficialDocument({
  officialDocument,
  lineTable,
  sections: sourceSurfaces.sections,
  sectionByLine: sourceSurfaces.sectionByLine,
  xrefOccurrences: sourceSurfaces.xrefOccurrences,
  anchorOccurrences: sourceSurfaces.anchorOccurrences,
  adapter,
});
```

新结构：

```ts
const sourceSurfaces = projectSourceSurfaces({ officialDocument, lineTable });
const officialProjection = projectOfficialDocument({
  officialDocument,
  lineTable,
  blockSurfaces: sourceSurfaces.blockSurfaces,
  sections: sourceSurfaces.sections,
  sectionByLine: sourceSurfaces.sectionByLine,
  xrefOccurrences: sourceSurfaces.xrefOccurrences,
  anchorOccurrences: sourceSurfaces.anchorOccurrences,
  adapter,
});
```

如果不想一次性改 `official-projector.ts` 的所有参数，可以第一阶段保留 `sections/sectionByLine`，但这些数据必须由 official AST 派生，不能由 regex section scanner 派生。

### 修改 `src/official-projector.ts`

目标是减少 `context.sections.find(candidate => candidate.line === line)` 这种脆弱配对。第一阶段可以仍按 line 配对，但必须保证 section list 来自 official AST。第二阶段建议直接传入 `Map<AsciidoctorBlock, SourceInterval>` 或 `Map<OfficialBlockSurface, SourceInterval>`，让 buildSection/buildListing/buildTable 使用对应 surface。

`buildListing()` 需要改掉固定 `findClosingDelimiter(..., "----")`。它应从 source interval 获取 span/contentSpan。listing 的 content 可以继续优先 `block.getSource()`，但 source span 必须能覆盖 fenced block。

`buildTable()` 也不应固定找 `|===` 作为唯一结束方式。table source end 由 interval resolver 给出；delimiter 只做局部确认。

### 修改 `src/inline-occurrence-scanner.ts`

当前按所有 `lineTable.lines` 扫，再调用 `shouldSkipInlineLine()`。新设计应增加 AST-aware 扫描函数：

```ts
export function scanInlineOccurrencesInOfficialBlocks(options: {
  lineTable: LineTable;
  blockSurfaces: OfficialBlockSurface[];
  intervals: Map<OfficialBlockSurface, SourceInterval>;
}): {
  xrefOccurrences: XrefOccurrenceNode[];
  anchorOccurrences: AnchorOccurrenceNode[];
};
```

扫描策略：

- `paragraph`：扫描 interval 的 content lines。
- `table`：第一阶段可以扫描整个 table span 中非 delimiter 行，但必须避免 table 内 literal/listing cell 被全局 `----` 误判；第二阶段可深入 table cells，如果 Asciidoctor.js 暴露 cell style，则按 cell style 判断。
- `listing`、`literal`、`pass`：不扫描。
- `section`：不直接扫描 section heading；section title 不当作 inline occurrence 来源。
- `open`：递归交给 children，不扫 open delimiter 自身。
- 未知 block context：保守不扫描，并发 diagnostic，除非需求明确。

这样 fenced code/pass-through 里的 `<<after>>` 不会出现在 occurrence 列表里；table prose cell 中的 xref 仍可保留。

## 3. TDD 任务拆分

### Task 1：写红测，固定已复现裂缝

文件：新增 `test/parser-block-boundaries.test.ts`。

测试 1：table asciidoc cell 中 section-looking 行不得污染 section scope。

```ts
it("does not let section-looking table cell content truncate section scope", () => {
  const path = writeFixture("table-asciidoc-cell-section.adoc", `= Probe

== Before

[#t]
.Table
|===
a|
== Not A Section

See <<after>> inside table cell.
|===

[#after]
== After
`);

  const document = parseAbundantTree({ sourcePath: path });
  const before = document.children.find(
    (node) => node.kind === "section" && "title" in node && node.title === "Before",
  ) as SectionNode;
  const xref = document.xrefOccurrences.find((item) => item.raw === "<<after>>");

  expect(before.span?.endLine).toBeGreaterThanOrEqual(12);
  expect(xref?.containingSectionId).toBe("_before");
  expect(document.targets.map((target) => target.id)).not.toContain("_not_a_section");
});
```

测试 2：fenced listing 不扫描内部 xref，且 listing span 覆盖 fence。

```ts
it("treats fenced code as listing and does not scan its inline-looking content", () => {
  const path = writeFixture("fenced-code.adoc", "= Probe\n\n== Before\n\n```\n== Not A Section\nSee <<after>> inside fenced code.\n```\n\n[#after]\n== After\n");
  const document = parseAbundantTree({ sourcePath: path });
  const listing = findNode(document.children, "listing") as ListingNode;

  expect(listing.span).toEqual({ startLine: 5, endLine: 8 });
  expect(document.xrefOccurrences.map((xref) => xref.raw)).not.toContain("<<after>>");
  expect(document.targets.map((target) => target.id)).not.toContain("_not_a_section");
});
```

测试 3：pass-through 不扫描内部 xref。

```ts
it("does not scan passthrough block content as xrefs or sections", () => {
  const path = writeFixture("passthrough-block.adoc", `= Probe

== Before

++++
== Not A Section
See <<after>> inside passthrough.
++++

[#after]
== After
`);
  const document = parseAbundantTree({ sourcePath: path });

  expect(document.xrefOccurrences.map((xref) => xref.raw)).not.toContain("<<after>>");
  expect(document.targets.map((target) => target.id)).not.toContain("_not_a_section");
});
```

测试 4：table cell 中 `----` 不得被全局 listing range 吞掉 table prose xref。这里要把语义写清楚：如果该 cell 是 AsciiDoc prose cell，xref 应保留；如果是 literal cell，xref 不应保留，但原因必须来自 cell/block style，不是全局 delimiter scanner。第一轮先覆盖 prose cell：

```ts
it("does not treat delimiter-looking table cell text as a global listing range", () => {
  const path = writeFixture("table-delimiter-text.adoc", `= Probe

== Before

[#t]
.Table
|===
a|
This prose mentions a delimiter-looking line.
----
See <<after>> after that line.
|===

[#after]
== After
`);
  const document = parseAbundantTree({ sourcePath: path });
  expect(document.xrefOccurrences.map((xref) => xref.raw)).toContain("<<after>>");
});
```

辅助 `writeFixture()` 应写入 `test/tmp/` 或 `tmp/test-fixtures/`，并在测试里用 `mkdirSync(..., { recursive: true })`。如果 Biome 扫 tmp，测试 helper 文件应放在 `test/helpers.ts`，动态写出的 `.adoc` 不会被 TypeScript lint 作为源码扫描。

运行命令：

```bash
pnpm test test/parser-block-boundaries.test.ts
```

预期：新增测试失败，失败原因应指向当前 bug，而不是 import/type 错误。

提交：

```bash
git add test/parser-block-boundaries.test.ts test/helpers.ts
git commit --only -m "test: capture AST boundary parser regressions" -- test/parser-block-boundaries.test.ts test/helpers.ts
```

### Task 2：实现 official block walker

文件：新增 `src/official-block-walker.ts`，新增 `test/official-block-walker.test.ts`。

测试应构造真实 Asciidoctor document，断言 fenced code 是 listing、pass block 是 pass、table cell section-looking 内容不会生成 section surface。

实现要点：递归 `getBlocks()`，记录 parent 和 index。不要读源码，不要算 span。

运行：

```bash
pnpm test test/official-block-walker.test.ts
pnpm typecheck
```

提交：

```bash
git add src/official-block-walker.ts test/official-block-walker.test.ts
git commit --only -m "feat: walk official Asciidoctor block surfaces" -- src/official-block-walker.ts test/official-block-walker.test.ts
```

### Task 3：实现 source interval resolver

文件：新增 `src/source-interval-resolver.ts`，新增 `test/source-interval-resolver.test.ts`。

必须覆盖：

- section metadata start 到下一个 sibling 前一行。
- fenced listing start/end/contentSpan。
- `----` listing start/end/contentSpan。
- table span 不被 table cell 内 delimiter 干扰。
- pass block span 覆盖 `++++`。
- sourceLine 缺失时返回 undefined 或 diagnostic，不做全文件结构猜测。

关键实现函数建议：

```ts
function nextSiblingStartLine(surface: OfficialBlockSurface, lineTable: LineTable): number | undefined;
function previousMetadataStart(lineTable: LineTable, blockStartLine: number): number;
function resolveDelimitedBlockSpan(lineTable: LineTable, startLine: number, allowedDelimiters: string[]): LineSpan | undefined;
function lineTrimmedEquals(lineTable: LineTable, line: number, values: string[]): boolean;
```

注意：`resolveDelimitedBlockSpan()` 只能在 official context 已确认时使用，调用者必须传入 `listing` 或 `pass` 等 context 对应的 allowed delimiter。这个约束应写成代码注释，因为这是防止旧病复发的核心。

运行：

```bash
pnpm test test/source-interval-resolver.test.ts
pnpm typecheck
```

提交：

```bash
git add src/source-interval-resolver.ts test/source-interval-resolver.test.ts
git commit --only -m "feat: resolve source intervals from official block anchors" -- src/source-interval-resolver.ts test/source-interval-resolver.test.ts
```

### Task 4：把 section discovery 迁移到 official AST

文件：修改 `src/source-surfaces.ts`，可以删除或停止使用 `src/section-scanner.ts` 主路径；若保留，应标记为 fallback/internal 并不参与 parse 主流程。修改 `src/parser.ts` 调用新函数。

新 section 构造规则：

- 遍历 official surfaces 中 `context === "section"` 的 surface。
- `level` 用 `surface.level`，不要用 marker 长度反推；若 undefined，再用 heading marker 局部推导。
- `title` 用 `surface.title` 优先，源码 heading 仅用于 `titleSpan`。
- `ids` 优先 metadata ids；没有 metadata ids 时用 `surface.id` 并标记 `asciidoctor-generated`。
- `span` 用 resolver 给出的 source interval。
- `children` 仍由 official projector 填。

必须保证 `sectionByLine` 只由 official sections 建立，不包含 table cell 内的伪 section。

运行：

```bash
pnpm test test/parser-block-boundaries.test.ts
pnpm test
pnpm typecheck
```

预期：table section pollution 红测变绿，旧 parser tests 仍通过。

提交：

```bash
git add src/source-surfaces.ts src/parser.ts src/section-scanner.ts
git commit --only -m "fix: derive sections from official AST" -- src/source-surfaces.ts src/parser.ts src/section-scanner.ts
```

如果 `section-scanner.ts` 已无引用，应删除，并把删除加入 commit。

### Task 5：迁移 inline occurrence scanner 到 AST-aware block scanning

文件：修改 `src/inline-occurrence-scanner.ts`、`src/source-surfaces.ts`，必要时新增 `src/inline-scan-policy.ts`。

建议新增策略函数：

```ts
export function inlineScanPolicy(context: string | undefined): "scan" | "skip" | "recurse" {
  switch (context) {
    case "paragraph":
    case "table":
      return "scan";
    case "section":
    case "open":
      return "recurse";
    case "listing":
    case "literal":
    case "pass":
      return "skip";
    default:
      return "skip";
  }
}
```

如果 table 的处理过粗，第一轮可以扫描 table interval 中非 `|===` delimiter 行，保留当前 table xref 能力；第二轮再按 Asciidoctor cell model 精细化。关键是不能让 table 内 `----` 创建全局 skip range。

运行：

```bash
pnpm test test/parser-block-boundaries.test.ts
pnpm test
pnpm typecheck
```

预期：fenced code、pass-through、table delimiter text 红测变绿；现有 `table-xref-audit` 仍通过。

提交：

```bash
git add src/inline-occurrence-scanner.ts src/source-surfaces.ts src/inline-scan-policy.ts
git commit --only -m "fix: scan inline occurrences by official block context" -- src/inline-occurrence-scanner.ts src/source-surfaces.ts src/inline-scan-policy.ts
```

### Task 6：让 listing/table projector 使用 resolved intervals

文件：修改 `src/official-projector.ts`。

关键改动：

- `buildListing()` 不再调用 `findClosingDelimiter(..., "----")`。
- `buildTable()` 不再调用 `findClosingDelimiter(..., "|===")` 作为结构事实。
- 这些函数从 `SourceInterval` 读取 `span`、`contentSpan`、`metadataSpan`。
- `content` 仍可优先 `block.getSource()`，但 source span 以 resolver 为准。

如果暂时不想重构 `ProjectContext` 太大，可新增：

```ts
type ProjectContext = {
  ...
  intervalByLine: Map<number, SourceInterval>;
};
```

但更健康的是 `intervalByBlock` 或 `surfaceByBlock`，避免 line collision。由于 AsciidoctorBlock 是对象引用，可以用 `WeakMap<AsciidoctorBlock, SourceInterval>`。

运行：

```bash
pnpm test test/parser-block-boundaries.test.ts
pnpm test
pnpm typecheck
```

提交：

```bash
git add src/official-projector.ts src/source-surfaces.ts
git commit --only -m "fix: project block spans from resolved source intervals" -- src/official-projector.ts src/source-surfaces.ts
```

### Task 7：补 diagnostics 与不变量测试

文件：修改 `src/parser.ts`、`src/source-surfaces.ts`、`src/model.ts` 如需扩展 diagnostic code；新增 `test/parser-invariants.test.ts`。

不变量：

- output section 必须来自 official section surface。
- 没有 source location 的 official block 不得导致全文件结构扫描。
- 对无法确定 span 的 official block，结构可以保留，但必须有 diagnostic。
- `toolDiagnostics` 不得混进 `children`。

测试示例：

```ts
expect(document.children.every((node) => node.kind !== "unknown" || node.asciidoctor)).toBe(true);
expect(document.toolDiagnostics.every((item) => item.code.length > 0)).toBe(true);
```

运行：

```bash
pnpm test test/parser-invariants.test.ts
pnpm test
pnpm typecheck
```

提交：

```bash
git add src/parser.ts src/source-surfaces.ts src/model.ts test/parser-invariants.test.ts
git commit --only -m "test: enforce parser source-authority invariants" -- src/parser.ts src/source-surfaces.ts src/model.ts test/parser-invariants.test.ts
```

### Task 8：提高并锁定覆盖率

文件：修改 `vitest.config.ts`，必要时拆分 `test/parser.test.ts`。

配置建议第一阶段：

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html"],
  thresholds: {
    statements: 90,
    lines: 90,
    functions: 95,
    branches: 80,
  },
},
```

如果你坚持“几乎眼睛里容不下沙子”，第二阶段目标应提升为：

```ts
thresholds: {
  statements: 95,
  lines: 95,
  functions: 98,
  branches: 90,
},
```

但我建议分两段落地。第一段先偿还结构债务，防止低于 90 静默通过；第二段继续补 parser grammar boundary，把 branch 拉上去。否则开发者可能为了覆盖率写低价值测试，而不是先修核心事实源。

运行：

```bash
pnpm test:coverage
pnpm check
```

提交：

```bash
git add vitest.config.ts test/*.test.ts
git commit --only -m "test: enforce parser coverage thresholds" -- vitest.config.ts test/*.test.ts
```

## 4. 验收标准

本节定义“完成”的最低含义。完成不是“代码能跑”，也不是“已有测试通过”。完成必须同时满足结构权威、源码坐标、语义扫描、诊断面、测试门禁、交付状态六类证据。

### 4.1 当前阶段完成定义

当前阶段完成时，解析器必须满足以下对象不变量：

- official AST 是 block identity、section tree、block parent/child 关系和 block context 的唯一结构权威。
- 源码扫描不能创建 official AST 中不存在的 section、listing、table、pass、literal 或 open block。
- 源码扫描只允许补充 metadata、raw text、line span、column span、局部 delimiter confirmation 和 fallback diagnostic。
- fallback 必须以 official block source location 或 official block object 为锚点；没有锚点时，解析器可以降级 source span，但不能凭全文件正则制造结构。
- `sectionByLine` 只能由 official section surfaces 建立；table cell、listing、pass-through、literal block 中的 section-looking text 不得改变 section scope。
- `toolDiagnostics` 是诊断输出面；诊断不得作为 document tree child 出现。
- `children`、`targets`、`xrefOccurrences`、`anchorOccurrences` 必须来自同一个 `AbundantDocument` 构造流程。

源码坐标必须满足以下规则：

- 所有公开 `SourcePosition` 均为 1-based line、1-based column。
- section span 必须从 section metadata 起始行或 heading 行开始，到下一个同级/上级 official section 前一行或父区间结束。
- paragraph text 和 paragraph span 只能覆盖 paragraph content，不得吞入后续空白 block separator。
- listing span 必须覆盖 metadata、opening delimiter、content、closing delimiter；fenced code block 和 dashed listing 都必须正确覆盖。
- table span 必须覆盖 metadata、opening delimiter、table body、closing delimiter；table cell 内 delimiter-looking text 不得决定 table/listing 全局边界。
- pass-through/literal block 的 content 不得被当成 ordinary prose 扫描。
- open block 是容器；open block 自身不作为 prose source，但其 paragraph descendants 可以产生 inline occurrences。

inline occurrence 语义必须满足以下规则：

- paragraph 中的 shorthand xref、macro xref、double-bracket anchor、anchor macro 必须被扫描。
- ordinary table cell 中的 xref 必须被扫描。
- `a|` AsciiDoc table cell 中的 paragraph xref 必须被扫描。
- `a|` AsciiDoc table cell 中的 nested listing/literal/pass content 不得被扫描。
- table cell 中 nested open block 的 paragraph descendants 必须被扫描。
- listing、literal、pass-through、fenced code 内的 xref/anchor/section-looking text 不得进入 top-level occurrence catalog。
- metadata anchor 可以成为 anchor occurrence，但同一个 source anchor 不得被重复挂载到多个 tree nodes。

### 4.2 必跑验证命令

全部任务完成后，必须给出这些证据：

```bash
pnpm test test/parser-block-boundaries.test.ts
pnpm test
pnpm test:coverage
pnpm check
```

最低接受输出：

- 所有测试通过。
- 新增边界测试通过。
- coverage statements >= 90。
- coverage lines >= 90。
- coverage functions >= 95。
- coverage branches >= 80，后续提升计划明确。
- `pnpm check` 全绿。
- `git status --short` 只显示本次任务相关文件，不能混入其他项目或无关修改。

### 4.3 语义验收样例

- table asciidoc cell 中 `== Not A Section` 不影响父 section span 和 xref containing section。
- fenced code block 内 `<<xref>>` 不进入 xrefOccurrences。
- fenced listing 的 span/contentSpan 正确覆盖 fence 与内容。
- pass-through block 内 `<<xref>>` 不进入 xrefOccurrences。
- table prose cell 中 delimiter-looking 文本不创建全局 listing range。
- table asciidoc cell 中 nested listing 的 `<<xref>>` 不进入 xrefOccurrences。
- table asciidoc cell 中 nested open block 的 paragraph `<<xref>>` 进入 xrefOccurrences。
- paragraph 后接空白行和其他 block 时，paragraph text 不包含空白分隔行。
- 旧样例 `samples/reference-links.adoc` 输出 target/xref/anchor 不回退。
- interdocument xref 不读取外部文档的行为不回退。

### 4.4 100% 稳定目标的后续完成定义

当前 coverage threshold 是第一阶段门槛，不是解析器终局门槛。100% 稳定目标下，后续任务必须继续提升以下方面：

- Branch coverage 目标从 80% 提升到 90%；提升前必须先补语义边界测试，不能用无意义调用填覆盖率。
- `official-projector.ts` 的 section lookup 应从 line-based lookup 迁移到 official block identity lookup，例如 `WeakMap<AsciidoctorBlock, SectionNode>`。
- table cell scanning 应从“扫 table source 再跳过 non-prose ranges”迁移到“从 table cell inner document 的 scannable block ranges 生成扫描区间”。
- unknown official block context 必须有明确策略：scan、skip、recurse 或 diagnostic；不能静默依赖 default branch。
- include directive、source map 指向外部文件、source location 缺失、nested open/listing/table 组合必须有专项测试。
- CRLF、Unicode column、无尾随换行、空文档、只有 document title 的文件必须有 source span 回归测试。
- 所有 parser bugfix 必须先有 red test；没有 red test 的 parser 行为改动不能合入。

### 4.5 批次审核通过条件

后续每个实现批次必须满足以下条件才允许提交：

- 批次目标能映射到本计划中的一个或多个验收条款。
- 新行为先有失败测试，修复后目标测试变绿。
- `pnpm test`、`pnpm test:coverage`、`pnpm check` 新鲜运行通过。
- diff 中不存在新的全文件结构 scanner。
- diff 中不存在未解释的 parser heuristic；如果必须使用 heuristic，代码注释必须说明其 official AST 锚点和失败降级方式。
- commit message 必须说明 parser 语义变化、测试证据和仍保留的限制。

## 5. 实施顺序与纪律

这项债务不要大爆炸式重写。正确顺序是：先红测，再新增 AST walker，再 interval resolver，再迁移 section，再迁移 inline scanner，再收 projector span，最后加 coverage threshold。每一步都必须能跑目标测试和 typecheck。提交要用 `git commit --only`，避免污染同仓其他人的 staged 内容；新文件要先 `git add` 才能被 `--only` 提交。

不要在实现中做这些事：

- 不要新增另一个全文件 regex scanner 替代旧 scanner。
- 不要把所有 delimited block 一概禁扫。要按 official context 和项目语义决定。
- 不要为了让测试过而删除 xref/table 能力。
- 不要在 source location 缺失时创造官方 AST 不存在的 section。
- 不要把 parser diagnostic 当 tree child 输出。
- 不要用 coverage 数字掩盖语义测试缺口。

## 6. 最终架构图

最终数据流应该是：

```text
source file
  -> lineTable
  -> officialDocument (@asciidoctor/core, sourcemap true)
  -> walkOfficialBlocks(officialDocument)
  -> resolveSourceInterval(officialBlock, lineTable)
  -> build sections/source scopes from official section surfaces
  -> scan inline occurrences by official block context and resolved intervals
  -> projectOfficialDocument using official blocks + resolved source evidence
  -> bind xrefs / add anchor targets
  -> AbundantDocument
```

这个架构有一个明确的单一权威：官方 AST 决定结构，源码只提供证据。它不会再因为 table cell 中一行 `== ...`、fenced code 中一个 `<<...>>`、pass-through 中一段 AsciiDoc-looking 文本、table cell 里一个 `----`，就污染全局解析结果。

这才是解析器应该有的健康形态：不是没有 fallback，而是 fallback 被关在局部；不是没有正则，而是正则不掌权；不是只看 happy path，而是把语法边界作为一等测试对象。
