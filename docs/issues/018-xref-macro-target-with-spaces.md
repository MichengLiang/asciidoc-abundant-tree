# 目标带空格的 `xref:` 宏不进 xrefOccurrences

- 发现：2026-10-30，asciidoc-multi-book-workspace 计划 #6 的 6.1：为 07 号书「标题即地址」实测按标题引用时发现。
- 代码版本：asciidoc-abundant-tree 仓库 `9aabaa2`（0.2.6）。
- 影响：按标题引用、标题里带空格时（如 `xref:role 的作用域[]`），官方实现都把它解析成链接，aat 的 `xrefOccurrences` 里却没有它：
  RDF 里没有这条 xref 边，bookgraph 的 who / why 少一条引用；工作区改为按 aat 检查引用以后，这类引用也不受检查。
  同一个目标写成 `<<role 的作用域>>` 不受影响。

## 复现（实测）

```asciidoc
= T

== role 的作用域

== 另一节

见 xref:role 的作用域[]。

也见 xref:role 的作用域[作用域一节]。

还有 <<role 的作用域>>。
```

aat 0.2.6 的 `parseAbundantTree` 只交出一条：

```text
shorthand "role 的作用域" "<<role 的作用域>>" 11
```

三个官方实现都把三处解析成同一个链接：

```text
Asciidoctor 2.0.26（Ruby）   #_role_的作用域 | role 的作用域 / 作用域一节 / role 的作用域
Asciidoctor.js 3.0.4        #_role_的作用域 | role 的作用域 / 作用域一节 / role 的作用域
Asciidoctor.js 4.1.1        #_role_的作用域 | role 的作用域 / 作用域一节 / role 的作用域
```

## 原因

读代码得出：`src/inline-occurrence-scanner.ts:42` 的 `macroXrefPattern = /xref:([^\s[]+)\[([^\]]*)\]/gu` 把空白排除在目标之外，
目标里一有空格就不匹配。shorthand `<<…>>` 走另一条规则，带空格的目标能收下。

## 修复要守住的

* `xref:role 的作用域[]` 与 `xref:role 的作用域[作用域一节]` 都进 `xrefOccurrences`，`target` 是 `role 的作用域`，`sourceSpan` 指向宏本身。
* 收下的这两条照常取官方绑定，`officialHref` 与上面三个官方实现一致。
* 宏认不认，以官方实现为准：拿上面的样例与官方逐条对照，不多收、不少收。
