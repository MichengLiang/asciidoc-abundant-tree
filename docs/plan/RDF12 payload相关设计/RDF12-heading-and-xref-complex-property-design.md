# RDF12 Heading And Xref Complex Property Design

本文档规定 RDF12 heading projection 中 heading node 与 xref edge evidence 的复杂属性模型、源表面、RDF 输出、源码改造范围、测试改造范围、样例与书籍同步范围、验收命令和完成定义。

本文档面向接手 `asciidoc-abundant-tree` 的开发者。开发者只需要当前代码库和本文档即可实施。本文档不依赖讨论记录，不要求开发者读取外部聊天材料。

执行命令的工作目录是：

```bash
micheng-ts/projects/asciidoc-abundant-tree
```

所有路径均相对于 `micheng-ts/projects/asciidoc-abundant-tree/`。执行者不得把 `/home/t103o/workbench` 当作本任务的项目根。

本文档是开发设计规约。`docs/bookshelf/books/06-rdf12-line-projection` 是 RDF12 heading projection 的规范书。开发者必须按本文档修改运行时代码、测试、样例、README、冷链消费脚本和 6 号书，使它们表达同一套对象事实。

## 1. 文档目标

本任务把 RDF12 heading projection 中的复杂数据挂载统一为字段模型：

* heading node 拥有字段。
* xref edge evidence 拥有字段。
* 字段名来自源表面的 name，并通过 `fieldPredicate()` 映射为 `aat:` predicate。
* 字段值为 scalar 时输出 literal。
* 字段值由 source value block 承载时输出 raw value object。

完成后的公共 RDF 图不使用 `aat:payload` 作为 heading 或 xref edge 的复杂属性入口。完成后的公共 RDF 图不使用 `aat:payloadSelector`、`aat:payloadKind`、`aat:payloadId`、`aat:role` 表达复杂属性机制。字段名已经承载下游模型选择语义；raw value object 只承载 raw、format、source coordinate 和必要的 binding evidence。

本文档规定：

* 当前代码事实。
* 目标对象模型。
* 源表面规范。
* RDF 输出契约。
* 匹配规则。
* 源码改造设计。
* 测试改造设计。
* 样例与文档同步范围。
* 验收命令。
* 完成定义。

完成声明必须同时满足 RDF 输出事实、测试、样例、README、6 号书和冷链消费脚本。任意一处仍表达 `aat:payload` 主查询模型，任务未完成。

## 2. 对象语言

本节定义本文档使用的对象术语。以下章节使用这些术语定义目标公共契约。

### 2.1 Field Predicate

field predicate 是字段名在 RDF 图中的谓词 IRI。项目已有 `src/rdf12-projection/field-predicate.ts`：

```ts
export function fieldPredicate(fieldName: string): Rdf12IriTerm
```

该函数把安全字段名映射为 `aat:<fieldName>`，把不能直接作为 prefixed local name 的字段名映射为 `aat:field-<encoded>`。

heading metadata direct attribute、heading complex property、xref edge literal field、xref edge complex property 均使用同一套 field predicate 规则。复杂属性不引入独立命名规则。

### 2.2 Literal Field

literal field 是值为 string literal 的字段。

heading metadata 中的 `status=active` 投影为：

```ttl
:heading aat:status "active" .
```

xref named attribute 中的 `weight=0.9` 在其 value 未绑定 source value block 时投影为：

```ttl
:xrefEdge aat:weight "0.9" .
```

literal field 不创建 raw value object。

### 2.3 Complex Property

complex property 是值为 raw value object 的字段。

complex property 的 subject 可以是 heading node，也可以是 xref edge evidence。complex property 的 predicate 是 field predicate。complex property 的 object 是 raw value object。

heading complex property 示例：

```ttl
:heading aat:release-policy-config :value-l10-o0 .
```

xref edge complex property 示例：

```ttl
:xrefEdge aat:dependency-evidence :value-l44-o0 .
```

complex property 不使用 `aat:payload` 作为谓词。字段名即下游消费入口。

### 2.4 Raw Value Object

raw value object 是保存 source value block 的 raw text、format 和 source coordinate 的 RDF resource。

raw value object 输出以下字段：

* `aat:format`
* `aat:raw`
* `aat:relativePath`
* `aat:startLine`
* `aat:endLine`
* `aat:contentStartLine`
* `aat:contentEndLine`

raw value object 在存在 selector binding evidence 时输出以下字段：

* `aat:forSelector`
* `aat:sourceValueId`

raw value object 不输出以下字段：

* `aat:payloadKind`
* `aat:role`
* `aat:payloadId`

raw value object 不作为 heading node，不参与 heading tree，不参与 xref target binding，不展开 raw 内部字段。

### 2.5 Source Value Block

source value block 是源文档中承载 raw value 的 listing/source block。

source value block 自身不是 RDF structure node。source value block 只有在 heading complex property 或 xref edge complex property 规则匹配时才进入 RDF 图，并以 raw value object 的形式出现。

未被规则匹配的 source block 保持普通 AsciiDoc block 身份，不创建 raw value object。

### 2.6 Source Value Id

source value id 是 source value block 的本地 id。

