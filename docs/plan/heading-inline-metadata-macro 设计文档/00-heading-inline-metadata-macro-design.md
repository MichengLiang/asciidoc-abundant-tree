# Heading Inline Metadata Macro Design

本文档定义 `asciidoc-abundant-tree` 的 heading inline metadata macro 设计。

本文档是开发设计规约。本文档不是聊天记录、实现日志、用户教程或变更说明。接手实现的开发者只需要当前代码库和本文档即可实施。

执行命令的工作目录是：

```bash
micheng-ts/projects/asciidoc-abundant-tree
```

所有路径均相对于 `micheng-ts/projects/asciidoc-abundant-tree/`。执行者不得把 `/home/t103o/workbench` 当作本任务的项目根。

## 1. 文档对象

heading inline metadata macro 是 AsciiDoc 普通行内文本中的自定义宏。该宏把自然语言句子中的短元信息标记为所属 heading 的 direct metadata field。

公共宏名为 `hmeta`。

canonical authored surface 为：

```asciidoc
hmeta:<field>[<value>, label=<display>]
```

目标行为：

```asciidoc
[#required-rule]
== 约束规则

约束规则当前处于 hmeta:status[active, label=生效] 状态，优先级为 hmeta:priority[normal, label=普通]。
它由 hmeta:owner[docs-team] 维护，角色是 hmeta:role[rule, label=规则节点]。
```

RDF12 heading projection 中的目标事实：

```ttl
:requiredRuleHeading aat:status "active" ;
    aat:priority "normal" ;
    aat:owner "docs-team" ;
    aat:role "rule" .
```

`label` 服务 reader-facing display。`value` 服务 AST、RDF、SHACL、SPARQL 和下游模型。两者属于不同投影面。

## 2. 当前代码事实

本节描述当前代码中与 heading inline metadata macro 相关的事实。当前事实用于定位改造边界，不是目标契约。

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

当前 parser 输出中，`priority` 和 `summary` 进入 `HeadingDescriptionMetadataNode.fields`。

当前实现只吸收满足以下条件的 leading description list run：

- description list 位于 section 开头，空行不打断该开头区域。
- list 无 id、title、style 和 block metadata。
- list item description 只包含文本和允许的 inline occurrence。
- list run 中不存在 nested description list。
- list run 中不存在 attached structural block。

被吸收的 description list 从 `section.children` 中移除。它不再作为普通正文列表出现。

### 2.3 Direct field predicate

`src/rdf12-projection/field-predicate.ts` 已经定义字段名到 RDF predicate 的统一映射：

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

当前 scanner 不识别 `hmeta`。未注册的 `hmeta:status[active]` 在当前 parser 输出中只是 paragraph text，不进入 `children`，不进入 document-level occurrence catalog，不进入 RDF。

### 2.5 Asciidoctor.js inline macro extension

当前项目使用 `@asciidoctor/core` `3.0.4`。

该 runtime 提供 Asciidoctor.js extension registry：

```js
const registry = asciidoctor.Extensions.create();

registry.inlineMacro("hmeta", function () {
  const self = this;
  self.positionalAttributes("value");
  self.process(function (parent, target, attributes) {
    return self.createInline(parent, "quoted", String(attributes.label ?? attributes.value ?? target), {
      type: "mark",
    });
  });
});

asciidoctor.load(source, {
  extension_registry: registry,
});
```

该 processor 在 inline conversion 阶段执行。`load()` 完成后不会产生 `hmeta` AST occurrence。`getSource()` 不触发 processor。`getContent()` 和 `convert()` 触发 processor。

processor 可以取得：

- macro target。
- parsed attributes。
- parent block。
- parent block source line。

processor 不能作为稳定 parse event 使用。processor 不提供 macro 自身的 source column。多行 paragraph 中多个 `hmeta` occurrence 共享 parent paragraph line。

## 3. 当前缺口

作者在 heading body 的自然语言句子中表达短元信息时，当前系统没有结构化入口。

示例：

```asciidoc
约束规则当前处于生效状态，优先级为普通。
```

该句子包含两个短元信息：

- `status = active`
- `priority = normal`

当前 attrlist 可以在 heading 前表达这些字段。当前 heading description metadata 可以在 heading 下开头字段区表达这些字段。两者都不表达“句子中的这个词组同时是读者文本和结构字段”。

