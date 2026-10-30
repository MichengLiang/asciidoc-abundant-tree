# `pass:[…]` 透传里的 xref 被当成引用收下

- 发现：2026-10-30，asciidoc-multi-book-workspace 计划 #6 的 6.2：工作区改为按 aat 的绑定检查书内引用，模板 07 号书报出四处没绑上的 xref，
  都写在 `pass:[…]` 里，是书在展示 xref 的写法。
- 代码版本：asciidoc-abundant-tree 仓库 `36fa1bd`（代码与 0.2.6 相同）。
- 影响：透传里的文字 Asciidoctor 不做宏替换、不生成链接，aat 却把其中的 xref 收进 `xrefOccurrences`、投影成 xref 边。目标恰好是某个标题时，
  图里凭空多一条引用（bookgraph 的 who / why 多出来）；目标不存在时，它成了没绑上的引用，按 aat 检查引用的工作区会报错。
  工作区眼下按源行跳过落在 `pass:[…]` 里的 xref（asciidoc-multi-book-workspace 的 `bindReferences`），aat 修好以后去掉。

## 复现（实测）

```asciidoc
= T

== 标题

写法：`pass:[xref:标题[显示文本]]`。

|===
|写法
|`pass:[xref:标题[显示文本, rel=depends-on]]`
|===
```

三个官方实现都不生成链接，透传的文字原样进 `<code>`：

```text
Asciidoctor 2.0.26（Ruby）  (no links)  <code>xref:标题[显示文本]</code>  <code>xref:标题[显示文本, rel=depends-on]</code>
Asciidoctor.js 3.0.4       (no links)  同上
Asciidoctor.js 4.1.1       (no links)  同上
```

aat 0.2.6 收下两条，并把它们绑定到标题「标题」：

```text
occ local macro "xref:标题[显示文本]" line 5 official {"href":"#_标题","resolvedId":"_标题","reftext":"显示文本","resolvedType":"section"}
occ local macro "xref:标题[显示文本, rel=depends-on]" line 9 official {"href":"#_标题",...}
edge "标题" bound
edge "标题" bound
```

官方层的 `href` 也给出了 `#_标题`，所以下游没法拿“有没有官方 href”区分真假引用（它为什么给出，没有单独查）。

模板里的实例：asciidoc-multi-book-workspace `e248159` 上，07 号书 `backmatter/appendix-a.adoc` 第 56、59 行，
`parts/010-source-surface/010-source-and-projection.adoc` 第 69、83 行。

## 原因

读代码得出：`scanXrefMatches`（`src/inline-occurrence-scanner.ts:407`）在块的文字行上直接用 `shorthandXrefPattern` 与 `macroXrefPattern`
（同文件 41–42 行）匹配，不看行内透传；透传里的文字照样被匹配成 xref。

## 修复要守住的

* `pass:[…]` 与带替换列表的 `pass:q[…]` 等变体里的 xref 不进 `xrefOccurrences`，不投影成边。
* 同一行透传之外的 xref 照常收下。
* 收不收以三个官方实现是否生成链接为准逐条对照。只实测了 `pass:[…]`；`+++…+++`、`$$…$$` 两种透传没有测，修时一并对照。
