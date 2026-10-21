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
