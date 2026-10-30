# 一些例子

这些例子仅供理解工具链背后行为与部分语法约定的参考
这里出现的谓词也仅供参考，请根据实际的业务需要，建模自己所需要的准确谓词

## 源文档
```adoc
= 我的笔记本

一段文字xxx

[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, banana=true]。

[apple=true]
[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

=== 细分规则a

一段文字xxx

==== 细分规则a.a

一段文字xxx

== 其他东西

在标题里的交叉引用，主语默认是当前标题。
例如 xref:delivery[rel=implementation]
就是 其他东西 实现 配送策略

若rel为空，则语义为 references
例如 xref:capacity[]

```

## 投影效果

```ttl
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix field: <https://micheng.dev/ns/asciidoc-field#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
@prefix : <urn:aat:doc:base.adoc#>.

:activity a prov:Activity, aat:ProjectionActivity;
    prov:used :source.
:heading-1 a aat:Heading;
    aat:containsDirectly :heading-2, :heading-3, :heading-6;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "我的笔记本";
    aat:raw """= 我的笔记本

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 1.
:heading-2 a aat:Heading;
    aat:addressLabel "delivery";
    aat:addressPath "我的笔记本::配送策略";
    aat:childOrder 1;
    aat:contentEndLine 8;
    aat:contentStartLine 8;
    aat:documentOrder 2;
    aat:endLine 9;
    aat:headingLevel 1;
    aat:headingLine 6;
    aat:headline "配送策略";
    aat:metadataEndLine 5;
    aat:metadataStartLine 5;
    aat:raw """[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, banana=true]。

""";
    aat:relativePath "base.adoc";
    aat:role "policy";
    aat:startLine 5;
    field:owner "ops";
    field:status "active";
    rel:depends-on :heading-3.
:heading-3 a aat:Heading;
    aat:addressLabel "capacity";
    aat:addressPath "我的笔记本::运力规则";
    aat:childOrder 2;
    aat:containsDirectly :heading-4;
    aat:contentEndLine 14;
    aat:contentStartLine 14;
    aat:documentOrder 3;
    aat:endLine 15;
    aat:headingLevel 1;
    aat:headingLine 12;
    aat:headline "运力规则";
    aat:metadataEndLine 11;
    aat:metadataStartLine 10;
    aat:raw """[apple=true]
[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

""";
    aat:relativePath "base.adoc";
    aat:role "rule";
    aat:startLine 10;
    field:apple "true";
    field:status "active".
:heading-4 a aat:Heading;
    aat:addressPath "我的笔记本::运力规则::细分规则a", "运力规则::细分规则a";
    aat:childOrder 1;
    aat:containsDirectly :heading-5;
    aat:contentEndLine 18;
    aat:contentStartLine 18;
    aat:documentOrder 4;
    aat:endLine 19;
    aat:generatedAddressLabel "_细分规则a";
    aat:headingLevel 2;
    aat:headingLine 16;
    aat:headline "细分规则a";
    aat:raw """=== 细分规则a

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 16.
:heading-5 a aat:Heading;
    aat:addressPath "我的笔记本::运力规则::细分规则a::细分规则a.a", "细分规则a::细分规则a.a", "运力规则::细分规则a::细分规则a.a";
    aat:childOrder 1;
    aat:contentEndLine 22;
    aat:contentStartLine 22;
    aat:documentOrder 5;
    aat:endLine 23;
    aat:generatedAddressLabel "_细分规则a_a";
    aat:headingLevel 3;
    aat:headingLine 20;
    aat:headline "细分规则a.a";
    aat:raw """==== 细分规则a.a

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 20.
:heading-6 a aat:Heading;
    aat:addressPath "我的笔记本::其他东西";
    aat:childOrder 3;
    aat:contentEndLine 31;
    aat:contentStartLine 26;
    aat:documentOrder 6;
    aat:endLine 32;
    aat:generatedAddressLabel "_其他东西";
    aat:headingLevel 1;
    aat:headingLine 24;
    aat:headline "其他东西";
    aat:raw """== 其他东西

在标题里的交叉引用，主语默认是当前标题。
例如 xref:delivery[rel=implementation]
就是 其他东西 实现 配送策略

若rel为空，则语义为 references
例如 xref:capacity[]

""";
    aat:references :heading-3;
    aat:relativePath "base.adoc";
    aat:startLine 24;
    rel:implementation :heading-2.
:projection a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource :source;
    prov:wasDerivedFrom :source;
    prov:wasGeneratedBy :activity.
:source a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "base.adoc".
:xref-edge-l27-c4-o0 rdf:reifies <<(:heading-6 rel:implementation :heading-2)>>;
    a aat:XrefEdge;
    aat:endColumn 37;
    aat:endLine 27;
    aat:officialHref "#delivery";
    aat:officialReftext "配送策略";
    aat:officialResolvedId "delivery";
    aat:officialResolvedType "section";
    aat:raw "xref:delivery[rel=implementation]";
    aat:rel "implementation";
    aat:relativePath "base.adoc";
    aat:sourceHeading :heading-6;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 27;
    aat:syntax "macro";
    aat:targetHeading :heading-2;
    aat:targetSelector "delivery".
:xref-edge-l31-c4-o0 rdf:reifies <<(:heading-6 aat:references :heading-3)>>;
    a aat:XrefEdge;
    aat:endColumn 19;
    aat:endLine 31;
    aat:officialHref "#capacity";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity";
    aat:officialResolvedType "section";
    aat:raw "xref:capacity[]";
    aat:relativePath "base.adoc";
    aat:sourceHeading :heading-6;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 31;
    aat:syntax "macro";
    aat:targetHeading :heading-3;
    aat:targetSelector "capacity".
:xref-edge-l8-c8-o0 rdf:reifies <<(:heading-2 rel:depends-on :heading-3)>>;
    a aat:XrefEdge;
    aat:displayLabel "运力规则";
    aat:endColumn 56;
    aat:endLine 8;
    aat:officialHref "#capacity";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity";
    aat:officialResolvedType "section";
    aat:raw "xref:capacity[运力规则, rel=depends-on, banana=true]";
    aat:rel "depends-on";
    aat:relativePath "base.adoc";
    aat:sourceHeading :heading-2;
    aat:sourceSelector "delivery";
    aat:startColumn 8;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading :heading-3;
    aat:targetSelector "capacity";
    field:banana "true".
```