目标缺口是句内短元信息的结构化表达通道。该通道必须同时满足：

- 源文本仍是自然语言句子。
- 被标记词组有 reader-facing display。
- 被标记词组有 stable field value。
- field 归属于 macro 所在位置的 owner heading。
- RDF12 projection 输出 heading direct predicate。

多行字段和独立字段块继续由 heading description metadata 承担。heading inline metadata macro 不承载多行 raw value。

## 4. 目标对象定义

heading inline metadata macro 是 `hmeta` inline macro occurrence。

它的构成性条件：

- macro name 是 `hmeta`。
- macro 出现在 scannable inline text surface 中。
- macro target 是 field name。
- macro attribute value 是 field value。
- macro attribute label 是 display label。
- macro source position 归属一个 owner heading。
- owner heading 获得一个 direct metadata field。

`hmeta` occurrence 是源表面证据。heading direct metadata field 是目标结构事实。

一个 `hmeta` occurrence 不创建 xref edge，不创建 target alias，不解析 raw value，不建立跨 heading relation。

## 5. 术语

### 5.1 hmeta occurrence

hmeta occurrence 是源文档中的一次 `hmeta:<field>[...]` macro occurrence。

每个 occurrence 保存：

- raw source。
- source span。
- field name。
- field value。
- display label。
- containing section selector。

### 5.2 Field name

field name 是 macro target。

源表面：

```asciidoc
hmeta:status[active, label=生效]
```

`status` 是 field name。

RDF predicate 由 `fieldPredicate("status")` 产生。

### 5.3 Field value

field value 是结构值。

field value 来自 named `value` attribute。若 named `value` 不存在，则来自第一个 positional argument。

源表面：

```asciidoc
hmeta:status[active, label=生效]
```

`active` 是 field value。

等价显式表面：

```asciidoc
hmeta:status[value=active, label=生效]
```

### 5.4 Display label

display label 是 reader-facing text。

display label 来自 named `label` attribute。

源表面：

```asciidoc
hmeta:status[active, label=生效]
```

`生效` 是 display label。

display label 不参与 RDF field value。display label 不作为 heading 上的 `aat:label` 输出。

### 5.5 Owner heading

owner heading 是 hmeta occurrence 所属的 heading。

owner heading 由 occurrence 的 source position 与 section scope 决定。默认规则是：macro 所在源码位置的最近 section heading 是 owner heading。

owner heading 不通过 `for=`、target selector、headline text 或 generated id 推断。

### 5.6 Direct metadata field

direct metadata field 是 heading resource 上的 literal field。

源表面：

```asciidoc
hmeta:priority[normal, label=普通]
```

目标 RDF：

```ttl
:heading aat:priority "normal" .
```

## 6. 源表面规范

### 6.1 Canonical surface

canonical surface：

```asciidoc
hmeta:<field>[<value>, label=<display>]
```

示例：

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态。
```

解释：

- `hmeta` 是 macro name。
- `status` 是 field name。
- `active` 是 field value。
- `生效` 是 display label。

### 6.2 Value-only surface

当结构值本身适合读者阅读时，`label` 可以省略：

```asciidoc
该规则由 hmeta:owner[docs-team] 维护。
```

解释：

- field name 是 `owner`。
- field value 是 `docs-team`。
- display text 回退为 `docs-team`。

### 6.3 Named value surface

Named value surface：

```asciidoc
hmeta:status[value=active, label=生效]
```

该表面与 `hmeta:status[active, label=生效]` 具有同一解释结果。

`value=` 用于需要显式命名结构值的文本。它不改变 field name、display label 或 owner heading 规则。

### 6.4 Quoted comma value

值中包含逗号时必须使用引号：

```asciidoc
hmeta:summary["hello, world", label="你好，世界"]
```

该 surface 的 field value 是 `hello, world`。

未加引号的逗号按 Asciidoctor attrlist 分隔规则处理。实现不得猜测合并被拆开的 positional arguments。

### 6.5 Multiple hmeta occurrences in prose

一个句子可以包含多个 hmeta occurrences：

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态，优先级为 hmeta:priority[normal, label=普通]。
```

