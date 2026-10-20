# 单段的 [partintro] 报 delimiter-not-found，块坐标丢失

- 发现：2026-10-21，trestlework 8 号设计书升级到 asciidoc-abundant-tree 0.1.21 以后，bookgraph 的地图列出 8 条
  `source-interval.delimiter-not-found`（升级之前也有，只是 0.1.20 不交出投影警告）。
- 代码版本：asciidoc-abundant-tree 0.1.21（npm 发布版）；仓库 `c9214ec`。
- 影响：部导言只有一段、写成 `[partintro]` 加一个段落时，每个这样的导言报一条 `source-interval.delimiter-not-found`
  与一条 `source-location.missing`，这个段落没有来源坐标。读坐标的工具（书架阅读页、bookgraph 的 `路径:行号`）在这里拿不到位置。

## 复现（实测）

```asciidoc
= 书
:doctype: book

= 第一部

[partintro]
导言只有一段。

== 第一章

正文。
```

`parseAbundantTree({ mode: 'book-entry', … })` 的 `toolDiagnostics`：

```text
source-interval.delimiter-not-found  Could not locate open block delimiter from official source line 7.
source-location.missing  Official block source location is missing for context 'paragraph' node 'paragraph'.
```

同一本书把导言写成开放块（`[partintro]` 下一行 `--`，段落，再一行 `--`），两条诊断都没有（实测）。

## 原因（推断，没有读源码确认）

Asciidoctor 允许 `[partintro]` 直接作为一个段落的块样式：这个段落就是导言，不需要开放块。从诊断文字看，坐标恢复见到
`partintro` 上下文以后，在官方源行里找开放块的开始分隔符，单段的写法里没有它，于是放弃了这个块的坐标。

## 方向

坐标恢复把“带 `[partintro]` 样式的单个段落”当作段落处理：块的范围就是那个段落的行，不找分隔符。

## 下游怎样处理的

trestlework 把 8 号书的部导言统一写成开放块，理由是书自己的：两段以上的导言本来就必须用开放块，统一一种写法，
以后给导言加一段不会踩坑。这不是对这个问题的绕行；别的书照样会写单段导言，问题仍在。
