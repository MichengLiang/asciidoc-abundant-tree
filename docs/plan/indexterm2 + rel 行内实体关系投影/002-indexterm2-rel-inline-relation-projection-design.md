# `indexterm2 + rel` 行内实体关系投影设计

本文定义一种 AsciiDoc 行内关系声明表面。该表面使用 `indexterm2:[...]` 标记正文可见索引词，使用 `rel:predicate[...]` 声明关系谓词，并在 RDF 1.2 投影中生成资源、关系 triple、边证据和投影日志。

该机制处理源文档中已经写明的结构事实。标题和术语表 term 分别形成 RDF resource；`indexterm2` 的 primary 值作为 selector 查询这些 resource；`rel` inline macro 触发同一行内的 selector 消费；成功识别的关系进入 RDF 图；失败识别进入投影日志。

## 1. 对象边界

行内实体关系投影面向 AsciiDoc 书稿正文中的关系声明。它不替代 AsciiDoc 原生索引词、标题、术语表或 xref 机制；它在这些源表面之上增加一类可投影的关系声明。

投影器承担以下职责：

- 为标题生成 `aat:Heading` resource。
- 为术语表 term 生成 `aat:GlossaryTerm` resource。
- 建立 selector catalog，使 `indexterm2` primary 能查询可作为关系端点的 resource。
- 识别同一行内的 `rel` 宏和被消费的 `indexterm2` token。
- 将成功识别的关系投影为 RDF triple 和 `aat:InlineRelationEdge` 证据 resource。
- 将结构失败写入投影日志。

投影器不承担以下职责：

- 不归并同名 heading 和 glossary term。
- 不判断关系是否符合业务语义。
- 不解释普通边字段的领域含义。
- 不把失败关系写入 RDF 图。
- 不从普通自然语言中抽取隐含关系。
- 不跨行消费 `indexterm2` token。

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

### 2.3 XrefEdge 与 InlineRelationEdge

`aat:XrefEdge` 和 `aat:InlineRelationEdge` 都属于边证据 resource。二者都保留源位置、raw surface、selector、display label、关系谓词字段和 `rdf:reifies` 指向的 triple term。

`aat:XrefEdge` 来自 AsciiDoc xref occurrence。它有 Asciidoctor official binding，例如 `aat:officialHref`、`aat:officialResolvedId`、`aat:officialResolvedType` 和 `aat:officialReftext`。

`aat:InlineRelationEdge` 来自 `rel` 行内关系声明。它没有 Asciidoctor xref binding。它的端点 resource 可以是 heading，也可以是 glossary term，因此使用 `aat:sourceResource` 与 `aat:targetResource` 表示端点。

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

它们具有相同可查找名称，但不是同一个 RDF resource。下游工具可以根据自己的模型、规则或人工判断进行合并、过滤、推理或校验。投影器只保留源文档中写下的结构事实。

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

空集表示 unresolved。单元素集合表示唯一命中。多元素集合表示多候选命中。多候选不是失败；它会参与关系展开。

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
- 空字符串、带首尾空白或无法映射的 target 不形成有效 predicate。

如果 `rel` 宏有多个 positional argument，该 relation pattern 不识别，投影日志记录 `inline-relation.too-many-positional-arguments`。

## 7. 控制字段

`subjects` 和 `objects` 是机器控制字段。控制字段出现后，值必须符合该字段的解释规则。非法值、数量不足或缺少必要端点时，关系不进入 RDF 图。

### 7.1 `subjects`

`subjects` 是非负整数。

|写法|解释|
|---|---|
|缺省|若左侧存在未消费 `indexterm2` token，消费最近 1 个；否则使用当前直系 heading resource。|
|`subjects=0`|强制使用当前直系 heading resource，不消费左侧 `indexterm2` token。|
|`subjects=N`, `N > 0`|从左侧未消费 `indexterm2` token 中消费最近 N 个作为 subject selectors。|
|非法值|关系不生成边，写入投影日志。|
|数量不足|关系不生成边，写入投影日志。|

