# Heading Inline Metadata Macro Design

本文档定义 `asciidoc-abundant-tree` 的 heading inline metadata macro。接手实现的开发者应能只依赖当前代码库与本文档完成开发、测试、样例更新和 review。

执行命令的工作目录是：

```bash
micheng-ts/projects/asciidoc-abundant-tree
```

本文档中的路径均相对于 `micheng-ts/projects/asciidoc-abundant-tree/`。

## 1. 对象定义

heading inline metadata macro 是 AsciiDoc 正文中的 `hmeta` inline macro。它把句子中的短字段写法解释为当前 heading 的 direct metadata field，并在 AST 中保留该宏 occurrence 的 source evidence。

Canonical authored surface：

```asciidoc
hmeta:<field>[<value>, label=<display>]
```

示例：

```asciidoc
[#required-rule]
== 约束规则

约束规则当前处于 hmeta:status[active, label=生效] 状态，优先级为 hmeta:priority[normal, label=普通]。
它由 hmeta:owner[docs-team] 维护，角色是 hmeta:role[rule, label=规则节点]。
```

该示例在 RDF12 heading projection 中产生 heading direct field facts：

```ttl
:requiredRuleHeading aat:status "active" ;
    aat:priority "normal" ;
    aat:owner "docs-team" ;
    aat:role "rule" .
```

`value` 是结构值。它进入 AST occurrence，并作为 RDF heading field fact 的 literal object。

`label` 是显式显示文本。它只服务 reader-facing conversion output；RDF object 仍由 `value` 提供。

## 2. 当前代码事实

本节记录实现前必须尊重的现有事实。这里的事实用于确定改造边界；目标契约在后续章节定义。

### 2.1 Heading attrlist metadata

heading 前的 attrlist 已经进入 `SectionNode.metadata`。

源表面：

```asciidoc
[#structure-example.process, status=draft, owner=docs-team]
== 结构示例
```

当前 parser 输出中，attrlist 被表示为 `MetadataNode`：

- `ids: ["structure-example"]`
- `roles: ["process"]`
- `attributes.status = "draft"`
- `attributes.owner = "docs-team"`

当前 RDF12 projection 中，`src/rdf12-projection/attributes.ts` 把 heading metadata roles 和 named attributes 投影为 heading direct predicates：

```ttl
:heading aat:addressLabel "structure-example" ;
    aat:role "process" ;
    aat:status "draft" ;
    aat:owner "docs-team" .
```

当前实现会保留同一 predicate 的多个不同 object。示例：

```asciidoc
[#multi.first.second, role=attr-role]
== Multi

role:: desc-role
```

当前 RDF 中同一 heading 会包含多个 `aat:role` object：

```ttl
:heading aat:role "first", "second", "attr-role", "desc-role" .
```

该多值行为是忠实投影原则的基础：投影层传递字段事实，同一 predicate 的不同 object 都保留为图中事实。

### 2.2 Heading description metadata

heading 下方开头连续出现的 plain description list run 已经被 `src/heading-description-metadata.ts` 吸收为 `section.descriptionMetadata`。

源表面：

```asciidoc
[#required-rule.rule, status=active]
== 约束规则

priority:: normal
summary::
约束规则集中说明结构示例必须满足的条件。
多行说明保留为同一个标题字段。
```

当前 parser 输出中，`priority` 和 `summary` 进入 `HeadingDescriptionMetadataNode`。`entries` 保留条目证据；`fields` 是便捷视图。

当前实现只吸收满足以下条件的 leading description list run：

- description list 位于 section 开头，空行不打断该开头区域。
- list 无 id、title、style 和 block metadata。
- list item description 只包含文本和允许的 inline occurrence。
- list run 中不存在 nested description list。
- list run 中不存在 attached structural block。

被吸收的 description list 从 `section.children` 中移除，不再作为普通正文列表出现。

`role:: rule` 在 description metadata 中是普通 heading field fact。当前 RDF projection 输出：

```ttl
:heading aat:role "rule" .
```

`hmeta:role[rule]` 必须与该语义对齐：field name 是 `role`，predicate 是 `aat:role`。

当前 `attributes.ts` 投影 description metadata 时使用 `descriptionMetadata.fields`。该便捷视图对同一 description metadata run 内的 duplicate key 只保留最后一个值，因此早先 duplicate entry 不会进入 RDF。忠实投影目标要求 RDF projection 改为消费 `descriptionMetadata.entries`，让每个 description metadata entry 都能成为 field fact。

### 2.3 Direct field predicate

`src/rdf12-projection/field-predicate.ts` 定义字段名到 RDF predicate 的统一映射：

