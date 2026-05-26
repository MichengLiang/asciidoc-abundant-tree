# asciidoc-abundant-tree 本体规约

`asciidoc-abundant-tree` 是一个单文件 AsciiDoc 丰富结构树恢复器。它从一个 `.adoc` 源文件中构造一份 TypeScript 数据模型，并将该模型序列化为面向人的终端树或面向程序的 JSON。终端树和 JSON 都是消费者投影；核心产物是可由 TypeScript 程序直接调用和检查的 `AbundantDocument` 对象。

本文定义当前人工制品的对象边界、问题世界、公共契约、数据模型、解析流水线、非目标和不变量。工程目录、工具链、测试命令和质量门禁见 `asciidoc-abundant-tree 工程实现规约.md`。验收标准、黑盒测试和完成条件见 `asciidoc-abundant-tree 验收标准与黑盒测试.md`。

## 1. 问题世界

AsciiDoc 文档中存在可被人类作者直接观察的结构表面：标题、标题前元数据、block 标题、block 属性列表、listing、table、paragraph、inline xref、inline anchor 和显式 ID。这些结构表面可以支撑图投影、引用分析、文档 lint、作用域解释和其它下游程序。

现有参考工具 `notes/关于AsciiDoc/asciidoc-ast-viewer` 使用 `@ggrossetie/haddock` 打印 parser 返回的树。该工具提供了有价值的观察材料，但它不能作为当前正式对象继续扩展，原因是：

- `<<...>>` 短写交叉引用和 `[[...]]` 内联锚点在旧输出中退化为普通文本。
- `[#id]`、`.title`、`[source,python]` 等 block metadata 与主体 block 分离，无法稳定附着到 listing、table 或 section。
- heading 没有 section 容器，段落、代码块、表格和 xref 无法可靠归属到标题作用域。
- 输出只适合观察旧 parser 形状，不适合作为下游程序的稳定数据契约。

`asciidoc-abundant-tree` 解决的是单文件结构事实恢复问题。它不要求恢复完整 CST，也不要求复制 Asciidoctor 内部所有 AST 形状。它只恢复当前下游需要的丰富结构事实，并清楚标记每个事实来自原始 source layer 还是 Asciidoctor official layer。

## 2. 期望改变

引入该人工制品以后，使用者应能完成以下动作：

- 在 TypeScript 程序中读取一个 `.adoc` 文件并得到结构化 `AbundantDocument`。
- 在终端中查看一棵稳定缩进的 pretty tree，用于快速观察文档结构。
- 将同一份 `AbundantDocument` 序列化为 JSON，供下游程序消费。
- 根据 source span 回到原文位置，检查标题、block metadata、xref 和 anchor 的来源。
- 同时观察原始语法表面和 Asciidoctor 官方解释结果，而不混淆二者。
- 判断某个 paragraph、listing、table 或 xref 处于哪个 section 作用域内。

这些动作共同定义当前对象的存在理由。仅能打印文本树不足以满足机器消费；仅能输出 JSON 也不足以满足人工观察。两种序列化必须来自同一个 TypeScript 对象，不能各自实现一套事实来源。

## 3. 当前对象

当前对象包含三个层位：

```text
TypeScript data model  核心结构对象，供程序直接调用
pretty text serializer 面向人的终端树投影
JSON serializer        面向机器的传输投影
```

TypeScript data model 是公共契约的核心。pretty text 和 JSON 不拥有独立事实来源；它们只是同一数据模型的不同投影。

当前对象的命令行入口用于快速读取文件、选择序列化格式和返回错误状态。CLI 不是唯一消费路径；下游程序应优先通过 library API 得到 `AbundantDocument`。

## 4. 输入契约

输入是一个 AsciiDoc 源文件路径。

```bash
asciidoc-abundant-tree path/to/file.adoc
asciidoc-abundant-tree path/to/file.adoc --json
asciidoc-abundant-tree path/to/file.adoc --format tree
asciidoc-abundant-tree path/to/file.adoc --format json
```

解释规则：

- 路径按当前进程工作目录解析。
- 文件内容按 UTF-8 文本读取。
- 行号使用 1-based line number。
- 列号使用 1-based Unicode code point column。
- 输入模式是 single-file。

single-file 表示当前工具只读取命令行指定的源文件。它不会打开 xref 指向的其它 `.adoc` 文件，也不会执行跨文件构建。

## 5. 输出契约

### 5.1 TypeScript 对象

核心输出是 `AbundantDocument`。该对象保留源文件信息、解析器信息、文档标题、section tree、target catalog、xref occurrences、anchor occurrences、block nodes 和工具诊断。

