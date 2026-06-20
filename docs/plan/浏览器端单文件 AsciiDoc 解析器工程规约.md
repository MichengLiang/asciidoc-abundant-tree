# 浏览器端单文件 AsciiDoc 解析器工程规约

本文定义 `asciidoc-abundant-tree` 的浏览器端单文件解析公共 API。该 API 接收 AsciiDoc 源字符串，运行于浏览器运行时，返回主模型 `AbundantDocument`，供前端工具读取结构节点、节点属性、xref 边、边属性、target binding 和源坐标。

本文面向接手实现的开发者。读者通过本文获得完整对象定义、当前代码事实、目标状态、公共契约、实现边界、黑盒测试对象、完成标准和优秀标准。读者不需要从聊天记录、前端教学 demo 或 CLI 使用说明中反推目标。

## 1. 当前对象

当前对象是浏览器端单文件 AsciiDoc 解析公共 API。

该 API 的输入是一个完整 AsciiDoc 源字符串。该 API 的输出是 `AbundantDocument`。该输出必须保留主解析器的单文件结构语义：document title、section、paragraph、listing、table、description list、metadata、target catalog、anchor occurrence、xref occurrence、heading inline metadata occurrence、official Asciidoctor binding、source span、line span、raw source surface 和 tool diagnostics。

前端消费者通过该 API 把内存中的 AsciiDoc 文本转化为结构对象。前端消费者从结构对象继续投影图、表格、检查报告、编辑器标注或交互视图。解析器不直接承担前端图布局职责；图布局是 `AbundantDocument` 的下游投影。

### 1.1 对象名称

规范名称：浏览器端单文件 AsciiDoc 解析器。

公共 API 名称：

```ts
parseAbundantTreeFromSource
```

浏览器入口：

```ts
asciidoc-abundant-tree/browser
```

名称中的 `Source` 表示调用者提供源文本。名称中的 `browser` 表示该入口的依赖图满足浏览器运行时。

### 1.2 构成性条件

缺少以下任一条件，该对象不成立：

- 调用者以 `sourceText: string` 提供完整 AsciiDoc 文本。
- API 在真实浏览器页面中可导入、可调用、可返回。
- 返回对象是 `AbundantDocument`。
- 返回对象保留单文件解析所需的 source layer 和 official Asciidoctor layer。
- 前端消费者从返回对象稳定读取节点、节点属性、xref 边、边属性、连接关系和源坐标。

这些条件定义对象身份。实现细节必须服务这些条件。

## 2. 问题定义

当前摩擦是：前端消费者拥有 AsciiDoc 源字符串，却没有一个浏览器可运行的主解析器公共入口把该字符串转成 `AbundantDocument`。

这个摩擦产生三个直接后果。

第一，前端工具无法消费主解析器事实。现有前端教学项目只能在 `apps/projection-teacher/src/projection.ts` 中手写正则行扫描器。该扫描器形成的节点和边不是 `asciidoc-abundant-tree` 主模型事实。

第二，同一份 AsciiDoc 文本在 Node 工具和浏览器工具中没有共同解析契约。Node 侧通过 `parseAbundantTree({ sourcePath })` 得到主模型；浏览器侧没有等价的 `sourceText -> AbundantDocument` 入口。

第三，前端图、审计和编辑器定位无法稳定依赖主模型字段。消费者需要节点、节点属性、xref 边、边属性、target binding 和 source span；手写教学扫描器只能覆盖局部语法，不能承担完整主解析语义。

要解决的问题是：为浏览器前端提供一个公共 API，使内存中的单文件 AsciiDoc 源字符串进入主解析器，并返回可由前端工具直接消费的 `AbundantDocument`。

## 3. 消费者与行动轨迹

### 3.1 消费者

消费者是前端生态和前端工具链，包括：

- 浏览器内在线 AsciiDoc 编辑器。
- 文档结构可视化应用。
- xref 和 anchor 审计界面。
- 浏览器内 lint 或迁移预览工具。
- Web Worker 中运行的文档分析器。
- Vite、React、Vue、Svelte 或原生 Web 应用中的分析模块。

这些消费者共同特征是：文本已经存在于浏览器内存中，消费者需要结构对象，而不是 HTML 渲染结果。

### 3.2 当前行动轨迹

当前前端教学项目 `apps/projection-teacher` 已经从 textarea 接收 AsciiDoc 字符串。`apps/projection-teacher/src/App.tsx` 中的状态 `source` 来自 textarea 的 `onChange`。该应用随后调用 `projectTeachingGraph(source)`。

`projectTeachingGraph()` 位于 `apps/projection-teacher/src/projection.ts`。该函数用正则和行扫描识别标题、属性列表、xref、description list 和 hmeta。它不调用 `parseAbundantTree()`，不调用 `createAsciidoctorAdapter()`，也不消费 `AbundantDocument`。

因此，当前前端教学项目的数据来源已经是浏览器文本输入，但它的解析事实来源不是主解析器。它只能形成教学图，不能作为完整主解析语义的依据。

