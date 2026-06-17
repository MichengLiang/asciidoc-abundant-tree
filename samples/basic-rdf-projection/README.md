# 基础 RDF12 heading projection 消费示例

这个目录给出一个自足的 RDF12 heading projection 示例。源文档是一个小型结构夹具；它不模拟具体业务流程，而是集中展示标题、标题层级、标题属性、交叉引用关系、xref 证据和 listing ID 归属如何成为可查询 RDF 事实。

这个示例同时展示两类下游消费：

- `consume_projection.py`：最小 Python 消费脚本，读取 projection 图并输出标题树、关系和 target alias 报告。
- `validate_with_shacl.mjs` / `query_with_oxigraph.mjs`：标准 RDF/JS 工具链消费脚本，使用 SHACL、SPARQL 和 RDF 1.2 reifier 查询对 projection 图做建模、校验和关系解释。

## 文件

- `basic-projection.adoc`：源 AsciiDoc 结构夹具。
- `consume_projection.py`：Python 下游消费脚本。
- `structure-model.ttl`：下游模型图，声明 role class 和 relation hierarchy。
- `structure-shapes.ttl`：SHACL shapes 图，声明 role、字段、枚举和关系约束。
- `validate_with_shacl.mjs`：RDF/JS + SHACL 校验脚本。
- `query_with_oxigraph.mjs`：Oxigraph SPARQL 查询与 CONSTRUCT materialization 脚本。
- `README.md`：源文件、预生成 Turtle 和脚本输出记录。

## 复现命令

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

`consume_projection.py` 使用 PEP 723 inline dependencies，`uv run` 会按需安装 `pyoxigraph`。两个 Node.js 脚本使用项目依赖中的 `n3`、`@zazuko/env-node`、`rdf-validate-shacl` 和 `oxigraph`。

## 结构覆盖

| 特性 | 示例表面 | RDF12 事实 / 下游消费 |
|---|---|---|
| document title heading | `= 基础 RDF 投影示例` | level 0 `aat:Heading` |
| manual address label | `[#structure-example.process]` | `aat:addressLabel "structure-example"` |
| generated address label | `=== 生成标签节点` | `aat:generatedAddressLabel "_生成标签节点"` |
| heading direct fields | `status=draft, owner=docs-team` / `priority=normal` | `aat:status`、`aat:owner`、`aat:priority` |
| heading role | `.process` / `.rule` / `.evidence` | `aat:role`，下游模型映射为 role class |
| heading tree | section nesting | `aat:containsDirectly`、`aat:childOrder`、`aat:documentOrder` |
| explicit relation | `rel=requires` / `rel=documents` | `rel:requires`、`rel:documents` |
| relation hierarchy | `structure-model.ttl` | `rel:requires` materializes `ex:dependency`；`rel:documents` materializes `ex:evidenceLink` |
| default relation | `xref:required-rule[]` | `aat:references` |
| xref evidence | xref occurrence source text | `aat:XrefEdge`、`rdf:reifies`、source/target selectors |
| SHACL validation | `structure-shapes.ttl` | role fields、status/priority enum、outgoing relation、incoming relation constraints |
| local non-heading target alias | `#rule-query-example` on listing | owning heading `aat:addressLabel "rule-query-example"` |

## 源 AsciiDoc

```asciidoc
= 基础 RDF 投影示例

这个示例是一个小型结构夹具，用来展示 RDF12 heading projection 的基础查询面：标题树、地址标签、直接属性、交叉引用边证据和本地 target 归属。

[#structure-example.process, status=draft, owner=docs-team]
== 结构示例

结构示例要求 xref:required-rule[约束规则, rel=requires, weight=0.7]，并把关系证据写入说明节点。

// 如果元数据的值很长也可以分多行标注
[priority=normal]
[#required-rule.rule, status=active]
== 约束规则

约束规则展示 role、status、priority 和入边约束如何进入下游 shape。

[#rule-query-example]
[source,sql]
----
SELECT subject, predicate, object
FROM projected_graph
WHERE role = 'rule';
----

=== 生成标签节点

这个标题没有手写 ID，用来展示 generated address label 进入 heading label space。

[#evidence-note.evidence, status=active]
== 关系证据说明

关系证据说明用 xref:rule-query-example[规则查询示例, rel=documents] 指向约束规则章节里的 listing target。

关系证据说明也用 xref:required-rule[] 展示默认 `aat:references` 关系。
```