TypeScript 程序消费该对象时，不需要解析 pretty text，也不需要从 JSON 反推类型。

### 5.2 Pretty Text

默认 CLI 输出是 pretty text tree。该格式服务人工观察。

格式规则：

- 每个节点以 `<node attr="value">` 开始。
- 子节点缩进 4 个空格。
- 文本内容独立缩进行。
- 属性值进行 XML-style escaping。
- 不输出 closing tag。
- 节点名使用稳定小写名称。

pretty text 不是严格 XML，也不是机器主契约。程序消费应使用 TypeScript API 或 JSON。

### 5.3 JSON

JSON 输出是 `AbundantDocument` 的传输序列化。它服务下游程序、管道和非 TypeScript 运行时。

JSON 必须满足以下规则：

- 保留与 TypeScript 数据模型相同的对象层级。
- 字段名使用稳定 camelCase。
- 不把 pretty text 字符串包进 JSON。
- 不输出 `undefined`。
- 可选字段缺失表示该事实不存在或当前无法获得。
- 错误结果与成功结果使用不同 envelope，不能把错误伪装成文档节点。

## 6. 公共 TypeScript 模型

以下类型表达当前对象的公共模型边界。实现可以继续拆分内部类型，但对外类型必须保持这些语义。

```ts
export type OutputFormat = "tree" | "json";

export type ParseAbundantTreeOptions = {
	sourcePath: string;
};

export type ParserInfo = {
	name: "@asciidoctor/core";
	version: string;
};

export type SourcePosition = {
	line: number;
	column: number;
};

export type SourceSpan = {
	start: SourcePosition;
	end: SourcePosition;
};

export type LineSpan = {
	startLine: number;
	endLine: number;
};

export type SourceLayer = {
	raw?: string;
	line?: number;
	span?: LineSpan;
	sourceSpan?: SourceSpan;
};

export type AsciidoctorLayer = {
	context?: string;
	nodeName?: string;
	href?: string;
	resolvedId?: string;
	resolvedType?: TargetType;
	reftext?: string;
};

export type AbundantNodeBase = {
	kind: string;
	source?: SourceLayer;
	asciidoctor?: AsciidoctorLayer;
	children?: AbundantNode[];
};

export type AbundantDocument = {
	kind: "document";
	sourcePath: string;
	mode: "single-file";
	parser: ParserInfo;
	title?: TitleNode;
	children: AbundantNode[];
	targets: TargetNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	toolDiagnostics: ToolDiagnostic[];
};
```

这些类型不要求一次实现所有字段，但文档、测试和实现必须使用同一套语义。字段缺失必须表示真实缺失，不能表示实现者忘记填。

## 7. 节点模型

### 7.1 Document

Document 是单文件解析结果的根节点。

必要字段：

- `kind = "document"`。
- `sourcePath`：输入文件路径。
- `mode = "single-file"`。
- `parser.name = "@asciidoctor/core"`。
- `parser.version`：实际依赖版本。
- `children`：文档顶层结构节点。
- `targets`：当前文件内可引用目标目录。
- `xrefOccurrences`：当前文件内 xref 出现点。
- `anchorOccurrences`：当前文件内 anchor 出现点。

Document 不表示跨文件工程，不表示站点，不表示图模型。

### 7.2 Section

Section 是标题作用域容器。它由 Asciidoctor official section tree 和 source span recovery 共同构造。

字段：

- `kind = "section"`。
- `level`：AsciiDoc section level。
- `ids`：section 可引用 ID 列表。
- `title`：标题文本。
- `line`：标题所在行。
- `span`：section 覆盖的源文件行范围。
- `titleSpan`：标题文本行列范围。
- `idOrigin`：`"source"`、`"asciidoctor-generated"` 或 `"unknown"`。
- `metadata`：紧邻标题并附着到标题的 metadata。
- `children`：该 section 内的子 section 和 block。

section span 规则：

- section 起始于标题行。
- 如果标题前存在紧邻 metadata，section span 起始于 metadata 首行。
- section 结束于下一个同级或更高级 section 的前一行。
- 没有后续同级或更高级 section 时，结束于父 section 结束行或文档结束行。
- document title 不与普通 section 混淆。

### 7.3 Paragraph

Paragraph 表示 Asciidoctor official block tree 中的 paragraph。它保留普通文本，并在 xref 或 anchor occurrence 位置插入子节点。

Paragraph 不恢复完整 inline formatting AST。strong、emphasis、literal 等 inline formatting 可以先作为文本保留。该限制来自当前对象边界：当前目标是标题作用域、metadata、xref、anchor 和可消费结构，不是完整 inline CST。

### 7.4 Listing

