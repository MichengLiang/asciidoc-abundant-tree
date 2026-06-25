# `indexterm2 + rel` 行内实体关系投影设计

本文定义一种 AsciiDoc 行内关系声明表面。该表面使用 `indexterm2:[...]` 标记端点 selector，使用 `rel:predicate[...]` 声明关系谓词，并在 RDF 1.2 投影中生成端点资源、行内关系证据、条件成立的主关系 triple、候选绑定事实和结构诊断。

行内关系投影处理源文档中已经写明的关系声明。标题和术语表 term 形成可寻址端点资源；`indexterm2` primary 值查询 selector catalog；`rel` inline macro 触发同一行内的 selector 消费；完成消费的 selector-pair 形成 `aat:InlineRelationEdge`；端点唯一绑定且 predicate 有效时，投影器生成主关系 triple 并由 edge evidence 使用 `rdf:reifies` 指向该 triple。

## 1. 对象边界

行内实体关系投影面向 AsciiDoc 书稿正文中的显式关系声明。它在 heading、glossary term、index term 和 inline macro 的源表面之上，提供可回源、可审计、可查询的 RDF 关系投影。

投影器承担以下职责：

- 为标题生成 `aat:Heading` resource。
- 为术语表 term 生成 `aat:GlossaryTerm` resource。
- 建立 selector catalog，使 `indexterm2` primary 能查询可作为关系端点的 resource。
- 识别同一行内被 `rel` 宏消费的 subject selector 和 object selector。
- 为完成消费的 selector-pair 生成 `aat:InlineRelationEdge` 证据 resource。
- 在端点唯一绑定且 predicate 有效时生成主关系 triple 和 `rdf:reifies`。
- 在端点未绑定或多候选时保留 selector、候选 resource、字段和回源坐标。
- 将无法形成稳定消费表面的结构问题写入投影日志。

投影器不从普通自然语言中抽取隐含关系，不归并同名 heading 与 glossary term，不跨行消费 `indexterm2` token。

## 2. 资源层

### 2.1 Heading resource

标题继续使用现有 `aat:Heading` resource。标题文本写入 `aat:headline`；手写 ID 写入 `aat:addressLabel`；Asciidoctor 生成 ID 写入 `aat:generatedAddressLabel`；标题行、源范围、文档顺序、层级、role 和标题字段按现有 RDF 1.2 heading projection 规则投影。

```turtle
<#heading-l11-o0> a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery-policy" ;
  aat:role "policy" ;
  aat:headingLevel 1 ;
  aat:documentOrder 2 ;
  aat:headingLine 12 ;
  aat:relativePath "books/cold-chain.adoc" .
```

`aat:Heading` 不增加 `aat:label` 字段。标题用于 selector catalog 的值来自 `aat:headline`、`aat:addressLabel`、`aat:generatedAddressLabel` 和现有 local target alias 机制。

### 2.2 GlossaryTerm resource

`aat:GlossaryTerm` 来自 `[glossary]` section 下的 description list term。它是独立 resource，不投影为 heading，不归并到同名 heading。

```asciidoc
[glossary]
配送策略:: 冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。
```

投影为：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" ;
  aat:definition "冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 4 ;
  aat:endLine 4 .
