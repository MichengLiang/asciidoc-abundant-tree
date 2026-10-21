# 块里有被引入的行时，块没有坐标，被引入文件里的 xref 也不挂到块和标题上

- 发现：2026-10-22，小汤回头检查 RDF 这条线时，在 trestlework 8 号书与 seekcrowd《人群实验室》上实测。
- 代码版本：asciidoc-abundant-tree 仓库 `dd57fb8`（0.2.1 之后）。
- 影响：三种表现，病根相同——把来源文件当成了结构边界。
  1. `[source]` / `----` / `include::代码文件[]` / `----` 这种写法，整块写在作者文件里，却因为中间那几行来自
     被引入的文件，被判为"跨来源文件"：没有 `source`、`span`、`contentSpan`，每处一条
     `block-origin.multi-source-span`，消息里只有展开后的逻辑行号，作者找不到是哪个文件哪一行。8 号书 10 处，
     《人群实验室》13 处。
  2. `|===` 写在作者文件、表格行用 include 引入，或段落中间一行 include：被引入行里的 xref 不挂到块下，
     块的 `bindingRequests` 里没有它们，RDF 里这些边没有 `aat:sourceHeading`、`aat:officialHref`，也没有
     `rdf:reifies <<( 标题 aat:references 目标 )>>`。
  3. 出现处属于哪个标题，按"同一文件、行号落在标题区间里"判定。被引入文件自己没有标题时（如 `_partintro.adoc`、
     只有段落的片段），里面的 xref 没有所属标题，图里的边没有起点。8 号书 716 条边里有 4 条如此，全部来自
     各部的 `_partintro.adoc`；bookgraph 的 `who()` 因此漏掉它们。被引入文件里的 `[[anchor]]` 同样归不到标题上。
- 涉及：`src/book-entry/source-aware-coordinate.ts` 的 `recoverSourceAwareSourceLayer`（块里任何一行来自别的文件
  就失败）；`src/official-projector.ts` 的 `originLineSpan`（内容区间单独回源）与 `collectOccurrencesInSpan`
  （按块的文件与行区间过滤出现处）；`src/book-entry/source-scope-index.ts`（所属标题按来源区间判定）；
  `src/rdf12-projection/xref-projector.ts` 的 `sourceHeadingBySelector`（要求标题与 xref 在同一文件）。

## 复现（实测）

章节 `parts/a.adoc`（由 `book.adoc` 引入）：

```adoc
[#sec-a]
== Section A

[source,python]
----
include::../code/x.py[]
----

|===
| Col
include::rows.adoc[]
|===

Opening line of the paragraph.
include::middle.adoc[]
Closing line.

include::loose.adoc[]

[#target]
== Target
```

`rows.adoc` 是 `| row xref:target[T1]`，`middle.adoc` 是 `Middle line xref:target[T2].`，`loose.adoc` 是
`Loose paragraph xref:target[T3].`。

| 对象 | 0.2.1 的结果 |
|---|---|
| listing、table、段落 | 没有 `source`，各报一条 `block-origin.multi-source-span` |
| T1、T2 | 不在块的 children 里；RDF 边没有 `sourceHeading`、`officialHref`、`rdf:reifies` |
| T3 | 段落在树里挂在 Section A 下，但 RDF 边没有 `sourceHeading` |

## 方向

10 号书 08 章本来写着"logical document 提供结构关系，origin 提供坐标"，实现在这三处把两件事混在了一起：

- 块的坐标取作者文件：块的第一条与最后一条有来源的行在同一个文件时，raw 取该文件从首行到末行的原文，保留
  include 指令行（和标题 raw 保留 include 指令是同一条规则）；`contentSpan` 也在作者文件里，是两条分隔符之间的
  那几行。只有开头和结尾真的落在两个文件时才报诊断，消息写出两端的 `文件:行`。
- 块内有哪些出现处、出现处属于哪个标题，在逻辑文档上判定：前者看出现处来自块的哪条逻辑行，后者用逻辑行上的
  `sectionByLine`（09 号书「Section Scope」）。RDF 按 `containingSectionId` 绑定起点标题，不要求同一文件。

## 解决

2026-10-22，aat 计划 #6：规约 `4a9f9a5`（10 号书 08 章「Block Raw」与新的「结构关系在 Logical Document 上判定」），
实现 `fcea484`（块的坐标、`contentSpan`、块内出现处）与 6.5 的提交（所属标题），随 0.2.2 发布。

- 块的作者文件由首尾两行决定，raw 保留 include 指令行；只有首尾真的在两个文件、或同一文件被两次读入且块从后一次
  走回前一次时才报诊断，消息写出两端的 `文件:行`。
- 块内出现处按块内逻辑行的来源点认；所属 section 在扫描之后、回源之前按逻辑行上的 `sectionByLine` 判定，
  `src/book-entry/source-scope-index.ts`（按来源区间判定）整个删除。RDF 的起点标题与锚点的地址标签按
  `containingSectionId` 找标题，不要求同一文件；目标节点新增 `containingSectionId`。
- 摸底时还纠正了一条旧断言：章节里 include 一个 `===` 小节之后写的内容，在官方 AST 里属于那个小节
  （AsciiDoc 的 section 延续到下一个标题），aat 的节点树本来也这样挂，只有 `containingSectionId` 按来源文件说成了
  外层 section。现在两者一致。

复现里的结果变为：listing、表格、段落都有 `parts/a.adoc` 的坐标，没有诊断；T1、T2 挂在各自的块下；T1–T3 的边都有
起点标题 Section A。真书：8 号书诊断 10→0，4 条 `_partintro.adoc` 的边挂到各自的部标题；《人群实验室》诊断 13→0。