```ts
export function fieldPredicate(fieldName: string): Rdf12IriTerm
```

安全字段名映射为 `aat:<fieldName>`。不能直接作为 prefixed local name 的字段名映射为 `aat:field-<encoded>`。

heading attrlist metadata、heading description metadata 和 heading inline metadata 使用同一套 field predicate 规则。

### 2.4 Inline occurrence scanner

`src/inline-occurrence-scanner.ts` 当前识别以下 inline occurrences：

- shorthand xref：`<<target,label>>`
- macro xref：`xref:target[label, rel=...]`
- double bracket anchor：`[[id,reftext]]`
- anchor macro：`anchor:id[reftext]`

当前 scanner 不识别 `hmeta`。未实现前，`hmeta:status[active]` 只保留在 paragraph text 中，不进入 `children`，不进入 document-level occurrence catalog，不进入 RDF。

现有 inline occurrence 管线已经提供 hmeta 应复用的 source evidence 机制：

- 在 official block surface 的 scannable source range 中扫描 source text。
- 为 occurrence 生成 `raw` 和 `sourceSpan`。
- book-entry/source-aware 模式下恢复 origin source layer。
- 去重并按 source span 排序。
- 通过 section scope 设置 `containingSectionId`。
- 在 official projector 中挂回对应文本节点的 `children`。
- 在 `AbundantDocument` 上保留 document-level occurrence catalog。

hmeta 复用该 occurrence 管线；hmeta 的 RDF 输出属于 heading metadata field 投影。

### 2.5 Scannable block policy

`src/official-block-policy.ts` 当前定义：

- `scan`：`admonition`、`dlist`、`list_item`、`paragraph`、`table`、`verse`
- `recurse`：`example`、`olist`、`quote`、`section`、`sidebar`、`ulist`、`open`
- `skip`：`listing`、`literal`、`pass`、`stem`
- `diagnostic`：未知 context

table 扫描已有专门逻辑，只扫描 official table cell ranges，不扫描 delimiter、separator 或不属于 official cell 的 source line。

hmeta scanner 必须复用该 policy 和 table range 逻辑。

### 2.6 Macro argument parser

当前 `src/macro-argument-parser.ts` 使用逗号切分参数。它能解析：

```text
active, label=生效
```

为：

```json
{
  "positional": ["active"],
  "named": { "label": "生效" }
}
```

它不能正确解析 quoted comma：

```text
"hello, world", label="你好，世界"
```

当前结果会把 `"hello, world"` 拆成两个 positional item，并保留引号。hmeta public surface 承诺 quoted comma 时，必须新增或升级 inline macro attribute parser。

### 2.7 Asciidoctor.js inline macro extension

当前项目使用 `@asciidoctor/core` `3.0.4`。

实验确认：Asciidoctor.js inline macro extension callback 在 `load()` 后不执行，`getSource()` 后不执行，`getContent()` 和 `convert()` 时执行，且可重复执行。callback 能取得 macro target、parsed attributes、parent block、parent block source line；callback 不提供 macro 自身 source column。

因此 Asciidoctor.js extension 只负责 conversion display。结构事实必须由 source scanner 提取。

## 3. 需求缺口

作者在 heading body 的自然语言句子中表达短字段时，当前系统没有结构化入口。

示例句子：

```asciidoc
约束规则当前处于生效状态，优先级为普通。
```

该句子包含两个短字段事实：

- `status = active`
- `priority = normal`

现有 attrlist 可以在 heading 前表达短字段。现有 heading description metadata 可以在 heading 下开头字段区表达短字段和多行字段。两者都不表达“句子中的这个词组同时是读者文本和结构字段”。

`hmeta` 补足该句内字段入口：

- source text 仍是自然语言句子。
- 被标记词组有 reader-facing display。
- 被标记词组有 stable field value。
- field fact 归属于 macro 所在 source position 的 owner heading。
- RDF12 projection 输出 heading direct predicate。

多行字段继续由 heading description metadata 承担。`hmeta` 只表达句内短 literal field value。

## 4. 公共源表面

### 4.1 Canonical surface

```asciidoc
hmeta:<field>[<value>, label=<display>]
```