```

`aat:term` 是术语表 term 的名称字段。`aat:definition` 是该 term 的描述列表正文。`aat:GlossaryTerm` 不增加 `aat:label` 字段；selector catalog 直接登记 `aat:term` 的值。

### 2.3 Relation evidence resource

`aat:XrefEdge` 和 `aat:InlineRelationEdge` 都是 relation evidence resource。relation evidence 保存源位置、raw surface、selector、display label、关系谓词字段、端点绑定结果和回源坐标。

`aat:XrefEdge` 来自 AsciiDoc xref occurrence。它的端点属于 heading projection label space，并使用 `aat:sourceHeading`、`aat:targetHeading` 和 `aat:candidateHeading` 表达 heading 端点绑定结果。它还保存 Asciidoctor official binding，例如 `aat:officialHref`、`aat:officialResolvedId`、`aat:officialResolvedType` 和 `aat:officialReftext`。

`aat:InlineRelationEdge` 来自 `rel` 行内关系声明。它的端点 resource 可以是 `aat:Heading`，也可以是 `aat:GlossaryTerm`，因此使用 `aat:sourceResource`、`aat:targetResource`、`aat:candidateSourceResource` 和 `aat:candidateTargetResource` 表达端点绑定结果。

relation evidence 在主 relation triple 存在时使用 `rdf:reifies` 指向该 triple。端点未绑定、多候选或 predicate 无效时，relation evidence 不写 `rdf:reifies`。

## 3. 不归并原则

同名 resource 不由投影器归并。

```asciidoc
[glossary]
配送策略:: 冷链订单在不同约束下选择履约路径的规则集合。

[#delivery-policy.policy]
== 配送策略
```

投影中存在两个 resource：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" .

<#heading-l8-o0> a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery-policy" .
```

它们具有相同可查找名称，但不是同一个 RDF resource。下游工具按自己的模型、规则或人工判断进行合并、过滤、推理或校验。投影器保留源文档中写下的结构事实。

## 4. Selector catalog

selector catalog 是 `indexterm2` primary 到可投影 resource 的查询面。它不是 RDF resource 上的统一字段，也不要求所有 resource 拥有同名 predicate。

进入 selector catalog 的值包括：

|Resource 类型|来源字段|catalog entry kind|
|---|---|---|
|`aat:Heading`|`aat:headline`|`headline`|
|`aat:Heading`|`aat:addressLabel`|`addressLabel`|
|`aat:Heading`|`aat:generatedAddressLabel`|`generatedAddressLabel`|
|`aat:Heading`|local non-heading target alias 写入的 `aat:addressLabel`|`addressLabel`|
|`aat:GlossaryTerm`|`aat:term`|`term`|

`indexterm2:[配送策略]` 的 selector 是 `配送策略`。该 selector 查询 catalog 后得到一个 candidate set：

```text
resolve("配送策略") -> []
resolve("配送策略") -> [<#glossary-term-l4-o0>]
resolve("配送策略") -> [<#glossary-term-l4-o0>, <#heading-l8-o0>]
```

空集表示 unresolved。单元素集合表示 bound。多元素集合表示 ambiguous。ambiguous 进入 `aat:InlineRelationEdge` 的 candidate endpoint resource；它不直接生成主 relation triple。

## 5. 行内关系表面

`rel` inline macro 是关系声明触发器。`indexterm2` token 是关系端点 selector 的来源。

显式主语关系：

```asciidoc
indexterm2:[A] rel:p[显示名] indexterm2:[B]
```

省略主语关系：

```asciidoc
rel:p[显示名] indexterm2:[B]
```

多端点关系：

```asciidoc
indexterm2:[A] 与 indexterm2:[B] rel:p[显示名, subjects=2, objects=2] indexterm2:[C] 和 indexterm2:[D]
```

普通文字可以出现在 `indexterm2` 与 `rel` 之间，也可以出现在 `rel` 与后续 `indexterm2` 之间。投影器不解释这些普通文字；它只读取同一行内的 token 顺序。

## 6. `rel` 宏参数

`rel` 宏表面：

```asciidoc
rel:predicate[displayLabel?, namedAttrs...]
```

参数规则：

- macro name 固定为 `rel`。
- macro target 是关系谓词 token。
- 最多一个 positional argument；该 positional 是 `aat:displayLabel`。
- named attributes 是边字段。
- `subjects` 和 `objects` 是投影器识别的控制字段。

示例：

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check]
```

解释为：

```text
predicate token = depends-on
displayLabel = 依赖
objects = 2
reason = capacity-check
```

关系谓词映射沿用现有 relation predicate 规则：

- ordinary token 映射到 `rel:` namespace。
- 已配置 prefix 的 CURIE 展开到对应 namespace。
- absolute IRI 直接作为 predicate IRI。
- 空字符串、带首尾空白或无法映射的 target 不形成 predicate IRI。

如果 `rel` 宏有多个 positional argument，该 relation surface 不形成稳定消费表面，投影日志记录 `inline-relation.too-many-positional-arguments`。

## 7. 控制字段

`subjects` 和 `objects` 是机器控制字段。控制字段出现后，值必须符合该字段的解释规则。非法值、数量不足或缺少必要端点时，relation surface 进入结构诊断。

### 7.1 `subjects`

`subjects` 是非负整数。

|写法|解释|
|---|---|
|缺省|若左侧存在未消费 `indexterm2` token，消费最近 1 个；否则使用当前直系 heading resource。|
|`subjects=0`|强制使用当前直系 heading resource，不消费左侧 `indexterm2` token。|
|`subjects=N`, `N > 0`|从左侧未消费 `indexterm2` token 中消费最近 N 个作为 subject selectors。|
|非法值|relation surface 进入结构诊断。|
|数量不足|relation surface 进入结构诊断。|

### 7.2 `objects`

`objects` 是正整数。

|写法|解释|
|---|---|
|缺省|`objects=1`。|
|`objects=N`, `N > 0`|从右侧后续 `indexterm2` token 中消费 N 个作为 object selectors。|
|`objects=0`|relation surface 进入结构诊断。|
|非法值|relation surface 进入结构诊断。|
|数量不足|relation surface 进入结构诊断。|

## 8. 单行消费模型

消费范围是一行。每一行独立扫描，状态不跨行。

一行中的相关 token 抽象为：

```text
M(label) = indexterm2:[label]
R(predicate, fields) = rel:predicate[fields]
```

普通文字、标点和连接词不参与端点解析。

扫描状态：

```text
pendingSubjects = []
activeRelation = none
```

遇到 `M(label)`：

```text
如果 activeRelation 正在等待 object:
    将该 M(label) 加入 activeRelation.objectTokens。
    若 object token 数量满足 objects=N，完成该 relation。
