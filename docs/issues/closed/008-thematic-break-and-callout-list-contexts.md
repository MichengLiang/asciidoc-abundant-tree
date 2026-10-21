# 分隔线与 callout 列表被当作未知 context：报假诊断，callout 里的 xref 丢失

- 发现：2026-10-22，aat 计划 #7 的 7.5 裁判比对时，三本 07 号样板书各有 2 条诊断。
- 代码版本：asciidoc-abundant-tree 仓库 `209e7ac`（0.2.3 之前）。
- 影响：每条分隔线（`'''`）与每个 callout 列表各报一条 `official-block-context.unknown`；callout 列表条目里的 xref 与
  anchor 不进 occurrence。

## 复现（实测）

```asciidoc
= 文

== 节

[source,ts]
----
const x = 1; // <1>
----
<1> 见 xref:target[目标]。

'''

后文 xref:after[后]。

[#target]
== 目标
```

诊断：两条 `official-block-context.unknown`（`thematic_break`、`colist`）；xref 只有 `after`，callout 里的 `target` 丢失。

## 原因

`officialBlockPolicy`（`src/official-block-policy.ts`）没有列出 `thematic_break` 与 `colist`，落到 `default` 的
`diagnostic`：块被保守跳过并报诊断，它的后代也不扫描。

## 方向

- `thematic_break` 没有内容，归 `skip`。
- `colist` 与 `olist` 相同：列表是容器（`recurse`），条目是 `list_item`（`scan`）。要核对官方 callout 条目的 context 与
  source location，以及条目文本是否做 macros 替换。
- 顺带核对官方还有哪些 context 不在表里（`image`、`audio`、`video`、`toc`、`page_break`、`floating_title` 等），
  逐个按官方行为归类，规约写进 09 号书「Inline 扫描边界」。

## 解决

2026-10-22，aat 计划 #8 的 8.2（`git log --grep "Work-Package: 8.2"`），随 0.2.4 发布。规约在 09 号书第 7 章「Inline 扫描
边界」的归类表与「Callout 列表的坐标」（8.1）。

- 照"方向"把官方块 context 全集过了一遍：以 4.1.1 HTML5 转换器的 `convert_*` 方法为全集，不在策略表里的有
  `thematic_break`、`page_break`、`toc`、`image`、`audio`、`video`、`floating_title`（内容模型都是 empty，归 skip）与
  `colist`（与 `olist` 一样归 recurse）。skip 只跳过内容：块标题与属性行照样扫，带 ID 的块由投影器的通用分支登记为
  block 目标，`xref:fig[]`、指向 discrete 标题的 xref 都解析到了。只剩扩展注册的自定义 context 报诊断。
- 核对 callout 条目时发现官方的一个怪癖：callout 列表的 source location 落在它的**最后一条**上。官方建完块取上一次
  mark（`parser.js` 1443 行），`parseCalloutList` 每读一条后续条目 mark 一次（1812-1862 行）；Ruby 2.0.26 相同。
  补坐标模块（`completeOfficialSourceLocations`）让列表取第一条的坐标，列表前的块标题与属性行因此归它。
- 写"markdown 引语里的 callout 列表"测试时撞出 issue 012（引语以列表结尾时栈溢出），已在 8.7 先修。
- discrete 标题的标题文字与 section 标题一样还不扫，见 issue 009。
- 新测试（`block contexts`）：全集守卫（转换器的每种块 context 都有归类，以后升级 Asciidoctor 多出新的 context 会先报出来）；
  一份文档放齐这几种块：诊断为空，callout 条目与各块标题的 xref、callout 条目里的锚点位置都对，`fig`、`loose` 解析为
  block 目标；带 ID 与标题的 callout 列表从标题行开始；markdown 引语里的 callout 列表。变异实验：不补 callout 列表坐标、
  colist 不归 recurse、image 或 floating_title 不归 skip，都被抓到。
