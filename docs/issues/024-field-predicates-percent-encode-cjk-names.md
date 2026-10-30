# 中文字段名的谓词做了百分号编码，按字段名写的查询静默落空

- 发现：2026-10-30，workbench 里为 reST 文档将来的 RDF 投影对照 aat 的谓词命名时，在 bookgraph 打开的 08 号书投影上实测。
- 代码版本：asciidoc-abundant-tree 仓库 `7627bc3`（0.2.6）。
- 性质：转告。
- 相关：023（非 ASCII 的关系谓词不生成主关系三元组）。
- 影响：查询者照书里的字段名写前缀名，`?h 字段:落点 ?v` 语法合法、结果为空，没有任何提示，看上去像“没有这个字段”；要写成
  `字段:%E8%90%BD%E7%82%B9` 才对得上。Turtle 输出里中文字段谓词只能整条 IRI 写出（`<…#field-%E8%90%BD%E7%82%B9>`），读不出是
  哪个字段。工作区 07 号书《字段》一章照规约写了这条编码规则，规约改了它也要跟着改。

## 实测

bookgraph 打开 trestlework 的 `08-trestlework-design`（aat 0.2.6 投影，pyoxigraph 0.5.11），三种写法查同一个字段“落点”：

```sparql
PREFIX 字段: <https://micheng.dev/ns/asciidoc-abundant-tree#field->
SELECT (COUNT(*) AS ?n) WHERE { ?h 字段:落点 ?v }                                       # 0
SELECT (COUNT(*) AS ?n) WHERE { ?h 字段:%E8%90%BD%E7%82%B9 ?v }                         # 119
SELECT (COUNT(*) AS ?n) WHERE { ?h <https://micheng.dev/ns/asciidoc-abundant-tree#field-%E8%90%BD%E7%82%B9> ?v }   # 119
```

谓词 IRI 里直接写汉字时，同一个 pyoxigraph 0.5.11 里 SPARQL 与 Turtle 都通，写出再读回一字不差：

```turtle
@prefix 字段: <https://micheng.dev/ns/asciidoc-abundant-tree#field-> .
@prefix 书: <urn:书/> .
书:红烧肉 字段:落点 "packages/core" .
```

`SELECT ?h ?v WHERE { ?h 字段:落点 ?v }` 查到这一条。

## 规约与实现现在怎样

* 规约：06 号书 `chapters/02-heading-node.adoc:143`：“非 ASCII 的名字即使是合法的 Turtle local name 也走编码一支，所以中文
  字段名永远落在 `aat:field-` 之下。”同书 `chapters/06-field-and-complex-property.adoc:46` 与术语表 `backmatter/glossary.adoc:22` 同。
* 实现：`src/rdf12-projection/field-predicate.ts:11`，`aat:field-` 加 `encodeURIComponent(fieldName)`。
* 测试：`test/rdf12-projection/field-predicate.test.ts:14-20` 断言编码形式（`über score`、`x/y`）。
* 消费方：`src/animation-yaml-export/graph-reader.ts:246-247` 用 `decodeURIComponent` 还原字段名。

## 相关的事实

* RDF 1.1 Concepts（§3.2）里两个 IRI 相等，当且仅当按 RFC 3987 的简单字符串比较相等。`field-落点` 与
  `field-%E8%90%BD%E7%82%B9` 因此是两个谓词，上面的 0 与 119 就是这样来的。
* RFC 3987 的 `ucschar` 收汉字。IRI 里必须编码的是它不允许的字符：空格、`<`、`>`、`"`、`{`、`}`、`|`、`\`、`^`、反引号与控制字符。
  08 号书里正有这样的字段名，例如“`` `dockview/` 是唯一的适配目录 ``”，带空格与反引号。
* 字段名是书的约定词表里的词（工作区 07 号书《声明本书的约定》），写书、读书、查图用的是同一个词。
* 节点 IRI（`urn:aat:doc:<哈希>#heading-l8-o0`）按行号与序号起名，读起来是同一类问题；这里不展开。工作区给 reST 文档设计投影时，
  打算让 IRI 直接带读者认得的名字，只编码 IRI 不允许的字符。

## 转告

只陈述实测与规约原文；规约要不要改、怎样改由 aat 定。