示例：

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态。
```

解释结果：

- field name：`status`
- field value：`active`
- explicit label：`生效`
- effective display text：`生效`

### 4.2 Value-only surface

当结构值本身适合读者阅读时，`label` 可以省略：

```asciidoc
该规则由 hmeta:owner[docs-team] 维护。
```

解释结果：

- field name：`owner`
- field value：`docs-team`
- explicit label：不存在
- effective display text：`docs-team`

AST occurrence 不把 fallback display text 存入 `label`。`label` 字段只保存作者显式写出的 `label=`。

### 4.3 Named value surface

```asciidoc
hmeta:status[value=active, label=生效]
```

该 surface 与 `hmeta:status[active, label=生效]` 具有同一结构解释：

- field name：`status`
- field value：`active`
- explicit label：`生效`

`value=` 只改变结构值的书写方式，不改变 owner heading 或 RDF predicate 规则。

### 4.4 Quoted comma value

值中包含逗号时使用引号：

```asciidoc
hmeta:summary["hello, world", label="你好，世界"]
```

解释结果：

- field name：`summary`
- field value：`hello, world`
- explicit label：`你好，世界`

实现必须支持 quoted comma。未加引号的逗号按 inline macro attribute 分隔符处理；实现不得猜测合并被拆开的 positional arguments。

### 4.5 Multiple occurrences in prose

一个句子可以包含多个 hmeta occurrences：

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态，优先级为 hmeta:priority[normal, label=普通]。
```

两个 occurrence 分别产生两个 heading field facts：

```ttl
:heading aat:status "active" ;
    aat:priority "normal" .
```

## 5. 解释规则

### 5.1 Field name extraction

`hmeta` macro target 是 field name。

```asciidoc
hmeta:status[active, label=生效]
```

field name 是 `status`。

实现只从 macro target 取得 field name。`label`、field value、display text 和 surrounding prose 不参与 field name 推断。

### 5.2 Field value extraction

field value 按以下顺序取得：

1. named `value` attribute。
2. first positional argument。

示例：

```asciidoc
hmeta:status[active, label=生效]
hmeta:status[value=active, label=生效]
```

两者的 field value 都是 `active`。

完整匹配的 `hmeta:<field>[...]` 缺少 field value 时，不产生 heading field fact，并产生 warning diagnostic：

```text
heading-inline-metadata.missing-value
```

diagnostic source 指向 hmeta macro source span。

不完整 macro text 不进入 hmeta occurrence。scanner 不对未完整匹配的文本做猜测式诊断。

### 5.3 Explicit label and display text

explicit label 来自 named `label` attribute。

effective display text 按以下顺序取得：

1. explicit label。
2. field value。

effective display text 只服务 conversion output。它不进入 RDF field value。

### 5.4 Owner heading

owner heading 是 hmeta occurrence source position 所在的 section scope。

single-file 模式下，scanner 使用现有 `sectionByLine` 机制为 occurrence 设置 `containingSectionId`。

book-entry 模式下，scanner 使用现有 source scope index 为 occurrence 设置 `containingSectionId`。

RDF projection 使用 occurrence 的 `containingSectionId` 或 source line ownership 找到 owner heading resource。

### 5.5 Repeated field facts

同一 owner heading 上同一 field name 可以出现多个 field facts。RDF projection 保留这些事实。

示例：

```asciidoc
[#rule, status=draft]
== 规则

status:: active

正文中又标记为 hmeta:status[ready, label=可复核]。
```

目标 RDF 包含多个 `aat:status` object：

```ttl
:ruleHeading aat:status "draft", "active", "ready" .
```

RDF projection 为每个 field fact 写出一个 heading direct predicate triple。不同 object value 均保留。

RDF graph 中至多存在一个完全相同的 subject-predicate-object triple。不同 object value 是不同图事实，必须保留。

### 5.6 Role field

`role` 是普通 field name。

```asciidoc
hmeta:role[rule, label=规则节点]
```

产生 heading direct field：

```ttl
:heading aat:role "rule" .
```

该行为与 heading description metadata 中的 `role:: rule` 对齐。`samples/basic-rdf-projection/validate_with_shacl.mjs` 通过 `aat:role` 与 `structure-model.ttl` 中的 `ex:roleName` 建立 class assertion；hmeta role field 必须进入同一 predicate。

## 6. 内部对象模型

### 6.1 Occurrence node

`src/model.ts` 增加 `HeadingInlineMetadataOccurrenceNode`。

目标形状：

```ts
export type HeadingInlineMetadataOccurrenceNode = NodeBase & {
  kind: "headingInlineMetadata";
  syntax: "macro";
  raw: string;
  field: string;
  value: string;
  label?: string;
  sourceSpan?: SourceSpan;
  containingSectionId?: string;
};
```

`label` 只保存显式 `label=`。`value` 缺失的完整 match 不进入该 node；缺失值只进入 diagnostic。

