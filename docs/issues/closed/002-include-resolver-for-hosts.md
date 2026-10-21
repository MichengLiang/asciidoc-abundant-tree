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

## 解决

2026-10-21，aat 计划 #5（规约 5.4，实现 5.5）。

`parseAbundantTree` 的 book-entry 调用接受 `includeResolvers`，方向与 issue 提的一致，形状按两件事定下：

- **交回连续的整行与起始源行**（`{ text, origin: { path, startLine } }`）。AsciiDoc 的 include 以行为单位，官方 Reader 的
  `pushInclude` 推入的也是行；docloom 按 AST 选出的范围从行中开始时（嵌套成员），宿主扩到整行。来源须在 documentRoot 之内。
- **解析器只在官方 Reader 一侧调用。** aat 向官方 Reader 登记一个 include 处理器，把文本推入 Reader，文件与起始行取自来源；
  这次推入的帧记下来源，logical document 一侧按推入身份取用。于是 leveloffset、indent、来源里的递归 include 都与文件 include
  相同（有一条测试让同一本书分别经解析器与文件 include 引入同一份内容，节点树与诊断逐项相同）。解析器收到的属性是 Asciidoctor
  解析出的，与书架构建时 Asciidoctor 的 include 处理器收到的一样，三方登记同一个选择器。

来源核实沿用「选取引入」的逐行配对：交回的文本与来源对不上，余下的行没有坐标并报 `origin-map.selection-mismatch`；
解析器抛出异常时构造失败（`include.resolver-failed`）。没有解析器认领的 directive 行为不变。规约见 10 号书第 4 章
「宿主登记的 include 解析器」，README 与 CHANGELOG 有用法。

下游要做的：trestlework 书架的结构检查、阅读页，以及 bookgraph 的投影，各自在调用 `parseAbundantTree` 时登记 docloom 的解析器
（需要 aat 0.2.1 以上，书架通过 `link:` 用本地 aat 的，构建一次 dist 就能用）。