否则:
    将该 M(label) 加入 pendingSubjects。
```

遇到 `R(predicate, fields)`：

```text
读取 predicate、displayLabel、named attributes、subjects、objects。
根据 subjects 规则确定 subject selectors 或 containing heading source。
创建 activeRelation，等待 objects 个 object token。
```

完成 relation 后，被消费的 subject token 和 object token 不再参与后续 `rel` 的端点解析。

示例：

```text
M(A) R(p) M(B) R(q) M(C)
```

生成两个 selector-pair：

```text
A --p--> B
CurrentHeading --q--> C
```

`M(B)` 已经被第一条 relation 消费为 object，不会自动成为第二条 relation 的 subject。

## 9. Selector 解析与端点绑定

完成消费的 relation 先形成 selector-pair 集合。多 subject 与多 object 的组合发生在 selector token 层。

```text
subjectSelectors = consumed subject selectors or containing heading source
objectSelectors = consumed object selectors
selectorPairs = subjectSelectors × objectSelectors
```

投影器为每个 selector-pair 创建一个 `aat:InlineRelationEdge`。每个 selector-pair 的 source endpoint 与 target endpoint 分别执行 binding。

selector binding 的结果分为三类：

|结果|条件|投影|
|---|---|---|
|unresolved|candidate set 为空|保留 selector literal；不写 endpoint resource。|
|bound|candidate set 只有一个 resource|写入 `aat:sourceResource` 或 `aat:targetResource`。|
|ambiguous|candidate set 有多个 resource|写入 `aat:candidateSourceResource` 或 `aat:candidateTargetResource`。|

省略 subject 使用当前直系 heading 时，edge 写入 `aat:sourceMode "containing-heading"`。当前直系 heading 存在时，该 heading 写入 `aat:sourceResource`。当前位置没有可用 heading resource 时，该 relation surface 进入结构诊断。

## 10. Relation evidence 与 asserted relation triple

每个 `aat:InlineRelationEdge` 保存 selector-pair 证据。主 relation triple 只在以下条件同时成立时生成：

- source endpoint 写入了 `aat:sourceResource`。
- target endpoint 写入了 `aat:targetResource`。
- `rel` predicate token 映射出了 predicate IRI。

条件成立时，投影器生成：

```turtle
<S> rel:p <O> .
```

同一个 edge evidence 使用 `rdf:reifies` 指向该 triple：

```turtle
<#inline-rel-edge-l14-c10-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<S> rel:p <O>)>> ;
  aat:sourceResource <S> ;
  aat:targetResource <O> ;
  aat:sourceSelector "A" ;
  aat:targetSelector "B" ;
  aat:rel "p" ;
  aat:raw "rel:p[显示名]" ;
  aat:relationSurfaceRaw "indexterm2:[A] rel:p[显示名] indexterm2:[B]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 14 ;
  aat:startColumn 10 .