### 3.3 目标行动轨迹

目标行动轨迹如下：

```text
textarea / editor / worker message
  -> sourceText: string
  -> parseAbundantTreeFromSource({ sourceText, sourcePath? })
  -> AbundantDocument
  -> frontend graph projection / audit view / editor markers
```

目标状态下，`projection-teacher` 或其他前端消费者不再手写 AsciiDoc 结构解析。消费者读取主模型：

- 从 `document.children` 获取结构节点。
- 从 `document.targets` 获取可绑定 target。
- 从 `document.xrefOccurrences` 获取边证据。
- 从 node metadata、description metadata 和 xref attributes 获取属性。
- 从 `sourceSpan`、`span`、`line` 和 `raw` 获取编辑器定位和源文本证据。

该行动轨迹把前端图建立在主解析器事实上。

## 4. 当前代码事实

本节只记录已确认事实。每条事实对应当前仓库文件、配置或浏览器探针结果。

### 4.1 当前公开解析入口是 Node-first

`src/parser.ts` 直接导入 Node 内建模块：

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

`parseAbundantTree()` 的单文件模式执行以下动作：

- 解析 `options.sourcePath`。
- 创建 Asciidoctor adapter。
- 调用 `readFileSync(sourcePath, "utf8")` 读取源文件。
- 调用 `adapter.loadFile(sourcePath)` 构造 official document。
- 调用 `buildLineTable(source)`。
- 调用 `parseAsciidoctorDocument(...)`。

该入口的输入对象是路径。该入口内部拥有读取文件的控制权。

### 4.2 当前公共类型没有 sourceText 输入形态

`src/model.ts` 中的 `ParseAbundantTreeOptions` 当前定义为：

```ts
export type ParseAbundantTreeOptions =
	| {
			sourcePath: string;
			mode?: "single-file";
	  }
	| {
			sourcePath: string;
			mode: "book-entry";
			documentRoot: string;
	  };
```

该类型没有 `sourceText` 字段。前端消费者不能通过当前公开类型直接传入内存字符串。

### 4.3 内部存在 sourceText 解析构件

`src/asciidoctor-adapter.ts` 的 `AsciidoctorParserAdapter` 暴露：

```ts
loadSource(sourceText: string): AsciidoctorBlock;
```

`createAsciidoctorAdapter()` 当前实现中，`loadSource(sourceText)` 调用 `processor.load(sourceText, ...)`。

`src/parser-core.ts` 暴露：

```ts
export function parseAsciidoctorDocument(
	input: ParserCoreInput,
): AbundantDocument
```

`ParserCoreInput` 接收 `officialDocument`、`adapter`、`lineTable`、`sourcePath`、`sourceText`、`mode` 和 `sourceFiles` 信息。该结构说明核心投影函数使用外部提供的 sourceText 和 official document 构造 `AbundantDocument`。

### 4.4 当前 browser import graph 存在 Node-only 污染点

除 `src/parser.ts` 外，以下文件也导入 Node 内建模块：

- `src/source-surfaces.ts` 导入 `node:path`。
- `src/book-entry/official-reader-preprocessor.ts` 导入 `node:fs`。
- `src/book-entry/source-set.ts` 导入 `node:fs`。
- `src/book-entry/logical-source-builder.ts` 导入 `node:fs`。
- `src/book-entry/reader-boundary-policy.ts` 导入 `node:fs` 和 `node:path`。
- `src/book-entry/path-boundary.ts` 导入 `node:path`。
- `src/rdf12-projection/path-coordinate.ts` 导入 `node:crypto` 和 `node:path`。
- `src/rdf12-projection/source-digest.ts` 导入 `node:crypto`。
- `src/cli.ts` 导入 `node:fs`、`node:path` 和 `node:process`。
- `src/animation-yaml-export/cli.ts` 导入 `node:process`。
- `src/animation-yaml-export/export-animation-yaml.ts` 导入 `node:path`。

当前 `src/index.ts` 同时导出 parser、RDF projection、animation yaml export 和 serializers。浏览器消费者从总入口导入时，会接触不属于浏览器单文件解析器的依赖图。

### 4.5 当前浏览器探针结果

临时 Vite 探针从当前源码导入 `parseAbundantTree` 并在 Chromium 页面调用：

```ts
parseAbundantTree({ sourcePath: "virtual.adoc" });
```

Vite 构建成功，但构建日志报告多个 Node 内建模块被 externalized for browser compatibility。页面运行结果为：

```text
(0 , Qi.resolve) is not a function
```

该错误对应 `node:path.resolve` 在浏览器 bundle 中不可调用。该探针证明当前公开解析入口不能作为浏览器单文件 sourceText API 使用。

### 4.6 Asciidoctor browser runtime 接口差异

临时浏览器探针直接导入 `@asciidoctor/core` 并检查 browser 条件下的 processor：

