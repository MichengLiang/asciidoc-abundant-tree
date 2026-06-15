# RDF12 payload 与 local target alias 代码同步执行规约

本文档规定 RDF12 payload 代码同步工作的执行范围、必读材料、对象契约、源码改造点、测试改造点、公共文档同步点、验收命令和完成定义。执行者必须按本文档完成实现。完成状态以本文末尾“完成定义”中的输出事实与命令结果为准。

本文档面向接手 `asciidoc-abundant-tree` 的后续开发者。执行者无需了解前置讨论，但必须阅读本文档列出的全部文件，并按照本文档中的对象定义和执行步骤修改代码。本文档不替代 6 号书；6 号书是 RDF12 标题投影图的规范来源，本文档是使运行时代码、测试、样例和公共说明同步到该规范的执行规约。

执行命令的工作目录是：

```bash
micheng-ts/projects/asciidoc-abundant-tree
```

所有文件路径均相对于 `micheng-ts/projects/asciidoc-abundant-tree/`。执行者不得把 workbench 根目录当作本任务的项目根。执行者不得回滚 unrelated worktree changes。提交时只提交本任务触及路径；存在新文件时，先 stage 新文件，再使用 `git commit --only -m "..." -- <paths>` 限定提交范围。

## 任务边界

本次工作以 `docs/bookshelf/books/06-rdf12-line-projection` 为对象契约。运行时 RDF12 投影、RDF12 测试、RDF12 样例、README RDF12 说明、preview sample 和 RDF12 下游消费者必须与该书保持同一套对象事实。

本次工作包括以下对象：

* 节点 payload。
* 边 payload。
* payload role。
* payload format。
* source payload id。
* xref payload selector。
* heading projection label space。
* local non-heading target alias。
* payload 相关 RDF12 查询契约。
* `animation-yaml-export` 对 RDF12 node payload 的读取路径。

本次工作不创建 paragraph、listing、table、anchor、payload block 等非 heading 结构节点。标题投影图的结构节点只由等号标题创建。

本次工作不解析 payload raw 内部业务字段。JSON、YAML、TOML、XML 或其它 raw 内容作为 opaque literal 保存。下游消费者按 role 与 format 解释 raw；RDF12 标题投影器不把 raw 内部字段展开为 RDF 业务谓词。

本次工作不把 `data` 作为 payload format 控制字段。payload format 来自 source block language，即 `ListingNode.language`。

本次工作不把 `.payload` 或 `.xref-payload` 作为 payload kind 控制信号。payload kind 由绑定机制决定。role token 表达 payload role，不决定 node/edge kind。

本次工作不把 xref target selector 与 xref payload selector 混入同一个绑定空间。普通 xref target selector 查询 heading projection label space；xref `payload=` selector 查询 source payload id space。

## 必读文件

执行者必须阅读本节列出的每一个文件。阅读顺序按本节顺序执行。每个文件后面的“阅读目的”定义该文件在本任务中的证据角色。

### 规范与前置材料

