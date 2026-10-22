# book-entry 中术语与描述的出现处拿两套坐标分列，xref 子节点与官方绑定整个丢失

- 发现：2026-10-22，aat 计划 #9 收尾的裁判比对（0.2.4 对 9.2 之后），trestlework 8 号书前言「检视阅读」一条描述下的两个 xref 丢了
  `officialHref`。
- 代码版本：asciidoc-abundant-tree 仓库 `c35724a`；0.2.4 及更早同样（术语行带文字的条目）。
- 影响：book-entry 模式下，描述列表的术语与写在术语行上的描述，xref 与锚点子节点全部丢失；这些 xref 不在任何绑定请求里，拿不到
  官方解析结果（`href`、官方 reftext），RDF 里只有 aat 按目标找出的 `resolvedId`，reftext 退回目标的标题。0.2.4 上 8 号书 758 个
  xref 里只有 353 个有 `href`，人群实验室 179 个里 143 个。8 号书的规则、决定大多写成「字段:: 文字」，正是这种条目。

## 复现（实测）

入口文件 include 一章，入口里先写几段，让逻辑行与来源行错开：

```asciidoc
术语 xref:target[术]:: 说明 xref:target[甲]
```

book-entry 投影后，术语与描述的 `children` 都是空的，两个 xref 都没有 `asciidoctor.href`；文件模式下一切正常。

## 原因

出现处属于哪个块按逻辑行的来源点判定（10 号书「结构关系在 Logical Document 上判定」），这一步对；之后术语与描述同在一行，
要按列分（`isOccurrenceInsideSourceSpan`）。book-entry 中出现处的 `sourceSpan` 已经回源成来源坐标，术语与描述的 `sourceSpan` 却是
逻辑坐标，两者行号不同，筛选全部落空。0.2.4 及更早，没有文字、另起一行的描述没有 `sourceSpan`，筛选放行，所以没丢；9.2 给它们也算
出了范围，就多丢了一处，裁判比对因此看见。

## 解决

2026-10-22，aat 计划 #9 的 9.4（`git log --grep "Work-Package: 9.4"`），随 0.2.5 发布。规约补在 10 号书 08 章「结构关系在 Logical
Document 上判定」与 11 章的契约测试。

- 投影器按坐标系取分列用的跨度（`occurrenceSpanOf`）：book-entry 用术语、描述回源以后的 `source.sourceSpan`，文件模式用原来的
  `sourceSpan`（两者同一套坐标）；回源失败时不按列分。
- 测试（`test/book-entry/description-occurrences.test.ts`）：引入的章节被入口文件推后几行，术语行上的 xref 分给术语与描述，另起一行
  的描述收下两行的 xref，五个 xref 都有官方 `href`。变异实验：按逻辑坐标分列、不按列分，都被抓到。
- 裁判比对：8 号书有 `href` 的 xref 从 353 个变成 712 个，人群实验室从 143 个变成 171 个；没有一个 xref 被绑出两个结果。剩下没有
  `href` 的几乎都在普通列表条目里，那是另一个缺口（issue 017）。