两个 occurrence 分别产生两个 heading direct metadata fields。

## 7. 解释规则

### 7.1 Field extraction

`hmeta` macro target 必须作为 field name。

实现不得从 `label`、`value`、display text、paragraph text 或 surrounding sentence 推断 field name。

### 7.2 Value extraction

field value 按以下顺序取得：

1. named `value` attribute。
2. first positional argument。

缺少 field value 时，该 occurrence 不产生 heading direct metadata field。

缺少 field value 的 occurrence 必须产生 warning diagnostic：

```text
heading-inline-metadata.missing-value
```

diagnostic source 指向 hmeta macro source span。

### 7.3 Display extraction

display text 按以下顺序取得：

1. named `label` attribute。
2. field value。

display text 只服务 conversion output 与 reader-facing surface。display text 不进入 RDF field value。

### 7.4 Owner binding

owner heading 由 occurrence source position 绑定。

实现使用现有 section scope 机制给 hmeta occurrence 设置 `containingSectionId`。RDF projection 使用 `containingSectionId` 或 source line ownership 找到 heading resource。

绑定规则：

- occurrence 位于 section body 中时，owner 是该 section。
- occurrence 位于 child section body 中时，owner 是 child section。
- occurrence 位于 listing/source/pass/literal content 中时，不创建 occurrence。
- occurrence 位于不可扫描 official block 中时，不创建 occurrence。

第一版目标对象不定义 cross-heading `for=` binding。`for=` 不属于 hmeta public surface。

### 7.5 Duplicate field rule

同一 owner heading 上同一 field name 可以出现多个来源。

字段视图使用 source order last-wins。

source order 定义：

- heading attrlist metadata 位于其 metadata source line。
- heading description metadata entry 位于其 term source line。
- hmeta occurrence 位于其 macro source span start。

同一 field 的所有 occurrence evidence 保留在 AST occurrence catalog 中。RDF heading direct predicate 输出最终 field view。

该规则与 `HeadingDescriptionMetadataNode.fields` 的 duplicate key last-wins 行为对齐。

### 7.6 Role field

`hmeta:role[rule, label=规则节点]` 输出 heading direct field：

```ttl
:heading aat:role "rule" .
```

`role` 不因来源为 hmeta 而进入 `aat:field-role` 或其它 predicate。

下游 role class mapping 继续消费 `aat:role`。

## 8. 内部对象模型

### 8.1 New occurrence node

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

`value` 缺失的 source match 不进入该 node。缺失值只进入 diagnostic。

### 8.2 Document catalog

`AbundantDocument` 增加 document-level catalog：

```ts
headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
```

该 catalog 与 `xrefOccurrences`、`anchorOccurrences` 同层。

### 8.3 Node children

可扫描文本节点的 `children` 可以包含 `HeadingInlineMetadataOccurrenceNode`。

适用节点：

- paragraph。
- description term。
- description。
- table scannable cell projection 中的文本节点或对应 occurrence catalog。

实现必须避免在 parent block 与 child block 中重复挂载同一 occurrence。

### 8.4 Source provenance

每个 occurrence 必须保存：

- `raw`。
- logical sourceSpan。
- recovered source layer。

book-entry 模式下，source-aware recovery 必须把 occurrence source 恢复到 origin file。失败时按现有 inline occurrence recovery 方式产生 diagnostic，不得伪造 origin coordinate。

### 8.5 Separation from description metadata

`HeadingInlineMetadataOccurrenceNode` 不写入 `section.descriptionMetadata.entries`。

理由：

- `descriptionMetadata` 表示 leading description list source surface。
- `headingInlineMetadata` 表示 inline macro source surface。
- 两者共享目标 field projection，不共享 AST source object。

实现可以在 RDF projection 阶段聚合三类来源：

- heading attrlist metadata。
- heading description metadata。
- heading inline metadata occurrences。

## 9. Asciidoctor.js registration contract

### 9.1 Registration purpose

Asciidoctor.js `hmeta` inline macro registration 服务 conversion display。

它保证 ordinary Asciidoctor conversion 不把 `hmeta:status[active, label=生效]` 原样泄漏到 HTML/PDF text surface。

它不作为 parser occurrence source。

### 9.2 Registration API

实现使用 Asciidoctor.js extension registry：