如果 implementation 已经在其他 occurrence node 的 `source` 中保存 `SourceLayer`，hmeta occurrence 也必须保存同类 source layer。book-entry 模式下，origin recovery 成功后 `source.relativePath` 和 `source.line` 指向 origin file。

### 6.2 Document catalog

`AbundantDocument` 增加 document-level catalog：

```ts
headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
```

该 catalog 与 `xrefOccurrences`、`anchorOccurrences` 同层。

### 6.3 Node children

可扫描文本节点的 `children` 可以包含 `HeadingInlineMetadataOccurrenceNode`。

适用位置：

- paragraph。
- description term。
- description。
- table node children for scannable table cell ranges。

table 不在本任务中新增 per-cell text AST。hmeta 在 table scannable cell 中出现时，进入 document-level catalog 和 table node children，沿用当前 table occurrence placement。

实现必须避免 parent/child 重叠范围导致同一 occurrence 重复挂载。

### 6.4 Separation from description metadata

`HeadingInlineMetadataOccurrenceNode` 不写入 `section.descriptionMetadata.entries`。

原因：

- `descriptionMetadata.entries` 表示 leading description list source surface。
- `headingInlineMetadata` 表示 inline macro source surface。
- 两者可以投影到同一个 heading field predicate，但 AST source object 不同。

## 7. Asciidoctor.js conversion contract

### 7.1 Purpose

Asciidoctor.js `hmeta` inline macro registration 只服务 conversion display。它使 ordinary Asciidoctor conversion 输出 reader-facing display text，而不是 raw macro syntax。

Parser construction、AST occurrence、RDF projection 不依赖 conversion callback side effects。

### 7.2 Registration point

`src/asciidoctor-adapter.ts` 是当前 processor construction point。若该文件继续唯一创建 `@asciidoctor/core` processor，`hmeta` extension registry 必须在该 adapter 中注册或组合。

实现不得在 CLI 层创建第二个 Asciidoctor processor 来处理 hmeta。

### 7.3 Conversion display

Registration layer 与 source scanner 必须共享 hmeta attribute interpretation helper：

- first positional argument maps to `value`。
- named `value` overrides positional value。
- named `label` controls explicit label。
- effective display text is `label ?? value`。

示例 extension shape：

```ts
const registry = processor.Extensions.create();

registry.inlineMacro("hmeta", function () {
  const self = this;
  self.positionalAttributes("value");
  self.process(function (parent, target, attributes) {
    const parsed = interpretHeadingInlineMetadataAttributes(target, attributes);
    return self.createInline(parent, "quoted", parsed.displayText, {
      type: "mark",
    });
  });
});
```

Actual inline node kind may be span/pass/quoted. Conversion output must show effective display text for valid hmeta values.

### 7.4 Callback boundary

The parser must not collect hmeta facts from `getContent()` or `convert()` callback execution.

Reasoning facts confirmed against `@asciidoctor/core` `3.0.4`:

- Inline macro processors execute during inline conversion.
- `load()` does not produce hmeta occurrence nodes.
- `getSource()` does not execute the processor.
- `getContent()` and `convert()` can execute the processor repeatedly.
- Callback source evidence lacks macro column.

## 8. Source scanner design

### 8.1 Integration point

Implement hmeta scanning in the existing inline occurrence path:

- Extend `src/inline-occurrence-scanner.ts`; or
- Add a dedicated hmeta scanner invoked by `src/source-surfaces.ts`.

The implementation must preserve existing xref and anchor behavior.

`scanInlineOccurrencesInOfficialBlocks()` should return:

```ts
{
  xrefOccurrences: XrefOccurrenceNode[];
  anchorOccurrences: AnchorOccurrenceNode[];
  headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
}
```

### 8.2 Match pattern

Scanner recognizes complete raw macro occurrences:

```text
hmeta:<target>[<attributes>]
```

`target` must be non-empty and must not contain whitespace or `[`.

The source span must cover the complete raw macro. For:

```asciidoc
hmeta:status[active, label=生效]
```

start column points to `h`; end column points after `]`.

Multiple hmeta occurrences in one line must have distinct source columns. hmeta occurrences in multiline paragraphs must use their actual source line and column, not parent paragraph start coordinates.

### 8.3 Attribute parser

hmeta attribute parser must support:

```text
active, label=生效
```

as:

```json
{
  "positional": ["active"],
  "named": { "label": "生效" }
}
```

and:

```text
"hello, world", label="你好，世界"
```

as:

```json
{
  "positional": ["hello, world"],
  "named": { "label": "你好，世界" }
}
```

Backslash-comma is not a merge rule for hmeta.