```json
{
  "importType": "function",
  "callType": "function",
  "getVersionType": "undefined",
  "inlineCreateType": "function"
}
```

Node 条件下 `createAsciidoctor().getVersion()` 存在并返回 `3.0.4`。Browser 条件下 `Inline.create` 存在，但 `getVersion` 不存在。

当前 `src/asciidoctor-adapter.ts` 在创建 adapter 时读取 `processor.getVersion()`。该假设阻断 browser runtime。

### 4.7 前端教学项目不是主解析器证明

`apps/projection-teacher/src/App.tsx` 从 textarea 读取字符串，并调用：

```ts
const projection = useMemo(() => projectTeachingGraph(source), [source]);
```

`projectTeachingGraph()` 位于 `apps/projection-teacher/src/projection.ts`。该文件没有导入 `src/index.ts`、`src/parser.ts`、`src/asciidoctor-adapter.ts` 或 `@asciidoctor/core`。该教学项目证明前端消费场景存在，不证明主解析器已在浏览器运行。

### 4.8 前端教学项目当前构建状态

运行：

```bash
pnpm --filter projection-teacher build
```

当前失败原因是 TypeScript 严格类型错误，包括 `TeachingEdge.tsx` 的 optional property 精确类型问题、`projection.ts` 的 possibly undefined 问题和 `PendingAttrList.role` 类型问题。

该事实说明前端教学项目本身也需要清理，但这不是浏览器单文件主解析器对象的核心实现路径。

## 5. 目标状态

目标状态是可观察的代码和运行结果。

### 5.1 包导出状态

`package.json` 暴露 browser-safe 子路径导出：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./browser": {
      "types": "./dist/browser.d.mts",
      "import": "./dist/browser.mjs"
    }
  }
}
```

`./browser` 子路径必须存在。`./browser` 子路径只导出浏览器单文件解析所需对象。构建产物文件名必须与 `package.json` 中的 `types` 和 `import` 字段一致。

### 5.2 公共调用状态

浏览器应用使用以下代码并成功运行：

```ts
import { parseAbundantTreeFromSource } from "asciidoc-abundant-tree/browser";

