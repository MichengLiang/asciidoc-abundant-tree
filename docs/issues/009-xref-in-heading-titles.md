# 标题里的 xref 与锚点不产生 occurrence

- 发现：2026-10-22，aat 计划 #8 为 issue 008 归类 `floating_title` 时，对照 section 标题实测。
- 代码版本：asciidoc-abundant-tree 仓库 `7d93499`（0.2.3）。
- 影响：section 标题与 discrete 标题（`floating_title`）里写的 `xref:`、`<<>>` 与 `[[id]]` 不进 occurrence，图里没有这些边。
  块标题（`.标题`）里的 xref 已经扫描，两种标题待遇不一致。真书（aat、trestlework、seekcrowd 书架）目前没有这种写法。

## 复现（实测）

```asciidoc
= 文

== 节 xref:target[目标]

正文。

[#target]
== 目标
```

`xrefOccurrences` 为空，没有诊断。Asciidoctor 给标题做 macros 替换，标题转成 `节 <a href="#target">目标</a>`。

## 原因

扫描器只扫块的内容区间与 metadata（`scanMetadataRange` 认 `.` 开头的块标题行）。section 是递归归类，标题行不在任何扫描区间里；
`titleSpanForSurface`（`src/source-interval-resolver.ts`）算出的标题区间只用于坐标。

## 方向

按 09 号书「Inline 扫描边界」：标题文字从 `=` 标记之后算起，扫描 xref 与锚点；section 标题里的 xref 属于这个 section 自己。
