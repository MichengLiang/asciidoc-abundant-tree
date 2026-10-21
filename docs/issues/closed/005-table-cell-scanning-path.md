# a| 单元格里的块走另一条扫描路径，sidebar、example、列表项、NOTE 里的 xref 丢失

- 发现：2026-10-21，小棉复核 aat 计划 #5 的 5.8 时测出（早于该轮存在）。
- 代码版本：asciidoc-abundant-tree 仓库 `e08953b`。
- 影响：`a|`（AsciiDoc 内容）单元格里，除普通段落与 `--` 开放块之外的块，里面的 xref 与 anchor 都不进 `xrefOccurrences`。

## 复现（实测）

```asciidoc
= 文

== 节

|===
a|
====
例 xref:a[A]。
====

* 项 xref:b[B]。

NOTE: 注 xref:c[C]。
|===

后文。
```

xref 为空。同一单元格换成 `[sidebar]` 隐身段落也一样；单元格里的普通段落（`a|单元段一 xref:a[A]。`）与 `--` 开放块能找到。

## 原因

单元格的内嵌文档由 `collectScannableInnerBlockRanges`（`src/inline-occurrence-scanner.ts` 544 行附近）扫描：它只扫 paragraph，
只递归 open 与 section，不经过 `officialBlockPolicy`。正文里的块按 policy 决定扫描、递归或跳过（09 号书「Inline 扫描边界」），
单元格里的块却是另一套规则，5.8 给 policy 加的“内容模型为 simple 的 sidebar 等按段落扫描”也覆盖不到这里。

## 方向

单元格内嵌文档的块按同一个 `officialBlockPolicy` 决定：scan 的块扫自己的区间，recurse 的块进子块，skip 的块整段排除。规约在
「Inline 扫描边界」写明单元格内容与正文同规则。

## 解决

2026-10-22，aat 计划 #7 的 7.3（`git log --grep "Work-Package: 7.3"`），随 0.2.3 发布。规约在 09 号书第 7 章「Inline 扫描
边界」（7.1）。

- 照"方向"做：扫描器的主循环抽成 `scanSurfaces`，正文与单元格共用。`a|` 单元格的内嵌文档交给同一个遍历器
  （`walkOfficialBlocks`）与区间解析器，再进这个循环；单元格专用的 `collectScannableInnerBlockRanges` 那一套删掉。
  内嵌文档的块坐标本来就是源文件的行（`table.js` 386、432 行），官方没有错。
- 遍历表格单元格收进 `official-block-utils`（`tableCells`、`cellDocument`、`asciidocCellDocuments`），补坐标也走进单元格：
  markdown 引语里的表格（issue 004）的单元格同样要换算；普通单元格不是块，按表格记下的换算取源行（`cellSourceLine`）。
- 改写时测出一个 0.2.0 起的回归：4.x 的 `Cell#lines` 是方法（`table.js` 616 行），扫描器按 Ruby 时代的属性读，得到
  `undefined`，多行普通单元格只扫第一行。0.1.21 与 3.x 引擎的 aat 都能找到第二行的 xref，现在也能了。
- 新测试（`table cells`）：单元格里的 example、列表、NOTE、sidebar 隐身段落与单行 `a|` 单元格，listing 照规则跳过；
  多行普通单元格；markdown 引语里的表格。变异实验：不进内嵌文档、不调用 `lines()`、表格不记换算、补坐标不进单元格，
  都被抓到。
