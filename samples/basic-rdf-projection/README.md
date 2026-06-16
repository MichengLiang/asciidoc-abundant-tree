# 基础 RDF12 heading projection 消费示例

这个目录给出一个自足的 RDF12 heading projection 示例。源文档描述订单处理流程；投影结果把标题、标题层级、标题属性、交叉引用关系、xref 证据和 listing ID 的归属表示为可查询 RDF 事实。

## 文件

- `basic-projection.adoc`：源 AsciiDoc。
- `consume_projection.py`：Python 下游消费脚本。
- `README.md`：源文件、预生成 Turtle 和脚本输出记录。

## 复现命令

```bash
pnpm --silent dev samples/basic-rdf-projection/basic-projection.adoc --format rdf12
```

```bash
uv run samples/basic-rdf-projection/consume_projection.py
```

`consume_projection.py` 使用 PEP 723 inline dependencies，`uv run` 会按需安装 `pyoxigraph`。

## 结构覆盖

| 特性 | 示例表面 | RDF12 事实 |
|---|---|---|
| document title heading | `= 基础 RDF 投影示例` | level 0 `aat:Heading` |
| manual address label | `[#order-flow.process]` | `aat:addressLabel "order-flow"` |
| generated address label | `=== 缺货处理` | `aat:generatedAddressLabel "_缺货处理"` |
| heading direct fields | `status=draft, owner=ops-docs` | `aat:status`、`aat:owner` |
| heading role | `.process` / `.rule` / `.note` | `aat:role` |
| heading tree | section nesting | `aat:containsDirectly`、`aat:childOrder`、`aat:documentOrder` |
| explicit relation | `rel=requires` / `rel=documents` | `rel:requires`、`rel:documents` |
| default relation | `xref:stock-check[]` | `aat:references` |
| xref evidence | xref occurrence source text | `aat:XrefEdge`、`rdf:reifies`、source/target selectors |
| local non-heading target alias | `#stock-query-example` on listing | owning heading `aat:addressLabel "stock-query-example"` |

## 源 AsciiDoc