xref edge complex property 使用 xref named attribute value 匹配 source value id。匹配成立时，raw value object 输出：

```ttl
:value aat:sourceValueId "rel-release-temperature-audit" .
```

source value id 是 binding evidence，不是字段名，不是 raw value object 的 RDF identity。

source value id 仍属于本地非标题 target id。该 id 按 local target alias 规则归属到 owning heading 的 `aat:addressLabel`。普通 xref target selector 使用该 id 时绑定 owning heading；xref named attribute value 使用该 id 时绑定 raw value object。两个绑定由字段语境区分。

### 2.7 Property Role

property role 是 heading complex property source block 上承担字段名职责的 role token。

源表面：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{ ... }
----
```

`release-policy-config` 是 property role。它投影为 heading 上的 field predicate：

```ttl
:heading aat:release-policy-config :value .
```

property role 不投影为 raw value object 上的 `aat:role` literal。

### 2.8 Control Field

control field 是不按普通 xref field 处理的 xref named attribute。

`rel` 是 xref relation control field。它决定 relation predicate，并作为 edge evidence 输出：

```ttl
:xrefEdge aat:rel "depends-on" .
```

`rel` 不参与 source value id matching。

`payload` 不属于目标复杂属性契约的 control field。完成后的规范样例、6 号书、README、冷链消费脚本和目标测试不得使用 `payload=` 表达复杂属性。

### 2.9 Binding Evidence

binding evidence 是解释 raw value object 如何从源表面连接到 subject 的证据字段。

heading complex property 使用带值 `for` 或 `forSelector` 绑定 heading 时，raw value object 输出：

```ttl
:value aat:forSelector "cold-chain-release" .
```

xref edge complex property 通过 source value id 匹配 source value block 时，raw value object 输出：

```ttl
:value aat:sourceValueId "rel-release-temperature-audit" .
```

无值 `for` 使用 source ownership 绑定 heading，不输出空 `aat:forSelector`。

## 3. 当前代码状态

本节描述当前实现中与本任务有关的事实。当前状态用于定位改造点，不是目标契约。

### 3.1 `field-predicate.ts`

`src/rdf12-projection/field-predicate.ts` 已提供字段名到 `aat:` predicate 的统一映射。

目标实现复用该函数。heading complex property 和 xref edge complex property 不创建新的 predicate 命名机制。

### 3.2 `attributes.ts`

`src/rdf12-projection/attributes.ts` 当前把 heading metadata attributes 和 xref named attributes 投影为 literal fields。

当前文件中 `xrefControlAttributes` 包含：

```ts
const xrefControlAttributes = new Set(["rel", "payload"]);
```

目标实现中 `rel` 仍为 relation control field。目标实现中 `payload` 不作为复杂属性控制字段。xref named attribute 的 value 如果唯一匹配 source value id，attribute 输出 complex property；否则输出 literal field。

### 3.3 `xref-projector.ts`

`src/rdf12-projection/xref-projector.ts` 当前读取 xref attributes 中的 `payload`，并输出：

```ttl
:xrefEdge aat:payloadSelector "..." .
```

目标实现不输出 `aat:payloadSelector`。

`xref-projector.ts` 继续负责以下对象：

* xref edge evidence resource。
* xref source span。
* `aat:syntax`
* `aat:raw`
* `aat:targetSelector`
* official Asciidoctor facts。
* `aat:displayLabel`
* `aat:sourceHeading`
* `aat:targetHeading`
* `aat:candidateHeading`
* `aat:rel`
* relation triple。
* RDF 1.2 reifier。

### 3.4 `payload-projector.ts`

`src/rdf12-projection/payload-projector.ts` 当前处理 node payload 和 edge payload，并输出以下公共事实：

* heading `aat:payload` payload object。
* xref edge `aat:payload` payload object。
* payload object `aat:payloadKind`。
* payload object `aat:role`。
* payload object `aat:payloadId`。
* payload object `aat:forSelector`。
* payload object `aat:format`。
* payload object `aat:raw`。
* payload object source coordinates。

目标实现把该文件重构为复杂属性与 raw value object 投影。目标输出不包含 `aat:payload`、`aat:payloadKind`、`aat:role`、`aat:payloadId`。

### 3.5 `metadata-parser.ts`

`src/metadata-parser.ts` 决定 attrlist 中 role、id、named attribute 和无值 attribute 的运行时形态。

目标实现必须确认 `[.review-playbook, for]` 在 `MetadataNode.attributes` 中保留 `for` marker presence。若当前解析结果不能区分 marker presence 与 absence，开发者必须修正 metadata parsing，并为无值 `for`、带值 `for=...` 和带值 `forSelector=...` 增加测试。

### 3.6 `samples/cold-chain-payload/consume_payloads.py`

当前冷链消费脚本通过以下查询形态读取 heading node payload：

```sparql
?heading aat:payload ?payload .
?payload aat:payloadKind "node" ;
         aat:role ?role ;
         aat:format ?format ;
         aat:raw ?raw .
```

目标脚本按 field predicate 查询 raw value object：

```sparql
?heading aat:release-policy-config ?releasePolicyConfig ;
         aat:review-playbook ?reviewPlaybook .
