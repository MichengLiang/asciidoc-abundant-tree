# 1
```asciidoc
= root

一段摘要

[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。

[.banana, for=delivery]
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

[#rel-delivery.pear]
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

[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

=== 我是3级标题

123

```

# 2

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#activity> a prov:Activity, aat:ProjectionActivity;
    prov:used <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#source>.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l1-o0> a aat:Heading;
    aat:containsDirectly <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l39-o0>, <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l5-o0>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "root";
    aat:raw """= root

一段摘要

""";
    aat:relativePath "structural-payload.adoc";
    aat:startLine 1.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l39-o0> a aat:Heading;
    aat:addressLabel "capacity";
    aat:childOrder 2;
    aat:containsDirectly <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l44-o0>;
    aat:contentEndLine 42;
    aat:contentStartLine 42;
    aat:documentOrder 3;
    aat:endLine 43;
    aat:headingLevel 1;
    aat:headingLine 40;
    aat:headline "运力规则";
    aat:metadataEndLine 39;
    aat:metadataStartLine 39;
    aat:raw """[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

""";
    aat:relativePath "structural-payload.adoc";
    aat:role "rule";
    aat:startLine 39;
    aat:status "active".
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l44-o0> a aat:Heading;
    aat:childOrder 1;
    aat:contentEndLine 46;
    aat:contentStartLine 46;
    aat:documentOrder 4;
    aat:endLine 47;
    aat:generatedAddressLabel "_我是3级标题";
    aat:headingLevel 2;
    aat:headingLine 44;
    aat:headline "我是3级标题";
    aat:raw """=== 我是3级标题

123

""";
    aat:relativePath "structural-payload.adoc";
    aat:startLine 44.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l5-o0> a aat:Heading;
    aat:addressLabel "delivery", "rel-delivery";
    aat:childOrder 1;
    aat:contentEndLine 37;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 38;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "配送策略";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "ops";
    aat:payload <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#payload-l10-o0>;
    aat:raw """[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。

[.banana, for=delivery]
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

[#rel-delivery.pear]
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

""";
    aat:relativePath "structural-payload.adoc";
    aat:role "policy";
    aat:startLine 5;
    aat:status "active";
    rel:depends-on <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l39-o0>.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#payload-l10-o0> aat:contentEndLine 22;
    aat:contentStartLine 13;
    aat:endLine 23;
    aat:forSelector "delivery";
    aat:format "json";
    aat:payloadKind "node";
    aat:raw """{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}""";
    aat:relativePath "structural-payload.adoc";
    aat:role "banana";
    aat:startLine 10.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#payload-l25-o0> aat:contentEndLine 36;
    aat:contentStartLine 28;
    aat:endLine 37;
    aat:format "yaml";
    aat:payloadId "rel-delivery";
    aat:payloadKind "edge";
    aat:raw """reason:
  type: risk-control
  signals:
    - weather
    - capacity
  description: 配送策略需要读取运力规则来决定是否降级。
edge:
  direction: outbound
  required: true""";
    aat:relativePath "structural-payload.adoc";
    aat:role "pear";
    aat:startLine 25.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#source>;
    prov:wasDerivedFrom <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#source>;
    prov:wasGeneratedBy <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#activity>.
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "structural-payload.adoc".
<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#xref-edge-l8-c8-o0> rdf:reifies <<(<urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l5-o0> rel:depends-on <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l39-o0>)>>;
    a aat:XrefEdge;
    aat:displayLabel "运力规则";
    aat:endColumn 77;
    aat:endLine 8;
    aat:officialHref "#capacity";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity";
    aat:officialResolvedType "section";
    aat:payloadSelector "rel-delivery";
    aat:payload <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#payload-l25-o0>;
    aat:raw "xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]";
    aat:rel "depends-on";
    aat:relativePath "structural-payload.adoc";
    aat:sourceHeading <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l5-o0>;
    aat:sourceSelector "delivery";
    aat:startColumn 8;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:4ce7bcc996e66f6a23b34d1317f1fa5768cef29978f8ddb95480596373da2ea2#heading-l39-o0>;
    aat:targetSelector "capacity";
    aat:weight "0.8".


```