## 下游模型图

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix ex: <https://micheng.dev/ns/structure-model#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.

ex:ModeledHeading a rdfs:Class;
    rdfs:label "Modeled heading".

ex:ProcessHeading a rdfs:Class;
    rdfs:label "Process heading";
    rdfs:subClassOf ex:ModeledHeading;
    ex:roleName "process".

ex:RuleHeading a rdfs:Class;
    rdfs:label "Rule heading";
    rdfs:subClassOf ex:ModeledHeading;
    ex:roleName "rule".

ex:EvidenceHeading a rdfs:Class;
    rdfs:label "Evidence heading";
    rdfs:subClassOf ex:ModeledHeading;
    ex:roleName "evidence".

ex:dependency a rdf:Property;
    rdfs:label "dependency".

ex:evidenceLink a rdf:Property;
    rdfs:label "evidence link".

rel:requires rdfs:subPropertyOf ex:dependency.
rel:documents rdfs:subPropertyOf ex:evidenceLink.
```

## SHACL Shapes 图

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix ex: <https://micheng.dev/ns/structure-model#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix sh: <http://www.w3.org/ns/shacl#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

ex:HeadingShape a sh:NodeShape;
    sh:targetClass aat:Heading;
    sh:property [
        sh:path aat:headline;
        sh:minCount 1;
        sh:datatype xsd:string;
        sh:message "heading must expose a headline"
    ];
    sh:property [
        sh:path aat:headingLine;
        sh:minCount 1;
        sh:datatype xsd:integer;
        sh:message "heading must expose its source heading line"
    ];
    sh:property [
        sh:path aat:relativePath;
        sh:minCount 1;
        sh:datatype xsd:string;
        sh:message "heading must expose its source relative path"
    ].

ex:ProcessShape a sh:NodeShape;
    sh:targetClass ex:ProcessHeading;
    sh:property [
        sh:path aat:owner;
        sh:minCount 1;
        sh:datatype xsd:string;
        sh:message "process heading must declare owner"
    ];
    sh:property [
        sh:path aat:status;
        sh:minCount 1;
        sh:in ("draft" "active");
        sh:message "process heading status must be draft or active"
    ];
    sh:property [
        sh:path rel:requires;
        sh:minCount 1;
        sh:class ex:RuleHeading;
        sh:message "process heading must require at least one rule heading"
    ].

ex:RuleShape a sh:NodeShape;
    sh:targetClass ex:RuleHeading;
    sh:property [
        sh:path aat:priority;
        sh:minCount 1;
        sh:in ("normal" "high");
        sh:message "rule heading priority must be normal or high"
    ];
    sh:property [
        sh:path aat:status;
        sh:minCount 1;
        sh:hasValue "active";
        sh:message "rule heading status must be active"
    ];
    sh:property [
        sh:path [ sh:inversePath rel:requires ];
        sh:minCount 1;
        sh:class ex:ProcessHeading;
        sh:message "rule heading must be required by at least one process heading"
    ].

ex:EvidenceShape a sh:NodeShape;
    sh:targetClass ex:EvidenceHeading;
    sh:property [
        sh:path aat:status;
        sh:minCount 1;
        sh:hasValue "active";
        sh:message "evidence heading status must be active"
    ];
    sh:property [
        sh:path rel:documents;
        sh:minCount 1;
        sh:class ex:RuleHeading;
        sh:message "evidence heading must document at least one rule heading"
    ].
```