Implementation may:

- Extend `parseMacroArguments()` to support quoted strings while preserving existing xref tests; or
- Add a new parser such as `parseInlineMacroAttributes()` and migrate only hmeta initially.

The parser must have focused tests before scanner tests depend on it.

### 8.4 Scannable contexts

hmeta scanning must follow the same scannable range policy used by xref/anchor scanning.

Required scannable surfaces:

- paragraph text。
- description list term text。
- description text。
- table official scannable cell ranges。
- other `officialBlockPolicy(context) === "scan"` prose ranges already scanned by inline occurrence scanner.

Required skipped surfaces:

- listing。
- literal。
- pass。
- stem。
- unscannable descendant ranges inside otherwise scannable containers。
- diagnostic policy blocks。

### 8.5 Description list handling

description list term and description text can contain hmeta.

Example:

```asciidoc
规则状态 hmeta:status[active, label=生效]:: 用于展示字段。
```

The occurrence belongs to the section scope containing the description list source position.

If a leading description list run is otherwise eligible for heading description metadata absorption, the presence of hmeta occurrence children in terms or descriptions must not make it ineligible. `src/heading-description-metadata.ts` must treat `headingInlineMetadata` as an allowed inline occurrence child when validating plain heading metadata lists.

### 8.6 Source recovery

single-file mode stores logical source spans directly.

book-entry mode first scans logical text, then uses the existing source-aware recovery mechanism to recover origin source layer.

On source recovery failure:

- Keep the occurrence if it has logical source evidence.
- Record the recovery diagnostic through existing tool diagnostic mechanisms.
- Do not fabricate origin file identity.

### 8.7 Containing section assignment

hmeta occurrences use the same containing section assignment branches as xref and anchor occurrences:

- single-file: `sectionByLine`
- book-entry: source scope index

The assigned `containingSectionId` must be available before RDF projection.

## 9. RDF12 projection contract

### 9.1 Direct predicate output

Each hmeta field fact outputs one heading direct predicate triple.

