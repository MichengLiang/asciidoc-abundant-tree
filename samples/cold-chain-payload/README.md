# 冷链出库放行 RDF12 payload 消费示例

这个目录展示一个小型、语义完整的 RDF12 payload 挂载与下游消费闭环。

示例业务是：冷链药品出库前，放行策略依赖温控审计规则；策略节点携带节点 payload，依赖关系边携带边 payload。Python 脚本从项目 CLI 生成 RDF12 Turtle，再用 `pyoxigraph` 查询 RDF，用 Pydantic v2 解释 payload raw。

## 文件

- `cold-chain-release.adoc`：源 AsciiDoc。
- `consume_payloads.py`：下游消费脚本，可直接通过 `uv run` 执行。
- `README.md`：源文件、预生成 Turtle 和脚本输出记录。

## 复现命令

```bash
pnpm --silent dev samples/cold-chain-payload/cold-chain-release.adoc --format rdf12
```

```bash
uv run samples/cold-chain-payload/consume_payloads.py
```

`consume_payloads.py` 使用 PEP 723 inline dependencies，`uv run` 会按需安装 `pyoxigraph`、`pydantic` 和 `PyYAML`。

## 结构覆盖

| 特性 | 示例表面 | RDF12 事实 |
|---|---|---|
| heading node | `== 冷链出库放行策略` | `aat:Heading` |
| heading role/direct fields | `[#cold-chain-release.policy, status=active, owner=quality-ops]` | `aat:role`、`aat:status`、`aat:owner` |
| selector node payload | `[.release-policy-config, for=cold-chain-release]` | heading `aat:payload` -> node payload，payload 输出 `aat:forSelector` |
| source-owner node payload | `[.review-playbook, for]` | heading `aat:payload` -> node payload，不输出空 `aat:forSelector` |
| edge payload | xref `payload=rel-release-temperature-audit` + `[#rel-release-temperature-audit.dependency-evidence]` | xref edge evidence `aat:payload` -> edge payload |
| source payload id | `#rel-release-temperature-audit` | edge payload `aat:payloadId` |
| payload role | `.release-policy-config` / `.review-playbook` / `.dependency-evidence` | payload `aat:role` |
| payload format | `[source,json]` / `[source,yaml]` | payload `aat:format` |
| local non-heading target alias | `#rel-release-temperature-audit` / `#sensor-check-schema` | owning heading `aat:addressLabel` |
| opaque raw | JSON/YAML block body | payload `aat:raw`，业务字段不展开为 RDF 谓词 |

## 源 AsciiDoc

