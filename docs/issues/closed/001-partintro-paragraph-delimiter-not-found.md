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

## 解决

2026-10-21，aat 计划 #5（规约 5.2，实现 5.3）。

原因按 Asciidoctor.js 4.1.1 源码确认，比报告的推断大一圈。`[partintro]` 段落先成为一个 open 块，放进部时官方把它改成复合块，
新建一个段落子块接过文本行（`parser.js` 566-575 行）：open 块的锚点是段落行，那里没有 `--`；新建的段落没有 source location。
顺着同一处源码又找到两类：

- 部下写普通段落（不写 `[partintro]`）时，官方把它包进新建的 partintro 开放块（554-565 行），这个块没有 source location，
  aat 把它连同里面的段落一起丢掉了——比丢坐标更重，内容整段不见；
- 所有隐身段落（`[source]`、`[quote]`、`[sidebar]` 等样式直接加在段落上，`parser.js` 1007-1012 行）都报 delimiter-not-found；
  加长的分隔符（`------`）也认不出来，06、12 号书因此有 15 条。

规约写进 09 号书第 7 章：「分隔符与它的闭合」「隐身段落」「官方合成的块」。实现：

- 解析后照官方给合成 preamble 补坐标的做法（`parser.js` 632-633 行），在官方块上补上两种合成块的 source location
  （`src/official-source-location.ts`）。为部导言写的旧补救（按文本向后搜索行号的 `findBlockSourceLine` 与
  `containerFallbackBlocks`）随之删除；
- 分隔符逐句移植官方 `isDelimitedBlock` 与 `DELIMITED_BLOCKS`（`src/official-delimiter.ts`），测试逐行对照官方函数；
- 锚点行不是分隔符、而是块的第一行源文时，块按段落或子块取范围，不报 delimiter-not-found；两者都不是时照报，守住坐标漂移。

验证：改动前后对 aat 的 7 本规约书、trestlework 8 号书、《人群实验室》投影比对。Turtle 逐字节相同；节点数不变，差异只在
单段导言的段落（有了坐标，数目与各书的单段 `[partintro]` 一一对应）和 15 个加长分隔符的 listing（结束行不再多算空行）；
aat 7 本书的诊断全部清零，《人群实验室》只剩早就存在的 13 条 multi-source-span。
