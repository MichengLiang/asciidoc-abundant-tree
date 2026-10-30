# xref 目标里的属性引用没有展开

- 发现：2026-10-30，asciidoc-multi-book-workspace 计划 #6 的 6.3：工作区把跨书 xref 改为在目标书里按标题绑定，06 号书教的
  `xref:{upper-book}#上册核心模型[]` 在 aat 里认不出是跨书引用，被当成书内引用报没绑上。
- 代码版本：asciidoc-abundant-tree 仓库 `3826bd9`（代码与 0.2.6 相同）。
- 影响：目标里写了属性引用的 xref，`target` 保留着 `{…}`，`scope` 是 `unresolved`，没有 `targetHeading`，官方层 `href` 也是没展开的
  `#{other}#目标章节`。跨文档的认不出指向哪个文档；书内的（如 `xref:{sec}[]`）展开后本可按标题绑定，也落空。图里少边，bookgraph 查不到
  它指向谁。工作区眼下用这本书转换后的 Asciidoctor 文档展开含 `{` 的目标再绑定（asciidoc-multi-book-workspace 的 `bindReferences`），
  aat 修好以后去掉。

## 复现（实测）

```asciidoc
= T
:other: other.adoc
:sec: 目标节

== 目标节

正文。

== 引用处

见 xref:{other}#目标章节[]。

见 xref:{other}#目标章节[显示]。

见 xref:{sec}[]。
```

三个官方实现都先展开属性，再解析 xref：

```text
Asciidoctor 2.0.26（Ruby）   other.html#目标章节 | other.html
                             other.html#目标章节 | 显示
                             #目标节 | [目标节]
Asciidoctor.js 3.0.4        同上
Asciidoctor.js 4.1.1        同上
```

（第三条显示 `[目标节]`，是因为没有空格的目标被当作 ID，而默认 `idprefix` 下生成的 ID 是 `_目标节`；属性本身已经展开。）

aat 0.2.6：

```text
occ unresolved "{other}#目标章节" official {"href":"#{other}#目标章节","resolvedId":"{other}#目标章节","reftext":"[{other}#目标章节]"}
occ unresolved "{other}#目标章节" official {"href":"#{other}#目标章节","resolvedId":"{other}#目标章节","reftext":"显示"}
occ unresolved "{sec}"            official {"href":"#{sec}","resolvedId":"{sec}","reftext":"[{sec}]"}
edge "{other}#目标章节" targetHeading 0 candidateHeading 0（两条）
edge "{sec}"            targetHeading 0 candidateHeading 0
```

## 原因

读代码得出：`scanXrefMatches`（`src/inline-occurrence-scanner.ts:407`）从源文字里取目标，原样作 `target`，不做属性替换；选择器绑定拿这一串
去查 label space。官方层的 `href` 为什么也是没展开的形式，没有单独查。

## 修复要守住的

* `xref:{other}#目标章节[]` 的目标是 `other.adoc#目标章节`，认作指向别的文档；官方层 `href` 是 `other.html#目标章节`，与三个官方实现一致。
* `xref:{sec}[]` 的目标是 `目标节`，在 label space 里绑定到标题「目标节」。
* 属性没有定义时按 Asciidoctor 的默认（`attribute-missing: skip`）原样留下，与官方一致。
* 正文里定义的属性（不在文档头）同样按官方在那个位置的取值展开。

## 解决

2026-10-30，aat 计划 #12 的 12.2（`git log --grep "Work-Package: 12.2"`），随 0.3.0 发布。规约在 09 号书第 7、8 章（xref 由官方转换认定）。

目标里的属性引用由官方展开：官方先替换属性，再替换宏，记录用的转换器收到的已经是展开后的目标。正文中途才定义的属性，
aat 照官方的属性回放（`restoreAttributes` 与 `playback`），按 xref 所在位置的取值展开源文里的 `selector`。指向别的文档的，
`document` 写文档部分、`selector` 写片段，RDF 写成 `aat:targetDocument`，不在本文档里绑定。

复现样例实测（0.3.0 之前的 dist）：前两处的 `document` 是 `other.adoc`、`selector` 是 `目标章节`、`href` 是 `other.html#目标章节`；
第三处的 `selector` 是 `目标节`，绑到标题「目标节」（官方的 HTML 里它是一条断链，aat 按标题原文绑定）。
