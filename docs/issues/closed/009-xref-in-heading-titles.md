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

## 解决

2026-10-22，aat 计划 #8 的 8.5（`git log --grep "Work-Package: 8.5"`），随 0.2.4 发布。规约在 09 号书第 7 章「Inline 扫描
边界」标题一段（8.1，8.5 补了 discrete 标题的归属）。

- 扫描器给 section 与 floating_title 扫标题行（`isHeading`），只扫 xref 与锚点，不扫 hmeta。section 标题行落在这个 section
  的范围里，标题里的 xref 属于它自己，RDF 里是从这个标题出发的边；discrete 标题的 xref 属于外层 section。
- 投影器为标题行上的 xref 登记官方解析请求（`requestTitleBindings`），标题里的自然引用 `<<目标标题>>` 由官方解析出目标。
- 官方把 section 标题末尾的 `[[id]]` 当作这个 section 的 ID，aat 照实投影。
- 顺手补准：8.2 让 discrete 标题进了投影器的通用分支，那里把非 section 块的 ID 一律当作作者写的；discrete 标题没写 ID 时，
  官方按标题生成，现在 idOrigin 是 `asciidoctor-generated`。
- 测试（`test/heading-titles.test.ts`）：section 标题里的 xref 与锚点、discrete 标题里的自然引用，行号、所属 section、
  解析结果；discrete 标题生成的 ID 的来源。变异实验：不扫标题、不登记标题的官方解析、生成的 ID 当作作者写的，都被抓到。