Source:

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态。
```

RDF:

```ttl
:heading aat:status "active" .
```

Predicate is `fieldPredicate(field)`. Object is string literal field value.

### 9.2 Faithful repeated facts

RDF projection preserves repeated field facts.

If multiple facts share the same owner heading and field predicate but have different values, RDF contains multiple objects:

```ttl
:heading aat:status "draft", "active", "ready" .
```

RDF projection emits one direct predicate triple for each collected field fact. Repeated facts with different object values remain visible as multiple objects for the same predicate.

### 9.3 Field fact sources

RDF heading direct field projection should be implemented as field fact collection followed by triple writing.

Recommended internal shape:

```ts
type HeadingFieldFact = {
  owner: SectionNode;
  field: string;
  value: string;
  sourceKind:
    | "attrlist-role"
    | "attrlist-attribute"
    | "description-metadata"
    | "heading-inline-metadata";
  sourceSpan?: SourceSpan;
};
```

The collector must include:

- one fact per attrlist role。
- one fact per attrlist named attribute。
- one fact per `HeadingDescriptionMetadataEntry`。
- one fact per valid hmeta occurrence。

An RDF graph contains at most one identical subject-predicate-object triple. Different object values must remain present.

### 9.4 Description metadata projection correction

`HeadingDescriptionMetadataNode.fields` remains useful as an AST convenience view. RDF projection must use `descriptionMetadata.entries` to preserve duplicate description metadata facts.

Example:

```asciidoc
owner:: ops
owner:: platform
```

RDF must preserve both facts:

```ttl
:heading aat:owner "ops", "platform" .
```

### 9.5 RDF object source

The RDF object comes from the field value.

Source:

```asciidoc
hmeta:status[active, label=生效]
```

RDF:

```ttl
:heading aat:status "active" .
```

The RDF object is the field value. The display label remains a conversion surface value.

### 9.6 Public RDF surface

The public RDF contract for hmeta is heading direct field triples. The AST/JSON/tree outputs provide source evidence for hmeta occurrences.

## 10. Serialization contract

### 10.1 JSON

JSON serializer must output document-level `headingInlineMetadataOccurrences`.

Example paragraph child:

```json
{
  "kind": "headingInlineMetadata",
  "syntax": "macro",
  "raw": "hmeta:status[active, label=生效]",
  "field": "status",
  "value": "active",
  "label": "生效",
  "sourceSpan": {
    "start": { "line": 5, "column": 8 },
    "end": { "line": 5, "column": 39 }
  },
  "containingSectionId": "required-rule"
}
```

When label is absent, JSON must omit `label` instead of writing a fallback label.

### 10.2 Tree format

Pretty tree format must expose hmeta occurrence as a child node and/or occurrence catalog entry. Tree output must not hide hmeta while JSON exposes it.

Stable serializer key order should place `headingInlineMetadataOccurrences` near `xrefOccurrences` and `anchorOccurrences`.

## 11. Source code change design

### 11.1 `src/model.ts`

Add `HeadingInlineMetadataOccurrenceNode`.

Add the node to `AbundantNode`.

Add `headingInlineMetadataOccurrences` to `AbundantDocument`.

### 11.2 `src/macro-argument-parser.ts`

Add quoted-string aware parsing for hmeta attributes.

If existing `parseMacroArguments()` is extended, all current xref parser tests must keep passing.

If a new parser is added, hmeta scanner and Asciidoctor conversion helper must use it consistently.

### 11.3 `src/inline-occurrence-scanner.ts`

Add hmeta scanning alongside xref and anchor scanning, or delegate hmeta matching to a dedicated helper.

Responsibilities:

- find complete raw `hmeta:<field>[...]` occurrences。
- parse field/value/label。
- create `HeadingInlineMetadataOccurrenceNode` for valid occurrences。
- emit `heading-inline-metadata.missing-value` diagnostic for complete matches without value。
- recover source origins。
- dedupe occurrences。
- sort by source span。

Existing xref and anchor behavior must remain unchanged.

### 11.4 `src/source-surfaces.ts`

Add hmeta occurrences to `SourceSurfaces`.

Assign containing section ids to hmeta occurrences with the same single-file and book-entry branches used by xref and anchor.

Return hmeta occurrences to parser core.

### 11.5 `src/official-projector.ts`

Add hmeta occurrences to `ProjectContext`.

Build grouped-by-line lookup for hmeta, matching xref/anchor lookup style.

Paragraph projection must include hmeta occurrence children sorted with xref and anchor by source position.

Description term and description text projection must include hmeta occurrence children only when the occurrence source span belongs to that term/description span.

Table projection must include hmeta occurrences from official scannable cell ranges in table node children, matching current table occurrence placement.

### 11.6 `src/heading-description-metadata.ts`

Treat `headingInlineMetadata` as an allowed inline occurrence child when deciding whether a leading description list run is plain heading metadata.

Do not write hmeta occurrences into `descriptionMetadata.entries`.

### 11.7 `src/parser-core.ts`

Construct `AbundantDocument.headingInlineMetadataOccurrences`.

Preserve diagnostics from missing values and source recovery failures in `toolDiagnostics`.

### 11.8 `src/rdf12-projection/attributes.ts`

Project hmeta fields to owner headings.

Refactor heading direct field projection around field facts:

- collect attrlist role facts。
- collect attrlist named attribute facts。
- collect description metadata entry facts。
- collect hmeta occurrence facts。
- write one RDF direct predicate triple per fact。

Repeated facts are written as repeated RDF field facts.

### 11.9 `src/asciidoctor-adapter.ts`

Register `hmeta` inline macro extension in the Asciidoctor processor used by parser/conversion.

Conversion output must display effective display text.

The extension must not mutate global shared state to collect projection data.

### 11.10 `src/serializers.ts`

Add `headingInlineMetadataOccurrences` to stable serialization order.

Ensure tree formatting displays hmeta occurrence nodes with field and value.

## 12. Tests

Testing must be layered. A single acceptance test cannot substitute for parser, scanner, projection, conversion and serialization tests.

### 12.1 Argument parser tests

File:

```text
test/macro-argument-parser.test.ts
```

Required additions:

1. `active, label=生效` parses positional value and named label。
2. `"hello, world", label="你好，世界"` parses quoted comma value and quoted label without quotes。
3. `value=active, label=生效` parses named value。
4. Empty named value remains distinguishable from missing argument according to parser contract。
5. Existing xref argument parser behavior remains compatible。

### 12.2 Parser scanner tests

File:

```text
test/heading-inline-metadata.test.ts
```

Required cases:

1. Paragraph hmeta occurrence creates document-level occurrence。
2. Occurrence has raw, field, value, explicit label and sourceSpan。
3. Occurrence without label stores no `label`。
4. Named `value=` surface matches positional value surface。
5. Quoted comma value is parsed as one value。
6. Missing value creates warning diagnostic and no occurrence node。
7. Multiple hmeta occurrences in one line have distinct source columns。
8. Multiple hmeta occurrences in multiline paragraph have actual line numbers。
9. Listing block content containing `hmeta:` is not scanned。
10. Literal/pass/stem content containing `hmeta:` is not scanned。

### 12.3 Section ownership tests

File:

```text
test/heading-inline-metadata-ownership.test.ts
```

Required cases:

1. hmeta under parent section belongs to parent。
2. hmeta under child section belongs to child。
3. hmeta before the first section does not create a heading field。
4. book-entry include file hmeta recovers origin relativePath and owner section。

### 12.4 Description list integration tests

File:

```text
test/parser-description-list.acceptance.test.ts
```

Required additions:

1. hmeta in description term is scanned once and attached to the term。
2. hmeta in description text is scanned once and attached to the description。
3. hmeta in attached listing under description is not scanned。
4. leading description metadata list containing hmeta occurrence children remains absorbable when other plain-list conditions hold。
5. absorbed hmeta occurrence remains in document-level hmeta catalog。

### 12.5 RDF projection tests

File:

```text
test/rdf12-projection/heading-inline-metadata.test.ts
```

Required cases:

1. `hmeta:status[active, label=生效]` outputs `aat:status "active"`。
2. `hmeta:priority[normal]` outputs `aat:priority "normal"`。
3. `hmeta:role[rule, label=规则节点]` outputs `aat:role "rule"`。
4. RDF object comes from field value when label differs from value。
5. RDF output for hmeta is represented by heading direct field triples。
6. multiple hmeta occurrences with same field and different values output multiple RDF objects。
7. attrlist field and hmeta field with same predicate both remain present。
8. description metadata field and hmeta field with same predicate both remain present。
9. duplicate description metadata entries are projected from entries, preserving multiple values。
10. unsafe field name uses `fieldPredicate()` encoded predicate。

### 12.6 Asciidoctor adapter conversion tests

File:

```text
test/asciidoctor-adapter-heading-inline-metadata.test.ts
```

Required cases:

1. Registered hmeta macro converts to explicit label。
2. Registered hmeta macro converts to value when label is absent。
3. Conversion output does not contain raw `hmeta:status[...]` for valid hmeta。
4. Registration works in the current safe mode used by adapter。
5. Registration does not alter parser source text or structural occurrence extraction。

### 12.7 Serialization tests

File:

```text
test/serializers-heading-inline-metadata.test.ts
```

Required cases:

1. JSON includes document-level hmeta occurrence catalog。
2. JSON includes hmeta occurrence as paragraph child。
3. JSON omits `label` when source omits `label=`。
4. Pretty tree format displays hmeta occurrence with field and value。

### 12.8 Basic RDF projection sample tests

Existing sample scripts must remain valid:

```bash
pnpm --silent dev samples/basic-rdf-projection/basic-projection.adoc --format rdf12
uv run samples/basic-rdf-projection/consume_projection.py
node samples/basic-rdf-projection/validate_with_shacl.mjs
node samples/basic-rdf-projection/query_with_oxigraph.mjs
```

If sample source is updated to include hmeta, README pre-generated Turtle and script outputs must be updated in the same change set.

## 13. Sample and documentation updates

### 13.1 `samples/basic-rdf-projection/basic-projection.adoc`

Extend the sample with one hmeta-bearing sentence.

The sample must keep existing demonstrations:

- heading attrlist metadata。
- heading description metadata。
- xref evidence。
- listing ID ownership under the heading label space。
- SHACL validation。
- Oxigraph relation materialization。

Add a field that does not destabilize existing required SHACL constraints unless validation is intentionally extended.

Recommended addition under `== 约束规则`:

```asciidoc
约束规则当前处于 hmeta:review-state[ready, label=可复核]。
```

Expected RDF:

```ttl
:requiredRuleHeading aat:review-state "ready" .
```

### 13.2 `samples/basic-rdf-projection/README.md`

README must document hmeta as the third heading metadata source:

- heading attrlist for short pre-heading fields。
- leading description list for multiline heading fields。
- hmeta for sentence-embedded short fields。

README must explain `label` / `value` separation.

README must update pre-generated Turtle and script outputs when sample facts change.

### 13.3 `docs/关于自定义宏.md`

This document can mention `hmeta` as a project-specific inline macro after implementation.

It must not define parser/projection contract. The contract belongs to this design document and project specification docs.

## 14. Acceptance commands

Run targeted tests:

```bash
pnpm vitest run test/macro-argument-parser.test.ts
```

```bash
pnpm vitest run test/heading-inline-metadata.test.ts
```

```bash
pnpm vitest run test/heading-inline-metadata-ownership.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/heading-inline-metadata.test.ts
```

```bash
pnpm vitest run test/asciidoctor-adapter-heading-inline-metadata.test.ts
```

```bash
pnpm vitest run test/serializers-heading-inline-metadata.test.ts
```

Run integration tests:

```bash
pnpm vitest run test/parser-description-list.acceptance.test.ts
```

```bash
pnpm vitest run test/rdf12-projection
```

Run sample consumers:

```bash
pnpm --silent dev samples/basic-rdf-projection/basic-projection.adoc --format rdf12
```

```bash
uv run samples/basic-rdf-projection/consume_projection.py
```

```bash
node samples/basic-rdf-projection/validate_with_shacl.mjs
```

```bash
node samples/basic-rdf-projection/query_with_oxigraph.mjs
```

Run project checks:

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

All commands must pass before implementation is complete.

## 15. Completion definition

This task is complete when all facts below hold.

- [ ] `hmeta:<field>[<value>, label=<display>]` is parsed as heading inline metadata occurrence.
- [ ] `hmeta:<field>[value=<value>, label=<display>]` has the same structural interpretation.
- [ ] quoted comma values parse as one value.
- [ ] missing value produces diagnostic and no occurrence node.
- [ ] hmeta occurrence has raw source, field, value, optional explicit label, sourceSpan and containing section id.
- [ ] hmeta occurrence appears in document-level occurrence catalog.
- [ ] hmeta occurrence appears in relevant text node children without duplicate emission.
- [ ] hmeta in listing/literal/pass/stem content is not scanned.
- [ ] hmeta owner binding uses source position section scope.
- [ ] book-entry hmeta occurrences recover origin relativePath and source span when recovery succeeds.
- [ ] RDF projection writes heading direct predicate using field value.
- [ ] RDF projection uses `fieldPredicate()` for hmeta field names.
- [ ] RDF projection preserves repeated field facts as multiple RDF objects.
- [ ] RDF projection projects description metadata from `entries`, preserving duplicate term facts.
- [ ] RDF projection writes field value when display label differs from value.
- [ ] RDF hmeta public surface is heading direct field triples.
- [ ] `hmeta:role[...]` outputs `aat:role`.
- [ ] Asciidoctor.js conversion displays effective display text.
- [ ] Asciidoctor.js conversion does not leak raw hmeta syntax for valid hmeta.
- [ ] `samples/basic-rdf-projection` demonstrates hmeta without breaking existing sample consumers.
- [ ] README/sample generated output documents hmeta value/label semantics.
- [ ] Acceptance commands pass.

## 16. Quality bar

An acceptable implementation satisfies the completion definition and keeps existing xref, anchor, description list, table and RDF projection tests passing.

An excellent implementation additionally has these properties:

- The hmeta parser is covered independently from scanner tests.
- The scanner implementation shares existing inline occurrence utilities instead of duplicating source recovery logic.
- The RDF field fact collector is simple enough that adding another heading metadata source would require only one new fact source function.
- Test failures identify the layer that failed: parser, scanner, ownership, RDF projection, conversion, serialization, or sample consumer.
- Sample README shows the exact Turtle and script output changes caused by hmeta.
- Code comments, if any, explain source-coordinate or projection invariants rather than restating control flow.

## 17. Review rules

Review must reject implementations with any of the following properties:

- Parser depends on `getContent()` or `convert()` callback execution to collect hmeta facts.
- Structural field value is derived from display label.
- hmeta source scanner scans skipped block content such as listing, literal, pass or stem.
- hmeta occurrence is stored as a fake description metadata entry.
- RDF projection drops repeated field facts with different values.
- RDF projection reads `descriptionMetadata.fields` as the only source of description metadata RDF facts.
- Sample docs mention hmeta without proving RDF and consumer behavior.
- Serializer exposes hmeta in JSON but hides it from tree output.

Core judgment:

`hmeta` is a sentence-embedded heading metadata field surface. The source scanner owns structural evidence. The Asciidoctor inline macro extension owns reader-facing conversion display. RDF12 projection faithfully exposes resulting field facts as heading direct predicates.

## 18. Commit guidance

The implementation commit message must describe object changes, not author process.

Suggested title:

```text
feat: support sentence-embedded heading metadata macros
```

Suggested body:

```text
- parse hmeta inline macros as source-aware heading metadata occurrences
- project hmeta values as heading direct RDF fields
- preserve repeated heading field facts in RDF projection
- render hmeta macros through an Asciidoctor.js inline extension
- preserve label/value separation across AST, RDF, and conversion surfaces
- document and test source ownership, duplicate facts, and non-scannable block boundaries
```

Commit only task-related paths. New files must be staged before path-limited commit.
