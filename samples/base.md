# 一些例子

这些例子仅供理解工具链背后行为与部分语法约定的参考
这里出现的谓词也仅供参考，请根据实际的业务需要，建模自己所需要的准确谓词

## 源文档
```adoc
= 我的笔记本

一段文字xxx

[#delivery-policy.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on, banana=true]。

[#capacity-rule.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

=== 细分规则a

一段文字xxx

==== 细分规则a.a

一段文字xxx

== 其他东西

在标题里的交叉引用，主语默认是当前标题。
例如 xref:delivery-policy[rel=implementation]
就是 其他东西 实现 配送策略

若rel为空，则语义为 references
例如 xref:capacity-rule[]


```

## 投影效果

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#activity> a prov:Activity, aat:ProjectionActivity;
    prov:used <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#source>.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l1-o0> a aat:Heading;
    aat:containsDirectly <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>, <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0>, <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "我的笔记本";
    aat:raw """= 我的笔记本

一段文字xxx

""";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:startLine 1.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0> a aat:Heading;
    aat:addressLabel "capacity-rule";
    aat:containsDirectly <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l15-o0>;
    aat:contentEndLine 13;
    aat:contentStartLine 13;
    aat:endLine 14;
    aat:headingLevel 1;
    aat:headingLine 11;
    aat:headline "运力规则";
    aat:metadataEndLine 10;
    aat:metadataStartLine 10;
    aat:previousSibling <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>;
    aat:raw """[#capacity-rule.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

""";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:role "rule";
    aat:startLine 10;
    aat:status "active".
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l15-o0> a aat:Heading;
    aat:containsDirectly <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l19-o0>;
    aat:contentEndLine 17;
    aat:contentStartLine 17;
    aat:endLine 18;
    aat:generatedAddressLabel "_细分规则a";
    aat:headingLevel 2;
    aat:headingLine 15;
    aat:headline "细分规则a";
    aat:raw """=== 细分规则a

一段文字xxx

""";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:startLine 15.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l19-o0> a aat:Heading;
    aat:contentEndLine 21;
    aat:contentStartLine 21;
    aat:endLine 22;
    aat:generatedAddressLabel "_细分规则a_a";
    aat:headingLevel 3;
    aat:headingLine 19;
    aat:headline "细分规则a.a";
    aat:raw """==== 细分规则a.a

一段文字xxx

""";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:startLine 19.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0> a aat:Heading;
    aat:contentEndLine 30;
    aat:contentStartLine 25;
    aat:endLine 31;
    aat:generatedAddressLabel "_其他东西";
    aat:headingLevel 1;
    aat:headingLine 23;
    aat:headline "其他东西";
    aat:previousSibling <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>;
    aat:raw """== 其他东西

在标题里的交叉引用，主语默认是当前标题。
例如 xref:delivery-policy[rel=implementation]
就是 其他东西 实现 配送策略

若rel为空，则语义为 references
例如 xref:capacity-rule[]

""";
    aat:references <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>;
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:startLine 23;
    rel:implementation <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0> a aat:Heading;
    aat:addressLabel "delivery-policy";
    aat:contentEndLine 8;
    aat:contentStartLine 8;
    aat:endLine 9;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "配送策略";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:owner "ops";
    aat:raw """[#delivery-policy.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on, banana=true]。

""";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:role "policy";
    aat:startLine 5;
    aat:status "active";
    rel:depends-on <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#source>;
    prov:wasDerivedFrom <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#source>;
    prov:wasGeneratedBy <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#activity>.
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc".
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#xref-edge-l26-c4-o0> rdf:reifies <<(<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0> rel:implementation <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>)>>;
    a aat:XrefEdge;
    aat:endColumn 44;
    aat:endLine 26;
    aat:officialHref "#delivery-policy";
    aat:officialReftext "配送策略";
    aat:officialResolvedId "delivery-policy";
    aat:officialResolvedType "section";
    aat:raw "xref:delivery-policy[rel=implementation]";
    aat:rel "implementation";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:sourceHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0>;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 26;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>;
    aat:targetSelector "delivery-policy".
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#xref-edge-l30-c4-o0> rdf:reifies <<(<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0> aat:references <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>)>>;
    a aat:XrefEdge;
    aat:endColumn 24;
    aat:endLine 30;
    aat:officialHref "#capacity-rule";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity-rule";
    aat:officialResolvedType "section";
    aat:raw "xref:capacity-rule[]";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:sourceHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l23-o0>;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 30;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>;
    aat:targetSelector "capacity-rule".
<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#xref-edge-l8-c8-o0> rdf:reifies <<(<urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0> rel:depends-on <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>)>>;
    a aat:XrefEdge;
    aat:banana "true";
    aat:displayLabel "运力规则";
    aat:endColumn 61;
    aat:endLine 8;
    aat:officialHref "#capacity-rule";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity-rule";
    aat:officialResolvedType "section";
    aat:raw "xref:capacity-rule[运力规则, rel=depends-on, banana=true]";
    aat:rel "depends-on";
    aat:relativePath "micheng-ts/projects/asciidoc-abundant-tree/samples/base.adoc";
    aat:sourceHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l5-o0>;
    aat:sourceSelector "delivery-policy";
    aat:startColumn 8;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <urn:aat:doc:694cbfc1bf954a1e96ef7350ba79a81964e0bd660ef896677a0d1aac3893d932#heading-l10-o0>;
    aat:targetSelector "capacity-rule".

```