| 路径 | 阅读目的 |
|---|---|
| `docs/bookshelf/books/06-rdf12-line-projection/book.adoc` | 确认 6 号书目录结构和四个部分的划分。 |
| `docs/bookshelf/books/06-rdf12-line-projection/frontmatter/preface.adoc` | 确认标题投影图的对象边界：payload 是复杂属性值，不是结构节点。 |
| `docs/bookshelf/books/06-rdf12-line-projection/backmatter/glossary.adoc` | 确认 `payload`、`payload block`、`source payload id`、`payload role`、`payload format`、`selector`、`node payload binding marker`、`address label`、`heading projection label space` 的术语定义。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/01-projection-object.adoc` | 确认构成性对象、消费者动作、排除边界和来源坐标。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/02-heading-node.adoc` | 确认 heading label space、本地 target 的标题归属、标题头部属性。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/05-xref-edge.adoc` | 确认 xref target selector、xref payload selector、edge evidence、selector space 分离。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/06-payload-and-attribute.adoc` | 确认直接属性、payload object、节点 payload、边 payload、opaque raw、payload format。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/07-query-contract.adoc` | 确认公共查询入口，尤其是 node payload 通过 heading `aat:payload` 查询，edge payload 通过 xref edge evidence `aat:payload` 查询。 |
| `docs/bookshelf/books/06-rdf12-line-projection/chapters/08-worked-example.adoc` | 确认 canonical sample 的源表面、RDF 事实和验收事实。 |
| `docs/plan/RDF12 payload相关设计/资料1.md` | 确认前置讨论和对象收敛过程。执行者不得把聊天过程写回 6 号书，但必须理解 node payload 不要求 ID、`data` 不属于契约、role 是 schema label。 |
| `docs/plan/rdf12-heading-address-label-alias-implementation-plan.md` | 确认 local non-heading target alias 的已有计划。执行者必须把该计划并入本次 payload 同步范围，而不是把它当作独立任务遗留。 |

### 样例与公共入口

| 路径 | 阅读目的 |
|---|---|
| `samples/structural-payload.adoc` | RDF12 payload 的 canonical sample。本任务的主验收输入。 |
| `samples/structural-payload-old.adoc` | 旧表面对照。执行者不得把该文件中的旧表面恢复为规范表面。 |
| `samples/rdf12-projection-preview.adoc` | README 预览样例的源文件。该文件必须与当前 RDF12 payload 契约一致。 |
| `README.md` | 公共入口说明。RDF12 projection 段落和示例必须与 6 号书一致。 |

### 核心源码

| 路径 | 阅读目的 |
|---|---|
| `src/rdf12-projection/projector.ts` | 确认 RDF12 投影 pipeline 顺序：structure、labels、xref、attributes、payload。 |
| `src/rdf12-projection/payload-projector.ts` | 核心 payload 投影实现。执行者必须重构该文件。 |
| `src/rdf12-projection/labels.ts` | heading label catalog 与 graph label 输出。执行者必须加入 local non-heading target alias。 |
| `src/rdf12-projection/label-catalog.ts` | 确认 label catalog owner 查询和去重行为。 |
| `src/rdf12-projection/selector-binding.ts` | 确认 selector binding 只通过 label catalog owners 判断 bound、unresolved、ambiguous。 |
| `src/rdf12-projection/xref-projector.ts` | 确认 xref edge evidence、source heading、target heading、payloadSelector、relation triple 的投影路径。 |
| `src/rdf12-projection/structure-projector.ts` | 确认 heading node index、heading labels、line spans 和 document order。 |
| `src/rdf12-projection/node-index.ts` | 确认 ownership resolver 可使用的 heading entry 字段。 |
| `src/rdf12-projection/attributes.ts` | 确认 direct attribute projection，避免把 payload marker 或 xref payload control field 当普通字段。 |
| `src/model.ts` | 确认 `AbundantDocument`、`ListingNode`、`TargetNode`、`XrefOccurrenceNode` 的字段。 |
| `src/metadata-parser.ts` | 确认 attrlist 中 role、id、attributes、无值字段的解析形态。执行者必须用实际解析结果处理 `[.banana, for]`。 |
| `src/binding-merge.ts` | 确认 target catalog 与 xref official binding 合并规则。 |

### 下游消费者

| 路径 | 阅读目的 |
|---|---|
| `src/animation-yaml-export/graph-reader.ts` | 确认 RDF12 payload 被下游读取的方式。执行者必须保证 node payload 无 source payload id 时，下游仍能读 payload raw。 |
| `src/animation-yaml-export/payload-parser.ts` | 确认下游按 `aat:format` 解析 raw。 |
| `test/fixtures/animation-yaml/bible.adoc` | 确认 animation-yaml fixture 是否仍使用旧 `.payload` / `data=` 表面，并同步为当前表面。 |
| `test/fixtures/animation-yaml/structure.adoc` | 同步 animation-yaml 结构 fixture 的 payload 表面。 |
| `test/fixtures/animation-yaml/script.adoc` | 同步 animation-yaml script fixture 的 payload 表面。 |

### 测试

| 路径 | 阅读目的 |
|---|---|
| `test/rdf12-projection/payload-projector.test.ts` | payload projector 单元测试。执行者必须替换旧契约测试。 |
| `test/rdf12-projection/payload.acceptance.test.ts` | `samples/structural-payload.adoc` 的 payload acceptance。 |
| `test/rdf12-projection/heading-projection.acceptance.test.ts` | `samples/structural-payload.adoc` 的 heading、xref、payload 总体验收。 |
| `test/rdf12-projection/query-contracts.test.ts` | RDF12 公共查询契约端到端测试。 |
| `test/rdf12-projection/labels.test.ts` | heading label space 与 label catalog 测试。 |
| `test/rdf12-projection/selector-binding.test.ts` | selector binding 的 bound、unresolved、ambiguous 测试。 |
| `test/rdf12-projection/xref-projector.test.ts` | xref edge evidence、relation triple、target binding 测试。 |
| `test/rdf12-projection/book-entry-coordinate.test.ts` | book-entry 坐标和 payload relativePath 测试。ownership resolver 不得破坏该测试覆盖的事实。 |
| `test/animation-yaml-export/export-animation-yaml.test.ts` | animation-yaml 下游 exporter 验收。 |

## 当前代码状态

执行者完成必读文件阅读后，在修改代码前运行本节命令取得基线事实。

```bash
pnpm dev samples/structural-payload.adoc --format rdf12
```

该命令的当前输出暴露以下事实：

* `配送策略` heading 输出 `aat:addressLabel "delivery"`。
* `配送策略` heading 未输出 `aat:addressLabel "rel-delivery"`。
* xref edge 输出 `aat:payloadSelector "rel-delivery"`。
* xref edge 能连接 edge payload。
* edge payload 输出 `aat:payloadId "rel-delivery"`、`aat:payloadKind "edge"`、`aat:format "yaml"` 和 raw。
* edge payload 未输出 `aat:role "pear"`。
* node payload 未输出。

继续运行：

```bash
pnpm vitest run test/rdf12-projection/payload.acceptance.test.ts test/rdf12-projection/labels.test.ts test/rdf12-projection/payload-projector.test.ts
```

这些测试暴露两类差距。第一类是实现差距：node payload 没有投影，local non-heading target alias 没有进入 heading label space，payload role 没有投影。第二类是测试差距：部分测试仍按旧 sample 表面查找 `delivery-policy`、`capacity-rule`、`delivery-policy-payload`、`rel-delivery-capacity`。执行者必须同时修复实现和测试，不能只改其中一边。

当前 `src/rdf12-projection/payload-projector.ts` 的关键问题是：

* `PayloadKind` 使用 `"node" | "xref"`，而公共对象语言是 node payload 与 edge payload。
* `projectPayloadListing()` 对所有 payload 都要求 `node.ids[0]`。
* role `payload` 与 `xref-payload` 被用于 payload kind 判断。
* `dataFormatFor()` 先读取 attrlist 的 `data`，再读取 `node.language`。
* payload roles 没有投影为 `aat:role`。
* `forSelectorFor()` 把 `for` / `forSelector` 的值统一转成字符串，无法表达无值 `for` 的 source ownership binding。

当前 `src/rdf12-projection/labels.ts` 的关键问题是：

* `projectLabels()` 只添加 heading 自身 label。
* `document.targets` 中的 listing、table、block、inline-anchor、unknown target 没有归属到 owning heading。
* graph 中缺少 local non-heading target alias 的 `aat:addressLabel`。
* label catalog 中缺少 local non-heading target alias，因此 xref target selector 无法绑定到 owning heading。

当前公共文档入口的关键问题是：

* `README.md` 的 RDF12 projection 示例仍展示旧表面。
* `samples/rdf12-projection-preview.adoc` 存在旧表面风险，执行者必须检查并同步。
* `docs/bookshelf/books/07-rdf12-heading-projection-implementation-plan` 仍包含旧实施计划语言。执行者要确认它是否作为当前入口被引用；若不是当前入口，不把它改写成新的规范书；若它作为当前入口出现，必须标明当前 RDF12 payload 契约以 6 号书为准。

## 对象契约

### heading node

heading node 由 AsciiDoc 等号标题创建。heading node 是标题投影图的结构节点。段落、listing、table、block、inline anchor 和 payload block 不创建 heading node。

heading node 的公共 label space 由三类事实构成：

* `aat:addressLabel`
* `aat:generatedAddressLabel`
* `aat:headline`

selector 绑定 heading 时只查询这三类事实。selector 不查询 role、direct attribute、xref display label、official reftext、raw text、payload role、payload raw 或 heading IRI。

### xref edge evidence

xref edge evidence 由标题切片中的 xref occurrence 创建。它保存 xref raw、source heading、target selector、target heading 或 candidate headings、direct attributes、payload selector、payload connection、source coordinate 和 RDF 1.2 reifier 关系。

xref edge evidence 不是 heading node。xref edge evidence 不参与 heading tree structure。

### payload object

payload object 是归属于 heading node 或 xref edge evidence 的复杂属性值。node payload 通过 heading node 的 `aat:payload` 读取。edge payload 通过 xref edge evidence 的 `aat:payload` 读取。

payload object 保存以下事实：

* `aat:payloadKind`
* `aat:role`
* `aat:format`
* `aat:raw`
* `aat:relativePath`
* `aat:startLine`
* `aat:endLine`
* `aat:contentStartLine`
* `aat:contentEndLine`
* 需要 selector 指向 payload block 时保存 `aat:payloadId`
* 节点 payload 使用非空 selector binding 时保存 `aat:forSelector`

payload object 的 RDF identity 由投影器生成。payload object 的 IRI 不使用作者手写 ID。payload object 不作为 heading node、structure edge endpoint 或 xref target heading。

### payload block

payload block 是源文档中承载 payload raw 的 listing block。payload block 是源表面，不是公共结构节点。payload block 只有满足 node payload 或 edge payload 成立条件时，才被 RDF12 projector 解释为 payload 来源。

### node payload

node payload 是归属于 heading node 的 payload object。

node payload 的成立条件是 listing block 的 attrlist 中存在 `for` 或 `forSelector` 字段。该字段是 node payload binding marker。role token 不建立 node payload 身份。source block language 不建立 node payload 身份。heading slice 位置不单独建立 node payload 身份。

带值 marker 表达 selector binding：

```asciidoc
[.banana, for=delivery]
[source,json]
----
{ "owner": { "team": "ops" } }
----
```

该表面表示：

* listing block 是 node payload。
* `banana` 是 payload role。
* `delivery` 是 heading selector。
* `json` 是 payload format。
* raw body 是 opaque payload raw。

无值 marker 表达 source ownership binding：

```asciidoc
[.banana, for]
[source,json]
----
{ "owner": { "team": "ops" } }
----
```

该表面表示：

* listing block 是 node payload。
* `banana` 是 payload role。
* payload 归属由 block 起始行所在的最内层 heading 决定。
* 无值 marker 不投影为空字符串 `aat:forSelector`。

node payload 不要求 source payload id。没有手写 ID 的 node payload 必须创建 payload object。node payload 的公共读取入口是 owning heading 的 `aat:payload`。

### edge payload

edge payload 是归属于 xref edge evidence 的 payload object。

edge payload 的成立条件是 xref edge evidence 的 `payload` 字段与 listing block 的 source payload id 唯一匹配。role token 不建立 edge payload 身份。

规范表面：

```asciidoc
xref:capacity[运力规则, rel=depends-on, payload=rel-delivery]

