# 冷链出库放行 RDF12 payload 消费示例

这个目录展示一个小型、语义完整的 RDF12 payload 挂载与下游消费闭环。

示例业务是：冷链药品出库前，放行策略依赖温控审计规则；策略节点携带小型嵌套 JSON payload，依赖关系边携带 YAML payload。RDF12 projection 保存 payload 的归属、角色、格式、raw 和源码坐标。Python 脚本从项目 CLI 生成 RDF12 Turtle，再用 `pyoxigraph` 查询 RDF，用 Pydantic v2 按 payload role 解释 raw。

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
| nested JSON object | `temperatureWindowCelsius.min/max` | node payload `aat:raw` |
| JSON object array | `checks[]` | node payload `aat:raw` |
| scalar array inside object | `checks[].signals[]` | 下游 Pydantic model 解释 raw |
| local non-heading target alias | `#rel-release-temperature-audit` / `#sensor-check-schema` | owning heading `aat:addressLabel` |
| opaque raw | JSON/YAML block body | payload object 保存 `aat:raw`，下游消费者解释内部字段 |

## 源 AsciiDoc

```asciidoc
= 冷链放行示例

这个示例展示 RDF12 heading projection 如何把节点 payload、边 payload、xref evidence 和本地非标题 target alias 保留为可查询事实。节点 payload 使用小型嵌套 JSON 表达放行策略配置；投影图保存 payload raw 与绑定事实，字段解释由下游消费者完成。

[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]。

[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "checks": [
    {
      "code": "temperature_checkpoint",
      "required": true,
      "signals": ["checkpoint_id", "temperature_celsius", "recorded_at"]
    },
    {
      "code": "route_exception_log",
      "required": true,
      "signals": ["route_id", "exception_code"]
    }
  ],
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
    aat:containsDirectly <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0>, <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l55-o0>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "冷链放行示例";
    aat:raw """= 冷链放行示例

这个示例展示 RDF12 heading projection 如何把节点 payload、边 payload、xref evidence 和本地非标题 target alias 保留为可查询事实。节点 payload 使用小型嵌套 JSON 表达放行策略配置；投影图保存 payload raw 与绑定事实，字段解释由下游消费者完成。

""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:startLine 1.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0> a aat:Heading;
    aat:addressLabel "cold-chain-release", "rel-release-temperature-audit";
    aat:childOrder 1;
    aat:contentEndLine 53;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 54;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "冷链出库放行策略";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "quality-ops";
    aat:payload <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l10-o0>, <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l34-o0>;
    aat:raw """[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]。

[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "checks": [
    {
      "code": "temperature_checkpoint",
      "required": true,
      "signals": ["checkpoint_id", "temperature_celsius", "recorded_at"]
    },
    {
      "code": "route_exception_log",
      "required": true,
      "signals": ["route_id", "exception_code"]
    }
  ],
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
    rel:depends-on <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l55-o0>.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l55-o0> a aat:Heading;
    aat:addressLabel "sensor-check-schema", "temperature-audit";
    aat:childOrder 2;
    aat:contentEndLine 64;
    aat:contentStartLine 58;
    aat:documentOrder 3;
    aat:endLine 65;
    aat:headingLevel 1;
    aat:headingLine 56;
    aat:headline "温控审计规则";
    aat:metadataEndLine 55;
    aat:metadataStartLine 55;
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
    aat:startLine 55;
    aat:status "active".
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l10-o0> aat:contentEndLine 31;
    aat:contentStartLine 13;
    aat:endLine 32;
    aat:forSelector "cold-chain-release";
    aat:format "json";
    aat:payloadKind "node";
    aat:raw """{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "checks": [
    {
      "code": "temperature_checkpoint",
      "required": true,
      "signals": ["checkpoint_id", "temperature_celsius", "recorded_at"]
    },
    {
      "code": "route_exception_log",
      "required": true,
      "signals": ["route_id", "exception_code"]
    }
  ],
  "manualReviewWhen": ["sensor_gap", "route_exception"]
}""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "release-policy-config";
    aat:startLine 10.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l34-o0> aat:contentEndLine 41;
    aat:contentStartLine 37;
    aat:endLine 42;
    aat:format "yaml";
    aat:payloadKind "node";
    aat:raw """review_team: quality-ops
steps:
  - check last temperature checkpoint
  - compare shipment route exception log
  - approve only when both records agree""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:role "review-playbook";
    aat:startLine 34.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l44-o0> aat:contentEndLine 52;
    aat:contentStartLine 47;
    aat:endLine 53;
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
    aat:startLine 44.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source>;
    prov:wasDerivedFrom <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source>;
    prov:wasGeneratedBy <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#activity>.
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc".
<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#xref-edge-l8-c12-o0> rdf:reifies <<(<urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0> rel:depends-on <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l55-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "温控审计规则";
    aat:endColumn 109;
    aat:endLine 8;
    aat:officialHref "#temperature-audit";
    aat:officialReftext "温控审计规则";
    aat:officialResolvedId "temperature-audit";
    aat:officialResolvedType "section";
    aat:payloadSelector "rel-release-temperature-audit";
    aat:payload <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#payload-l44-o0>;
    aat:raw "xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]";
    aat:rel "depends-on";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:sourceHeading <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l5-o0>;
    aat:sourceSelector "cold-chain-release";
    aat:startColumn 12;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0#heading-l55-o0>;
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
    required checks: temperature_checkpoint, route_exception_log
    signal fields: checkpoint_id, exception_code, recorded_at, route_id, temperature_celsius
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

RDF12 projector 的公共事实是 payload object 的归属、角色、格式、raw、payload kind 和源码坐标。`consume_payloads.py` 是下游消费者：它按 `aat:role` 选择 Pydantic model，按 `aat:format` 选择 JSON/YAML parser，再把 `aat:raw` 解释成放行策略配置、复核手册或依赖证据。payload raw 的 schema validation 与内部字段解释属于下游消费者；如果 raw 不满足下游模型，那是消费模型与源 payload 的不匹配，不改变 projection 的结构事实。