Listing 表示代码块或 literal listing block。

字段：

- `ids`：显式 ID。
- `title`：block title。
- `style`：例如 `source`。
- `language`：例如 `python`、`json`。
- `metadata`：附着到 listing 的 raw metadata。
- `content`：代码块原文内容。
- `metadataSpan`：metadata 行范围。
- `contentSpan`：代码内容行范围。
- `span`：metadata、delimiter 和内容共同覆盖的完整行范围。

Listing 的完整 span 不能只使用 Asciidoctor source location。Asciidoctor sourcemap 通常指向 delimiter 或内容行；完整 raw span 需要 source span enhancer 从原文恢复。

### 7.5 Table

Table 表示 Asciidoctor official table model。

字段：

- `ids`。
- `title`。
- `metadata`。
- `span`。
- `rows`。
- `cells`。

Table 内容结构来自 Asciidoctor official table model。当前工具不手写 raw table parser。

### 7.6 Metadata

Metadata 表示附着到 section、listing、table 或其它 block 的表面单位。

当前必须保留的 surface：

```text
[#id]
[id=id]
[[id]]
.title
[source,python]
[style#id.role,key=value]
```

字段：

- `kind = "metadata"`。
- `metadataKind`：`"id"`、`"title"`、`"attrlist"`、`"anchor"` 或 `"unknown"`。
- `raw`。
- `line`。
- `sourceSpan`。
- `ids`。
- `roles`。
- `attributes`。

Metadata raw 是公共契约，不是调试信息。

### 7.7 Xref Occurrence

Xref occurrence 表示源文件中的一个交叉引用出现点。

当前识别 surface：

```text
<<target>>
<<target,label>>
xref:target[label]
xref:target[label,key=value]
```

字段：

- `kind = "xref"`。
- `syntax`：`"shorthand"` 或 `"macro"`。
- `raw`。
- `target`。
- `label`。
- `attributes`。
- `sourceSpan`。
- `containingSectionId`。
- `targetKind`：词法级提示，不是语义判定。
- `asciidoctor.href`。
- `asciidoctor.resolvedId`。
- `asciidoctor.resolvedType`。
- `asciidoctor.reftext`。

`targetKind` 只能表达词法观察，例如 `document-target`、`natural-title-candidate`、`id-or-anchor`。它不能替代 official binding，也不能替代下游解释器。

### 7.8 Anchor Occurrence

Anchor occurrence 表示源文件中的 inline 或 block anchor 出现点。

当前识别 surface：

```text
[[id]]
[[id,reftext]]
anchor:id[]
```

字段：

- `kind = "anchor"`。
- `syntax`：`"double-bracket"` 或 `"macro"`。
- `raw`。
- `ids`。
- `reftext`。
- `sourceSpan`。
- `containingSectionId`。

Anchor occurrence 同时可以成为 target catalog 的来源。出现点和 target 条目是不同投影，不能混成一个对象。

### 7.9 Target

Target 表示当前文件内可被引用的目标。

字段：

- `kind = "target"`。
- `id`。
- `targetType`：`"section"`、`"listing"`、`"table"`、`"inline-anchor"`、`"block"` 或 `"unknown"`。
- `title`。
- `idOrigin`。
- `sourceSpan`。
- `asciidoctor`。

Target catalog 来自 Asciidoctor refs catalog 与 source occurrence recovery 的合成结果。

## 8. Source Layer 与 Official Layer

当前模型必须区分两类事实。

Source layer 描述原始文档表面：

```text
raw
line
span
sourceSpan
syntax
target
label
ids
roles
attributes
metadataSpan
contentSpan
```

Official layer 描述 Asciidoctor 已经解释出的结果：

```text
asciidoctor.context
asciidoctor.nodeName
asciidoctor.href
asciidoctor.resolvedId
asciidoctor.resolvedType
asciidoctor.reftext
```

Source layer 不能冒充 official result。Official result 也不能覆盖 raw surface。下游消费者可以选择相信 official binding，也可以根据 raw 重新解释。

## 9. 解析流水线

当前工具按编译原理流水线组织实现，即使 Asciidoctor 官方 parser 本身不是完整 CST pipeline。

```text
read source file
  -> build source line table
  -> load official Asciidoctor document
  -> collect official block tree and refs
  -> scan source surfaces
  -> recover metadata spans
  -> recover section scopes
  -> scan xref and anchor occurrences
  -> extract official xref bindings from per-occurrence official xref fragments
  -> merge source layer and official layer
  -> produce AbundantDocument
  -> serialize to pretty text or JSON
```

各步骤职责：