```

endpoint unresolved、endpoint ambiguous 或 predicate IRI 缺失时，edge evidence 仍保留源表面和绑定结果；该 edge 不写 `rdf:reifies`，不生成主 relation triple。

### 10.1 endpoint 表达

显式 subject 来自 `indexterm2` token 时，edge evidence 写入 `aat:sourceSelector`。

```turtle
aat:sourceSelector "风险控制" .
```

省略 subject 使用当前直系 heading 时，edge evidence 写入：

```turtle
aat:sourceMode "containing-heading" .
```

object 总是来自右侧被消费的 `indexterm2` token：

```turtle
aat:targetSelector "客户承诺" .
```

唯一绑定的 endpoint 使用 resource predicate：

```turtle
aat:sourceResource <#glossary-term-l6-o0> ;
aat:targetResource <#glossary-term-l7-o0> .
```

多候选 endpoint 使用 candidate resource predicate：

```turtle
aat:sourceSelector "配送策略" ;
aat:candidateSourceResource <#glossary-term-l4-o0>, <#heading-l11-o0> .
```

### 10.2 edge fields

`rel` 宏中的 named attributes 写入 edge evidence。`subjects` 与 `objects` 作为控制字段参与消费规则，同时也保留为 edge evidence 字段。

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check]
```

投影字段：

```turtle
aat:displayLabel "依赖" ;
aat:objects "2" ;
aat:reason "capacity-check" .
```

投影器不解释 `reason` 的领域含义。

### 10.3 edge resource identity

`InlineRelationEdge` IRI 使用 `inline-rel-edge-l<startLine>-c<startColumn>-o<occurrenceOrdinal>-p<pairOrdinal>` local id。

`startLine` 和 `startColumn` 来自 `rel` macro occurrence 的起点。`occurrenceOrdinal` 在同一行列出现多个 `rel` macro occurrence 时按源文档顺序递增。`pairOrdinal` 是该 `rel` occurrence 形成的 selector-pair 序号，按 subject selector 顺序和 object selector 顺序的嵌套遍历递增。

```text
subjects = [A, B]
objects = [C, D]
selector-pair order = A-C, A-D, B-C, B-D
pairOrdinal = 0, 1, 2, 3
```

同一个 `rel` occurrence 形成多个 selector-pair 时，这些 `InlineRelationEdge` 共享 `aat:raw`、`aat:relationSurfaceRaw`、`aat:relativePath`、`aat:startLine` 和 `aat:startColumn`。

## 11. raw 双层保留

`InlineRelationEdge` 保留两层 raw。

`aat:raw` 保存 `rel` 宏本身：

```text
rel:depends-on[依赖, objects=2, reason=capacity-check]
```

`aat:relationSurfaceRaw` 保存本次 relation 消费涉及的行内片段，包括被消费的 subject token、`rel` 宏、object token 及其间文本：

