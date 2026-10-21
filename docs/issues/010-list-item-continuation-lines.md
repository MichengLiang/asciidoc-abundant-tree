# 列表条目折行后，续行里的 xref 丢失

- 发现：2026-10-22，aat 计划 #8 核对 callout 列表条目的扫描范围时实测。
- 代码版本：asciidoc-abundant-tree 仓库 `7d93499`（0.2.3）。
- 影响：olist、ulist、colist 的条目文字写成多行时，只有标记行被扫描，续行里的 xref 与锚点静默丢失，没有诊断。
  callout 列表的说明文字常常折行，issue 008 修好以后这里会更常见。

## 复现（实测）

```asciidoc
= 文

== 节

. 第一条
接着写 xref:target[目标]。
. 第二条

[#target]
== 目标
```

`xrefOccurrences` 为空。

## 原因

`contentSpanForContext`（`src/source-interval-resolver.ts`）给 `list_item` 的内容区间只有标记行。官方读完标记行，把紧挨着的续行读成段落，
再用 `ListItem#foldFirst` 并进条目的文字（`parser.js` 1985-2011 行）；并进以后这个段落不再是子块，没有自己的坐标。

## 方向

内容区间从标记行起，按官方在列表里读段落的规则延伸（`parser.js` 3029-3036 行：停在空行、`+`、块分隔符、块属性行与列表标记行之前，
跳过行注释）。官方的原始文字 `ListItem._text` 是 `@internal`，生产代码不读它；测试里用它的行数当裁判。