```

当前脚本通过 xref edge `aat:payload` 读取 edge payload。目标脚本按 xref edge field predicate 查询：

```sparql
?edge aat:dependency-evidence ?dependencyEvidence .
```

### 3.7 6 号书与公共 README

`docs/bookshelf/books/06-rdf12-line-projection` 是 RDF12 heading projection 的规范书。该书表达 complex property / raw value object 对象模型，不承担当前实现状态记录。

书中对象语言使用 complex property、raw value object、source value block、source value id、property role、field predicate。书中不得把 `aat:payload`、`aat:payloadKind`、`aat:role` 或 payload selector 作为复杂属性公共查询模型。

`README.md` 和 `samples/cold-chain-payload/README.md` 必须与 6 号书保持一致。

## 4. 目标对象模型

### 4.1 总规则

RDF12 heading projection 暴露 heading node 与 xref edge evidence。

heading node 与 xref edge evidence 均可以拥有字段。字段名来自源表面的 name，并通过 `fieldPredicate()` 映射为 `aat:` predicate。

字段值有两种形态：

* scalar value 输出 string literal。
* raw source value 输出 raw value object。

raw value object 保存 raw、format、source coordinate 和 binding evidence。raw value object 不保存字段名。字段名由 subject 到 raw value object 的 predicate 表达。

### 4.2 Heading Complex Property

heading complex property 是 heading node 上的复杂字段。

源表面由 source value block 表达。source value block 必须携带 `for` 或 `forSelector` marker。source value block 必须有一个 property role。property role 是字段名。

带值 marker 使用 heading projection label space 绑定 heading：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{ ... }
----
```

投影：

```ttl
:heading-l5-o0 aat:release-policy-config :value-l10-o0 .

:value-l10-o0 aat:forSelector "cold-chain-release" ;
    aat:format "json" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 10 ;
    aat:endLine 32 ;
    aat:contentStartLine 13 ;
    aat:contentEndLine 31 .
```

无值 marker 使用 source ownership 绑定 heading：

```asciidoc
[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
----
```

投影：

```ttl
:heading-l5-o0 aat:review-playbook :value-l34-o0 .

:value-l34-o0 aat:format "yaml" ;
    aat:raw """review_team: quality-ops""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 34 ;
    aat:endLine 42 ;
    aat:contentStartLine 37 ;
    aat:contentEndLine 41 .
```

无值 marker 不输出 `aat:forSelector`。

heading complex property 不要求 source value id。source value block 上出现 id 时，该 id 不参与 heading complex property 字段名，也不输出为 raw value object identity。

### 4.3 Xref Edge Complex Property

xref edge complex property 是 xref edge evidence 上的复杂字段。

源表面由 xref named attribute 和 source value block 共同表达。xref named attribute 的 key 是字段名。xref named attribute 的 value 精确匹配 source value block id 时，该字段输出 raw value object。

源表面：

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