```text
rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

显式 subject 的 relation surface：

```text
indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]
```

两层 raw 对应不同源表面。`aat:raw` 对齐 `rel` occurrence；`aat:relationSurfaceRaw` 对齐一次 relation consumption surface。

## 12. 诊断面

结构消费失败不创建 `aat:InlineRelationEdge`。结构消费失败包括：

|代码|触发条件|
|---|---|
|`inline-relation.invalid-control-field`|`subjects` 或 `objects` 出现但不是合法整数，或 `objects=0`。|
|`inline-relation.insufficient-subjects`|`subjects=N` 需要 N 个左侧未消费 subject token，但数量不足。|
|`inline-relation.insufficient-objects`|`objects=N` 需要 N 个右侧 object token，但数量不足。|
|`inline-relation.missing-heading-subject`|需要当前直系 heading 作为 subject，但当前位置没有可用 heading resource。|
|`inline-relation.too-many-positional-arguments`|`rel` 宏出现超过一个 positional argument。|
|`inline-relation.interrupted-relation`|`rel` 已开始等待 object，但行结束或遇到新的 `rel` 时仍未满足 object 数量。|

绑定不完备创建 `aat:InlineRelationEdge`。selector unresolved、selector ambiguous 和 predicate token 无法映射为 IRI 时，edge evidence 保留 selector、candidate resource、raw、字段和 source span；该 edge 不生成主 relation triple。

绑定诊断代码：

|代码|触发条件|
|---|---|
|`inline-relation.unresolved-source-selector`|source selector 没有命中任何 resource。|
|`inline-relation.unresolved-target-selector`|target selector 没有命中任何 resource。|
|`inline-relation.ambiguous-source-selector`|source selector 命中多个 resource。|
|`inline-relation.ambiguous-target-selector`|target selector 命中多个 resource。|
|`inline-relation.invalid-predicate`|`rel` target 不能映射为 RDF predicate。|

投影日志是下游工具可消费的诊断面。RDF 图保留已经形成的 relation evidence。

## 13. 查询契约

### 13.1 已断言 inline relation

```sparql
SELECT ?edge ?source ?predicate ?target ?raw WHERE {
  ?edge a aat:InlineRelationEdge ;
        aat:sourceResource ?source ;
        aat:targetResource ?target ;
        aat:raw ?raw ;
        rdf:reifies <<(?source ?predicate ?target)>> .
}
```

该查询只返回已经生成主 relation triple 的 inline relation。

### 13.2 多候选 endpoint

```sparql
SELECT ?edge ?sourceSelector ?sourceCandidate ?targetSelector ?targetCandidate WHERE {
  ?edge a aat:InlineRelationEdge .
  OPTIONAL { ?edge aat:sourceSelector ?sourceSelector }
  OPTIONAL { ?edge aat:candidateSourceResource ?sourceCandidate }
  OPTIONAL { ?edge aat:targetSelector ?targetSelector }
  OPTIONAL { ?edge aat:candidateTargetResource ?targetCandidate }
  FILTER(BOUND(?sourceCandidate) || BOUND(?targetCandidate))
}
```

该查询返回含有 candidate endpoint resource 的 inline relation evidence。

### 13.3 未绑定 source endpoint

```sparql
SELECT ?edge ?sourceSelector ?targetSelector WHERE {
  ?edge a aat:InlineRelationEdge ;
        aat:sourceSelector ?sourceSelector .
  OPTIONAL { ?edge aat:targetSelector ?targetSelector }
  FILTER NOT EXISTS { ?edge aat:sourceResource ?source }
  FILTER NOT EXISTS { ?edge aat:candidateSourceResource ?sourceCandidate }
}
```

该查询返回 source selector 没有绑定到 resource 的 edge evidence。

### 13.4 未绑定 target endpoint

```sparql
SELECT ?edge ?sourceSelector ?targetSelector WHERE {
  ?edge a aat:InlineRelationEdge ;
        aat:targetSelector ?targetSelector .
  OPTIONAL { ?edge aat:sourceSelector ?sourceSelector }
  FILTER NOT EXISTS { ?edge aat:targetResource ?target }
  FILTER NOT EXISTS { ?edge aat:candidateTargetResource ?targetCandidate }
}
```

该查询返回 target selector 没有绑定到 resource 的 edge evidence。

### 13.5 候选关系视图

```sparql
SELECT ?edge ?sourceCandidate ?targetCandidate ?rel WHERE {
  ?edge a aat:InlineRelationEdge ;
        aat:rel ?rel .
  OPTIONAL { ?edge aat:sourceResource ?sourceBound }
  OPTIONAL { ?edge aat:candidateSourceResource ?sourceAmbiguous }
  OPTIONAL { ?edge aat:targetResource ?targetBound }
  OPTIONAL { ?edge aat:candidateTargetResource ?targetAmbiguous }
  BIND(COALESCE(?sourceBound, ?sourceAmbiguous) AS ?sourceCandidate)
  BIND(COALESCE(?targetBound, ?targetAmbiguous) AS ?targetCandidate)
  FILTER(BOUND(?sourceCandidate) && BOUND(?targetCandidate))
}
```

该查询返回 asserted endpoint 与 candidate endpoint 共同形成的候选关系视图。该视图不等同于主 relation triple 图。

## 14. 完整示例

### 14.1 源文档

```asciidoc
= 冷链履约策略说明