```ts
const registry = processor.Extensions.create();

registry.inlineMacro("hmeta", function () {
  const self = this;
  self.positionalAttributes("value");
  self.process(function (parent, target, attributes) {
    const display = attributes.label ?? attributes.value ?? target;
    return self.createInline(parent, "quoted", String(display), {
      type: "mark",
    });
  });
});
```

实际 implementation 可以返回 span/pass/quoted inline。conversion output 必须显示 `label ?? value`。

### 9.3 Registry construction point

`src/asciidoctor-adapter.ts` 是当前 processor construction point。

若该文件继续唯一创建 `@asciidoctor/core` processor，`hmeta` extension registry 必须在该 adapter 中注册或组合。

实现不得在 CLI 层创建第二个 Asciidoctor processor 来处理 hmeta。

### 9.4 Shared parsing rule

Registration layer 与 source scanner 必须共享同一参数解释规则：

- first positional argument maps to `value`。
- named `value` overrides positional value。
- named `label` controls display。

实现可以通过共享 helper 保证该规则一致。

### 9.5 Conversion callback boundary

Parser construction must not depend on conversion callback side effects.

理由：

- Inline macro processors execute during inline conversion.
- `load()` does not produce hmeta occurrence nodes.
- conversion callback does not expose macro source columns.
- repeated `getContent()` / `convert()` can execute the processor more than once.

Source-aware RDF projection 必须使用 source scanner 提取 hmeta occurrences。

## 10. Source scanner design

### 10.1 Scanner input

Scanner 使用现有 line table、official block surfaces 和 source intervals。

目标集成点：

- 扩展 `src/inline-occurrence-scanner.ts`。
- 或新增 `src/heading-inline-metadata-scanner.ts` 并由 `source-surfaces.ts` 调用。

实现必须复用现有 scannable range policy。

### 10.2 Match pattern

Scanner 识别：

```text
hmeta:<target>[<attributes>]
```

`target` 不包含 whitespace 和 `[`。

attribute text 使用 hmeta argument parser 解释。Parser 必须支持 quoted comma。

### 10.3 Source span

Scanner 对每个 match 调用 `sourceSpanForRange()` 生成 macro source span。

source span 必须覆盖完整 raw macro：

```asciidoc
hmeta:status[active, label=生效]
```

start column 指向 `h`，end column 指向 `]` 之后。

多行 paragraph 中的 hmeta occurrences 必须获得各自实际行号和 column。实现不得使用 parent paragraph start line 替代 macro line。

### 10.4 Scannable contexts

hmeta scanner 扫描与 xref/anchor scanner 同类的 macro-substituted prose。

扫描范围：

- paragraph。
- description list term text。
- description text。
- table ordinary scannable cells。
- metadata lines that already allow inline macro scan, if hmeta appears in title metadata and target object is clear.

不扫描范围：

- listing。
- source block content。
- literal。
- pass。
- diagnostic policy blocks。
- unscannable descendant ranges。

### 10.5 Description list handling

description list term 和 description text 可以承载 hmeta。

示例：

```asciidoc
规则状态 hmeta:status[active, label=生效]:: 用于展示字段。
```

term 中的 occurrence 属于所在 section。

description 中的 occurrence 属于所在 section。

Nested listing/source/pass block 内部 occurrence 不扫描。

### 10.6 Book-entry recovery

book-entry 模式下，scanner 先在 logical text 中得到 logical source span。

随后使用现有 source-aware recovery 机制恢复 origin source layer。

恢复失败时：

- occurrence 保留 logical source span。
- tool diagnostic 记录 recovery failure。
- RDF projection 不输出伪造 origin relativePath。

### 10.7 Containing section assignment

hmeta occurrence 使用与 xref/anchor 一致的 containing section assignment。

single-file 模式使用 `sectionByLine`。

book-entry 模式使用 source scope index。

## 11. RDF12 projection contract

### 11.1 Direct predicate output

hmeta fields 输出到 owner heading resource。

源表面：

```asciidoc
约束规则当前处于 hmeta:status[active, label=生效] 状态。
```

目标 RDF：

```ttl
:heading aat:status "active" .
```

Predicate 由 `fieldPredicate(field)` 生成。

Object 是 string literal field value。

### 11.2 No public occurrence resource

