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
@base <urn:aat:doc:base.adoc>.
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix field: <https://micheng.dev/ns/asciidoc-field#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#其他东西> a aat:Heading;
    aat:childOrder 3;
    aat:contentEndLine 31;
    aat:contentStartLine 26;
    aat:documentOrder 6;
    aat:endLine 32;
    aat:generatedAddressLabel "_其他东西";
    aat:headingLevel 1;
    aat:headingLine 24;
    aat:headline "其他东西";
    aat:name "其他东西";
    aat:raw """== 其他东西

在标题里的交叉引用，主语默认是当前标题。
例如 xref:delivery[rel=implementation]
就是 其他东西 实现 配送策略

若rel为空，则语义为 references
例如 xref:capacity[]

""";
    aat:references <#运力规则>;
    aat:relativePath "base.adoc";
    aat:startLine 24;
    rel:implementation <#配送策略>.
<#我的笔记本> a aat:Heading;
    aat:containsDirectly <#其他东西>, <#运力规则>, <#配送策略>;
    aat:contentEndLine 3;
    aat:contentStartLine 3;
    aat:documentOrder 1;
    aat:endLine 4;
    aat:headingLevel 0;
    aat:headingLine 1;
    aat:headline "我的笔记本";
    aat:name "我的笔记本";
    aat:raw """= 我的笔记本

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 1.
<#细分规则a.a> a aat:Heading;
    aat:childOrder 1;
    aat:contentEndLine 22;
    aat:contentStartLine 22;
    aat:documentOrder 5;
    aat:endLine 23;
    aat:generatedAddressLabel "_细分规则a_a";
    aat:headingLevel 3;
    aat:headingLine 20;
    aat:headline "细分规则a.a";
    aat:name "细分规则a.a";
    aat:raw """==== 细分规则a.a

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 20.
<#细分规则a> a aat:Heading;
    aat:childOrder 1;
    aat:containsDirectly <#细分规则a.a>;
    aat:contentEndLine 18;
    aat:contentStartLine 18;
    aat:documentOrder 4;
    aat:endLine 19;
    aat:generatedAddressLabel "_细分规则a";
    aat:headingLevel 2;
    aat:headingLine 16;
    aat:headline "细分规则a";
    aat:name "细分规则a";
    aat:raw """=== 细分规则a

一段文字xxx

""";
    aat:relativePath "base.adoc";
    aat:startLine 16.
<#运力规则> a aat:Heading;
    aat:addressLabel "capacity";
    aat:childOrder 2;
    aat:containsDirectly <#细分规则a>;
    aat:contentEndLine 14;
    aat:contentStartLine 14;
    aat:documentOrder 3;
    aat:endLine 15;
    aat:headingLevel 1;
    aat:headingLine 12;
    aat:headline "运力规则";
    aat:metadataEndLine 11;
    aat:metadataStartLine 10;
    aat:name "运力规则";
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
<#配送策略> a aat:Heading;
    aat:addressLabel "delivery";
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
    aat:name "配送策略";
    aat:raw """[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, banana=true]。

""";
    aat:relativePath "base.adoc";
    aat:role "policy";
    aat:startLine 5;
    field:owner "ops";
    field:status "active";
    rel:depends-on <#运力规则>.
<urn:aat:doc:base.adoc/projection#activity> a prov:Activity, aat:ProjectionActivity;
    prov:used <urn:aat:doc:base.adoc/projection#source>.
<urn:aat:doc:base.adoc/projection#projection> a prov:Entity, aat:HeadingProjection;
    prov:hadPrimarySource <urn:aat:doc:base.adoc/projection#source>;
    prov:wasDerivedFrom <urn:aat:doc:base.adoc/projection#source>;
    prov:wasGeneratedBy <urn:aat:doc:base.adoc/projection#activity>.
<urn:aat:doc:base.adoc/projection#source> a prov:Entity, aat:AsciiDocSourceDocument;
    aat:relativePath "base.adoc".
<urn:aat:doc:base.adoc/projection#xref-edge-l27-c4-o0> rdf:reifies <<(<#其他东西> rel:implementation <#配送策略>)>>;
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
    aat:sourceHeading <#其他东西>;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 27;
    aat:syntax "macro";
    aat:targetHeading <#配送策略>;
    aat:targetSelector "delivery".
<urn:aat:doc:base.adoc/projection#xref-edge-l31-c4-o0> rdf:reifies <<(<#其他东西> aat:references <#运力规则>)>>;
    a aat:XrefEdge;
    aat:endColumn 19;
    aat:endLine 31;
    aat:officialHref "#capacity";
    aat:officialReftext "运力规则";
    aat:officialResolvedId "capacity";
    aat:officialResolvedType "section";
    aat:raw "xref:capacity[]";
    aat:relativePath "base.adoc";
    aat:sourceHeading <#其他东西>;
    aat:sourceSelector "_其他东西";
    aat:startColumn 4;
    aat:startLine 31;
    aat:syntax "macro";
    aat:targetHeading <#运力规则>;
    aat:targetSelector "capacity".
<urn:aat:doc:base.adoc/projection#xref-edge-l8-c8-o0> rdf:reifies <<(<#配送策略> rel:depends-on <#运力规则>)>>;
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
    aat:sourceHeading <#配送策略>;
    aat:sourceSelector "delivery";
    aat:startColumn 8;
    aat:startLine 8;
    aat:syntax "macro";
    aat:targetHeading <#运力规则>;
    aat:targetSelector "capacity";
    field:banana "true".
```