const document = parseAbundantTreeFromSource({
	sourceText,
	sourcePath: "document.adoc",
});
```

调用结果满足：

- `document.kind === "document"`。
- `document.mode === "single-file"`。
- `document.sourceText === sourceText`。
- `document.sourcePath === "document.adoc"`。
- `document.parser.name === "@asciidoctor/core"`。
- `document.children`、`document.targets`、`document.xrefOccurrences`、`document.anchorOccurrences`、`document.toolDiagnostics` 可读。

### 5.3 主模型等价状态

同一份 sourceText 通过 Node 单文件解析和 browser sourceText 解析后，归一化核心字段等价。归一化字段包括：

- document title text。
- section title、level、ids、idOrigin、metadata。
- listing/table/description list 节点的公开字段。
- target id、targetType、idOrigin、sourceSpan。
- xref raw、target、label、attributes、scope、targetKind、sourceSpan、containingSectionId、asciidoctor binding。
- anchor raw、ids、sourceSpan、containingSectionId。
- tool diagnostic code、level、message 和 source。

归一化不比较对象引用、函数、内部 WeakMap、构建产物路径或测试运行临时目录绝对路径。

### 5.4 前端消费状态

前端工具从 `AbundantDocument` 投影出图：

- section 形成 graph node。
- section metadata 和 description metadata 形成 node properties。
- xref occurrence 形成 graph edge evidence。
- containing section 形成 edge source。
- target catalog 和 official binding 形成 edge target。
- xref label 和 attributes 形成 edge properties。
- sourceSpan 形成编辑器定位。

`apps/projection-teacher` 的迁移目标是 `AbundantDocument -> TeachingProjection`，迁移后不再维护与主解析器分离的 AsciiDoc 正则解析事实源。

## 6. 公共 API 契约

### 6.1 输入类型

新增公共类型：

```ts
export type ParseAbundantTreeFromSourceOptions = {
	readonly sourceText: string;
	readonly sourcePath?: string;
};
```

`sourceText` 是完整 AsciiDoc 源文本。调用者拥有该文本。解析器不得从 `sourcePath` 读取文本。

`sourcePath` 是 source identity。它参与 `AbundantDocument.sourcePath`、diagnostic label、source surface label 和前端展示。调用者未提供时，解析器使用稳定虚拟 source identity `document.adoc`。

### 6.2 输出类型

输出类型：

```ts
AbundantDocument
```

输出对象必须复用 `src/model.ts` 的主模型。不得为浏览器入口发明一套弱化 AST。

### 6.3 Parser info

`document.parser.name` 固定为 `@asciidoctor/core`。`document.parser.version` 必须是字符串。Browser runtime 无法从 processor 读取版本时，adapter 必须通过包内常量、构建注入值或安全后备值提供版本字符串。版本字段缺失不得阻断 parse。

### 6.4 错误与诊断

可恢复的解析观察进入 `toolDiagnostics`。不可构造 document 的情况抛出异常。

`toolDiagnostics` 用于表达 source location 缺失、未知 official block context、source interval recovery 降级等工具诊断。它不替代异常，也不混入 document tree children。

### 6.5 Import surface

浏览器消费者从 `asciidoc-abundant-tree/browser` 导入。该入口导出：

- `parseAbundantTreeFromSource`
- `serializeAbundantTreeToJson`
- 与返回模型相关的 TypeScript 类型

该入口不导出 CLI runner，不导出 Node path/file parser，不导出 animation yaml CLI，不导出需要 Node crypto/path 的 RDF convenience wrapper。

## 7. 数据模型消费规则

本节定义前端如何从 `AbundantDocument` 读取节点和边。

### 7.1 节点

主要 graph node 来源是 `SectionNode`。消费者遍历 `document.children`，递归收集 `kind === "section"` 的节点。

section node 的基础字段：

- `title`
- `level`
- `ids`
- `idOrigin`
- `source.line`
- `source.span`
- `source.sourceSpan`
- `source.raw`
- `asciidoctor.resolvedId`
- `asciidoctor.reftext`

listing、table、inline anchor、block target 和 source value block 是消费者图中的附属节点来源。解析器只提供事实，graph node 选择属于下游投影。

### 7.2 节点属性

节点属性来自以下位置：

- `SectionNode.metadata` 中的 id、role、named attributes。
- `SectionNode.descriptionMetadata` 中的 description list 字段。
- heading inline metadata occurrences。
- source layer 坐标字段。
- official layer resolved fields。

前端工具不应从标题文本中重新解析属性。属性事实已经在 AST 中。

### 7.3 边

边的证据来源是 `XrefOccurrenceNode`。

边 source 来自 `xref.containingSectionId`。消费者用该值映射到包含该 xref 的 section。

边 target 来自 xref target 与 target catalog 的绑定。消费者读取：

- `xref.target`
- `xref.scope`
- `xref.targetKind`
- `xref.asciidoctor.href`
- `xref.asciidoctor.resolvedId`
- `document.targets`

resolved local xref 连接到 matching target。unresolved xref 仍然保留为 edge evidence，但其 target node 不可绑定。

### 7.4 边属性

边属性来自：

- `xref.raw`
- `xref.label`
- `xref.attributes`
- `xref.sourceSpan`
- `xref.asciidoctor.reftext`
- `xref.asciidoctor.href`
- `xref.asciidoctor.resolvedType`

源文档中的 `rel`、`weight`、`relation-evidence` 等 xref named attributes 由 `xref.attributes` 承载。解析器不把这些字段提前折叠成固定 graph schema。

### 7.5 源坐标

前端编辑器定位依赖 `sourceSpan`。`sourceSpan.start.line`、`sourceSpan.start.column`、`sourceSpan.end.line`、`sourceSpan.end.column` 使用 1-based 坐标。消费者把坐标映射回输入框或编辑器模型。

## 8. 架构设计

### 8.1 文件职责

新增或修改的文件职责如下。

| 文件 | 职责 |
|---|---|
| `src/browser.ts` | 浏览器安全公共导出入口。 |
| `src/browser-parser.ts` | 实现 `sourceText -> AbundantDocument` 的单文件解析 API。 |
| `src/asciidoctor-adapter.ts` | 兼容 Node 和 browser Asciidoctor runtime 的公共 adapter。 |
| `src/source-surfaces.ts` | 接收 source identity helper，保持 source surface projection。 |
| `src/source-identity.ts` | 提供 Node 和 browser 两个 source identity helper。 |
| `src/model.ts` | 增加 `ParseAbundantTreeFromSourceOptions` 类型。 |
| `src/index.ts` | 保持现有 Node/public 主入口；不承载 browser-only API 依赖要求。 |
| `package.json` | 增加 `./browser` export。 |
| `tsdown.config.ts` | 增加 browser entry 构建产物。 |
| `test/browser-parser.test.ts` | 验证 sourceText parser 的模型语义。 |
| `test/browser-parser-browser-smoke.test.ts` | 验证真实浏览器导入与调用。 |
| `apps/projection-teacher/src/projection.ts` | 可迁移为 `AbundantDocument -> TeachingProjection` 的下游投影。 |

### 8.2 浏览器 parser 控制流

浏览器 parser 的控制流应保持单向：

```text
sourceText
  -> createAsciidoctorAdapter()
  -> adapter.loadSource(sourceText)
  -> buildLineTable(sourceText)
  -> parseAsciidoctorDocument(...)
  -> AbundantDocument