- source line table 提供 line、column、span 和 raw slicing。
- Asciidoctor adapter 只负责 official structure、refs catalog 和 official xref conversion fragments。
- source surface scanners 只负责原文 occurrence 和 metadata surface。
- binding merger 将 raw xref occurrence 与为同一个 occurrence 生成的 official xref binding 合并。
- serializer 只读取 `AbundantDocument`，不重新解析 AsciiDoc。

该流水线允许官方 parser 提供有价值的语义结果，同时保留原文事实。它避免把 Asciidoctor 的耦合结果误称为 CST。

## 10. Asciidoctor 配置

当前 single-file 解析使用 `@asciidoctor/core`。

加载策略：

```ts
asciidoctor.loadFile(sourcePath, {
	safe: "secure",
	sourcemap: true,
	to_file: false,
});
```

配置含义：

- `safe: "secure"` 支持当前单文件边界，避免 include 等外部文件行为改变当前树。
- `sourcemap: true` 提供 official source location。
- `to_file: false` 避免输出文件副作用。

Asciidoctor source location 不足以独立定义完整 source span。实现必须通过 source span enhancer 补充 raw span。

## 11. HTML Fragment Parser

`parse5` 只解析 Asciidoctor 为单个 xref occurrence 转换出的 HTML fragment。

职责：

- 提取 `<a>` 元素。
- 读取 `href`。
- 读取 link text。
- 将该 fragment 中的 official xref anchor 转成当前 occurrence 的 official layer。

`parse5` 不解析 AsciiDoc，不决定 section，不解释 xref，不参与 source span recovery。

整段 block HTML 中的普通 link、inline anchor 或其它 `<a>` 元素不能参与 xref binding。即使普通 link 出现在 xref 前面、文本相同或 href 相同，也不能污染 xref 的 `asciidoctor.href`、`asciidoctor.resolvedId` 或 `asciidoctor.reftext`。

## 12. 单文件边界

当前工具只读取输入文件。

它可以记录跨文档 xref 的 raw target 和 official href，例如：

```text
xref:other.adoc#remote-target[远程目标]
```

该 occurrence 可以输出：

```text
target="other.adoc#remote-target"
scope="external"
asciidoctor.href="other.html#remote-target"
```

`scope = "external"` 只表示 target 不属于当前文件 refs catalog。它不表示引用正确或错误。当前工具不会打开 `other.adoc` 验证目标。

## 13. 诊断边界

当前 abundant tree 不做文档 lint。

不属于当前树的判断：

- 引用写法是否推荐。
- 自然标题引用是否应该改写。
- 跨文件 target 是否存在。
- 文档业务语义是否正确。
- payload JSON 内部字段是否符合某个业务 schema。

工具自身错误必须通过错误出口表达。例子：

- 输入文件不存在。
- 文件读取失败。
- Asciidoctor load 失败。
- source occurrence 与 official anchor 无法满足合并不变量。
- serializer 收到未知节点。

工具错误不应被输出成文档树中的 `<diagnostic>` 节点。

## 14. 相邻人工制品

以下对象是下游或相邻对象，不属于当前实现职责：

- RDF 1.2 / RDF-star 图投影器。
- 文档 lint。
- 跨文件 AsciiDoc workspace resolver。
- 业务 payload schema validator。
- 引用风格建议器。
- 完整 inline formatting CST 恢复器。
- HTML/PDF/site generator。

当前 abundant tree 必须为这些对象提供足够事实材料，但不能替它们做语义判断。

## 15. 核心样例

`samples/reference-links.adoc` 是主要验收样例。内容来自旧 `samples/资料1.adoc`，文件名改为稳定英文 fixture 名。

该样例必须覆盖：

- document title。
- generated section id。
- explicit section id。
- listing id、title、language、content span。
- table id、title、rows。
- inline anchor。
- shorthand xref。
- macro xref。
- natural-title target candidate。
- target catalog。
- section scope。

`samples/interdocument-xref.adoc` 覆盖 single-file 模式下的跨文档引用。

## 16. 不变量

实现必须维护以下不变量：

- pretty text 和 JSON 来自同一个 `AbundantDocument`。
- source layer 字段只来自原文或 source span recovery。
- official layer 字段只来自 Asciidoctor official result 或其转换输出。
- section scope 由 section tree 和 source span 共同确定。
- xref occurrence 必须保留 raw、target、label、sourceSpan。
- anchor occurrence 必须保留 raw、ids、sourceSpan。
- target catalog 不静默创建跨文档 target。
- JSON 不把 pretty text 当作主数据。
- serializer 不重新解析 AsciiDoc。
- 工具错误不伪装成文档诊断。

这些不变量进入测试和完成判断。
