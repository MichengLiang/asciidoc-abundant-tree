# `xref:#id[]` 与 `<<#id>>` 带着 `#` 去绑定，落空

- 发现：2026-10-30，asciidoc-multi-book-workspace 计划 #6 的 6.2：工作区改为按 aat 的绑定检查书内引用，模板 00 号书
  `parts/02-body-structure/02-inline-structure.adoc` 第 13 行的 `xref:#body-map[正文结构地图]` 没绑上，而 HTML 里这个链接是好的。
- 代码版本：asciidoc-abundant-tree 仓库 `36fa1bd`（代码与 0.2.6 相同）。
- 影响：本文档内用 `#` 写的引用在图里没有目标（没有 `targetHeading`），bookgraph 查不到它指向谁；官方层写成 `href` `##body-map`、
  `resolvedId` `#body-map`，与三个官方实现的 `#body-map` 不一致。工作区眼下对以 `#` 开头又没绑上的选择器，去掉 `#` 后在 `labelCatalog`
  里再认一次（asciidoc-multi-book-workspace 的 `bindReferences`），aat 修好以后去掉。

## 复现（实测）

```asciidoc
= T

[#body-map]
== 正文结构地图

== 另一节

见 xref:#body-map[正文结构地图] 与 <<#body-map>>。
```

三个官方实现都把两处解析成同一个链接：

```text
Asciidoctor 2.0.26（Ruby）  #body-map | 正文结构地图（两处）
Asciidoctor.js 3.0.4       #body-map | 正文结构地图（两处）
Asciidoctor.js 4.1.1       #body-map | 正文结构地图（两处）
```

aat 0.2.6：

```text
occ unresolved macro "xref:#body-map[正文结构地图]" line 8 official {"href":"##body-map","resolvedId":"#body-map","reftext":"正文结构地图"}
occ unresolved shorthand "<<#body-map>>" line 8 official {"href":"##body-map","resolvedId":"#body-map","reftext":"[#body-map]"}
edge "#body-map" not bound
edge "#body-map" not bound
```

## 原因

读代码得出：`scanXrefMatches`（`src/inline-occurrence-scanner.ts:407`）把匹配到的目标原样作 `target`，选择器绑定
`bindSelector(context.labelCatalog, xref.target)`（`src/rdf12-projection/xref-projector.ts:325`）拿 `#body-map` 去查 label space，
而 label space 里只有 `body-map`。Asciidoctor 把目标开头的 `#` 当作“本文档里的片段”。官方层的 `##body-map` 推断是同一个带 `#`
的目标再被拼上一个 `#`，没有单独查。

## 修复要守住的

* `xref:#id[]` 与 `<<#id>>` 绑定到 ID（或标题原文）为 `id` 的标题；官方层的 `href` 是 `#id`，与三个官方实现一致。
* `xref:other.adoc#id[]` 这类指向别的文档的写法不受影响。

## 解决

2026-10-30，aat 计划 #12 的 12.2（`git log --grep "Work-Package: 12.2"`），随 0.3.0 发布。规约在 09 号书第 7、8 章（xref 由官方转换认定）。

官方看到目标以 `#` 开头，就把后面的部分当作本文档的片段；aat 现在用官方给的 `refid` 作 `selector`，不再带着 `#` 去查。

复现样例实测（0.3.0 之前的 dist）：两处的 `selector` 都是 `body-map`，`href` 是 `#body-map`，都绑到标题「正文结构地图」。

官方层的 `##body-map` 与 020 的根因相同：0.2.6 拿带 `#` 的目标再造一个 xref 节点交给转换器，转换器在前面又拼上一个 `#`。