```

该控制流不得包含 CLI argument parsing、file existence check、file read、process stdout/stderr、RDF digest、Turtle serialization 或 teaching graph layout。

### 8.3 数据流

`sourceText` 进入三个位置：

- `adapter.loadSource(sourceText)`
- `buildLineTable(sourceText)`
- `AbundantDocument.sourceText`

`sourcePath` 进入两个位置：

- `AbundantDocument.sourcePath`
- source surface label / diagnostic label

`sourcePath` 不控制读取动作。

`AbundantDocument` 进入前端投影函数。前端投影函数输出 graph view model。graph view model 不回写 parser。

### 8.4 Adapter runtime compatibility

`createAsciidoctorAdapter()` 当前假设 `processor.getVersion()` 存在。浏览器 runtime 事实不满足该假设。

Adapter 必须把 parser version 获取改成安全函数：

```ts
function parserVersion(processor: unknown): string {
	if (hasProperties(processor) && typeof processor.getVersion === "function") {
		const version = processor.getVersion();
		if (typeof version === "string") {
			return version;
		}
	}
	return ASCIIDOCTOR_CORE_VERSION;
}
```

`ASCIIDOCTOR_CORE_VERSION` 来自构建时生成的 package metadata 文件。该常量必须有测试防止与 `package.json` 依赖版本漂移。

### 8.5 Browser-safe path handling

`src/source-surfaces.ts` 当前使用 `basename`、`isAbsolute`、`join`、`normalize`、`resolve`。这些调用用于比较 official source location 与 parsed source file。

浏览器单文件 parser 需要一个 browser-safe source identity helper。该 helper 只处理 source identity 字符串，不承担文件系统语义。

新增 `src/source-identity.ts`：

```ts
export type SourceIdentityApi = {
	readonly normalize: (value: string) => string;
	readonly join: (left: string, right: string) => string;
	readonly basename: (value: string) => string;
	readonly isAbsolute: (value: string) => boolean;
	readonly resolve: (value: string) => string;
};
```

`src/source-identity.ts` 导出 `nodeSourceIdentity` 和 `browserSourceIdentity`。`projectSourceSurfaces()` 增加必填参数 `sourceIdentity: SourceIdentityApi`。Node parser 调用 `projectSourceSurfaces()` 时传入 `nodeSourceIdentity`。Browser parser 调用 `projectSourceSurfaces()` 时传入 `browserSourceIdentity`。平台差异只存在于 `src/source-identity.ts`。

### 8.6 Browser public entry import graph

`src/browser.ts` 的 import graph 必须可审计。允许依赖：

- `@asciidoctor/core`
- `parse5`
- 主模型文件
- parser-core
- source-lines
- browser parser
- serializers
- source surface projection 所需纯 TS 文件

不允许依赖：

- `node:fs`
- `node:path`
- `node:crypto`
- `node:process`
- CLI 文件
- book-entry filesystem preprocessing
- RDF digest/path coordinate convenience wrapper
- animation yaml CLI

该列表是入口依赖图验收依据。它不是一般性的“不要使用 Node”口号。

## 9. 黑盒测试对象

黑盒测试从消费者视角观察对象。测试不检查内部函数怎样组织，只检查 public API 是否满足输入输出契约。

### 9.1 Fixture

黑盒 fixture 使用一份小而完整的 AsciiDoc：

```adoc
= 浏览器解析夹具