### 7.2 `objects`

`objects` 是正整数。

|写法|解释|
|---|---|
|缺省|`objects=1`。|
|`objects=N`, `N > 0`|从右侧后续 `indexterm2` token 中消费 N 个作为 object selectors。|
|`objects=0`|关系不生成边，写入投影日志。|
|非法值|关系不生成边，写入投影日志。|
|数量不足|关系不生成边，写入投影日志。|

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
根据 subjects 规则确定 subject selectors 或 containing heading subject。
创建 activeRelation，等待 objects 个 object token。
```

完成 relation 后，被消费的 subject token 和 object token 不再参与后续 `rel` 的端点解析。

示例：

```text
M(A) R(p) M(B) R(q) M(C)
```

生成：

```text
A --p--> B
CurrentHeading --q--> C
```

`M(B)` 已经被第一条 relation 消费为 object，不会自动成为第二条 relation 的 subject。

## 9. Selector 解析与多候选展开

成功完成 token 消费后，relation 拥有 subject selectors 和 object selectors。

每个 selector 查询 selector catalog：

```text
resolve(selector) -> candidate resource set
```

如果任一 required selector 返回空集，relation 不生成边，并写入投影日志。

如果 selector 返回多个 candidate，投影器不消歧。最终关系边集合按资源候选笛卡尔积生成：

```text
subjectResources = union(resolve(each subject selector))
objectResources = union(resolve(each object selector))
edges = subjectResources × objectResources
```

例如：

```asciidoc
indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[推出, subjects=2] indexterm2:[需求]
```

生成：

```text
领域事实 --entails--> 需求
规约 --entails--> 需求
```

如果 `配送策略` selector 同时命中 glossary term resource 和 heading resource，则两者都参与展开。

## 10. 成功 RDF 投影

成功 relation 生成实际关系 triple：

```turtle
<S> rel:p <O> .
```

同时为每条实际 triple 生成一个 `aat:InlineRelationEdge` reifier resource：

```turtle
<Edge> a aat:InlineRelationEdge ;
  rdf:reifies <<(<S> rel:p <O>)>> ;
  aat:sourceResource <S> ;
  aat:targetResource <O> ;
  aat:rel "p" ;
  aat:displayLabel "显示名" ;
  aat:sourceSelector "..." ;
  aat:targetSelector "..." ;
  aat:raw "rel:p[...]" ;
  aat:relationSurfaceRaw "..." ;
  aat:relativePath "..." ;
  aat:startLine 12 ;
  aat:startColumn 18 .
```

每个 `aat:InlineRelationEdge` 只 `rdf:reifies` 一条 triple。一个 `rel` occurrence 通过多 subject、多 object 或 selector 多候选生成多条 triple 时，生成多条 edge evidence resource。它们可以共享同一个 `aat:raw`、`aat:relationSurfaceRaw` 和 source span。

### 10.1 source 表达

显式 subject 来自 `indexterm2` token 时，edge evidence 写入：

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

## 12. 失败诊断

失败关系不进入 RDF graph。失败关系不生成 relation triple，也不生成 `aat:InlineRelationEdge`。

失败信息进入投影日志。日志项包含诊断级别、诊断代码、消息、source span 和相关 raw surface。

基础诊断代码：

|代码|触发条件|
|---|---|
|`inline-relation.invalid-control-field`|`subjects` 或 `objects` 出现但不是合法整数，或 `objects=0`。|
|`inline-relation.insufficient-subjects`|`subjects=N` 需要 N 个左侧未消费 subject token，但数量不足。|
|`inline-relation.insufficient-objects`|`objects=N` 需要 N 个右侧 object token，但数量不足。|
|`inline-relation.missing-heading-subject`|需要当前直系 heading 作为 subject，但当前位置没有可用 heading resource。|
|`inline-relation.unresolved-subject-selector`|subject selector 没有命中任何 resource。|
|`inline-relation.unresolved-object-selector`|object selector 没有命中任何 resource。|
|`inline-relation.invalid-predicate`|`rel` target 不能映射为 RDF predicate。|
|`inline-relation.too-many-positional-arguments`|`rel` 宏出现超过一个 positional argument。|
|`inline-relation.interrupted-relation`|`rel` 已开始等待 object，但行结束或遇到新的 `rel` 时仍未满足 object 数量。|

日志示例：

```text
warning inline-relation.insufficient-objects books/cold-chain.adoc:23:18
  rel macro requested objects=2 but only 1 object indexterm2 token was available on this line; relation edge was not projected.