```asciidoc
= 基础 RDF 投影示例

这个示例展示 RDF12 heading projection 的基础查询面：标题树、地址标签、直接属性、交叉引用边证据和本地 target 归属。

[#order-flow.process, status=draft, owner=ops-docs]
== 订单处理流程

订单处理流程先执行 xref:stock-check[库存校验, rel=requires, weight=0.7]，然后把结果写入交接说明。

// 如果元数据的值很长也可以分多行标注
[apple=true]
[#stock-check.rule, status=active]
== 库存校验

库存校验规则描述订单进入履约前需要读取的库存快照。

[#stock-query-example]
[source,sql]
----
SELECT sku, available_qty
FROM inventory_snapshot
WHERE order_id = :order_id;
----

=== 缺货处理

缺货处理标题使用生成 address label 进入 heading label space。

[#handoff-note.note, status=active]
== 交接说明

交接说明用 xref:stock-query-example[库存查询示例, rel=documents] 指向库存校验章节里的 listing target。

交接说明也用 xref:stock-check[] 展示默认 `aat:references` 关系。
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

这个示例展示 RDF12 heading projection 的基础查询面：标题树、地址标签、直接属性、交叉引用边证据和本地 target 归属。

""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:startLine 1.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0> a aat:Heading;
    aat:addressLabel "stock-check", "stock-query-example";
    aat:apple "true";
    aat:childOrder 2;
    aat:containsDirectly <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l25-o0>;
    aat:contentEndLine 23;
    aat:contentStartLine 15;
    aat:documentOrder 3;
    aat:endLine 24;
    aat:headingLevel 1;
    aat:headingLine 13;
    aat:headline "库存校验";
    aat:metadataEndLine 12;
    aat:metadataStartLine 11;
    aat:raw """[apple=true]
[#stock-check.rule, status=active]
== 库存校验

库存校验规则描述订单进入履约前需要读取的库存快照。

[#stock-query-example]
[source,sql]
----
SELECT sku, available_qty
FROM inventory_snapshot
WHERE order_id = :order_id;
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
    aat:generatedAddressLabel "_缺货处理";
    aat:headingLevel 2;
    aat:headingLine 25;
    aat:headline "缺货处理";
    aat:raw """=== 缺货处理

缺货处理标题使用生成 address label 进入 heading label space。

""";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:startLine 25.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> a aat:Heading;
    aat:addressLabel "handoff-note";
    aat:childOrder 3;
    aat:contentEndLine 34;
    aat:contentStartLine 32;
    aat:documentOrder 5;
    aat:endLine 35;
    aat:headingLevel 1;
    aat:headingLine 30;
    aat:headline "交接说明";
    aat:metadataEndLine 29;
    aat:metadataStartLine 29;
    aat:raw """[#handoff-note.note, status=active]
== 交接说明

交接说明用 xref:stock-query-example[库存查询示例, rel=documents] 指向库存校验章节里的 listing target。

交接说明也用 xref:stock-check[] 展示默认 `aat:references` 关系。

""";
    aat:references <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:role "note";
    aat:startLine 29;
    aat:status "active";
    rel:documents <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>.
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0> a aat:Heading;
    aat:addressLabel "order-flow";
    aat:childOrder 1;
    aat:contentEndLine 10;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 10;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "订单处理流程";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "ops-docs";
    aat:raw """[#order-flow.process, status=draft, owner=ops-docs]
== 订单处理流程

订单处理流程先执行 xref:stock-check[库存校验, rel=requires, weight=0.7]，然后把结果写入交接说明。

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
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l32-c7-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> rel:documents <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "库存查询示例";
    aat:endColumn 54;
    aat:endLine 32;
    aat:officialHref "#stock-query-example";
    aat:officialReftext "库存查询示例";
    aat:officialResolvedId "stock-query-example";
    aat:officialResolvedType "listing";
    aat:raw "xref:stock-query-example[库存查询示例, rel=documents]";
    aat:rel "documents";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0>;
    aat:sourceSelector "handoff-note";
    aat:startColumn 7;
    aat:startLine 32;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "stock-query-example".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l34-c8-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0> aat:references <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:endColumn 26;
    aat:endLine 34;
    aat:officialHref "#stock-check";
    aat:officialReftext "库存校验";
    aat:officialResolvedId "stock-check";
    aat:officialResolvedType "section";
    aat:raw "xref:stock-check[]";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l29-o0>;
    aat:sourceSelector "handoff-note";
    aat:startColumn 8;
    aat:startLine 34;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "stock-check".
<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#xref-edge-l8-c11-o0> rdf:reifies <<(<urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0> rel:requires <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "库存校验";
    aat:endColumn 59;
    aat:endLine 8;
    aat:officialHref "#stock-check";
    aat:officialReftext "库存校验";
    aat:officialResolvedId "stock-check";
    aat:officialResolvedType "section";
    aat:raw "xref:stock-check[库存校验, rel=requires, weight=0.7]";
    aat:rel "requires";
    aat:relativePath "samples/basic-rdf-projection/basic-projection.adoc";
    aat:sourceHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l5-o0>;
    aat:sourceSelector "order-flow";
    aat:startColumn 11;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:0dc359eca041399da02627a3740ea0e2d7fe1efb46ff8d071ff39238aaf13d3d#heading-l11-o0>;
    aat:targetSelector "stock-check";
    aat:weight "0.7".
```

## Python 下游消费输出

```text
RDF12 basic projection report
Triples: 151

Headings by document order:
  1. [level 0] 基础 RDF 投影示例 labels=-
  2. [level 1] 订单处理流程 labels=order-flow role=process status=draft
  3. [level 1] 库存校验 labels=stock-check, stock-query-example role=rule status=active
  4. [level 2] 缺货处理 labels=_缺货处理
  5. [level 1] 交接说明 labels=handoff-note role=note status=active

Containment:
  基础 RDF 投影示例 --child 1--> 订单处理流程
  基础 RDF 投影示例 --child 2--> 库存校验
  基础 RDF 投影示例 --child 3--> 交接说明
  库存校验 --child 1--> 缺货处理

Xref edges:
  交接说明 --references--> 库存校验 (selector=stock-check, resolvedType=section)
  交接说明 --documents--> 库存校验 (selector=stock-query-example, resolvedType=listing)
  订单处理流程 --requires--> 库存校验 (selector=stock-check, resolvedType=section weight=0.7)

Local target aliases:
  stock-query-example -> 库存校验
```

## 消费边界

这个示例的消费者动作是读取标题投影图。Python 脚本从源文档生成 Turtle，读取 heading order、containment、xref evidence 和 local target alias，并把这些 RDF 事实整理为可读报告。