## 预生成 RDF12 Turtle

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#activity> a prov:Activity, aat:ProjectionActivity;
    prov:used <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#source>.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l1-o0> a aat:Heading;
    aat:containsDirectly <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>, <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0>, <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "基础 RDF 投影示例";
    aat:raw """= 基础 RDF 投影示例

这个示例是一个小型结构夹具，用来展示 RDF12 heading projection 的基础查询面：标题树、地址标签、直接属性、交叉引用边证据和本地 target 归属。

""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:startLine 1.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0> a aat:Heading;
    aat:addressLabel "required-rule", "rule-query-example";
    aat:childOrder 2;
    aat:containsDirectly <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l25-o0>;
    aat:contentEndLine 23;
    aat:contentStartLine 15;
    aat:documentOrder 3;
    aat:endLine 24;
    aat:headingLevel 1;
    aat:headingLine 13;
    aat:headline "约束规则";
    aat:metadataEndLine 12;
    aat:metadataStartLine 11;
    aat:priority "normal";
    aat:raw """[priority=normal]
[#required-rule.rule, status=active]
== 约束规则

约束规则展示 role、status、priority 和入边约束如何进入下游 shape。

[#rule-query-example]
[source,sql]
----
SELECT subject, predicate, object
FROM projected_graph
WHERE role = 'rule';
----

""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:role "rule";
    aat:startLine 11;
    aat:status "active".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l25-o0> a aat:Heading;
    aat:childOrder 1;
    aat:contentEndLine 27;
    aat:contentStartLine 27;
    aat:documentOrder 4;
    aat:endLine 28;
    aat:generatedAddressLabel "_生成标签节点";
    aat:headingLevel 2;
    aat:headingLine 25;
    aat:headline "生成标签节点";
    aat:raw """=== 生成标签节点

这个标题没有手写 ID，用来展示 generated address label 进入 heading label space。

""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:startLine 25.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> a aat:Heading;
    aat:addressLabel "evidence-note";
    aat:childOrder 3;
    aat:contentEndLine 34;
    aat:contentStartLine 32;
    aat:documentOrder 5;
    aat:endLine 35;
    aat:headingLevel 1;
    aat:headingLine 30;
    aat:headline "关系证据说明";
    aat:metadataEndLine 29;
    aat:metadataStartLine 29;
    aat:raw """[#evidence-note.evidence, status=active]
== 关系证据说明

关系证据说明用 xref:rule-query-example[规则查询示例, rel=documents] 指向约束规则章节里的 listing target。

关系证据说明也用 xref:required-rule[] 展示默认 `aat:references` 关系。

""";
    aat:references <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:role "evidence";
    aat:startLine 29;
    aat:status "active";
    rel:documents <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0> a aat:Heading;
    aat:addressLabel "structure-example";
    aat:childOrder 1;
    aat:contentEndLine 10;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 10;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "结构示例";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "docs-team";
    aat:raw """[#structure-example.process, status=draft, owner=docs-team]
== 结构示例

结构示例要求 xref:required-rule[约束规则, rel=requires, weight=0.7]，并把关系证据写入说明节点。

// 如果元数据的值很长也可以分多行标注
""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:role "process";
    aat:startLine 5;
    aat:status "draft";
    rel:requires <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#source>;
    prov:wasDerivedFrom <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#source>;
    prov:wasGeneratedBy <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#activity>.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l32-c9-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> rel:documents <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "规则查询示例";
    aat:endColumn 55;
    aat:endLine 32;
    aat:officialHref "#rule-query-example";
    aat:officialReftext "规则查询示例";
    aat:officialResolvedId "rule-query-example";
    aat:officialResolvedType "listing";
    aat:raw "xref:rule-query-example[规则查询示例, rel=documents]";
    aat:rel "documents";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0>;
    aat:sourceSelector "evidence-note";
    aat:startColumn 9;
    aat:startLine 32;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "rule-query-example".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l34-c10-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> aat:references <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:endColumn 30;
    aat:endLine 34;
    aat:officialHref "#required-rule";
    aat:officialReftext "约束规则";
    aat:officialResolvedId "required-rule";
    aat:officialResolvedType "section";
    aat:raw "xref:required-rule[]";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0>;
    aat:sourceSelector "evidence-note";
    aat:startColumn 10;
    aat:startLine 34;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "required-rule".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l8-c8-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0> rel:requires <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "约束规则";
    aat:endColumn 58;
    aat:endLine 8;
    aat:officialHref "#required-rule";
    aat:officialReftext "约束规则";
    aat:officialResolvedId "required-rule";
    aat:officialResolvedType "section";
    aat:raw "xref:required-rule[约束规则, rel=requires, weight=0.7]";
    aat:rel "requires";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0>;
    aat:sourceSelector "structure-example";
    aat:startColumn 8;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "required-rule";
    aat:weight "0.7".
```

## Python 下游消费输出

```text
RDF12 basic projection report
Triples: 152

Headings by document order:
  1. [level 0] 基础 RDF 投影示例 labels=-
  2. [level 1] 结构示例 labels=structure-example role=process status=draft
  3. [level 1] 约束规则 labels=required-rule, rule-query-example role=rule status=active
  4. [level 2] 生成标签节点 labels=_生成标签节点
  5. [level 1] 关系证据说明 labels=evidence-note role=evidence status=active

Containment:
  基础 RDF 投影示例 --child 1--> 结构示例
  基础 RDF 投影示例 --child 2--> 约束规则
  基础 RDF 投影示例 --child 3--> 关系证据说明
  约束规则 --child 1--> 生成标签节点

Xref edges:
  关系证据说明 --references--> 约束规则 (selector=required-rule, resolvedType=section)
  关系证据说明 --documents--> 约束规则 (selector=rule-query-example, resolvedType=listing)
  结构示例 --requires--> 约束规则 (selector=required-rule, resolvedType=section weight=0.7)

Local target aliases:
  rule-query-example -> 约束规则
```

## SHACL 校验输出

```text
RDF12 SHACL validation report
Projection quads: 152
Model quads: 20
Shape quads: 72
Role class assertions: 3

Conforms: true
Violations: 0
```

## Oxigraph 查询输出

```text
RDF12 Oxigraph model query report
Inferred relation quads: 2

Model relations:
  结构示例 --dependency--> 约束规则
  关系证据说明 --evidence-link--> 约束规则

Xref evidence:
  line 34: 关系证据说明 --references--> 约束规则 (section)
    raw: xref:required-rule[]
  line 32: 关系证据说明 --documents--> 约束规则 (listing)
    raw: xref:rule-query-example[规则查询示例, rel=documents]
  line 8: 结构示例 --requires--> 约束规则 (section)
    raw: xref:required-rule[约束规则, rel=requires, weight=0.7]
```

## 消费边界

`consume_projection.py` 的消费者动作是读取标题投影图。它从源文档生成 Turtle，读取 heading order、containment、xref evidence 和 local target alias，并把这些 RDF 事实整理为可读报告。

`validate_with_shacl.mjs` 的消费者动作是标准形状校验。它用 N3 读取 RDF 1.2 Turtle，把 projection graph 与 model graph 合并，根据 `structure-model.ttl` 中的 role mapping 给 heading 添加下游 class assertion，再用 `structure-shapes.ttl` 执行 SHACL validation。校验失败时，脚本从 projection graph 取回 `relativePath`、`headingLine` 和 `headline`，把 violation 定位回源文档。

`query_with_oxigraph.mjs` 的消费者动作是标准 RDF store 查询和模型解释。它用 Oxigraph 读取 RDF 1.2 Turtle 与 model graph，用 SPARQL CONSTRUCT materialize `rdfs:subPropertyOf` 声明出的关系，再查询 `ex:dependency`、`ex:evidenceLink` 和 `rdf:reifies` xref evidence。这个脚本展示 role、field、relation 已经是图上的事实，因此可以由 RDF/JS、SHACL、SPARQL 和 Oxigraph 工具链直接消费。
