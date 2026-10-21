# 让调用方注册 include 解析器：书按符号引用代码

- 发现：2026-10-21，trestlework 想让 8 号设计书按符号引用自己仓库的 TypeScript 代码（trestlework 计划 #11，11.4 的 spike）。
- 代码版本：asciidoc-abundant-tree 0.1.21（npm 发布版）；仓库 `070e7b7`。
- 性质：功能请求。

## 需求

书里的代码片段最好取自能通过类型检查的真实代码。按文件引用时代码一挪就要改书；按行号引用，代码一改行号就移动。
最稳的是按**符号**选：docloom（workbench `projects/docloom`）的 `@docloom/typescript` 用 TypeScript AST 选出一个声明，
代码挪了位置也不会选错。docloom 自己的文档站（Docusaurus）已经这样做。

书架的构建用 Asciidoctor，Asciidoctor 有 include 处理器扩展，这一侧可行（实测，见下）。但读同一本书的还有 aat：
书架的阅读页与结构检查、bookgraph 的投影都经过 `parseAbundantTree`，而 aat 自己解析 include，没有给调用方留钩子。

## 复现（实测）

```asciidoc
= 原型

[source,ts]
----
include::docloom:examples/gateway-board/commands/replay.ts[symbol=replay,part=source]
----
```

- Asciidoctor（`@asciidoctor/core` 3.0.4）注册一个 include 处理器，`handles` 认 `docloom:` 前缀，`process` 调
  `TypeScriptSourceIndex.select({ source, symbol, part })` 再 `reader.pushInclude(...)`：HTML 里正好是 `replay` 这一个声明。
- `parseAbundantTree({ mode: 'book-entry', … })` 抛出：

```text
BookEntryConstructionError include.attrlist-unmapped: Include attribute 'symbol' has no source mapping rule.
```

## 方向（推断，没有读源码确认）

`parseAbundantTree` 接受一组 include 解析器，例如按目标前缀注册：

```ts
parseAbundantTree({
  sourcePath, mode: 'book-entry', documentRoot,
  includeResolvers: [{ prefix: 'docloom:', resolve: (target, attributes) => ({ text, origin: { path, startLine, endLine } }) }],
})
```

解析器交回文本与它在源文件里的坐标，aat 照常给这段文本建立来源映射；没有登记的属性仍按现在的规则报错。
书架构建器与 Asciidoctor 的 include 处理器、Ruby 侧的 asciidoctor-heading-include（bookgraph 的 `read` 用它）各自登记同一个
选择器，三方就认同一种写法。

## 下游现在怎样做

trestlework 的示例保持“一个文件一个用法”，书 include 整个文件，就等于引用那一个用法；按符号引用写成 8 号书的一个槽位，
等 aat 能登记解析器以后再填。