[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
----
```

该表面表示：

* xref edge evidence 有 payload selector `rel-delivery`。
* listing block 的 source payload id 是 `rel-delivery`。
* `pear` 是 payload role。
* `yaml` 是 payload format。
* edge payload 归属于 xref edge evidence，不归属于 source heading 或 target heading。

edge payload 需要 source payload id，因为 xref `payload=` selector 必须指向它。edge payload 的 `aat:payloadId` 表示 source payload id binding fact，不表示 payload object 的 RDF identity。

### payload role

payload role 来自 payload block metadata roles。每个 payload role 输出为一个 `aat:role` literal。

payload role 是作者与下游消费者约定的 schema 或 model label。payload role 不决定 payload kind，不绑定 heading，不选择 edge payload。

### payload format

payload format 来自 source block language。`[source,json]` 输出 `aat:format "json"`。`[source,yaml]` 输出 `aat:format "yaml"`。没有 source block language 时，不输出 `aat:format`。投影器不从 raw 内容猜测 format。

`data` 不参与 payload format。即使 attrlist 写出 `data=toml`，只要 source block language 是 `yaml`，payload format 就是 `yaml`。

### heading projection label space

heading projection label space 由 heading 的 `aat:addressLabel`、`aat:generatedAddressLabel` 和 `aat:headline` 构成。普通 xref target selector 和 node payload 的非空 `for` / `forSelector` selector 查询该空间。

role、direct attribute、payload role、payload id、payload raw、xref display label、official reftext、raw text 和 heading IRI 不进入 heading projection label space。

### source payload id space

source payload id space 由 payload block 的 source payload id 构成。xref `payload=` selector 查询该空间。该空间不查询 heading headline、heading address label、payload role 或 raw。

同一个字符串允许同时出现在 heading projection label space 和 source payload id space。字段语境决定解释路径。例如 `rel-delivery` 作为普通 xref target selector 时绑定 owning heading；作为 `payload=rel-delivery` 时绑定 edge payload block。

### local non-heading target alias

local non-heading target alias 是本地非 section target ID 在 heading projection graph 中形成的 address label。目标类型包括 listing、table、block、inline-anchor 和 unknown。该 target 不创建公共结构节点。该 target 的 ID 归属为覆盖 target source span 起始行的最内层 heading node 的 `aat:addressLabel`。

该 alias 必须同时写入 graph 和 label catalog。只写 graph 会使 selector binding 缺失；只写 label catalog 会使公共查询缺失。

## 必须实现的 RDF 输出事实

对 `samples/structural-payload.adoc` 执行：

```bash
pnpm dev samples/structural-payload.adoc --format rdf12
```

输出必须包含本节事实。

`配送策略` heading：

* `heading-l5-o0` 是 `aat:Heading`。
* `heading-l5-o0` 有 `aat:headline "配送策略"`。
* `heading-l5-o0` 有 `aat:addressLabel "delivery"`。
* `heading-l5-o0` 有 `aat:addressLabel "rel-delivery"`。
* `heading-l5-o0` 有 `aat:role "policy"`。
* `heading-l5-o0` 有 `aat:status "active"`。
* `heading-l5-o0` 有 `aat:owner "ops"`。
* `heading-l5-o0` 有 `aat:payload <...#payload-l10-o0>`。

node payload：

* `payload-l10-o0` 有 `aat:payloadKind "node"`。
* `payload-l10-o0` 有 `aat:role "banana"`。
* `payload-l10-o0` 有 `aat:forSelector "delivery"`。
* `payload-l10-o0` 有 `aat:format "json"`。
* `payload-l10-o0` 有 `aat:relativePath "samples/structural-payload.adoc"`。
* `payload-l10-o0` 有 `aat:startLine 10`。
* `payload-l10-o0` 有 `aat:endLine 23`。
* `payload-l10-o0` 有 `aat:contentStartLine 13`。
* `payload-l10-o0` 有 `aat:contentEndLine 22`。
* `payload-l10-o0` 有完整 JSON raw literal。
* `payload-l10-o0` 在源 block 没有 ID 时不输出 `aat:payloadId`。

xref edge evidence：

* xref edge 有 `aat:sourceHeading <...#heading-l5-o0>`。
* xref edge 有 `aat:targetHeading <...#heading-l39-o0>`。
* xref edge 有 `aat:targetSelector "capacity"`。
* xref edge 有 `aat:displayLabel "运力规则"`。
* xref edge 有 `aat:rel "depends-on"`。
* xref edge 有 `aat:weight "0.8"`。
* xref edge 有 `aat:payloadSelector "rel-delivery"`。
* xref edge 有 `aat:payload <...#payload-l25-o0>`。
* `heading-l5-o0 rel:depends-on heading-l39-o0` 存在。
* xref edge 通过 `rdf:reifies` 指向该 relation triple term。

edge payload：

* `payload-l25-o0` 有 `aat:payloadKind "edge"`。
* `payload-l25-o0` 有 `aat:payloadId "rel-delivery"`。
* `payload-l25-o0` 有 `aat:role "pear"`。
* `payload-l25-o0` 有 `aat:format "yaml"`。
* `payload-l25-o0` 有 `aat:relativePath "samples/structural-payload.adoc"`。
* `payload-l25-o0` 有 `aat:startLine 25`。
* `payload-l25-o0` 有 `aat:endLine 37`。
* `payload-l25-o0` 有 `aat:contentStartLine 28`。
* `payload-l25-o0` 有 `aat:contentEndLine 36`。
* `payload-l25-o0` 有完整 YAML raw literal。

输出不得包含以下事实：

* 不得输出 `rdf:type aat:PayloadBlock`。
* 不得输出 `rdf:type aat:ListingBlock`。
* 不得输出 `rdf:type aat:TableBlock`。
* 不得输出 `rdf:type aat:AnchorTarget`。
* payload object 不得作为 `aat:containsDirectly` 的 subject 或 object。
* payload object 不得有 `aat:documentOrder`。
* payload object 不得作为 `aat:targetHeading` object。
* payload raw 内部字段不得展开为 `aat:owner`、`aat:risk`、`aat:reason`、`aat:edge` 等业务谓词。

## 源码改造设计

### `src/rdf12-projection/heading-ownership.ts`

执行者必须新增共享 ownership helper。该 helper 服务 local non-heading target alias 和无值 `for` node payload。

文件必须导出一个函数，函数名采用以下语义：

```ts
findInnermostHeadingBySourceLine
```

函数输入必须包含：

* `nodeIndex: Rdf12NodeIndex`
* `relativePath: string`
* `line: number`

函数输出是 `Rdf12NodeIndexEntry | undefined`。

候选 heading 的条件：

* entry 的 `relativePath` 等于输入 relativePath。
* 输入 line 位于 entry 的 source line span 内。
* source line span 优先使用 `sourceStartLine` / `sourceEndLine`。
* 缺少 source line span 时使用 `startLine` / `endLine`。

排序规则：

* span 长度更短的 heading 是更内层 heading。
* span 长度相等时，`startLine` 更大的 heading 是更内层 heading。
* 仍相等时保持 `nodeIndex.entries()` 的原始顺序。

该 helper 不读取 graph。该 helper 不使用 IRI lexical order。该 helper 不使用 Turtle textual order。该 helper 不使用 headline 或 address label。

`xref-projector.ts` 中已有的 source heading fallback 逻辑必须改为复用该 helper。local target alias 和无值 `for` 不得各自复制一套 ownership 逻辑。

### `src/rdf12-projection/labels.ts`

执行者必须扩展 `projectLabels()`。

`projectLabels()` 必须执行两类投影：

1. 为 heading 自身 headline、address label、generated address label 建立 label catalog。
2. 为 `document.targets` 中的 local non-heading target 建立 owning heading address label，并写入 graph 与 label catalog。

处理 `document.targets` 的规则：

* `target.targetType === "section"` 时跳过。section label 已由 heading 自身处理。
* target 没有 `id` 时跳过。
* target 没有 `sourceSpan` 时跳过。
* target 有 sourceSpan 时，用 sourceSpan start line 和 target source relative path 找 owning heading。
* 找到 owning heading 后，向 graph 写 `owner aat:addressLabel target.id`。
* 找到 owning heading 后，向 label catalog 写 `{ owner, labelKind: "addressLabel", value: target.id }`。

target source relative path 的取得必须与现有 source coordinate 规则一致。若 `TargetNode.source?.relativePath` 存在，使用该值；否则使用 projection 的 `relativePath`。

同一 heading 上重复写同一 address label 不得制造重复 graph triples。graph 已有同一 triple 时不重复添加。

同一 label 归属不同 headings 时，label catalog 必须保留多个 owners，使 `bindSelector()` 返回 ambiguous。

### `src/rdf12-projection/payload-projector.ts`

执行者必须重构 payload projector 的 kind、binding、role、format、payload id 逻辑。

内部类型必须表达公共对象语言：

```ts
type PayloadKind = "node" | "edge";
```

执行者必须实现 node payload binding marker 解析。解析结果必须区分：

* 没有 marker。
* 有 selector marker。
* 有 source ownership marker。

`forSelector` 与 `for` 的解释规则：

* `forSelector` 有非空字符串值时，使用该值作为 selector。
* `for` 有非空字符串值时，使用该值作为 selector。
* `for` 或 `forSelector` 以无值属性形式存在时，表示 source ownership marker。
* 无值 marker 不输出 `aat:forSelector ""`。

执行者必须用 `src/metadata-parser.ts` 的实际解析结果确认无值属性的运行时形态。若 parser 当前不能保留无值 `for`，执行者必须修 parser 或 metadata surface，使 RDF12 projector 能区分 marker presence 和 absence。不能用 `String(value)` 把布尔 marker、空 marker 和 selector 混成同一种字符串事实。

node payload 投影规则：

* listing 有 node payload binding marker 时，创建 node payload object。
* listing 无 ID 时仍创建 node payload object。
* payload resource IRI 继续由 source coordinate local id 生成。
* 输出 `aat:payloadKind "node"`。
* 输出 payload roles 为 `aat:role`。
* 输出 `aat:format`，值来自 `node.language`。
* 输出 `aat:raw`、relativePath、line span、content line span。
* marker 是 selector binding 时，输出 `aat:forSelector <selector>`，并用 heading projection label space 绑定 heading。
* marker 是 source ownership binding 时，用 shared ownership helper 绑定 heading，不输出 `aat:forSelector`。
* 绑定 unresolved 或 ambiguous 时，不连接 heading。
* node payload 不要求 `aat:payloadId`。

edge payload 投影规则：

* xref edge evidence 的 `payload` 字段形成 payload selector set。
* listing 的 source payload id 命中该 selector set 时，创建 edge payload object。
* selector 与 source payload id 唯一匹配时，xref edge evidence 连接 edge payload object。
* 输出 `aat:payloadKind "edge"`。
* 输出被 selector 消费的 `aat:payloadId`。
* 输出 payload roles 为 `aat:role`。
* 输出 `aat:format`，值来自 `node.language`。
* 输出 `aat:raw`、relativePath、line span、content line span。
* 多个 edge payload object 命中同一个 selector 时，不连接 edge payload。
* selector 未命中时，不连接 edge payload。

payload role 规则：

* payload role 来自 `node.metadata` 中所有 metadata roles。
* 每个 role 输出一个 `aat:role` literal。
* role 不参与 kind 判断。
* role `payload` 或 `xref-payload` 不具有 kind 控制权。

payload format 规则：

* `payloadFormatFor(node)` 只返回 `node.language`。
* 不读取 attrlist 的 `data`。
* 不从 raw 内容猜测 format。

payload id 规则：

* node payload 没有 source payload id 时，不输出 `aat:payloadId`。
* edge payload 必须输出被 xref `payload=` selector 消费的 source payload id。
* 同一 listing 有多个 IDs 时，edge payload 必须输出该 listing 的全部 source payload ids 为 `aat:payloadId`，其中必须包含被 xref `payload=` 消费的 selector。

### `src/rdf12-projection/xref-projector.ts`

执行者必须保持 xref target selector 与 xref payload selector 分离。

必须保持：

* xref target selector 通过 `bindSelector(labelCatalog, xref.target)` 查询 heading projection label space。
* xref `payload` attribute 只输出 `aat:payloadSelector`。
* xref `payload` attribute 不参与 `targetHeading` 绑定。
* xref `payload` attribute 不作为普通 direct attribute 输出。

执行者必须把 source heading fallback 改为复用 shared ownership helper。现有 duplicate source label、document title preamble 和 book-entry source coordinate 测试必须继续通过。

### `src/rdf12-projection/attributes.ts`

执行者必须保持 xref control attributes：

* `rel`
* `payload`

`payload` 不作为普通 `aat:payload` literal 输出。`rel` 继续选择 relation predicate，并可保留 `aat:rel`。

payload marker `for` / `forSelector` 不作为 payload 内部字段输出。payload marker 的公共事实是 `aat:forSelector` 或 heading-to-payload connection。

### `src/animation-yaml-export/graph-reader.ts`

执行者必须确认下游读取 node payload 的路径不要求 source payload id。

现有读取路径通过 heading 的 `aat:payload` 取得 payload object。该方向必须保留。

当 payload 没有 `aat:payloadId` 时，下游必须仍能解析 raw。payload parser 的 `payloadId` 输入可使用 payload IRI fallback，但测试必须证明 node payload 无 source payload id 时 exporter 仍输出业务 payload。

### `src/metadata-parser.ts`

执行者必须确认无值 attrlist 字段的解析结果。

如果 `[.banana, for]` 当前没有把 `for` 记录到 metadata attributes 中，执行者必须修复 parser，使 projector 能识别 marker presence。修复后必须有测试覆盖：

* `[.banana, for]`
* `[.banana, for=delivery]`
* `[.banana, forSelector=delivery]`

parser 修复不得改变 id、role、style、language 的既有语义。

## 测试改造规约

### `test/rdf12-projection/payload-projector.test.ts`

执行者必须替换旧 payload 契约测试。

必须覆盖：

* 无 ID node payload with `for=delivery` 成功投影。
* 无 ID node payload with `for=delivery` 成功连接 heading。
* node payload 输出 `aat:payloadKind "node"`。
* node payload 输出 `aat:role "banana"`。
* node payload 输出 `aat:forSelector "delivery"`。
* node payload 输出 `aat:format "json"`。
* node payload 输出 raw 和 line spans。
* node payload 没有 source id 时不输出 `aat:payloadId`。
* `[.banana, for]` 按 source owner 绑定 heading。
* `[.banana, for]` 不输出空 `aat:forSelector`。
* unresolved node payload selector 不连接 heading。
* ambiguous node payload selector 不连接 heading。
* role-only listing 不成为 node payload。
* source-only listing 不成为 node payload。
* edge payload 通过 xref `payload=` 与 source payload id 绑定。
* edge payload 输出 `aat:payloadKind "edge"`。
* edge payload 输出 `aat:payloadId`。
* edge payload 输出 role。
* edge payload 输出 format。
* edge payload selector 未匹配时不连接 payload。
* edge payload selector 多义匹配时不连接 payload。
* `data` 不影响 `aat:format`。

测试 helper 中不得用 `onlyPayloadById()` 查找 node payload。node payload 必须从 heading 的 `aat:payload` edge 取得。edge payload 从 xref edge 的 `aat:payload` edge 取得；断言 payloadId 是 edge payload fact，而不是查找入口。

### `test/rdf12-projection/labels.test.ts`

执行者必须同步 label space 测试。

必须覆盖：

* heading native ID 输出为 `aat:addressLabel`。
* generated heading ID 输出为 `aat:generatedAddressLabel`。
* local non-heading target ID 输出为 owning heading `aat:addressLabel`。
* `rel-delivery` 归属 `配送策略` heading。
* `engine-code` 归属其 owning heading。
* `perf-table` 归属其 owning heading。
* `warning-text` 归属其 owning heading。
* role、display label、official reftext、raw text、direct attribute、heading IRI 不进入 label catalog。

旧断言“listing ids、table ids、inline anchors、payload ids 不在 selector labels 中”必须删除或改写。当前对象契约要求这些 local non-heading target IDs 作为 owning heading address labels。

### `test/rdf12-projection/selector-binding.test.ts`

执行者必须覆盖 selector binding 的结果状态。

必须覆盖：

* `bindSelector(labelCatalog, "engine-code")` 返回 bound。
* `bindSelector(labelCatalog, "perf-table")` 返回 bound。
* `bindSelector(labelCatalog, "warning-text")` 返回 bound。
* paragraph block target ID 返回 bound。
* block anchor target ID 返回 bound。
* 同一 selector 归属多个 heading 时返回 ambiguous。
* 同一 selector 在同一 heading 内重复出现时返回单一 owner。
* role、display label、raw、heading IRI 返回 unresolved。

### `test/rdf12-projection/xref-projector.test.ts`

执行者必须覆盖 local non-heading target alias 对 xref projection 的影响。

必须覆盖：

* xref 指向 listing ID 时，`targetHeading` 是 owning heading。
* xref 指向 table ID 时，`targetHeading` 是 owning heading。
* xref 指向 inline anchor ID 时，`targetHeading` 是 owning heading。
* xref 指向 paragraph/block target ID 时，`targetHeading` 是 owning heading。
* relation triple 的 object 是 owning heading，不是 listing/table/block resource。
* edge evidence 保留 `aat:targetSelector`。
* edge evidence 保留 official resolved facts，包括 `aat:officialResolvedId` 和 `aat:officialResolvedType`。
* xref `payload=` selector 不参与 `targetHeading` 绑定。

### `test/rdf12-projection/payload.acceptance.test.ts`

执行者必须把该文件同步到 `samples/structural-payload.adoc` 的 canonical surface。

必须覆盖：

* `delivery` heading 存在。
* `capacity` heading 存在。
* `rel-delivery` 是 `delivery` heading 的 address label。
* node payload 从 `delivery` heading 的 `aat:payload` 取得。
* node payload 输出 kind、role、forSelector、format、raw、line spans。
* node payload 不要求 payloadId。
* edge payload 从 xref edge 的 `aat:payload` 取得。
* edge payload 输出 payloadId、kind、role、format、raw、line spans。
* edge payload 不挂到 source heading 或 target heading。
* payload object 不成为 structure 或 xref target node。

### `test/rdf12-projection/heading-projection.acceptance.test.ts`

执行者必须移除旧 sample 断言。

必须改为：

* `delivery-policy` 改为 `delivery`。
* `capacity-rule` 改为 `capacity`。
* `rel-delivery-capacity` 改为 `rel-delivery`。
* `delivery-policy-payload` 不作为 node payload 查询入口。
* 不再断言 `aat:kind "policy"`。
* 断言 heading role `policy` 与 `rule`。
* 断言 payload role `banana` 与 `pear`。
* 断言 edge payload format `yaml`。
* 断言 node payload format `json`。
* 断言 local target alias `rel-delivery`。

### `test/rdf12-projection/query-contracts.test.ts`

执行者必须同步公共查询契约。

必须覆盖：

* address label `delivery` 返回 `配送策略`。
* address label `rel-delivery` 返回 `配送策略`。
* node payload query 从 heading `aat:payload` 开始。
* edge payload query 从 xref edge `aat:payload` 开始。
* payload role 查询能找到 `banana` node payload。
* payload role 查询能找到 `pear` edge payload。
* xref target selector 指向 local non-heading target ID 时，target heading 是 owning heading。

### `test/rdf12-projection/book-entry-coordinate.test.ts`

执行者必须运行该测试并保持通过。

如果 ownership resolver 使用 relativePath 与 source line span，book-entry 坐标不能被 single-file 假设破坏。payload relativePath 必须来自 payload owner origin file，而不是 entry file 的合成坐标。

### `test/animation-yaml-export/export-animation-yaml.test.ts`

执行者必须同步 animation-yaml fixture 和验收。

fixture 中 node payload 必须使用业务 role + `for` marker。不得依赖 `.payload` role 作为 kind 信号。fixture 中 payload format 必须来自 `[source,yaml]` 或 `[source,json]`。不得依赖 `data=`。

测试必须证明 exporter 能从 heading `aat:payload` 读取 node payload raw，并按 `aat:format` 解析。

## 文档与样例同步规约

### `README.md`

执行者必须更新 RDF12 Projection 段落，使它与 6 号书一致。

README 中的 RDF12 payload 说明必须表达：

* node payload 使用 `for` / `forSelector` marker。
* node payload 不要求 source payload id。
* edge payload 使用 xref `payload=` selector 与 source payload id。
* payload role 来自 role token。
* payload format 来自 source block language。
* local non-heading target IDs become owning heading address labels。
* payload raw opaque。

README 示例不得继续展示以下表面作为 RDF12 payload 规范示例：

* `.section`
* `kind=policy`
* `.payload`
* `.xref-payload`
* `data=json`
* `data=yaml`
* `data=toml`
* node payload source id

### `samples/rdf12-projection-preview.adoc`

执行者必须把 preview sample 改为当前表面。preview sample 必须与 README 中的 preview 保持一致。

preview sample 应使用：

* `[#delivery.policy, status=active]`
* `xref:capacity[运力规则, rel=depends-on, payload=rel-delivery]`
* `[.banana, for=delivery]`
* `[source,json]`
* `[#rel-delivery.pear]`
* `[source,yaml]`
* `[#capacity.rule, status=active]`

### `samples/structural-payload.adoc`

该文件已经接近 canonical sample。执行者只能按 6 号书校准它。不得恢复旧 ID、旧 role、旧 `data` 表面。

### `samples/structural-payload-old.adoc`

该文件是旧表面对照。执行者不得把它作为 README 或 6 号书的规范样例引用。若测试引用该文件，测试名称必须表明它是 old surface 或 legacy input boundary。

### `docs/bookshelf/books/07-rdf12-heading-projection-implementation-plan`

执行者必须检查 README、docs index 或其它入口是否把该书作为当前 RDF12 payload 规范入口。若没有作为当前入口，不重写该书对象定义。若作为当前入口出现，必须增加边界说明：当前 RDF12 payload 对象契约以 `docs/bookshelf/books/06-rdf12-line-projection` 为准。

## 实施顺序

执行者按本节顺序执行。每一步完成后运行该步指定测试。

### 步骤 1：写 payload projector 失败测试

先改 `test/rdf12-projection/payload-projector.test.ts`。写出 node payload 无 ID、无值 `for`、role、format、edge payload、`data` 忽略等测试。运行：

```bash
pnpm vitest run test/rdf12-projection/payload-projector.test.ts
```

测试必须失败在当前缺失行为上。失败原因必须对应本文档定义的差距。

### 步骤 2：写 label 与 selector 失败测试

改 `test/rdf12-projection/labels.test.ts` 和 `test/rdf12-projection/selector-binding.test.ts`。运行：

```bash
pnpm vitest run test/rdf12-projection/labels.test.ts test/rdf12-projection/selector-binding.test.ts
```

测试必须暴露 local non-heading target alias 缺失。

### 步骤 3：新增 ownership resolver

新增 `src/rdf12-projection/heading-ownership.ts`。把 `xref-projector.ts` 的 source heading fallback 改为复用该 helper。运行：

```bash
pnpm vitest run test/rdf12-projection/xref-projector.test.ts test/rdf12-projection/book-entry-coordinate.test.ts
```

现有 xref source heading 行为和 book-entry coordinate 行为必须保持。

### 步骤 4：实现 local non-heading target alias

改 `src/rdf12-projection/labels.ts`。写 graph address label 与 catalog entry。运行：

```bash
pnpm vitest run test/rdf12-projection/labels.test.ts test/rdf12-projection/selector-binding.test.ts test/rdf12-projection/xref-projector.test.ts
```

local target alias 必须绑定 owning heading。xref target selector 指向 local non-heading ID 时必须产生 targetHeading、relation triple 和 reifier。

### 步骤 5：重构 payload projector

改 `src/rdf12-projection/payload-projector.ts`。实现 node marker、edge selector、role、format、payloadId、source owner binding。运行：

```bash
pnpm vitest run test/rdf12-projection/payload-projector.test.ts
```

payload projector tests 必须通过。

### 步骤 6：同步 acceptance 与 query contract

改 `test/rdf12-projection/payload.acceptance.test.ts`、`test/rdf12-projection/heading-projection.acceptance.test.ts`、`test/rdf12-projection/query-contracts.test.ts`。运行：

```bash
pnpm vitest run test/rdf12-projection/payload.acceptance.test.ts test/rdf12-projection/heading-projection.acceptance.test.ts test/rdf12-projection/query-contracts.test.ts
```

canonical sample 的 RDF facts 必须与 6 号书一致。

### 步骤 7：同步 README、preview sample、animation-yaml

改 `README.md`、`samples/rdf12-projection-preview.adoc`、animation-yaml fixtures 与 exporter tests。运行：

```bash
pnpm vitest run test/animation-yaml-export/export-animation-yaml.test.ts
```

下游 exporter 必须能读取新式 node payload。

### 步骤 8：运行完整验证

运行本文“验收命令”章节中的全部命令。所有命令必须通过。

## 验收命令

所有命令在 `micheng-ts/projects/asciidoc-abundant-tree` 下执行。

```bash
pnpm vitest run test/rdf12-projection/payload-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/labels.test.ts test/rdf12-projection/selector-binding.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/xref-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/payload.acceptance.test.ts test/rdf12-projection/heading-projection.acceptance.test.ts test/rdf12-projection/query-contracts.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/book-entry-coordinate.test.ts
```

```bash
pnpm vitest run test/rdf12-projection
```

```bash
pnpm vitest run test/animation-yaml-export/export-animation-yaml.test.ts
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm build
```

```bash
pnpm dev samples/structural-payload.adoc --format rdf12
```

若 `pnpm lint` 报告格式问题，执行者运行：

```bash
pnpm format
```

然后再次运行：

```bash
pnpm lint
```

执行者不得在失败命令存在时声明完成。若外部环境使某条命令无法运行，交付说明必须写出命令、失败原因、缺失环境和未验证风险。

## 完成定义

以下条件必须同时满足：

- [ ] `samples/structural-payload.adoc` 的 `[.banana, for=delivery]` 无 source payload id，RDF 输出仍包含 node payload object。
- [ ] node payload 通过 `heading-l5-o0 aat:payload payload-l10-o0` 读取。
- [ ] node payload 输出 `aat:payloadKind "node"`。
- [ ] node payload 输出 `aat:role "banana"`。
- [ ] node payload 输出 `aat:forSelector "delivery"`。
- [ ] node payload 输出 `aat:format "json"`。
- [ ] node payload 输出正确 raw、relativePath、startLine、endLine、contentStartLine、contentEndLine。
- [ ] node payload 无 source id 时不输出 `aat:payloadId`。
- [ ] `[.banana, for]` 能按 source owner 绑定 heading。
- [ ] `[.banana, for]` 不输出空 `aat:forSelector`。
- [ ] role-only listing 不成为 node payload。
- [ ] source-only listing 不成为 node payload。
- [ ] edge payload 通过 xref `payload=rel-delivery` 与 `#rel-delivery` 绑定。
- [ ] edge payload 输出 `aat:payloadKind "edge"`。
- [ ] edge payload 输出 `aat:payloadId "rel-delivery"`。
- [ ] edge payload 输出 `aat:role "pear"`。
- [ ] edge payload 输出 `aat:format "yaml"`。
- [ ] payload format 只来自 source block language。
- [ ] attrlist `data` 不影响 payload format。
- [ ] `heading-l5-o0` 输出 `aat:addressLabel "delivery"`。
- [ ] `heading-l5-o0` 输出 `aat:addressLabel "rel-delivery"`。
- [ ] `engine-code`、`perf-table`、`warning-text` 能绑定到 owning heading。
- [ ] paragraph block target ID 能绑定到 owning heading。
- [ ] block anchor target ID 能绑定到 owning heading。
- [ ] xref 指向 local non-heading target ID 时，relation triple 的 endpoint 是 owning heading。
- [ ] xref `payload=` selector 不参与 heading target binding。
- [ ] duplicate label across headings 返回 ambiguous。
- [ ] duplicate label within same heading 不制造 false ambiguity。
- [ ] role、display label、official reftext、raw text、direct attribute、heading IRI 不进入 selector binding。
- [ ] public RDF graph 不输出 `aat:PayloadBlock`、`aat:ListingBlock`、`aat:TableBlock`、`aat:AnchorTarget`、`aat:XrefOccurrence` 等旧结构资源类型。
- [ ] payload raw 内部字段不展开为业务 RDF 谓词。
- [ ] README RDF12 projection 示例使用当前 payload 表面。
- [ ] `samples/rdf12-projection-preview.adoc` 使用当前 payload 表面。
- [ ] animation-yaml fixtures 不依赖 `.payload` role 识别 node payload。
- [ ] animation-yaml exporter 能读取新式 node payload。
- [ ] 本文“验收命令”章节中的命令全部通过，或交付说明记录不可运行命令的环境原因与未验证风险。

## 提交说明材料

提交说明记录变迁事实。对象定义不写变迁过程；提交说明写变迁过程。

提交标题使用：

```text
feat: synchronize rdf12 payload projection with book contract
```

提交正文必须包含以下要点：

```text
- project node payloads from for/forSelector markers without requiring source payload ids
- project payload roles and derive payload format from source block language
- bind local non-heading target ids to owning heading address labels
- keep xref payload selector binding separate from heading selector binding
- update RDF12 acceptance/query tests, README preview, and animation-yaml fixtures
```

执行提交时只提交本任务路径。命令形态：

```bash
git add <new-files>
git commit --only -m "feat: synchronize rdf12 payload projection with book contract" -- <paths>
```

`<paths>` 必须只包含本任务修改的源码、测试、样例、README 和文档文件。执行者不得把 unrelated staged changes 混入提交。

## 写作与审查纪律

执行者修改 6 号书、README、测试名称和注释时，必须使用对象语言。

对象定义写当前事实。对象定义不写“以前、现在、后来、未来、废弃、迁移、兼容”等过程语言。过程语言写在 commit message、PR 描述或 changelog 中。

文档中的规则必须有明确执行对象。禁止使用会让执行者自行扩大或缩小范围的词。需要表达硬性要求时使用“必须”。需要表达禁止行为时使用“不得”。需要表达输出事实时直接写“输出”或“不输出”。

示例不能替代规则。每个示例前必须有规则，示例只展示规则的一个表面。

负面排除只在能阻止高成本误读时出现。本任务中必须排除的高成本误读包括：

* 用 role 决定 payload kind。
* 用 `data` 决定 payload format。
* 要求 node payload 必须有 source payload id。
* 把 payload block 创建为结构节点。
* 把 xref `payload=` 当作普通 xref target selector。

执行者完成实现后，reviewer 按本文“完成定义”逐条检查。任意一项不满足，任务未完成。