[glossary]
配送策略:: 冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。
运力规则:: 用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。
风险控制:: 在履约过程中识别温控失败、延迟送达和异常签收风险的机制。
降级规则:: 当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。
客户承诺:: 平台向客户展示并承诺的送达时间、温区和异常处理说明。
促销计划:: 运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。

[#delivery-policy.policy, status=active]
== 配送策略

在日常履约中，rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]，因为冷链订单不只需要有货，还需要在承诺温区和承诺时间内完成拣货、交接与送达。

当运营团队准备扩大曝光时，indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]，否则页面上的可售表达会早于真实供给能力。

如果系统监测到城市仓温控设备不足，indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]，并由当前章节继续 rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]。
```

### 14.2 Resource 投影

```turtle
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#> .
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

<#heading-l1-o0> a aat:Heading ;
  aat:headline "冷链履约策略说明" ;
  aat:headingLevel 0 ;
  aat:documentOrder 1 ;
  aat:headingLine 1 ;
  aat:relativePath "books/cold-chain.adoc" .

<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" ;
  aat:definition "冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 4 ;
  aat:endLine 4 .

<#glossary-term-l5-o0> a aat:GlossaryTerm ;
  aat:term "运力规则" ;
  aat:definition "用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 5 ;
  aat:endLine 5 .

<#glossary-term-l6-o0> a aat:GlossaryTerm ;
  aat:term "风险控制" ;
  aat:definition "在履约过程中识别温控失败、延迟送达和异常签收风险的机制。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 6 ;
  aat:endLine 6 .

<#glossary-term-l7-o0> a aat:GlossaryTerm ;
  aat:term "降级规则" ;
  aat:definition "当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 7 ;
  aat:endLine 7 .

<#glossary-term-l8-o0> a aat:GlossaryTerm ;
  aat:term "客户承诺" ;
  aat:definition "平台向客户展示并承诺的送达时间、温区和异常处理说明。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 8 ;
  aat:endLine 8 .

<#glossary-term-l9-o0> a aat:GlossaryTerm ;
  aat:term "促销计划" ;
  aat:definition "运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 9 ;
  aat:endLine 9 .

<#heading-l11-o0> a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery-policy" ;
  aat:role "policy" ;
  aat:status "active" ;
  aat:headingLevel 1 ;
  aat:documentOrder 2 ;
  aat:headingLine 12 ;
  aat:relativePath "books/cold-chain.adoc" .
```

`<#glossary-term-l4-o0>` 与 `<#heading-l11-o0>` 都可由 selector `配送策略` 命中。二者不归并。

### 14.3 省略 subject 的多 object 关系

源表面：

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

`rel` 左侧没有未消费 subject token，source 使用当前直系 heading。`objects=2` 消费右侧两个 `indexterm2` token，形成两个 selector-pair：

```text
当前直系 heading -> 运力规则
当前直系 heading -> 风险控制
```

两个 selector-pair 的端点都唯一绑定，因此生成两个主 relation triple：

