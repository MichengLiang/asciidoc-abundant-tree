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

## 解决

2026-10-22，aat 计划 #8 的 8.3（`git log --grep "Work-Package: 8.3"`），随 0.2.4 发布。规约在 09 号书第 7 章「Inline 扫描
边界」列表条目一段与「官方怎样读段落」（8.1、8.7、8.3）。

- `list_item` 的内容区间从标记行延伸到续行的最后一行，由 `listItemTextEndLine`（`src/official-paragraph.ts`）照官方读法算：
  紧挨着的内容以 text_only 读，先读掉锚点行、属性列表行与行注释（`parseBlockMetadataLine`，`parser.js` 2798-2880 行；
  text_only 时 `.标题` 不是 metadata），下面的段落在列表里读（`paragraphEndLine`，8.7 移植的 `readParagraphLines`）。
  紧挨着的不是段落时没有续行。
- 对照时的两处意外：紧挨着属性行或锚点行时，官方照样并进下面的段落，metadata 被丢弃；`.标题` 行在 text_only 下是条目的文字
  （xref 也替换）。都按官方写进规约与实现。
- 裁判测试（`test/list-item-text.test.ts`）：13 种写法里每个条目的内容区间读进的行，与官方并好的 `ListItem._text`
  逐行相同（`_text` 是 `@internal`，只在测试里读）；续行里的 xref 进 occurrence。变异实验：内容区间只到标记行、不读掉
  metadata、不在列表里读段落，都被抓到。