[#source.policy, status=active, owner=docs]
== 来源节点

priority:: high
summary::
来源节点说明第一行。
来源节点说明第二行。

来源节点引用 xref:target.rule[目标节点, rel=requires, weight=0.7]。

[#target.rule, status=draft]
== 目标节点

[#target-json]
[source,json]
----
{"kind":"rule","status":"draft"}
----
```

该 fixture 覆盖：

- document title
- section
- section attrlist id
- section role
- section named attributes
- description metadata
- xref
- xref label
- xref named attributes
- target section
- listing block target
- sourceSpan

### 9.2 Browser public API smoke

测试动作：

1. 启动 Vite 测试页面。
2. 页面从 `asciidoc-abundant-tree/browser` 导入 `parseAbundantTreeFromSource`。
3. 页面调用该 API，输入 fixture sourceText。
4. 页面把归一化结果写入 DOM 或返回给 Playwright。

断言：

- `kind === "document"`。
- `mode === "single-file"`。
- title text 为 `浏览器解析夹具`。
- 至少两个 section。
- 至少一个 xref occurrence。
- 至少两个 target。
- source section metadata 包含 id `source`、role `policy`、status `active`、owner `docs`。
- xref attributes 包含 `rel: "requires"`、`weight: 0.7` 或当前 parser 的等价 typed value。
- xref `containingSectionId` 指向来源节点。
- xref `sourceSpan.start.line` 为正整数。
- 页面无 uncaught runtime error。

### 9.3 Dependency surface smoke

测试动作：

1. 构建只导入 `asciidoc-abundant-tree/browser` 的 Vite app。
2. 捕获构建 stderr/stdout。

断言：

- 构建日志中没有由 browser entry 引起的 `node:fs` externalized warning。
- 构建日志中没有由 browser entry 引起的 `node:path` externalized warning。
- 构建日志中没有由 browser entry 引起的 `node:crypto` externalized warning。
- bundle 在 Chromium 中运行成功。

### 9.4 Node/browser 等价测试

测试动作：

1. 将 fixture sourceText 写入测试临时 `.adoc` 文件。
2. 调用 Node parser：`parseAbundantTree({ sourcePath })`。
3. 调用 browser parser：`parseAbundantTreeFromSource({ sourceText, sourcePath: "fixture.adoc" })`。
4. 归一化两个 `AbundantDocument`。

断言：

- 归一化 document title 一致。
- section title、level、ids、metadata 一致。
- targets 一致。
- xref raw、target、label、attributes、sourceSpan、containingSectionId 一致。
- anchor occurrences 一致。
- tool diagnostic codes 一致。

归一化函数不得删除当前消费者需要的字段。

### 9.5 Frontend graph consumer test

测试动作：

1. 用 browser parser 解析 fixture。
2. 把 `AbundantDocument` 传入 `projectTeachingGraphFromDocument(document)`。

断言：

- graph nodes 包含 `来源节点` 和 `目标节点`。
- `来源节点` node fields 包含 `status=active`、`owner=docs`、`priority=high`。
- graph edges 包含从 `来源节点` 到 `目标节点` 的 edge。
- edge fields 包含 `label=目标节点`、`rel=requires`、`weight=0.7`。
- edge 保存 sourceSpan 或可回查 sourceSpan。

该测试证明前端消费者能从主 AST 得到节点和边，而不是依赖手写语法扫描。

## 10. 完成标准

完成标准定义对象成立。全部标准满足时，才允许声明浏览器端单文件解析器完成。

### 10.1 Public API 标准

- `package.json` 暴露 `./browser` export。
- `./browser` export 生成 `.mjs` 和 `.d.mts`。
- `./browser` export 导出 `parseAbundantTreeFromSource`。
- `./browser` export 导出 `AbundantDocument` 相关类型。
- `parseAbundantTreeFromSource` 的输入类型包含 `sourceText: string`。
- `parseAbundantTreeFromSource` 返回 `AbundantDocument`。

### 10.2 Browser runtime 标准

- Vite browser app 可导入 `asciidoc-abundant-tree/browser`。
- Chromium 页面可调用 `parseAbundantTreeFromSource()`。
- 调用 fixture 后返回 `document.kind === "document"`。
- 页面运行期间无 uncaught exception。
- browser entry 构建日志无 browser entry 引起的 Node built-in externalization warning。

### 10.3 AST 标准

fixture parse 结果必须满足：

- `document.title.text === "浏览器解析夹具"`。
- `document.mode === "single-file"`。
- `document.sourceText === fixtureSourceText`。
- `document.children` 中存在标题为 `来源节点` 的 section。
- `document.children` 中存在标题为 `目标节点` 的 section。
- `document.targets.length >= 2`。
- `document.xrefOccurrences.length >= 1`。
- 来源 section metadata 包含 id、role 和 named attributes。
- 来源 section description metadata 包含 `priority` 和 `summary`。
- xref occurrence 包含 raw、target、label、attributes、sourceSpan 和 containingSectionId。
- target section 可从 target catalog 或 official binding 找到。

### 10.4 等价标准

同一 fixture 在 Node parser 与 browser parser 下的归一化 AST 等价。等价字段包括：

- document title
- section title/level/ids/metadata
- target id/type/sourceSpan
- xref raw/target/label/attributes/sourceSpan/containingSectionId/official binding
- description metadata fields
- listing id/style/language/contentSpan

### 10.5 门禁标准

必须通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter projection-teacher build
```

新增 browser-specific 测试命令时，文档和 `package.json` scripts 必须同步记录。完成时必须提供该命令的通过结果。

### 10.6 工作树标准

提交前 `git status --short` 只允许出现本任务相关文件。不得混入无关样例、缓存、构建产物或其他项目修改。新文件提交使用 `git commit --only` 前必须先 `git add` 跟踪。

## 11. 优秀标准

优秀标准定义实现质量。满足完成标准只说明对象成立；满足优秀标准才说明实现干净。

### 11.1 语义干净

- API 名称表达输入事实：`parseAbundantTreeFromSource`。
- browser entry 名称表达运行时事实：`./browser`。
- `sourceText` 表示待解析文本。
- `sourcePath` 表示 source identity。
- parser 返回 `AbundantDocument`，不返回教学图。
- graph projection 函数的名称表达投影事实：`projectTeachingGraphFromDocument`。
- diagnostics 保持 diagnostics 身份，不伪装成 tree node。

### 11.2 控制流干净

- browser parser 控制流是一条 sourceText 到 AbundantDocument 的直线。
- 没有 CLI 分支进入 browser parser。
- 没有 filesystem 后备分支。
- 没有正则教学 parser 后备分支。
- 没有把 RDF projection 作为 browser parse 的必经步骤。
- adapter runtime 兼容集中在 adapter 内部。

### 11.3 数据流干净

- sourceText 不被重新从 sourcePath 读取覆盖。
- sourcePath 不触发 IO。
- officialDocument 只由 `adapter.loadSource(sourceText)` 创建。
- lineTable 只由同一份 sourceText 创建。
- AST 到 graph 的转换发生在下游投影函数。
- 前端状态不回写 parser 内部状态。

### 11.4 架构干净

- `src/browser.ts` 只做浏览器公共导出。
- `src/browser-parser.ts` 只实现 sourceText parse API。
- Node parser 保留在 `src/parser.ts`。
- Browser parser 与 Node parser 共用 `parseAsciidoctorDocument()`。
- Node-only import 不出现在 browser entry 依赖图。
- 平台差异通过 adapter 或小型 helper 注入，不散落在业务投影代码中。
- 新增文件职责单一，避免把 parser、graph projection、UI 和 build harness 写进同一个文件。

### 11.5 测试干净

- 单测验证模型语义。
- 浏览器 smoke 验证真实运行时。
- 构建日志测试验证依赖图。
- Node/browser 对照测试验证语义等价。
- 前端 graph consumer 测试验证消费者动作。
- fixture 小而完整，覆盖消费者关心字段。
- 每个回归测试都有明确字段断言，不只断言“不报错”。

### 11.6 文档干净

- README 或 API 文档中明确展示 sourceText browser usage。
- 文档示例直接使用 `asciidoc-abundant-tree/browser`。
- 文档不把 browser parser 描述为 CLI 替代品。
- 文档不把 teaching graph 描述为 parser 输出。
- 文档说明 `AbundantDocument` 是上游事实对象，graph 是下游投影。

## 12. 实现任务设计

本节给开发者提供任务拆分。每个任务应独立产生可测试变化。

### Task 1：建立 browser API 类型与入口红测

文件：

- 新增 `src/browser.ts`
- 新增 `src/browser-parser.ts`
- 修改 `src/model.ts`
- 新增 `test/browser-parser.test.ts`

测试先写：

```ts
import { describe, expect, it } from "vitest";
import { parseAbundantTreeFromSource } from "../src/browser";

const fixture = `= 浏览器解析夹具

[#source.policy, status=active, owner=docs]
== 来源节点

来源节点引用 xref:target.rule[目标节点, rel=requires, weight=0.7]。

[#target.rule, status=draft]
== 目标节点
`;

describe("browser source parser", () => {
	it("parses sourceText into an AbundantDocument", () => {
		const document = parseAbundantTreeFromSource({
			sourceText: fixture,
			sourcePath: "fixture.adoc",
		});

		expect(document.kind).toBe("document");
		expect(document.mode).toBe("single-file");
		expect(document.sourcePath).toBe("fixture.adoc");
		expect(document.sourceText).toBe(fixture);
		expect(document.title?.text).toBe("浏览器解析夹具");
		expect(document.xrefOccurrences).toHaveLength(1);
	});
});
```

该测试在最初会因为 API 不存在而失败。

实现最小 browser parser：

```ts
import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import type { AbundantDocument, ParseAbundantTreeFromSourceOptions } from "./model";
import { parseAsciidoctorDocument } from "./parser-core";
import { buildLineTable } from "./source-lines";

const DEFAULT_BROWSER_SOURCE_PATH = "document.adoc";

export function parseAbundantTreeFromSource(
	options: ParseAbundantTreeFromSourceOptions,
): AbundantDocument {
	const sourcePath = options.sourcePath ?? DEFAULT_BROWSER_SOURCE_PATH;
	const adapter = createAsciidoctorAdapter();
	const lineTable = buildLineTable(options.sourceText);

	return parseAsciidoctorDocument({
		officialDocument: adapter.loadSource(options.sourceText),
		adapter,
		lineTable,
		sourcePath,
		sourceText: options.sourceText,
		mode: "single-file",
	});
}
```

此任务在 Node test environment 中证明 sourceText API 的模型路径成立。

### Task 2：修复 Asciidoctor adapter 的 browser parserVersion

文件：

- 修改 `src/asciidoctor-adapter.ts`
- 新增或修改 `test/asciidoctor-adapter.test.ts`

测试目标：

- adapter 在 processor 缺少 `getVersion()` 时仍可提供 parserVersion。
- parserVersion 是非空字符串。
- `Inline.create` 和 `Extensions.create` 仍为硬要求。

实现要求：

- 把 `processor.getVersion()` 包装成安全函数。
- 版本后备值来自单一常量。
- 常量名称为 `ASCIIDOCTOR_CORE_VERSION`.

### Task 3：隔离 browser entry 的 Node-only import

文件：

- 修改 `src/source-surfaces.ts`
- 新增 `src/source-identity.ts`
- 修改 `src/parser-core.ts`
- 修改 `src/parser.ts`
- 修改 `src/browser-parser.ts`

测试目标：

- browser source parser test 不需要 import `node:path`。
- Vite browser build 不再报告 `source-surfaces.ts` 的 `node:path` externalization。

实现要求：

- 将 source identity 操作抽到 `src/source-identity.ts`。
- `projectSourceSurfaces()` 增加必填 `sourceIdentity` 参数。
- Node parser 使用 `nodeSourceIdentity`。
- Browser parser 使用 `browserSourceIdentity`。
- source surface 逻辑保持共享。

### Task 4：增加 package browser export 和 build entry

文件：

- 修改 `package.json`
- 修改 `tsdown.config.ts`

测试目标：

- `pnpm build` 生成 `dist/browser.mjs` 和 `dist/browser.d.mts`。
- `publint` 不报告 browser export 类型错误。
- 浏览器测试 app 从包子路径导入。

实现要求：

- `src/browser.ts` 加入 tsdown entry。
- `package.json` `exports` 加入 `./browser`。
- 不破坏现有 `.` export 和 CLI bin。

### Task 5：真实浏览器 smoke test

文件：

- 新增 `test/browser-smoke/` browser test harness。
- 修改 `package.json` scripts，增加明确 browser smoke 命令。

测试目标：

- Vite 构建一个只导入 `asciidoc-abundant-tree/browser` 的页面。
- Playwright 打开 Chromium 页面。
- 页面调用 `parseAbundantTreeFromSource()`。
- 页面返回归一化结果。
- Node built-in externalization warning 不出现。

实现要求：

- 测试产物写入项目内 `tmp/`，不写系统临时目录。
- 测试结束清理或让 `tmp/` 保持 disposable。
- Playwright 由项目脚本调用。

### Task 6：Node/browser AST 等价测试

文件：

- 新增 `test/browser-parser-equivalence.test.ts`

测试目标：

- 同一 fixture 经 Node parser 和 sourceText parser 得到等价 AST。
- 归一化函数保留消费者字段。

实现要求：

- 临时源文件写入项目 `tmp/` 或测试 fixture 目录。
- 归一化函数只删除运行环境差异字段。
- 不用 snapshot 掩盖具体字段；关键字段显式断言。

### Task 7：前端教学项目迁移消费面

文件：

- 修改 `apps/projection-teacher/src/projection.ts`
- 修改 `apps/projection-teacher/src/App.tsx`
- 新增 `apps/projection-teacher/src/projection.test.ts`

测试目标：

- `projection-teacher` 从 `AbundantDocument` 投影 teaching graph。
- `pnpm --filter projection-teacher build` 通过。
- teaching graph 节点和边字段来自主模型。

实现要求：

- 保留 UI 行为。
- runtime path 删除手写 AsciiDoc parser 事实源。

## 13. 验收命令

完成时必须运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter projection-teacher build
```

新增 browser smoke 后必须运行对应脚本：

```bash
pnpm test:browser
```

具体脚本名由实现提交定义，但文档和 `package.json` 必须一致。

## 14. 自审清单

开发者提交前逐项检查：

- [ ] `./browser` export 存在。
- [ ] browser parser 输入类型包含 `sourceText`。
- [ ] browser parser 返回 `AbundantDocument`。
- [ ] browser parser 不读取文件。
- [ ] browser parser 不经过 CLI。
- [ ] browser entry 依赖图不含 Node-only import。
- [ ] browser runtime smoke 在 Chromium 中通过。
- [ ] fixture 能解析出 section、metadata、xref、target 和 sourceSpan。
- [ ] Node/browser 核心 AST 等价测试通过。
- [ ] projection-teacher 消费主 AST 的迁移测试通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm build` 通过。
- [ ] `pnpm --filter projection-teacher build` 通过。
- [ ] 新增代码没有复制主解析逻辑。
- [ ] 新增代码没有引入第二套正则 AsciiDoc parser。
- [ ] 新增代码没有把 graph projection 写进 parser。
- [ ] 新增代码没有把 diagnostics 写成 tree child。
- [ ] `git status --short` 不含无关文件。

## 15. 本文档边界

本文档定义浏览器端单文件 sourceText 解析器。本文档不定义 CLI、静态站点构建、文档发布、RDF Turtle 浏览器输出、book-entry 多文件浏览器输入、编辑器 UI 设计或图布局算法。

这些对象拥有不同输入、消费者和验收面。它们不能替代当前对象，也不能作为当前对象未完成时的解释。

## 16. 完成定义

当浏览器消费者从 `asciidoc-abundant-tree/browser` 导入 `parseAbundantTreeFromSource`，把输入框中的 AsciiDoc 字符串交给该函数，并在 Chromium 中得到与 Node 单文件 parser 核心字段等价的 `AbundantDocument`，且前端图消费者能从该对象读取节点、节点属性、xref 边、边属性、连接关系和源坐标时，当前对象完成。

当实现同时满足语义干净、控制流干净、数据流干净、架构干净、测试干净和文档干净的标准时，当前对象优秀。