```turtle
<#heading-l11-o0> rel:depends-on <#glossary-term-l5-o0> .
<#heading-l11-o0> rel:depends-on <#glossary-term-l6-o0> .

<#inline-rel-edge-l14-c10-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l11-o0> rel:depends-on <#glossary-term-l5-o0>)>> ;
  aat:sourceResource <#heading-l11-o0> ;
  aat:targetResource <#glossary-term-l5-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "运力规则" ;
  aat:rel "depends-on" ;
  aat:displayLabel "依赖" ;
  aat:objects "2" ;
  aat:reason "capacity-check" ;
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check]" ;
  aat:relationSurfaceRaw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 14 ;
  aat:startColumn 8 .

<#inline-rel-edge-l14-c10-o0-p1> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l11-o0> rel:depends-on <#glossary-term-l6-o0>)>> ;
  aat:sourceResource <#heading-l11-o0> ;
  aat:targetResource <#glossary-term-l6-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "风险控制" ;
  aat:rel "depends-on" ;
  aat:displayLabel "依赖" ;
  aat:objects "2" ;
  aat:reason "capacity-check" ;
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check]" ;
  aat:relationSurfaceRaw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 14 ;
  aat:startColumn 8 .
```

### 14.4 多 subject、多 object 与多候选 subject

源表面：

```asciidoc
indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]
```

subject selectors：

```text
促销计划
配送策略
```

object selectors：

```text
客户承诺
运力规则
```

selector-pair 集合：

```text
促销计划 -> 客户承诺
促销计划 -> 运力规则
配送策略 -> 客户承诺
配送策略 -> 运力规则
```

`促销计划`、`客户承诺` 和 `运力规则` 都唯一绑定。`配送策略` 命中 `<#glossary-term-l4-o0>` 与 `<#heading-l11-o0>`，因此两个以 `配送策略` 为 source selector 的 edge evidence 写入 `aat:candidateSourceResource`。

```turtle
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0> .
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l5-o0> .

<#inline-rel-edge-l16-c41-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0>)>> ;
  aat:sourceResource <#glossary-term-l9-o0> ;
  aat:targetResource <#glossary-term-l8-o0> ;
  aat:sourceSelector "促销计划" ;
  aat:targetSelector "客户承诺" ;
  aat:rel "constrains" ;
  aat:displayLabel "共同约束" ;
  aat:subjects "2" ;
  aat:objects "2" ;
  aat:review "required" ;
  aat:raw "rel:constrains[共同约束, subjects=2, objects=2, review=required]" ;
  aat:relationSurfaceRaw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 16 ;
  aat:startColumn 41 .

<#inline-rel-edge-l16-c41-o0-p1> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#glossary-term-l9-o0> rel:constrains <#glossary-term-l5-o0>)>> ;
  aat:sourceResource <#glossary-term-l9-o0> ;
  aat:targetResource <#glossary-term-l5-o0> ;
  aat:sourceSelector "促销计划" ;
  aat:targetSelector "运力规则" ;
  aat:rel "constrains" ;
  aat:displayLabel "共同约束" ;
  aat:subjects "2" ;
  aat:objects "2" ;
  aat:review "required" ;
  aat:raw "rel:constrains[共同约束, subjects=2, objects=2, review=required]" ;
  aat:relationSurfaceRaw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 16 ;
  aat:startColumn 41 .

<#inline-rel-edge-l16-c41-o0-p2> a aat:InlineRelationEdge ;
  aat:sourceSelector "配送策略" ;
  aat:candidateSourceResource <#glossary-term-l4-o0>, <#heading-l11-o0> ;
  aat:targetResource <#glossary-term-l8-o0> ;
  aat:targetSelector "客户承诺" ;
  aat:rel "constrains" ;
  aat:displayLabel "共同约束" ;
  aat:subjects "2" ;
  aat:objects "2" ;
  aat:review "required" ;
  aat:raw "rel:constrains[共同约束, subjects=2, objects=2, review=required]" ;
  aat:relationSurfaceRaw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 16 ;
  aat:startColumn 41 .

<#inline-rel-edge-l16-c41-o0-p3> a aat:InlineRelationEdge ;
  aat:sourceSelector "配送策略" ;
  aat:candidateSourceResource <#glossary-term-l4-o0>, <#heading-l11-o0> ;
  aat:targetResource <#glossary-term-l5-o0> ;
  aat:targetSelector "运力规则" ;
  aat:rel "constrains" ;
  aat:displayLabel "共同约束" ;
  aat:subjects "2" ;
  aat:objects "2" ;
  aat:review "required" ;
  aat:raw "rel:constrains[共同约束, subjects=2, objects=2, review=required]" ;
  aat:relationSurfaceRaw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 16 ;
  aat:startColumn 41 .
```