目标 RDF 图不为 hmeta occurrence 创建 public resource。

目标 RDF 图不输出以下结构：

```ttl
:occurrence a aat:HeadingInlineMetadataOccurrence .
:heading aat:hasInlineMetadata :occurrence .
```

理由：

- 当前 heading attrlist fields 和 heading description metadata fields 已经使用 direct predicate contract。
- `test/rdf12-projection/attributes.test.ts` 已经保护无 public attribute resources 的 RDF surface。
- AST/JSON occurrence catalog 提供 source evidence。
- RDF public surface 保持 heading field query contract。

### 11.3 Label exclusion

RDF field value 必须使用 field value。

源表面：

```asciidoc
hmeta:status[active, label=生效]
```

目标 RDF：

```ttl
:heading aat:status "active" .
```

禁止 RDF：

```ttl
:heading aat:status "生效" .
:heading aat:label "生效" .
:heading aat:displayLabel "生效" .
```

`label` 不进入 heading RDF field surface。

### 11.4 Duplicate field projection

RDF projection 使用最终 field view。

同一 owner heading 的同一 field 只有最终值进入 direct field view。

若 RDF graph implementation 不能删除 earlier triple，projection 阶段必须先构造 field map，再写 triples。实现不得先写 earlier field，再追加 later field，导致多值冲突。

### 11.5 Interaction with role class mapping

hmeta 产生的 `aat:role` 必须被下游 role mapping 消费。

示例：

```asciidoc
该标题表示 hmeta:role[rule, label=规则节点]。
```

目标 RDF：

```ttl
:heading aat:role "rule" .
```

`samples/basic-rdf-projection/validate_with_shacl.mjs` 通过 `aat:role` 与 `structure-model.ttl` 中的 `ex:roleName` 建立 class assertion。hmeta role field 必须进入同一 predicate。

## 12. Serialization contract

### 12.1 JSON

JSON serializer 必须输出 document-level `headingInlineMetadataOccurrences`。

Paragraph children 中的 occurrence 输出形态：

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

### 12.2 Tree format

Pretty tree format must expose hmeta occurrence as a child node or occurrence catalog entry.

Tree format must not hide hmeta occurrence while JSON exposes it. Serializer outputs must remain auditable across formats.

## 13. Source code change design

### 13.1 `src/model.ts`

Add `HeadingInlineMetadataOccurrenceNode`.

Add the node to `AbundantNode`.

Add `headingInlineMetadataOccurrences` to `AbundantDocument`.

### 13.2 `src/macro-argument-parser.ts`

Current `parseMacroArguments()` splits by comma and does not implement quoted comma semantics.

hmeta parser must support quoted comma.

Implementation options:

- Extend `parseMacroArguments()` to handle quotes while preserving existing xref parsing behavior.
- Add `parseInlineMacroAttributes()` for hmeta and optionally migrate xref after tests.

Required parsing facts:

```text
active, label=生效
```

produces:

```json
{
  "positional": ["active"],
  "named": { "label": "生效" }
}
```

```text
"hello, world", label="你好，世界"
```

produces:

```json
{
  "positional": ["hello, world"],
  "named": { "label": "你好，世界" }
}
```

Backslash-comma is not a merge rule for hmeta.

### 13.3 `src/inline-occurrence-scanner.ts`

Add hmeta scanning alongside xref and anchor scanning, or delegate to a new scanner.

Scanner responsibilities:

- find raw macro occurrences。
- parse field/value/label。
- produce `HeadingInlineMetadataOccurrenceNode`。
- recover source origins。
- dedupe occurrences。
- sort by source span。

Scanner must preserve existing xref and anchor behavior.

### 13.4 `src/source-surfaces.ts`

Add hmeta occurrence arrays to `SourceSurfaces`.

Assign containing section ids to hmeta occurrences with the same single-file and book-entry branches used by xref/anchor.

Return hmeta occurrences to parser core.

### 13.5 `src/official-projector.ts`

Paragraph projection must include hmeta occurrence children sorted with xref and anchor by source position.

Description list term/description projection must include hmeta occurrence children when the source span belongs to that term/description.

Implementation must prevent duplicate occurrence children when parent and child spans overlap.

### 13.6 `src/parser-core.ts`

