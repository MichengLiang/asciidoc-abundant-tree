# Asciidoctor.js 4.x 迁移调查

- 日期：2026-10-21。对照版本：`@asciidoctor/core` 3.0.4（aat 0.1.21 所用）与 4.1.1（当时的 `latest`）；Ruby 版 Asciidoctor 2.0.26。
- 背景材料：小亮的生态调查（`docs/raw/4x版本调查.md`，不进仓库）讲了 4.x 是什么——原生 JavaScript 重写、零依赖、纯 ESM、
  API 全异步、自带类型；2026-06-22 发布 4.0.0，经 11 个补丁版进入 4.1。本文回答另一个问题：**aat 依赖 3.x 的哪些东西，在 4.x 上是什么**。
- 结论：迁。能删的是因 Opal 才有的代偿；坐标重建与行内扫描是因 Asciidoctor 本身的语义，4.x 是忠实移植，它们留下。
  代价主要是公共 API 改为异步（0.2.0）。

## 方法

把两个版本并排装进一个临时项目（`@asciidoctor/core@4.1.1` 与别名 `ad3` → `@asciidoctor/core@3.0.4`），对同一份输入
各跑一遍，逐项比对输出。输入取 aat 最难处理的写法：有空隙的 `tags=a;b`、紧挨着两次引入同一个文件、`leveloffset`
引入里再嵌套 include、带位置参数的行内宏；另取 trestlework 8 号书（61 个文件、4176 行）测速度。

## Reader：逐行一致，怪癖也一致

`loadFile(…, { parse: false })` 之后逐行 `readLine()`，记下读前读后的游标、`include_stack` 深度与栈顶帧的身份。
23 行输出，两个版本**每一格都相同**，包括：

- 有空隙的选取，空隙之后的行号是错的：`b1` 在 `code.py` 第 8 行，两个版本的游标都报第 4→5 行。这是 `reader.rb`
  里两处 FIXME 所说的行为（一次推入只传首个选中行号，此后逐行累加），4.x 照样移植了。
- 一次推入的第一行，读前的游标还停在外层文件上（`book.adoc:6`），读后才进入被引入的文件。
- 栈顶帧的对象身份区分推入：紧挨着两次引入同一个文件得到两个不同的帧；`leveloffset` 补的 `:leveloffset: +1`、
  空行、`:leveloffset!:` 与这次推入同一帧。

所以 aat 在 Reader 这一层的做法——逐行与官方输出配对、用推入身份划 include 边界（a30b738）、
`cursorForReturnedReaderLine` 的差一行修正——**不是 Opal 的代偿，是 Asciidoctor 的语义**，迁移后原样保留。
`book-entry/` 的坐标重建也不因迁移而变小：sourcemap 仍只记块的起始行与文件。

## 接口：语义一致，写法变干净

| aat 用到的 | 3.0.4 | 4.1.1 | 两边结果 |
|---|---|---|---|
| 入口 | `createAsciidoctor()` 工厂，`processor.loadFile` | 具名导出 `loadFile`、`load`（返回 Promise） | — |
| id 解析 | `document.$resolve_id(text)`（Opal 方法） | `document.resolveId(text)` | `乙节 → b2` |
| 交叉引用文字 | `ref.$xreftext()` | `await ref.getXrefText()` | `乙节` |
| 行内节点 | `processor.Inline.create(…)` | `new Inline(…)`，`await convert()` | `<a href="#b2">[b2]</a>` |
| Reader 的推入栈 | Opal 实例变量 `reader.include_stack` | 带类型的 `reader.includeStack` | 同上一节 |
| 扩展注册 | `processor.Extensions.create()`，DSL | `Extensions.create()`，同样的 DSL | 宏收到的命名属性相同 |
| 章节 sourcemap 行号 | `getSourceLocation().getLineNumber()` | 同 | `[1, 4, 9]` |
| 解析 8 号书一次 | 168 ms | 85 ms | — |

两处真实的差别，迁移时要处理：

1. **行内宏的位置参数。** `hmeta:t[一,二,k=1]`：3.x 交给 `process` 的属性是
   `{value:"一", k:"1", $positional:["一","二"]}`，`$positional` 是 Opal 的产物；4.x 照 Ruby 的约定给
   `{"1":"一", "2":"二", value:"一", k:"1"}`。`src/heading-inline-metadata.ts:49-56` 读的是 `$positional`。
