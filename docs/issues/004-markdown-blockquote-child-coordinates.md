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