Construct `AbundantDocument.headingInlineMetadataOccurrences`.

Keep `toolDiagnostics` from missing value and source recovery failures.

### 13.7 `src/rdf12-projection/attributes.ts`

Project hmeta fields to owner headings.

Implementation must:

- collect heading attrlist fields。
- collect heading description metadata fields。
- collect heading inline metadata fields。
- apply source order last-wins。
- write final field map to RDF graph。

Existing heading attrlist and description metadata behavior must stay compatible.

### 13.8 `src/asciidoctor-adapter.ts`

Register `hmeta` inline macro extension in the Asciidoctor processor used by parser/conversion.

Conversion output must display `label ?? value`。

The extension must not mutate global shared state to collect projection data.

### 13.9 `src/serializers.ts`

Add `headingInlineMetadataOccurrences` to stable serialization order.

Add `headingInlineMetadata` node formatting.

## 14. Tests

Testing must be layered. A single acceptance test cannot substitute for parser, scanner, projection, conversion and serialization tests.

### 14.1 Parser scanner tests

File:

```text
test/heading-inline-metadata.test.ts
```

Required cases:

1. Paragraph hmeta occurrence creates document-level occurrence.
2. Occurrence has raw, field, value, label and sourceSpan.
3. Occurrence without label uses value as display fallback in conversion contract but still stores no label.
4. Named `value=` surface matches positional value surface.
5. Quoted comma value is parsed as one value.
6. Missing value creates warning diagnostic and no occurrence field.
7. Multiple hmeta occurrences in one line have distinct source columns.
8. Multiple hmeta occurrences in multiline paragraph have actual line numbers.
9. Source block content containing `hmeta:` is not scanned.
10. Listing block content containing `hmeta:` is not scanned.

### 14.2 Section ownership tests

File:

```text
test/heading-inline-metadata-ownership.test.ts
```

Required cases:

1. hmeta under parent section belongs to parent.
2. hmeta under child section belongs to child.
3. hmeta before first section does not bind to a section heading unless document title support is explicitly implemented.
4. book-entry include file hmeta recovers origin relativePath and owner section.

### 14.3 RDF projection tests

File:

```text
test/rdf12-projection/heading-inline-metadata.test.ts
```

Required cases:

1. `hmeta:status[active, label=生效]` outputs `aat:status "active"`。
2. `hmeta:priority[normal]` outputs `aat:priority "normal"`。
3. `hmeta:role[rule, label=规则节点]` outputs `aat:role "rule"`。
4. label is not projected as field value。
5. label is not projected as heading `aat:label` or `aat:displayLabel`。
6. no public hmeta occurrence RDF resources are created。
7. duplicate field follows source order last-wins。
8. attrlist, description metadata and hmeta conflict uses source order last-wins。
9. unsafe field name uses `fieldPredicate()` encoded predicate。

### 14.4 Asciidoctor adapter conversion tests

File:

```text
test/asciidoctor-adapter-heading-inline-metadata.test.ts
```

Required cases:

1. Registered hmeta macro converts to display label。
2. Registered hmeta macro converts to value when label is absent。
3. Conversion output does not contain raw `hmeta:status[...]`。
4. Registration works in current safe mode used by adapter。
5. Registration does not alter parser source text.

### 14.5 Serialization tests

File:

```text
test/serializers-heading-inline-metadata.test.ts
```

Required cases:

1. JSON includes document-level hmeta occurrence catalog。
2. JSON includes hmeta occurrence as paragraph child。
3. Pretty tree format displays hmeta occurrence with field and value。

### 14.6 Description list integration tests

File:

```text
test/parser-description-list.acceptance.test.ts
```

Required additions:

1. hmeta in description term is scanned once。
2. hmeta in description text is scanned once。
3. hmeta in nested listing under description is not scanned。

### 14.7 Basic RDF projection sample tests

Existing sample scripts must remain valid:

```bash
pnpm --silent dev samples/basic-rdf-projection/basic-projection.adoc --format rdf12
uv run samples/basic-rdf-projection/consume_projection.py
node samples/basic-rdf-projection/validate_with_shacl.mjs
node samples/basic-rdf-projection/query_with_oxigraph.mjs
```

If sample source is updated to include hmeta, README pre-generated output and consumer scripts must be updated in the same change set.