```asciidoc
= 冷链放行示例

这个示例展示 RDF12 heading projection 如何把节点 payload、边 payload、xref evidence 和本地非标题 target alias 保留为可查询事实。

[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]。

[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": [2, 8],
  "maxOfflineMinutes": 12,
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
  - approve only when both records agree
----

[#rel-release-temperature-audit.dependency-evidence]
[source,yaml]
----
source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。
----

[#temperature-audit.rule, status=active]
== 温控审计规则

温控审计规则定义冷链药品在出库前必须满足的温度记录完整性要求。

[#sensor-check-schema]
[source,json]
----
{"required": ["checkpoint_id", "temperature_celsius", "recorded_at"]}
----
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

<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#activity> a prov:Activity, aat:ProjectionActivity;
    prov:used <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source>.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l1-o0> a aat:Heading;
    aat:containsDirectly <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l41-o0>, <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "冷链放行示例";
    aat:raw """= 冷链放行示例

这个示例展示 RDF12 heading projection 如何把节点 payload、边 payload、xref evidence 和本地非标题 target alias 保留为可查询事实。

""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:startLine 1.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l41-o0> a aat:Heading;
    aat:addressLabel "sensor-check-schema", "temperature-audit";
    aat:childOrder 2;
    aat:contentEndLine 50;
    aat:contentStartLine 44;
    aat:documentOrder 3;
    aat:endLine 51;
    aat:headingLevel 1;
    aat:headingLine 42;
    aat:headline "温控审计规则";
    aat:metadataEndLine 41;
    aat:metadataStartLine 41;
    aat:raw """[#temperature-audit.rule, status=active]
== 温控审计规则

温控审计规则定义冷链药品在出库前必须满足的温度记录完整性要求。

[#sensor-check-schema]
[source,json]
----
{"required": ["checkpoint_id", "temperature_celsius", "recorded_at"]}
----

""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "rule";
    aat:startLine 41;
    aat:status "active".
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0> a aat:Heading;
    aat:addressLabel "cold-chain-release", "rel-release-temperature-audit";
    aat:childOrder 1;
    aat:contentEndLine 39;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 40;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "冷链出库放行策略";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "quality-ops";
    aat:payload <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l10-o0>, <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l20-o0>;
    aat:raw """[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]。

[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": [2, 8],
  "maxOfflineMinutes": 12,
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
  - approve only when both records agree
----

[#rel-release-temperature-audit.dependency-evidence]
[source,yaml]
----
source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。
----

""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "policy";
    aat:startLine 5;
    aat:status "active";
    rel:depends-on <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l41-o0>.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l10-o0> aat:contentEndLine 17;
    aat:contentStartLine 13;
    aat:endLine 18;
    aat:forSelector "cold-chain-release";
    aat:format "json";
    aat:payloadKind "node";
    aat:raw """{
  "temperatureWindowCelsius": [2, 8],
  "maxOfflineMinutes": 12,
  "manualReviewWhen": ["sensor_gap", "route_exception"]
}""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "release-policy-config";
    aat:startLine 10.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l20-o0> aat:contentEndLine 27;
    aat:contentStartLine 23;
    aat:endLine 28;
    aat:format "yaml";
    aat:payloadKind "node";
    aat:raw """review_team: quality-ops
steps:
  - check last temperature checkpoint
  - compare shipment route exception log
  - approve only when both records agree""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "review-playbook";
    aat:startLine 20.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l30-o0> aat:contentEndLine 38;
    aat:contentStartLine 33;
    aat:endLine 39;
    aat:format "yaml";
    aat:payloadId "rel-release-temperature-audit";
    aat:payloadKind "edge";
    aat:raw """source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "dependency-evidence";
    aat:startLine 30.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source>;
    prov:wasDerivedFrom <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source>;
    prov:wasGeneratedBy <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#activity>.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc".
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#xref-edge-l8-c12-o0> rdf:reifies <<(<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0> rel:depends-on <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l41-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "温控审计规则";
    aat:endColumn 109;
    aat:endLine 8;
    aat:officialHref "#temperature-audit";
    aat:officialReftext "温控审计规则";
    aat:officialResolvedId "temperature-audit";
    aat:officialResolvedType "section";
    aat:payloadSelector "rel-release-temperature-audit";
    aat:payload <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l30-o0>;
    aat:raw "xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]";
    aat:rel "depends-on";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:sourceHeading <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0>;
    aat:sourceSelector "cold-chain-release";
    aat:startColumn 12;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l41-o0>;
    aat:targetSelector "temperature-audit";
    aat:weight "0.9".
```

## Python 下游消费输出

```text
RDF12 cold-chain payload report
Triples: 115

Policy: cold-chain-release / 冷链出库放行策略
  node payload release-policy-config [json]
    temperature window: 2..8 C
    max offline minutes: 12
    manual review when: sensor_gap, route_exception
  node payload review-playbook [yaml]
    review team: quality-ops
    steps: 3

Relation: 冷链出库放行策略 --depends-on--> 温控审计规则
  payload selector: rel-release-temperature-audit
  edge payload dependency-evidence [yaml]
    source: quality-sop-2026
    risk level: high
    required signals: temperature_checkpoint, route_exception_log
    reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。

Local target aliases:
  rel-release-temperature-audit -> 冷链出库放行策略
  sensor-check-schema -> 温控审计规则
```

## 消费边界

RDF12 projector 只保留结构事实和 opaque raw。`consume_payloads.py` 是下游工具，它按 `aat:role` 选择 Pydantic model，按 `aat:format` 选择 JSON/YAML parser，再解释 `aat:raw`。如果 payload raw 不满足下游模型，那是下游消费错误，不是 RDF12 projector 的 lint 责任。