[#rel-release-temperature-audit]
[source,yaml]
----
source: quality-sop-2026
risk_level: high
----
```

投影：

```ttl
:xref-edge-l8-c12-o0 aat:dependency-evidence :value-l44-o0 ;
    aat:weight "0.9" ;
    aat:rel "depends-on" .

:value-l44-o0 aat:sourceValueId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """source: quality-sop-2026
risk_level: high""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 44 ;
    aat:endLine 53 ;
    aat:contentStartLine 47 ;
    aat:contentEndLine 52 .
```

一个 xref edge evidence 可以拥有多个 complex properties：

```asciidoc
xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit, risk-assessment=rel-release-risk, review-procedure=rel-release-review]
```

投影：

```ttl
:xrefEdge aat:dependency-evidence :dependencyEvidenceValue ;
    aat:risk-assessment :riskAssessmentValue ;
    aat:review-procedure :reviewProcedureValue ;
    aat:weight "0.9" .
```

未绑定 source value block id 的 xref named attribute 输出 literal field。投影器不诊断作者意图。

xref target selector 与 xref named attribute value 使用不同语境。`xref:rel-release-temperature-audit[...]` 作为 xref target selector 时查询 heading projection label space；`dependency-evidence=rel-release-temperature-audit` 作为 xref named attribute 时查询 source value id。相同字符串可以同时作为 owning heading 的 address label 和 raw value object 的 source value id。

### 4.4 Raw Opacity

raw value object 的 `aat:raw` 是 opaque literal。RDF12 heading projection 不解析 JSON、YAML、TOML、XML 或其它 raw 内容。RDF12 heading projection 不把 raw 内部字段展开为 RDF business predicates。

下游消费者按 field predicate 和 `aat:format` 解释 raw。

示例：

* `aat:release-policy-config` 对应下游 `ReleasePolicyConfig` model。
* `aat:review-playbook` 对应下游 `ReviewPlaybook` model。
* `aat:dependency-evidence` 对应下游 `DependencyEvidence` model。

RDF12 heading projection 只保存 raw、format、source coordinate 和 binding evidence。

## 5. 源表面规范

### 5.1 冷链样例 Heading Complex Properties

冷链策略标题源表面：

```asciidoc
[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "manualReviewWhen": ["sensor_gap", "route_exception"]
}
----

[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
steps:
  - check last temperature checkpoint
  - compare shipment route exception log
----
```

字段解释：

* `status=active` 是 heading literal field。
* `owner=quality-ops` 是 heading literal field。
* `release-policy-config` 是 heading complex property field name。
* `for=cold-chain-release` 使用 heading label space 绑定 heading。
* `review-playbook` 是 heading complex property field name。
* 无值 `for` 使用 source ownership 绑定 heading。
* `[source,json]` 输出 `aat:format "json"`。
* `[source,yaml]` 输出 `aat:format "yaml"`。

### 5.2 冷链样例 Xref Edge Complex Property

冷链依赖边源表面：

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

[#rel-release-temperature-audit]
[source,yaml]
----
source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。
----
```

字段解释：

* `rel=depends-on` 是 relation control field。
* `weight=0.9` 是 xref edge literal field。
* `dependency-evidence` 是 xref edge complex property field name。
* `rel-release-temperature-audit` 是 source value id。
* `#rel-release-temperature-audit` 是 source value block id。
* `[source,yaml]` 输出 `aat:format "yaml"`。

source value block 不需要 `.dependency-evidence` role。属性名已经由 xref attribute key 给出。

### 5.3 结构样例字段命名

`samples/structural-payload.adoc` 使用业务字段名，不使用占位水果名。

目标表面：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, relation-evidence=rel-delivery-capacity]。

[.policy-risk-profile, for=delivery]
[source,json]
----
{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}
----

[#rel-delivery-capacity]
[source,yaml]
----
reason:
  type: risk-control
  signals:
    - weather
    - capacity
  description: 配送策略需要读取运力规则来决定是否降级。
edge:
  direction: outbound
  required: true
----
```

RDF 字段：

```ttl
:deliveryHeading aat:policy-risk-profile :policyRiskProfileValue .
:xrefEdge aat:relation-evidence :relationEvidenceValue .
```

## 6. RDF 输出契约

本节规定目标 RDF 输出形状。测试必须按本节断言。

### 6.1 Heading Node

冷链策略标题输出：

```ttl
:heading-l5-o0 a aat:Heading ;
    aat:addressLabel "cold-chain-release" ;
    aat:role "policy" ;
    aat:status "active" ;
    aat:owner "quality-ops" ;
    aat:release-policy-config :value-l10-o0 ;
    aat:review-playbook :value-l34-o0 .
```

标题 role `policy` 仍是 heading classification。它不同于 heading complex property 的 property role。

### 6.2 Heading Raw Value Objects

带 selector 的 heading complex property value：

```ttl
:value-l10-o0 aat:forSelector "cold-chain-release" ;
    aat:format "json" ;
    aat:raw """{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "manualReviewWhen": ["sensor_gap", "route_exception"]
}""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 10 ;
    aat:endLine 32 ;
    aat:contentStartLine 13 ;
    aat:contentEndLine 31 .
```

source ownership heading complex property value：

```ttl
:value-l34-o0 aat:format "yaml" ;
    aat:raw """review_team: quality-ops
steps:
  - check last temperature checkpoint
  - compare shipment route exception log""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 34 ;
    aat:endLine 42 ;
    aat:contentStartLine 37 ;
    aat:contentEndLine 41 .
```

### 6.3 Xref Edge Evidence

冷链依赖 xref edge 输出：

```ttl
:xref-edge-l8-c12-o0 a aat:XrefEdge ;
    aat:sourceHeading :heading-l5-o0 ;
    aat:targetHeading :heading-l55-o0 ;
    aat:targetSelector "temperature-audit" ;
    aat:displayLabel "温控审计规则" ;
    aat:rel "depends-on" ;
    aat:weight "0.9" ;
    aat:dependency-evidence :value-l44-o0 ;
    aat:raw "xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]" .
```

relation triple 与 RDF 1.2 reifier 仍属于 xref edge projection：

```ttl
:heading-l5-o0 rel:depends-on :heading-l55-o0 .
:xref-edge-l8-c12-o0 rdf:reifies <<(:heading-l5-o0 rel:depends-on :heading-l55-o0)>> .
```

### 6.4 Xref Edge Raw Value Object

```ttl
:value-l44-o0 aat:sourceValueId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 44 ;
    aat:endLine 53 ;
    aat:contentStartLine 47 ;
    aat:contentEndLine 52 .
```

### 6.5 Forbidden Public Facts

目标 RDF 图不得输出以下事实：

* heading 通过 `aat:payload` 指向 heading raw value object。
* xref edge evidence 通过 `aat:payload` 指向 edge raw value object。
* xref edge evidence 输出 `aat:payloadSelector`。
* raw value object 输出 `aat:payloadKind`。
* raw value object 输出 `aat:role`。
* raw value object 输出 `aat:payloadId`。
* raw value object 声明为 `aat:PayloadBlock`。
* raw value object 声明为 `aat:Heading`。
* raw value object 作为 `aat:containsDirectly` subject 或 object。
* raw value object 输出 `aat:documentOrder`。
* raw value object 作为 `aat:targetHeading` object。
* raw 内部字段展开为 `aat:owner`、`aat:risk`、`aat:reason`、`aat:edge` 等业务谓词。

## 7. 匹配规则

### 7.1 Source Value Block Index

投影器建立 source value block index。index 从 document tree 中收集 listing/source blocks。

每条 index entry 保存：

* block ids。
* source block language。
* raw content。
* block source span。
* content span。
* source relative path。
* metadata roles。
* metadata attributes。

index 只收集具有 block source span、raw content 和 source relative path 的 listing/source blocks。缺少 source span 或 raw content 的 block 不能产生 raw value object。

source value block index 不判断 block 是否进入 RDF 图。index 只提供匹配所需的 source facts。

### 7.2 Heading Complex Property Matching

listing/source block 的 attrlist 中存在 `for` 或 `forSelector` marker 时，该 block 是 heading complex property candidate。

candidate 必须有一个 property role。property role 是 field name。

candidate 没有 property role 时，不输出 heading complex property。

candidate 有多个 property roles 时，不输出 heading complex property。多个 role 不能稳定给出一个字段名。投影器不猜测哪个 role 是字段名。

带值 `for` 或 `forSelector`：

* marker value 是 heading selector。
* selector 查询 heading projection label space。
* selector 唯一绑定 heading 时，输出 heading complex property。
* selector 未绑定时，不输出 heading complex property。
* selector 多义绑定时，不输出 heading complex property。

无值 `for` 或 `forSelector`：

* marker 表达 source ownership binding。
* 投影器按 block start line 与 relativePath 查找 innermost owning heading。
* 找到 owning heading 时，输出 heading complex property。
* 找不到 owning heading 时，不输出 heading complex property。
* 不输出空 `aat:forSelector`。

未输出 heading complex property 的 candidate 不创建孤立 raw value object。

### 7.3 Xref Edge Complex Property Matching

xref occurrence 的 named attributes 按以下规则处理。

`rel` 是 relation control field：

* 映射 relation predicate。
* 输出 `aat:rel`。
* 不参与 source value id matching。

其它 named attributes：

* attribute key 通过 `fieldPredicate()` 映射为 predicate。
* attribute value 唯一匹配 source value block id 时，输出 xref edge complex property。
* attribute value 未匹配 source value block id 时，输出 literal field。
* attribute value 匹配多个 source value blocks 时，输出 literal field。

投影器不输出诊断。投影器不判断作者意图。匹配成立则输出 complex property；匹配不成立则输出 literal field。

xref named attribute 的处理范围不包括 positional label。xref display label 继续输出为 `aat:displayLabel`，不参与 source value id matching。

### 7.4 Source Value Id Matching

source value id matching 使用 source value block ids。

匹配键是 xref named attribute value 的完整字符串。投影器不做 fuzzy matching，不做 case folding，不按 headline、role、raw content 或 generated label 匹配。

同一 id 对应一个 source value block 时为唯一匹配。

同一 id 对应多个 source value blocks 时为多义匹配。

### 7.5 Format Rule

raw value object 的 `aat:format` 来自 source block language，即 `ListingNode.language`。

投影器不从 attrlist `data` 读取 format。投影器不从 raw content 猜测 format。

source block 没有 language 时，不输出 `aat:format`。

## 8. 源码改造设计

### 8.1 `src/rdf12-projection/payload-projector.ts`

该文件承载复杂数据投影实现。实现保留文件名，内部对象语言改为 complex property 与 raw value object。

必须实现：

* source value block index。
* heading complex property candidate 识别。
* heading selector binding。
* heading source ownership binding。
* xref edge complex property matching。
* raw value object resource creation。
* raw value object format/raw/source coordinate output。
* `aat:forSelector` output for selector-bound heading complex property。
* `aat:sourceValueId` output for xref edge complex property。

必须删除或停止输出：

* heading `aat:payload` connection。
* xref edge `aat:payload` connection。
* `aat:payloadKind`。
* `aat:role` on raw value object。
* `aat:payloadId`。

resource identity 使用现有 block resource local id allocator。当前 `ResourceKind` 包含 `payload`，不包含 `value`；实现保留 `payload-l<line>-o<n>` 形式的 IRI fragment。该 fragment 是 graph resource identity，不是字段名，不是 raw value object 的公共类别。测试不得通过 fragment 中的 `payload` 词判断对象语义。

### 8.2 `src/rdf12-projection/attributes.ts`

heading metadata direct attributes 继续由 `attributes.ts` 投影。

xref named attributes 不能在 `attributes.ts` 中全部提前输出 literal，然后由 complex property projector 追加 object。否则同一个 attribute 会同时拥有 literal 和 raw value object。

目标实现采用以下职责分配：

* `attributes.ts` 投影 heading metadata roles 与 heading metadata named attributes。
* `attributes.ts` 不投影 xref named attributes。
* xref named attributes 由 complex property projector 统一处理：`rel` 由 `xref-projector.ts` 处理，其它 named attributes 在 complex property projector 中按 matching rule 输出 literal 或 raw value object。

该职责分配保证每个 xref attribute 只输出一种 field value。

### 8.3 `src/rdf12-projection/xref-projector.ts`

保留：

* xref edge resource creation。
* source span triples。
* `aat:syntax`
* `aat:raw`
* `aat:targetSelector`
* official Asciidoctor facts。
* `aat:displayLabel`
* `aat:sourceHeading`
* `aat:targetHeading`
* `aat:candidateHeading`
* `aat:rel`
* relation triple。
* RDF 1.2 reifier。

删除:

* 读取 `payload` 作为 control attribute。
* 输出 `aat:payloadSelector`。

`rel` 是唯一由 xref relation mapping 消费的 xref named attribute。

### 8.4 `src/rdf12-projection/field-predicate.ts`

不改 `fieldPredicate()` 行为。

所有字段名使用该函数：

* heading metadata literal fields。
* heading complex property fields。
* xref edge literal fields。
* xref edge complex property fields。

### 8.5 `src/metadata-parser.ts`

开发者必须验证 attrlist 无值字段的解析结果。`[.review-playbook, for]` 必须在 metadata attributes 中保留 `for` 的存在事实。实现不得把 marker absence、empty selector 和 source ownership marker 混为同一个字符串。

若 parser 当前不能提供该事实，开发者必须修改 parser，并更新 parser 或 metadata 相关测试。该修改不得改变 id、role、style、language 和普通 named attribute 的既有语义。

### 8.6 `src/rdf12-projection/heading-ownership.ts`

source ownership heading complex property 使用 `findInnermostHeadingBySourceLine()`。

该 helper 已服务 source line ownership。实现者不得复制另一套 ownership 逻辑。

### 8.7 `samples/cold-chain-payload/consume_payloads.py`

脚本按 field predicate 查询 raw value objects。

策略报告查询 `aat:release-policy-config` 与 `aat:review-playbook`。

关系报告查询 `aat:dependency-evidence`。

脚本不再按 `aat:payload` 枚举 node values。脚本不再读取 raw value object 上的 `aat:role`。

### 8.8 `src/animation-yaml-export`

`animation-yaml-export` 若读取 RDF12 complex data，必须改为 field predicate 查询。它不得依赖 `aat:payload`、`aat:payloadKind` 或 raw value object `aat:role`。

对应 fixtures 使用业务字段名和 `for` marker，不使用 `.payload` 或 `payload=`。

## 9. 测试改造设计

### 9.1 `test/rdf12-projection/payload-projector.test.ts`

该测试文件改为 complex property projector 单元测试。

必须覆盖 heading complex property：

* `[.release-policy-config, for=delivery]` 输出 `heading aat:release-policy-config value`。
* raw value object 输出 `aat:forSelector "delivery"`。
* raw value object 输出 `aat:format`。
* raw value object 输出 `aat:raw`。
* raw value object 输出 source line spans。
* raw value object 不输出 `aat:role`。
* raw value object 不输出 `aat:payloadKind`。
* raw value object 不输出 `aat:payloadId`。

必须覆盖 source ownership:

* `[.review-playbook, for]` 输出 `heading aat:review-playbook value`。
* raw value object 不输出 `aat:forSelector`。
* marker absence、empty selector 和 source ownership marker 不被混同。

必须覆盖 invalid heading complex property candidates:

* role-only listing 不输出 heading complex property。
* source-only listing 不输出 heading complex property。
* `for` marker with no property role 不输出 heading complex property。
* `for` marker with multiple property roles 不输出 heading complex property。
* unresolved `for=<selector>` 不输出 heading complex property。
* ambiguous `for=<selector>` 不输出 heading complex property。

必须覆盖 xref edge complex property:

* xref named attribute `dependency-evidence=rel-delivery-capacity` 匹配 source value block id 时输出 `xrefEdge aat:dependency-evidence value`。
* raw value object 输出 `aat:sourceValueId "rel-delivery-capacity"`。
* raw value object 输出 `aat:format`。
* raw value object 输出 `aat:raw`。
* raw value object 输出 source line spans。
* raw value object 不输出 `aat:role`。
* raw value object 不输出 `aat:payloadKind`。
* raw value object 不输出 `aat:payloadId`。
* xref edge 不输出 `aat:payload`。
* xref edge 不输出 `aat:payloadSelector`。

必须覆盖 literal fallback:

* xref named attribute `weight=0.8` 输出 `aat:weight "0.8"`。
* xref named attribute value 未匹配 source value block id 时输出 literal field。
* xref named attribute value 多义匹配 source value block id 时输出 literal field。

必须覆盖 multiple edge complex properties:

* 一个 xref edge 同时输出 `aat:dependency-evidence`、`aat:risk-assessment`、`aat:review-procedure` 三个 raw value object。

### 9.2 `test/rdf12-projection/attributes.test.ts`

该测试覆盖 field projection split：

* heading metadata literal fields 继续输出。
* xref `rel` 不输出为普通 literal field之外的重复 field。
* xref literal attribute 由 complex property projector 输出。
* xref complex attribute 不同时输出 literal。

### 9.3 `test/rdf12-projection/xref-projector.test.ts`

该测试继续覆盖 xref edge evidence：

* source heading。
* target heading。
* target selector。
* display label。
* official resolved facts。
* relation triple。
* RDF 1.2 reifier。
* local non-heading target alias relation endpoints。

删除或改写 `payloadSelector` 相关断言。目标 xref edge 不输出 `aat:payloadSelector`。

保留或增加 source value id 作为 local target alias 的断言。普通 xref target selector 指向 source value id 时，`targetHeading` 是 owning heading；xref named attribute value 指向同一 source value id 时，输出 xref edge complex property。

### 9.4 `test/rdf12-projection/payload.acceptance.test.ts`

该测试按 canonical sample 验收 complex property：

* `delivery` heading 输出 `aat:policy-risk-profile` raw value object。
* xref edge 输出 `aat:relation-evidence` raw value object。
* raw value objects 输出 format/raw/source coordinate。
* raw value objects 不输出 payload mechanism fields。
* raw 内部字段不展开。
* raw value objects 不成为 structure node。

### 9.5 `test/rdf12-projection/query-contracts.test.ts`

公共查询契约改为 field predicate 查询：

heading complex property query:

```sparql
SELECT ?raw ?format WHERE {
  ?heading aat:addressLabel "delivery" ;
           aat:policy-risk-profile ?value .
  ?value aat:raw ?raw ;
         aat:format ?format .
}
```

xref edge complex property query:

```sparql
SELECT ?raw ?format WHERE {
  ?edge a aat:XrefEdge ;
        aat:relation-evidence ?value .
  ?value aat:raw ?raw ;
         aat:format ?format .
}
```

测试不得查询 `aat:payload`、`aat:payloadKind`、`aat:role` 或 `aat:payloadSelector`。

### 9.6 `test/rdf12-projection/heading-projection.acceptance.test.ts`

该测试同步 structural sample：

* `banana` 改为业务字段名，例如 `policy-risk-profile`。
* `pear` 改为业务字段名，例如 `relation-evidence`。
* `payload=...` 改为 `relation-evidence=...`。
* edge source value block 不使用 role 表达 edge property name。
* 验收 RDF facts 使用 field predicates。

### 9.7 `test/animation-yaml-export/export-animation-yaml.test.ts`

animation-yaml fixtures 中的 complex data 表面必须同步为 complex property surface。

测试必须证明 exporter 通过 field predicate 读取 raw value object。

## 10. 样例与文档同步

### 10.1 `samples/cold-chain-payload/cold-chain-release.adoc`

保留 heading complex property blocks：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
...
----

[.review-playbook, for]
[source,yaml]
----
...
----
```

修改 xref edge complex property：

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。
```

修改 edge source value block：

```asciidoc
[#rel-release-temperature-audit]
[source,yaml]
----
...
----
```

### 10.2 `samples/cold-chain-payload/README.md`

同步以下内容：

* 结构覆盖表。
* 源 AsciiDoc。
* 预生成 Turtle。
* Python 消费脚本说明。
* Python 输出记录。
* 消费边界。

README 使用 complex property / raw value object 对象语言。README 不把 `aat:payload` 作为 node 或 edge 复杂属性查询入口。

### 10.3 `samples/structural-payload.adoc`

替换占位字段名。

目标表面：

```asciidoc
配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, relation-evidence=rel-delivery-capacity]。

[.policy-risk-profile, for=delivery]
[source,json]
----
...
----

[#rel-delivery-capacity]
[source,yaml]
----
...
----
```

### 10.4 `samples/rdf12-projection-preview.adoc`

README preview sample 与目标 complex property surface 一致。

### 10.5 `README.md`

RDF12 Projection 章节同步 complex property contract：

* heading complex properties use `for` / `forSelector` marker。
* heading complex property field name comes from property role。
* xref edge complex property field name comes from xref named attribute key。
* xref edge complex property value binds source value id。
* raw value object preserves format/raw/source coordinates。
* raw stays opaque。
* field predicates are the public query entry。

README 示例不得使用 `payload=`、`aat:payload`、`aat:payloadSelector`、`aat:payloadKind`、raw value object `aat:role` 表达复杂属性。

### 10.6 `docs/bookshelf/books/06-rdf12-line-projection`

6 号书同步目标对象模型。

需要修改：

* `frontmatter/preface.adoc`
* `backmatter/glossary.adoc`
* `book.adoc`
* `chapters/01-projection-object.adoc`
* `chapters/02-heading-node.adoc`
* `chapters/04-structure-edges.adoc`
* `chapters/05-xref-edge.adoc`
* `chapters/06-field-and-complex-property.adoc`
* `chapters/07-query-contract.adoc`
* `chapters/08-worked-example.adoc`

6 号书写当前对象事实。变迁过程和实现历史写入提交说明。

## 11. 验收命令

所有命令在 `micheng-ts/projects/asciidoc-abundant-tree` 下执行。

```bash
pnpm vitest run test/rdf12-projection/payload-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/attributes.test.ts test/rdf12-projection/xref-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/payload.acceptance.test.ts test/rdf12-projection/query-contracts.test.ts test/rdf12-projection/heading-projection.acceptance.test.ts
```

```bash
pnpm vitest run test/rdf12-projection
```

```bash
pnpm vitest run test/animation-yaml-export/export-animation-yaml.test.ts
```

```bash
pnpm --silent dev samples/cold-chain-payload/cold-chain-release.adoc --format rdf12
```

```bash
uv run samples/cold-chain-payload/consume_payloads.py
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

所有命令必须通过。命令失败时，交付说明必须写出失败命令、失败原因、已验证范围和未验证风险。

## 12. 完成定义

以下事实全部成立时，本任务完成。

- [ ] heading complex property 使用 field predicate 输出 raw value object。
- [ ] xref edge complex property 使用 field predicate 输出 raw value object。
- [ ] heading literal fields 继续输出 literal。
- [ ] xref edge literal fields 继续输出 literal。
- [ ] xref `rel` 继续映射 relation predicate，并输出 `aat:rel`。
- [ ] xref named attribute value 唯一匹配 source value id 时输出 complex property。
- [ ] xref named attribute value 未匹配 source value id 时输出 literal field。
- [ ] xref named attribute value 多义匹配 source value id 时输出 literal field。
- [ ] raw value object 输出 `aat:format`。
- [ ] raw value object 输出 `aat:raw`。
- [ ] raw value object 输出 `aat:relativePath`。
- [ ] raw value object 输出 `aat:startLine`。
- [ ] raw value object 输出 `aat:endLine`。
- [ ] raw value object 输出 `aat:contentStartLine`。
- [ ] raw value object 输出 `aat:contentEndLine`。
- [ ] selector-bound heading raw value object 输出 `aat:forSelector`。
- [ ] source-owned heading raw value object 不输出 `aat:forSelector`。
- [ ] xref edge raw value object 输出 `aat:sourceValueId`。
- [ ] source value id 继续作为 local target alias 归属 owning heading。
- [ ] 普通 xref target selector 指向 source value id 时绑定 owning heading。
- [ ] xref named attribute value 指向 source value id 时绑定 raw value object。
- [ ] raw value object 不输出 `aat:role`。
- [ ] raw value object 不输出 `aat:payloadKind`。
- [ ] raw value object 不输出 `aat:payloadId`。
- [ ] heading 不通过 `aat:payload` 连接 heading raw value object。
- [ ] xref edge evidence 不通过 `aat:payload` 连接 edge raw value object。
- [ ] xref edge evidence 不输出 `aat:payloadSelector`。
- [ ] raw value object 不创建 heading node。
- [ ] raw value object 不参与 heading tree。
- [ ] raw value object 不作为 xref target heading。
- [ ] raw 内部字段不展开为业务 RDF predicates。
- [ ] cold-chain source uses `dependency-evidence=rel-release-temperature-audit`。
- [ ] cold-chain edge source value block uses `[#rel-release-temperature-audit]` without role。
- [ ] cold-chain consumer script queries `aat:release-policy-config`。
- [ ] cold-chain consumer script queries `aat:review-playbook`。
- [ ] cold-chain consumer script queries `aat:dependency-evidence`。
- [ ] structural sample uses business field names, not placeholder fruit names。
- [ ] README uses complex property / raw value object contract。
- [ ] 6 号书 uses complex property / raw value object contract。
- [ ] `samples/cold-chain-payload/README.md` uses complex property / raw value object contract。
- [ ] 验收命令全部通过。

## 13. 写作纪律

6 号书写对象事实。提交说明写变迁过程和实现历史。

本文档写当前代码状态和目标状态。本文档不写聊天过程。

提交说明写变迁事实。

文档规则使用确定表达。对象规则直接写构成条件、输出事实、禁止事实和验收事实。6 号书的对象定义只包含当前对象事实。

公共 RDF 输出中的每个字段必须有消费者动作：

* field predicate 让消费者按字段名查询。
* raw value object 让消费者取得 raw、format 和 source coordinate。
* `aat:forSelector` 让消费者审计 heading selector binding。
* `aat:sourceValueId` 让消费者审计 source value id binding。

不能说明消费者动作的字段不进入公共 RDF 输出。

投影器不做 linter。投影器不推断作者意图。投影器只按源表面匹配规则输出 RDF facts。

示例不能替代规则。每个示例前必须有规则，示例只展示规则的一个表面。

## 14. 提交说明材料

Git commit 承担变迁叙述。提交标题：

```text
feat: project rdf12 complex properties as named raw values
```

提交正文包含：

```text
- project heading complex properties from for-marked source value blocks
- project xref edge complex properties from named attributes bound to source value ids
- represent complex property values as raw value objects with format and source coordinates
- remove generic payload predicates from the public RDF query path
- update samples, 6号书, README, and cold-chain consumer queries
```

提交时只提交本任务涉及路径。存在新文件时先 stage 新文件，再使用限定路径提交：

```bash
git add "docs/plan/RDF12 payload相关设计/RDF12-heading-and-xref-complex-property-design.md"
git add docs/bookshelf/books/06-rdf12-line-projection/chapters/06-field-and-complex-property.adoc
git add -u docs/bookshelf/books/06-rdf12-line-projection
git commit --only -m "feat: project rdf12 complex properties as named raw values" -- <paths>
```

`<paths>` 只包含本任务修改的源码、测试、样例、README、6 号书和本文档。
