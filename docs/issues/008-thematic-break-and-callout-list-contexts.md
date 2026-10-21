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
