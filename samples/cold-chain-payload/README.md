# 冷链出库放行 RDF12 complex property 消费示例

这个目录展示一个小型、语义完整的 RDF12 complex property 与下游消费闭环。

示例业务是：冷链药品出库前，放行策略依赖温控审计规则；策略 heading 挂载 JSON/YAML raw value object，依赖关系边挂载 YAML raw value object。RDF12 projection 通过字段谓词连接 subject 与 raw value object；Python 脚本从项目 CLI 生成 RDF12 Turtle，再用 `pyoxigraph` 查询字段谓词，用 Pydantic v2 解释 raw JSON/YAML。

## 文件

- `cold-chain-release.adoc`：源 AsciiDoc。
- `consume_payloads.py`：下游消费脚本，可直接通过 `uv run` 执行。
- `README.md`：源文件、Turtle 摘要和脚本输出记录。

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
| selector-bound heading complex property | `[.release-policy-config, for=cold-chain-release]` | heading `aat:release-policy-config` -> raw value object，value 输出 `aat:forSelector` |
| source-owned heading complex property | `[.review-playbook, for]` | heading `aat:review-playbook` -> raw value object，不输出空 selector |
| xref edge complex property | xref `dependency-evidence=rel-release-temperature-audit` + `[#rel-release-temperature-audit]` | xref edge evidence `aat:dependency-evidence` -> raw value object |
| source value id | `#rel-release-temperature-audit` | raw value object `aat:sourceValueId` |
| raw value format | `[source,json]` / `[source,yaml]` | raw value object `aat:format` |
| nested JSON object | `temperatureWindowCelsius.min/max` | raw value object `aat:raw` |
| JSON object array | `checks[]` | raw value object `aat:raw` |
| scalar array inside object | `checks[].signals[]` | 下游 Pydantic model 解释 raw |
| local non-heading target alias | `#rel-release-temperature-audit` / `#sensor-check-schema` | owning heading `aat:addressLabel` |
| opaque raw | JSON/YAML block body | raw value object 保存 `aat:raw`，下游消费者解释内部字段 |

## 源 AsciiDoc

```asciidoc
= 冷链放行示例

这个示例展示 RDF12 heading projection 如何把 heading complex property、xref edge complex property、xref evidence 和本地非标题 target alias 保留为可查询事实。复杂属性使用 source value block 承载 raw JSON/YAML；投影图通过字段谓词连接 raw value object，字段解释由下游消费者完成。

[#cold-chain-release.policy, status=active, owner=quality-ops]
== 冷链出库放行策略

冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

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

## RDF12 Turtle 摘要

下面是实际 Turtle 输出的摘录，不是可直接提交给 Turtle parser 的完整输出。`{document-hash}` 表示 CLI 按源文档路径计算出的 64 位十六进制 document key；当前样例的一次实际值是 `6133abcc6b1d0264191cad9fc3a3bb659b7f42a7f119bf1c6fc3a47571245ad0`。摘录省略 provenance、root heading、完整 heading raw、official xref evidence、未在摘录中使用的 prefix 和部分 source coordinate 字段；raw literal 中的 `...` 只表示摘录省略，不属于实际 raw 内容。未省略的谓词、line number、field predicate 和 raw value object 关系应与实际输出一致。

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<urn:aat:doc:{document-hash}#heading-l5-o0> a aat:Heading;
    aat:addressLabel "cold-chain-release", "rel-release-temperature-audit";
    aat:headline "冷链出库放行策略";
    aat:owner "quality-ops";
    aat:release-policy-config <urn:aat:doc:{document-hash}#payload-l10-o0>;
    aat:review-playbook <urn:aat:doc:{document-hash}#payload-l34-o0>;
    aat:role "policy";
    aat:status "active";
    rel:depends-on <urn:aat:doc:{document-hash}#heading-l55-o0>.

<urn:aat:doc:{document-hash}#payload-l10-o0> aat:contentEndLine 31;
    aat:contentStartLine 13;
    aat:endLine 32;
    aat:forSelector "cold-chain-release";
    aat:format "json";
    aat:raw """{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  },
  "checks": [
    ...
  ],
  "manualReviewWhen": ["sensor_gap", "route_exception"]
}""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:startLine 10.

<urn:aat:doc:{document-hash}#payload-l34-o0> aat:contentEndLine 41;
    aat:contentStartLine 37;
    aat:endLine 42;
    aat:format "yaml";
    aat:raw """review_team: quality-ops
steps:
  - check last temperature checkpoint
  - compare shipment route exception log
  - approve only when both records agree""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:startLine 34.

<urn:aat:doc:{document-hash}#payload-l44-o0> aat:contentEndLine 52;
    aat:contentStartLine 47;
    aat:endLine 53;
    aat:format "yaml";
    aat:raw """source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。""";
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc";
    aat:sourceValueId "rel-release-temperature-audit";
    aat:startLine 44.

<urn:aat:doc:{document-hash}#xref-edge-l8-c12-o0> rdf:reifies <<(<urn:aat:doc:{document-hash}#heading-l5-o0> rel:depends-on <urn:aat:doc:{document-hash}#heading-l55-o0>)>>;
    a aat:XrefEdge;
    aat:dependency-evidence <urn:aat:doc:{document-hash}#payload-l44-o0>;
    aat:rel "depends-on";
    aat:sourceHeading <urn:aat:doc:{document-hash}#heading-l5-o0>;
    aat:targetHeading <urn:aat:doc:{document-hash}#heading-l55-o0>;
    aat:targetSelector "temperature-audit";
    aat:weight "0.9".
```

## Python 下游消费输出

```text
RDF12 cold-chain complex property report
Triples: 108

Policy: cold-chain-release / 冷链出库放行策略
  heading field release-policy-config [json]
    temperature window: 2..8 C
    required checks: temperature_checkpoint, route_exception_log
    signal fields: checkpoint_id, exception_code, recorded_at, route_id, temperature_celsius
    manual review when: sensor_gap, route_exception
  heading field review-playbook [yaml]
    review team: quality-ops
    steps: 3

Relation: 冷链出库放行策略 --depends-on--> 温控审计规则
  source value id: rel-release-temperature-audit
  edge field dependency-evidence [yaml]
    source: quality-sop-2026
    risk level: high
    required signals: temperature_checkpoint, route_exception_log
    reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。

Local target aliases:
  rel-release-temperature-audit -> 冷链出库放行策略
  sensor-check-schema -> 温控审计规则
```

## 消费边界

RDF12 projector 的公共事实是字段谓词、raw value object、format、raw、binding evidence 和源码坐标。`consume_payloads.py` 是下游消费者：它按 heading field `aat:release-policy-config`、`aat:review-playbook` 和 xref edge field `aat:dependency-evidence` 选择 Pydantic model，按 `aat:format` 选择 JSON/YAML parser，再把 `aat:raw` 解释成放行策略配置、复核手册或依赖证据。raw 的 schema validation 与内部字段解释属于下游消费者；如果 raw 不满足下游模型，那是消费模型与源字段的匹配问题，不改变 projection 的结构事实。