```

投影日志是下游工具可消费的诊断面。正式 RDF 图只承载成功形成的资源、关系 triple 和边证据。

## 13. 完整示例

### 13.1 源文档

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

### 13.2 Resource 投影

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

### 13.3 第一段关系

源表面：

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

`rel` 左侧没有未消费 subject token，source 使用当前直系 heading。`objects=2` 消费右侧两个 `indexterm2` token。

```turtle
<#heading-l11-o0> rel:depends-on <#glossary-term-l5-o0> .
<#heading-l11-o0> rel:depends-on <#glossary-term-l6-o0> .

<#inline-rel-edge-l14-c10-o0-a> a aat:InlineRelationEdge ;
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

<#inline-rel-edge-l14-c10-o0-b> a aat:InlineRelationEdge ;
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

### 13.4 第二段关系

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

selector `配送策略` 命中两个 resource：`<#glossary-term-l4-o0>` 和 `<#heading-l11-o0>`。因此 subject resource set 为：

```text
<#glossary-term-l9-o0>
<#glossary-term-l4-o0>
<#heading-l11-o0>
```

object resource set 为：

```text
<#glossary-term-l8-o0>
<#glossary-term-l5-o0>
```

生成候选乘积边：

```turtle
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0> .
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l5-o0> .
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l8-o0> .
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l5-o0> .
<#heading-l11-o0> rel:constrains <#glossary-term-l8-o0> .
<#heading-l11-o0> rel:constrains <#glossary-term-l5-o0> .

<#inline-rel-edge-l16-c41-o0-a> a aat:InlineRelationEdge ;
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
```

上面只展开展示了一条 edge evidence。其余五条 triple 各自拥有对应的 `aat:InlineRelationEdge`，并共享同一个 `aat:raw`、`aat:relationSurfaceRaw` 和 source span。

### 13.5 第三段关系

第一条源表面：

```asciidoc
indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]
```

```turtle
<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0> .

<#inline-rel-edge-l18-c32-o0> a aat:InlineRelationEdge ;
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

<#inline-rel-edge-l18-c96-o0> a aat:InlineRelationEdge ;
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

## 14. 审查清单

实现该设计时，以下条件必须同时成立：

- `aat:GlossaryTerm` 是独立 resource，不投影为 `aat:Heading`。
- 同名 `aat:Heading` 与 `aat:GlossaryTerm` 不归并。
- `aat:GlossaryTerm` 使用 `aat:term`，不增加重复的 `aat:label`。
- selector catalog 登记 heading 的 `headline`、`addressLabel`、`generatedAddressLabel` 和 glossary term 的 `term`。
- 关系端点 token 只来自同一行内被 `rel` 消费的 `indexterm2`。
- `rel` 宏最多一个 positional argument；该 positional 投影为 `aat:displayLabel`。
- `subjects` 与 `objects` 是控制字段；非法值或数量不足时不生成边。
- 多候选 selector 按候选 resource 展开，不消歧。
- 每条成功 triple 对应一个 `aat:InlineRelationEdge`。
- `aat:raw` 保存 `rel` 宏本身。
- `aat:relationSurfaceRaw` 保存本次 relation consumption surface。
- 失败关系不进入 RDF 图，只进入投影日志。
- 投影器不解释普通边字段的业务含义。
