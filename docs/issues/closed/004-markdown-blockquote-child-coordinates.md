# Markdown 风格引语（`> `）里的段落坐标错位，xref 丢失

- 发现：2026-10-21，小棉复核 aat 计划 #5 时测出（早于该轮存在）。
- 代码版本：asciidoc-abundant-tree 仓库 `e08953b`。
- 影响：`> ` 写的引语里的段落拿到错误的坐标，报两条 `source-location.external-file` 与一条 `delimiter-not-found`；里面的 xref 全部丢失。

## 复现（实测）

```asciidoc
= 文

== 节

> 引语一 xref:a[A]。
> 引语二。
>
> 第二段。
> -- 某人

后文。
```

官方 AST：quote（compound）在第 5 行，两个子段落的坐标是 L=1、L=4，没有文件名。aat 的诊断：`delimiter-not-found@5`、两条
`source-location.external-file`；xref 为空。

## 原因

坐标错是官方的：Asciidoctor.js 4.1.1 去掉每行的 `> ` 之后，用 `new Reader(mapped)` 建子块（`parser.js` 1121 行附近），新 Reader 的
行号从 1 起、没有文件，子块的 sourceLocation 因此是引语内部的相对行号。aat 看到没有文件名的坐标，判为外部文件，子块被跳过。

## 方向

- 向 asciidoctor.js 报告：子 Reader 应带上外层游标（文件与起始行），与 Ruby 版对照确认是否同样如此；
- aat 这一侧：父块是 markdown 引语时，子块坐标按父块锚点行加相对行号换算回源行（前缀 `> ` 不改变行数）。规约写明这是对官方
  坐标的换算，以官方行号为准。

## 解决

2026-10-22，aat 计划 #7 的 7.2（`git log --grep "Work-Package: 7.2"`），随 0.2.3 发布。规约在 09 号书第 7 章「段落写法
的引语」。

- 与 Ruby 版对照：Asciidoctor 2.0.26 同样给出相对行号、没有文件（`Reader.new lines` 不带游标），这是两个实现共有的行为。
  报给上游的事悬置在计划 #7 的收尾包下，等小亮想做时再做。
- 换算在补坐标的同一处（`official-source-location.ts`，函数改名为 `completeOfficialSourceLocations`）：相对的第 n 行是
  从锚点行往下、跳过行注释数到的第 n 行（不是简单的"锚点行加相对行号"：引语段落里夹着行注释时，官方读段落已经把它跳过）。
  同一个 Reader 读出的块一并换算，嵌套的 markdown 引语从它自己的锚点行数起。
- 实现时测出方向没想到的一层：引语里的块，官方读到的是去掉前缀的行。只换算坐标而按源行判断结构，`> ====` 找不到分隔符、
  `> [sidebar]` 对不上第一行，`> ____` 还会被当成又一层 markdown 引语、坐标被换算两次。现在区间解析器按"套几层就去掉几个
  `> `"的视图（`source-lines.ts` 的 `quotedLineTable`）做结构判断，span 与列号仍取源行。
- 引语的范围算上子块之后只有 `>` 的行与出处行，内容区间不含出处行。
- 新测试：issue 里的复现（段落范围与 xref 行号）、引语里夹行注释、example、sidebar、列表、`____`、嵌套引语与出处行；
  `source-interval-resolver` 直接断言内外两层引语的范围。变异实验：不换算、不用视图、嵌套时重复换算、不算 `>` 行，都被抓到。