### 14.5 后续关系

第一条源表面：

```asciidoc
indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]
```

```turtle
<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0> .

<#inline-rel-edge-l18-c32-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0>)>> ;
  aat:sourceResource <#glossary-term-l6-o0> ;
  aat:targetResource <#glossary-term-l7-o0> ;
  aat:sourceSelector "风险控制" ;
  aat:targetSelector "降级规则" ;
  aat:rel "triggers" ;
  aat:displayLabel "触发" ;
  aat:severity "high" ;
  aat:raw "rel:triggers[触发, severity=high]" ;
  aat:relationSurfaceRaw "indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 18 ;
  aat:startColumn 32 .
```

第二条源表面：

```asciidoc
rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]
```

前一个 `indexterm2:[降级规则]` 已经被 `rel:triggers` 消费为 object，不参与 `rel:updates` 的 subject 解析。`rel:updates` 使用当前直系 heading 作为 source。

```turtle
<#heading-l11-o0> rel:updates <#glossary-term-l8-o0> .

<#inline-rel-edge-l18-c96-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l11-o0> rel:updates <#glossary-term-l8-o0>)>> ;
  aat:sourceResource <#heading-l11-o0> ;
  aat:targetResource <#glossary-term-l8-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "客户承诺" ;
  aat:rel "updates" ;
  aat:displayLabel "更新" ;
  aat:scope "customer-facing" ;
  aat:raw "rel:updates[更新, scope=customer-facing]" ;
  aat:relationSurfaceRaw "rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 18 ;
  aat:startColumn 96 .
```

## 15. 审查清单

实现该设计时，以下条件必须同时成立：

- `aat:GlossaryTerm` 是独立 resource，不投影为 `aat:Heading`。
- 同名 `aat:Heading` 与 `aat:GlossaryTerm` 不归并。
- `aat:GlossaryTerm` 使用 `aat:term`，不增加重复的 `aat:label`。
- selector catalog 登记 heading 的 `headline`、`addressLabel`、`generatedAddressLabel` 和 glossary term 的 `term`。
- 关系端点 token 只来自同一行内被 `rel` 消费的 `indexterm2`。
- `rel` 宏最多一个 positional argument；该 positional 投影为 `aat:displayLabel`。
- `subjects` 与 `objects` 是控制字段；非法值或数量不足时进入结构诊断。
- 完成消费的 selector-pair 生成 `aat:InlineRelationEdge`。
- 唯一绑定的 endpoint 写入 `aat:sourceResource` 或 `aat:targetResource`。
- 多候选 endpoint 写入 `aat:candidateSourceResource` 或 `aat:candidateTargetResource`。
- 未绑定 endpoint 保留 `aat:sourceSelector` 或 `aat:targetSelector`。
- 主 relation triple 只在 source endpoint 唯一绑定、target endpoint 唯一绑定、predicate 有效时生成。
- `rdf:reifies` 只在主 relation triple 存在时写入 edge evidence。
- `aat:raw` 保存 `rel` 宏本身。
- `aat:relationSurfaceRaw` 保存本次 relation consumption surface。
- 结构消费失败进入投影日志。
- 绑定不完备进入 RDF evidence，并可同时进入投影日志。
- 投影器不解释普通边字段的业务含义。