## 15. Sample and documentation updates

### 15.1 `samples/basic-rdf-projection/basic-projection.adoc`

Extend the sample with one hmeta-bearing sentence.

The sample must keep existing demonstrations:

- heading attrlist metadata。
- heading description metadata。
- xref edge evidence。
- local target alias。
- SHACL validation。
- Oxigraph relation materialization。

Add a field that does not destabilize existing required SHACL constraints unless validation is intentionally extended.

Example addition:

```asciidoc
约束规则当前处于 hmeta:review-state[ready, label=可复核]。
```

Expected RDF:

```ttl
:requiredRuleHeading aat:review-state "ready" .
```

### 15.2 `samples/basic-rdf-projection/README.md`

README must document hmeta as the third heading metadata source:

- heading attrlist for short pre-heading fields。
- leading description list for multiline heading fields。
- hmeta for sentence-embedded short fields。

README must explain `label` / `value` separation.

README must update pre-generated Turtle and script outputs when sample facts change.

### 15.3 `docs/关于自定义宏.md`

This document can mention `hmeta` as a project-specific inline macro after implementation.

It must not define parser/projection contract. The contract belongs to this design document and project specification docs.

## 16. Acceptance commands

Run targeted tests:

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

## 17. Completion definition

This task is complete when all facts below hold.

- [ ] `hmeta:<field>[<value>, label=<display>]` is parsed as heading inline metadata occurrence.
- [ ] `hmeta:<field>[value=<value>, label=<display>]` has the same structural interpretation.
- [ ] quoted comma values parse as one value.
- [ ] missing value produces diagnostic and no field.
- [ ] hmeta occurrence has raw source, field, value, optional label, sourceSpan and containing section id.
- [ ] hmeta occurrence appears in document-level occurrence catalog.
- [ ] hmeta occurrence appears in relevant text node children without duplicate emission.
- [ ] hmeta in source/listing/pass/literal content is not scanned.
- [ ] hmeta owner binding uses nearest section source scope.
- [ ] book-entry hmeta occurrences recover origin relativePath and source span.
- [ ] RDF projection writes heading direct predicate using field value.
- [ ] RDF projection uses `fieldPredicate()` for hmeta field names.
- [ ] RDF projection does not write display label as field value.
- [ ] RDF projection does not create public hmeta occurrence resources.
- [ ] RDF projection handles duplicate fields by source order last-wins.
- [ ] `hmeta:role[...]` outputs `aat:role`.
- [ ] Asciidoctor.js conversion displays `label ?? value`.
- [ ] Asciidoctor.js conversion does not leak raw hmeta syntax.
- [ ] `samples/basic-rdf-projection` demonstrates hmeta without breaking existing sample consumers.
- [ ] README/sample generated output documents hmeta value/label semantics.
- [ ] Acceptance commands pass.

## 18. Review rules

Review must reject implementations with any of the following properties:

- Parser depends on `getContent()` or `convert()` callback side effects to collect hmeta facts.
- RDF projection uses display label as structural value.
- hmeta source scanner scans listing/source/pass/literal content.
- hmeta occurrence is stored as fake description metadata entry.
- hmeta creates xref edge, target alias or cross-heading relation.
- hmeta duplicate field behavior differs from documented source order last-wins.
- Implementation creates public RDF attribute resources without a separate RDF evidence design.
- Sample docs mention hmeta without proving RDF and consumer behavior.

Core judgment:

`hmeta` is a sentence-embedded heading metadata field surface. The source scanner owns parse/projection evidence. The Asciidoctor inline macro extension owns conversion display. RDF12 projection exposes the resulting field as a heading direct predicate using the structural value.

## 19. Commit guidance

The implementation commit message must describe object changes, not author process.

Suggested title:

```text
feat: support sentence-embedded heading metadata macros
```

Suggested body:

```text
- parse hmeta inline macros as source-aware heading metadata occurrences
- project hmeta values as heading direct RDF fields
- render hmeta macros through an Asciidoctor.js inline extension
- preserve label/value separation across AST, RDF, and conversion surfaces
- document and test source ownership, duplicate field, and non-scannable block boundaries
```

Commit only task-related paths. New files must be staged before path-limited commit.