2. **缺值时返回 `null`。** 段落没有标题、块没有 style、属性不存在时，4.x 的 `getTitle()`、`getStyle()`、`getAttribute()`
   返回 `null`，3.x 返回 `undefined`；`getId()`、`getAttributes()[键]`、`getReftext()` 两边都是 `undefined`。aat 用
   `definedObject` 去掉 `undefined` 字段，`null` 会漏进输出（`"title": null`）。4.x 自带的类型把这些返回值标成
   `string | null`，改用它以后由 tsc 列出每一处。

## 两类代偿

**因 Opal 才有的，迁移后删掉**（`src/asciidoctor-adapter.ts`）：

- 手写的 `AsciidoctorBlock` 类型（第 5 行起）：3.x 没有可用的类型，方法都标成可选再逐个探测。改用包里的 `AbstractBlock`、
  `Document`、`Section` 等。
- `hasRuntimeInlineFactory`、`hasRuntimeExtensionFactory`（第 330、341 行）：探测 Opal 运行时有没有暴露 `Inline.create`、
  `Extensions.create`。4.x 是具名导出，导入失败在加载时就报。
- `$resolve_id`（第 28、204 行）、`$xreftext`（第 376、397 行）：Opal 转译后的方法名。
- `include_stack`（第 158、176 行）：Opal 的实例变量；4.x 有带类型的 `includeStack`。
- `ASCIIDOCTOR_CORE_VERSION = "3.0.4"`（第 52 行）这个兜底：4.x 有 `getVersion()`。
- `heading-inline-metadata.ts` 的 `$positional`。
- 顺带消失的：书架里同时有 aat 自带的 3.x 与书架自己的 3.x 时，两份 Opal 运行时在一个进程里打出
  `Opal already loaded. Loading twice can cause troubles`（实测）。aat 换成 4.x 后与书架的 3.x 并存，没有警告，两边都正常（实测）。

**因 Asciidoctor 语义才有的，保留**：

- 逐行来源重建（`src/book-entry/`）、`cursorForReturnedReaderLine`、推入身份：见上文 Reader 一节。
- 行内 xref 自己扫原文（`src/inline-occurrence-scanner.ts`）：Asciidoctor 的行内处理是替换，不产生带位置的行内树，Ruby 版也一样。
- 块的结束行（`src/source-interval-resolver.ts`、`src/source-surfaces.ts`）：sourcemap 只记起始行。
- xref 的官方 `href` 经 `Inline` 转换成 HTML 再用 parse5 读回：这样拿到的是转换器认定的链接（含跨文档 `.adoc#` → `.html#`），
  不是 aat 自己推的；4.x 的 `convert()` 变为异步，做法不变。

## 代价

- **公共 API 异步。** `loadFile`、`load`、`readLine`、`getContent`、`convert`、`getXrefText` 都返回 Promise，`parseAbundantTree`
  及其上的命令行、browser-parser、animation-yaml-export 随之异步。对外是破坏性变更，发 0.2.0；0.x 下 `^0.1.x` 不会自动升上来。
  测试里约两百处调用加 `await`，是机械改动。
- **浏览器构建没有 `loadFile`。** aat 的浏览器入口只用 `load`，要在 4.x 上跑一遍 `test:browser` 与 projection-teacher 确认。
- **Node ≥ 20**（4.1.1 的 `engines`；迁移指南写 ≥ 22）。aat 的 CI 是 Node 24。
- 下游：bookgraph 的 `_project.mjs`、trestlework 与 seekcrowd 书架的 `book-structure.mjs` 加 `await`。

## 验证方式：让旧版本当裁判

Reader 与接口逐项一致，所以同一本书用 0.1.21 与迁移后的 aat 投影出的 Turtle，除 parser 版本号外应当逐字节相同。
对 trestlework 8 号书与 seekcrowd《人群实验室》两本真书做这一比对，哪里不同哪里就有问题；这比手写断言覆盖得更全。

## 迁移以后：书架改为链接本地 aat

aat 在书架里是工具（结构检查、bookgraph 的查询），不是会随书发出去的运行时依赖；同一台机器上的书架各装一版 npm 包，
只带来版本漂移（迁移前：seekcrowd 0.1.19、trestlework 0.1.20、aat 0.1.21），bookgraph 对两本书给出的事实因此不一致。
迁移后书架以 pnpm `link:` 指向本仓库：`dist/` 只在门禁里测试通过后构建，书架看到的是最近一次全绿；破坏性变更在同一轮里
连同下游一起改。最坏的情况也只是检查暂时不可用：书仍可用 Ruby 版 Asciidoctor 构建，查找仍可用 rg。
