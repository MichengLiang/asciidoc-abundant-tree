<Assistant id="1">
# `preview:build` 报错来源调查

我把这次 `pnpm preview:build` 的输出拆开看了。结论先说清楚：你这次看到的两条信息都不是“官方 Asciidoctor 编译器判定你的 AsciiDoc 语法非法”导致的。真正让命令退出码变成 1 的，是本项目 runtime 里自己加的一层 HTML 本地资源检查。另一条 `include.unsupported-attrlist` 也不是官方编译器错误，而是 `asciidoc-abundant-tree` 这个辅助分析工具在构造 reader page map 时抛出来的错误；而且它已经被当前 runtime 捕获并降级成 cover-only page map warning，没有直接中断构建。

我按实际执行链路查了一遍。`preview:build` 运行的是 `node dist/build-template-preview.js`，它会把 `templates/default-workspace` 初始化到 `build/template-preview/workspace`，然后在这个预览 workspace 里执行 `node tools/adoc-books.mjs build`。在 runtime 里，HTML 生成部分是 `src/runtime/adoc-books.mts` 的 `buildHtml()`，它调用 `@asciidoctor/core` 的 `asciidoctor.convertFile()`，每本书只输出一个 `build/html/books/<book-id>/book.html`。也就是说，对于 `07-structured-writing-conventions` 这本书，实际输出文件是 `build/template-preview/workspace/build/html/books/07-structured-writing-conventions/book.html`，而不会生成 `build/html/books/07-structured-writing-conventions/backmatter/appendix-a.html` 这种按源文件拆开的 HTML 页面。

我直接调用了官方 `@asciidoctor/core` 对 `templates/default-workspace/books/07-structured-writing-conventions/book.adoc` 做转换，结果是 `asciidoctor convert ok`。我也对 `03-technical-book-workflow/book.adoc` 做了同样验证，结果同样是 `asciidoctor convert ok`。这说明官方转换层没有认为 `tag=main` include 或这次的 xref 写法是语法错误。进一步，我用官方转换器单独测试了 `include::...minimal-tool.mjs[tag=main]`，它可以正常展开 tag 区间，只把 `// tag::main[]` 和 `// end::main[]` 之间的代码拿出来。所以 `include::../examples/minimal-tool.mjs[tag=main]` 这类写法本身是官方 AsciiDoc/Asciidoctor 支持的，不是非法语法。

`include.unsupported-attrlist` 的来源很明确。我在 `node_modules/asciidoc-abundant-tree/dist/src-CcpWgwSP.mjs` 里找到了抛错位置：它的 `parseIncludeDirective()` 用正则匹配整行 `include::...[]`，然后如果 attrlist 不是空字符串，就抛 `constructionError("include.unsupported-attrlist", "Include directive uses unsupported attrlist ...")`。也就是说，它只支持空 attrlist 的 full-file include，例如 `include::chapter.adoc[]`，不支持 `include::file.mjs[tag=main]` 这种带 tag 的 include。它的 README 也说明了当前边界：book-entry mode 只展开“supported full-file include directives”，它是一个 source-aware static analysis 工具，不是完整 AsciiDoc 实现，也不替代 Asciidoctor。

还有一个更具体的问题：`03-technical-book-workflow/chapters/03-code-includes.adoc` 里的第 7 行 `include::../examples/minimal-tool.mjs[tag=main]` 位于一个 `[source,js]` + `----` 的 listing/source block 里面。官方 Asciidoctor 会把它作为 source block 内的 include 处理并展开代码片段，这是正确行为。但是 `asciidoc-abundant-tree` 的 book-entry include resolver 是逐行正则扫描，它没有先理解当前行处于 listing block/source block 语境里，也没有区分“书籍结构 include”和“示例代码 include”。所以它把这个 code include 也当成了 book-entry graph 的一部分来解析，然后因为 `tag=main` attrlist 非空而报错。这就是 `03-technical-book-workflow: reader page map fell back to cover-only mode: include.unsupported-attrlist...` 的根因。这个 warning 不是官方编译器输出，也不是构建失败的直接原因；它只是导致 `03-technical-book-workflow` 的 reader page map 退化成只有封面页。

真正导致 `preview:build` 退出失败的是下一条：`HTML_RESOURCE_MISSING: books/07-structured-writing-conventions/book.html -> ../../backmatter/appendix-a.html`。这个错误来自 `src/runtime/adoc-books.mts` 的 `missingLocalResources()`。它会扫描所有生成后的 HTML 文件，拿正则 `LOCAL_TARGET_PATTERN = /\b(?:href|src)="([^"]+)"/g` 找出所有 `href` 和 `src`，过滤掉空 target、fragment-only target、scheme URL，然后把剩下的本地相对路径按当前 HTML 文件所在目录解析。如果解析后的文件不存在，就报 `HTML_RESOURCE_MISSING`，最后 `assertNoIssues("HTML local resource check", ...)` 把它转成构建失败。

被点名的源文件 `templates/default-workspace/books/07-structured-writing-conventions/parts/010-source-surface/020-default-semantics.adoc` 第 28 行是：`详细判断规则见 xref:../../backmatter/appendix-a.adoc[]。` 这条 xref 在官方 Asciidoctor 转换后，实际进入 HTML 的内容是：`<a href="../../backmatter/appendix-a.html">../../backmatter/appendix-a.html</a>`。我在生成后的 `book.html` 第 1139 行看到了这个链接。然后同一个 `book.html` 第 1414 行实际上已经包含了附录内容，标题锚点是 `<h2 id="附录-a结构化写法速查">Appendix A: 附录 A：结构化写法速查</h2>`。也就是说，附录不是没被 include，也不是官方编译器不能处理；它已经进了同一个单页 HTML，只是这条 xref 被渲成了一个指向 `../../backmatter/appendix-a.html` 的跨文件链接，而这个项目的 HTML 输出策略并不生成那个文件，于是自定义 HTML resource checker 抓到了一个真实存在于 HTML 里的死链接。

所以这里要分两层判断。第一层是“源语法是否合法”：从官方 Asciidoctor 当前行为看，它是合法的，至少不会作为编译错误中断。第二层是“这条 xref 是否适合当前单页输出策略”：不适合。因为当前 runtime 是把整本书转换成一个 `book.html`，被 include 进书内的 backmatter section 应该在同页用锚点引用，而不是引用一个并不存在的 `appendix-a.html`。如果你写 `xref:../../backmatter/appendix-a.adoc[]`，Asciidoctor 会把它投影成 `.html` 文件链接；resource checker 再从最终 HTML 的角度看，判断这个本地文件不存在，这个判断本身并不荒唐。荒唐的是：我们把“源文件级 xref”和“当前 HTML 输出策略”混在一起，却没有给工具一个正确的转换语义。

我对“要不要干脆不要这个检查”的判断是：不要把整个 HTML 本地资源检查一刀切删掉，但应该修改它的边界，或者更准确地修源文档的 xref 表达。这个检查能抓真实问题，比如图片路径错、CSS/JS 路径错、跨书链接指向不存在的 book HTML、手写 HTML 里的本地资源缺失。完全删除后，预览可能静默产出断链页面，后面更难发现。不过它现在确实过于粗糙：它只看最终 HTML 里有没有本地文件，不理解 AsciiDoc include 后的“同页 section 锚点”关系，也不理解某些链接是 Asciidoctor 从源文件 xref 自动生成的。它适合做产物层断链扫描，不适合替代 Asciidoctor 或 source-aware xref resolver。

这里我建议分三件事处理。

第一，`include.unsupported-attrlist` 这条 warning 应该在 `asciidoc-abundant-tree` 侧修，或者在本项目调用它时更温和地处理。根因不是用户语法错，而是这个辅助分析器的 include graph 构造太保守，并且用逐行正则扫 include，没有排除 source/listing block。比较正的修法是让 `asciidoc-abundant-tree` 的 book-entry mode 只把空 attrlist 的 `.adoc` full-file include 当作结构 include；遇到非 `.adoc` include、带 tag 的 include、或处于 listing/source block 的 include，不应该抛 error 破坏整本书 page map，而应该保留原行或发 diagnostic warning。当前 runtime 已经 fallback 了，所以问题没有中断构建，但会让 reader page map 少掉章节导航，属于体验退化。

第二，`020-default-semantics.adoc` 这条 xref 应该按当前单页书输出方式改。最稳的是给附录标题声明一个显式稳定 ID，比如在 `backmatter/appendix-a.adoc` 顶部写：`[#structured-writing-quick-reference]`，然后在正文里用 `xref:structured-writing-quick-reference[结构化写法速查]`。这样官方 Asciidoctor 在同一 assembled book 里会生成同页锚点链接，而不是假设存在 `appendix-a.html`。这也符合你这本书本身正在讲的规则：需要长期引用的标题，尤其是跨源文件引用但最终同属一本书的标题，最好用稳定 ID，而不是用源文件相对路径去暗示阅读结构。

第三，HTML local resource check 可以保留，但应该避免误承担“源 xref 语义判断”的职责。它只应该检查最终 HTML 中确实应该作为文件存在的本地资源，尤其是 `img src`、`script src`、`link href`，以及明确跨页面的 HTML 链接。对于 Asciidoctor 从 `.adoc` xref 生成的 `.html` 链接，如果项目当前选择单页输出，就应该在源层修成锚点；或者在 checker 里识别“同一本书 book.html 内已有对应 section source”的情况，把它作为更具体的诊断，例如 `ADOC_XREF_RENDERED_AS_MISSING_HTML_PAGE`，提示作者改用稳定锚点，而不是泛泛地报资源缺失。这个比直接删除检查更有维护价值。

最终判断：你说“我的语法应该没有问题”，从官方编译器角度基本是对的。`tag=main` include 是官方支持语法；`xref:...adoc[]` 也是官方能接受并渲染的语法。当前失败不是官方编译器在说你语法错，而是项目自定义工具链在两个地方暴露了自己的边界：`asciidoc-abundant-tree` 的 include resolver 太窄；本项目的 HTML resource checker 太机械。但 `07` 这本书里的 xref 写法在当前单页 HTML 输出策略下确实会产出死链接，所以我不建议把这件事仅仅归为“检查器犯蠢”。更准确的处理是：源文档用稳定 ID 引用同书附录；工具链保留产物断链检查；`asciidoc-abundant-tree` 的 include 解析要避免把 code include 当成结构 include。

我建议下一步这样做：先把 `appendix-a.adoc` 加稳定 ID，并把 `020-default-semantics.adoc` 的 `xref:../../backmatter/appendix-a.adoc[]` 改成同书锚点 xref，解决当前 `preview:build` 的硬失败。然后另起一个小修，调整 `asciidoc-abundant-tree` 或本项目对它的调用，让带 tag 的 source include 不再造成 reader page map fallback。至于删除整个 HTML local resource check，我不建议；它应该降噪、分类、精准化，而不是消失。
</Assistant>

<User id="1">
好的，我发现把这个ADOC的这个后缀去掉就行了，就可以正常了。那这边引用就没有什么问题。那其实真正的问题在这边 asciidoc-abundant-tree 请你自己再深入调查一下调查一下代码之类的、测试之类的他应该是之前确实他只做了一半，这是include。 然后目前呢，也用了一些很奇怪的解析手法，是不是？你自己看啊，能不能继续复用官方的识别 官方的识别，看能不能去渠区分出这个，比如说什么代码块呀？或者说不解析之类的语义这样子呢？哎，但是我们的这个include不用自己去顾及太多的边缘case是不是第二点思考，如果说确实需要我们去手搓复刻解析器，那思考要不要需要引入正经的这个解析器库？ 然后哈，请你自己调查完整的include 这个语法是什么样子的？也就是说，我只想知道完整的include是什么样子的，当前状态和目标期望有什么差距。我不想知道什么第一步、第二步、第三步，那都是狗屎。啊，你现在要做的事情就是把这个include搞清楚。 你下次用弹窗通知我的时候，我希望你自己没有任何的猜测，或者说没有任何未验证的信息。你要是有，你自己验证清楚再来找我，要不然不要来找我。好，请你开始吧。信心满满之后，弹窗向我分享，不少于4000字或者更多，开始。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="2">
# `asciidoc-abundant-tree` 的 include 语义调查

我把这次调查范围收紧到一个问题：AsciiDoc/Asciidoctor 的 include 到底是什么，`asciidoc-abundant-tree` 现在做到了什么，二者之间差距在哪里，以及能不能复用官方识别能力。

结论先说：当前 `asciidoc-abundant-tree` 的 book-entry include 实现确实只做了一半，而且是主动收窄过的半成品。它现在不是复用官方 include 预处理器，而是在 `src/book-entry/include-resolution.ts` 里用一条正则逐行识别 `include::target[]`，只接受空 attrlist 的 full-file include。任何非空 attrlist，例如 `tag=main`、`lines=1..4`、`leveloffset=+1`、`indent=2`、`opts=optional`，都会被它作为 `include.unsupported-attrlist` construction error 抛出。测试里也明确把这个行为写成了负向契约，所以这不是偶发现象，而是当时设计范围的结果。

我看了源码、测试、设计文档、官方文档，并做了本地行为探针。下面是完整结论。

## 1. 官方 include 是 preprocessor directive，不是 block macro

官方文档对 include 的定位非常明确：include 看起来像 block macro，但它不是 macro，而是 preprocessor directive。它在文档行被读取时处理，发生在文档结构解析之前。因此它没有 surrounding document structure 的意识。官方文档还直接说明：如果不想处理 include，必须用反斜杠 escape；即使 include 出现在 verbatim block 里，也必须 escape，因为 include 不知道自己处在 verbatim block 里。

这个点非常关键，因为它否定了一个直觉方案：不能说“官方会识别代码块，所以 include 在代码块里不应该解析”。事实相反。官方 include 预处理器就是会在 source/listing/verbatim block 中处理 include。我们遇到的 `03-code-includes.adoc` 正是这种情况：

```adoc
[source,js]
----
include::../examples/minimal-tool.mjs[tag=main]
----
```

这在官方语义下不是“代码块里的一行普通文本”，而是 source block 内部嵌入外部文件片段。官方 Asciidoctor 会在解析 block 结构前把这行替换成目标文件 tag 区域的内容，然后 source block 再把替换后的内容作为代码显示。我本地用 `@asciidoctor/core` 3.0.4 验证了这一点：`include::...minimal-tool.mjs[tag=main]` 能正常输出 `export function describeBook(id) { ... }`，不会报错。

所以，目标不应该是“区分代码块然后不解析 include”。目标应该是：复用官方预处理器处理 include；在 `asciidoc-abundant-tree` 自己的 book-entry/source-map 层，区分哪些 include 是书籍结构 include，哪些 include 是代码/文本片段 include，哪些 include 只影响 logical text 而不应该被当作章节文件递归图的一部分。

## 2. 官方 include 的语法表面

官方文档给出的 include 指令形态是：

```adoc
include::target[leveloffset=offset,lines=ranges,tag(s)=name(s),indent=depth,encoding=encoding,opts=optional]
```

关键点如下。

`target` 是必需的。它可以是绝对路径、相对于当前文档的路径，或者 URL。target 是 line-oriented expression 的一部分，所以 target 可以包含空格，但不能以空格开头，因为那会变成 description list term。

include 指令必须独占一行。当前 `asciidoc-abundant-tree` 的正则 `^(\s*)include::([^[]+)\[([^\]]*)\]\s*$` 基本也只匹配独占一行的形态，但它不理解完整 attrlist 语法，只把 `[` 到 `]` 之间整段抓成字符串并要求为空。

`leveloffset` 是正式属性，用于调整被 include 内容中的 section level。官方文档说明它可以把 include 文件中的 heading 往下推。例如主书中 `include::chapter01.adoc[leveloffset=+1]` 可以把 chapter 文件的 document title 当成 level 1 section。这个属性不是简单筛行，它会在预处理输出中插入 `:leveloffset:` / `:leveloffset!:` 控制行。我本地用官方 Reader 验证到，`include::parts/chap.adoc[leveloffset=+1]` 的预处理 logical lines 里会出现：

```adoc
:leveloffset: +1

= Included Doc Title
...
:leveloffset!:
```

并且这些 leveloffset 控制行的 cursor path 指向 include 文件，line number 甚至会出现 `-1`、`0` 这类合成行坐标。这说明如果我们要精确 line origin，`leveloffset` 不是简单“复制目标文件原始行”能解决的。

`lines` 是正式属性，用于按行范围 include。官方文档给出 `lines=5..10`，也支持多个 range，例如 `lines="1..10,15..20"`，还可以用分号避免引号，例如 `lines=7;14..25;28..43`。还支持 `-1` 表示最后一行、`12..` 表示到最后。这个属性会改变 included line set。当前工具把 `lines=1..4` 作为 unsupported attrlist 报错，测试里也写了 `fails when a lines attrlist would change the included line set`。

`tag` / `tags` 是正式属性，用于选择 tagged regions。官方文档说明 tag directive 形如 `tag::name[]` 和 `end::name[]`，一般放在目标语言的行注释后面，例如 JS 里 `// tag::main[]`。它还支持多个 tag、wildcard 和 exclusion。我验证了 `tag=main` 会只输出 tag 区间内部内容；验证了 `tags=a;b` 可以选择多个区域；也验证了 `tags=a;b;!skip` 能排除内部 skip 区域。这里要注意一个 source-map 陷阱：官方 Reader 的输出行文本是对的，但 cursor line number 对复杂 tags 过滤不一定等于原文件真实物理行号。我用一个 `tags.txt` 验证，原文件里 `a2` 是第 7 行、`b1` 是第 11 行，但 Reader 给出的 line number 会压缩成 5、6 或 4、5 这类输出序号。这不是猜测，是本地输出实际如此。

`indent` 是正式属性，用于给 included content 调整缩进。我验证 `include::parts/text.txt[indent=2]` 在 source block 中会把输出行前面加空格，并且 included 行的 cursor path 指向目标文件。它改变的是 emitted logical text，不只是路径解析。

`encoding` 是正式属性。官方文档说明 include 文件不是 UTF-8 时应指定 encoding。当前工具完全按 Node `readFileSync(..., "utf8")` 读取，不支持 encoding 语义。

`opts=optional` 是正式属性。官方对 missing include 的行为我也验证了：没有 `opts=optional` 的 missing include 会通过 Asciidoctor logger 输出 error，并在 HTML 里生成 `Unresolved directive in ...`，但 `@asciidoctor/core` 不会直接抛 JS exception；有 `opts=optional` 时会静默跳过 missing include。当前 `asciidoc-abundant-tree` 对 missing include 是 construction error `include.missing-target`，这比官方更严格，也不支持 optional。

URL include 是正式能力，但需要 `allow-uri-read` 且受 safe mode 限制。官方文档说明 URI read permission 需要在 SERVER 或更低 safe mode 下启用 `allow-uri-read`；SECURE 或更高会强制禁用。当前 `asciidoc-abundant-tree` 的 book-entry builder 用 filesystem path boundary 检查，完全不支持 URL target。

safe mode 也是 include 语义的一部分。`@asciidoctor/core` 类型定义说明：SAFE 会限制访问 parent directory 外的文件，但仍允许 include；SECURE 禁用 include，并把 include 转成链接。我本地验证 `safe: secure` 下 `include::chapters/ch1.adoc[]` 不展开，而是变成 include link；`safe: unsafe` 下会展开。

escaped include 是正式语义。`cinclude::just-an-example.ext[]` 不处理为 include。官方文档明确说，在 verbatim block 中也需要 escape。我本地验证了官方 Reader 输出 escaped include 时会去掉反斜杠，logical line 变成 `include::escaped.adoc[]`；这会造成一个二次预处理风险：如果我们把 Reader 输出的 logical text 再交给 Asciidoctor 以 `safe: unsafe` parse，这个本来被 escape 的 include 会在第二轮被错误展开。

## 3. 当前 `asciidoc-abundant-tree` 的实现状态

当前实现集中在 `src/book-entry/include-resolution.ts` 和 `src/book-entry/logical-source-builder.ts`。

`include-resolution.ts` 只有一个识别器：

```ts
const includeDirectivePattern = /^(\s*)include::([^[]+)\[([^\]]*)\]\s*$/u;
```

`parseIncludeDirective()` 做了四件事：

1. line number 不存在时返回 ordinary。
2. trim 后以 `\include::` 开头时返回 ordinary。
3. 正则匹配失败时返回 ordinary。
4. 正则匹配成功后，如果 attrlist 非空，抛 `include.unsupported-attrlist`；否则返回 `{ kind: "include", target, sourceSpan }`。

`logical-source-builder.ts` 的 `appendSourceFile()` 逐行调用 `parseIncludeDirective()`。如果 ordinary，就把当前源行 append 到 `logicalLines`，并记录一个 `LineOrigin`。如果 include，就 `resolveIncludeTarget()`，检查 `documentRoot` 边界，然后递归 `appendSourceFile()`。

这个实现当前支持：

- 空 attrlist full-file include：`include::chapters/01.adoc[]`。
- nested include。
- repeated include 输出重复，但 source file table 去重。
- escaped include preservation。
- include target 按 containing file directory 解析。
- include cycle detection。
- include path 越出 documentRoot 前失败。
- missing target 作为 construction error 失败。
- 为每个 logical line 生成 line origin。

测试证明这些能力是当前 contract。`test/book-entry/logical-source-builder.test.ts` 覆盖 simple/nested/shared include、escaped include、relative target、dedup source file、line origin invariants。`test/book-entry/include-resolution.test.ts` 和 `book-entry-negative.test.ts` 明确断言 `tag=main`、`lines=1..4` 要失败。文档 `docs/bookshelf/books/10.../chapters/09-diagnostics.adoc` 也把 `include.unsupported-attrlist` 列为 construction error。

所以当前状态可以概括为：它实现的是“受控 book-entry full-file include graph builder”，不是 Asciidoctor include 预处理器。它可以满足简单书籍拆章，但不支持完整 include 语义。

## 4. 和官方语义的差距

差距不是一个 case，而是一类架构差异。

第一，当前工具把 include 当成“结构图边”，官方把 include 当成“行预处理”。官方 include 不关心 block context，只是在 reader 层把行加入或拿掉。当前工具把每个 include 都当成递归文件 include graph，这会天然误伤 code include、snippet include、data include、attribute include 等非章节结构用途。

第二，当前工具把 attrlist 非空视为 construction error；官方 attrlist 是 include 的核心语义。`tag/tags`、`lines`、`leveloffset`、`indent`、`encoding`、`opts=optional` 都是正式能力。

第三，当前工具能给精确 line origin，是因为它只做 full-file line copy；一旦支持 tag/lines/indent/leveloffset，line origin 不再是简单的一行对一行复制。官方 Reader 能告诉我们 logical text 和 cursor file/path，但对 `tags` 和不连续 `lines` 的 line number 不一定是原始物理行号。我已经验证了这个限制。

第四，当前工具用 construction error 的方式处理 missing include，官方默认是 logger error + unresolved directive 输出；`opts=optional` 静默跳过。这是行为策略差异，不只是实现缺失。

第五，当前工具没有 safe mode、URI、allow-uri-read、encoding 的语义。它只在本地 filesystem 和 documentRoot 边界内工作。

第六，当前工具逃避了官方 double preprocess 问题，因为它自己拼 logical text 后再 `adapter.loadSource(logicalText)`。当 logical text 来自自家 full-file copy 时没问题；但如果 logical text 来自官方 Reader，escaped include 已被 unescape，第二次交给 Asciidoctor 会被重新处理。我验证了 `\include::escaped.adoc[]` 经 Reader 输出后变成 `include::escaped.adoc[]`，再 `safe: unsafe` parse 会真的展开 `escaped.adoc`。这说明“直接用官方 Reader 输出 logical text，然后照旧 loadSource”不是安全替换。

## 5. 能不能复用官方识别

可以复用，但要分清复用哪一层。

官方 `@asciidoctor/core` 暴露了 `Reader`。类型定义里 `Reader.readLines()` 说明它会 consume、preprocess 并返回剩余行，触发 preprocessors；`Reader.getCursor()` 可以拿到当前 file、directory、path、line number；`Reader.pushInclude()` 是 IncludeProcessor 用来把目标内容压回 reader 的方法。我本地用 `parse:false` 打开文档，然后逐行 `reader.readLine()`，每次读取前拿 `reader.getCursor()`，确实能得到官方预处理后的 logical line，以及这个 logical line 当前所在的 file/path/line。

这意味着不必自己复刻“include 指令在哪里、路径怎么解析、tag 怎么过滤、lines 怎么选、indent 怎么加、leveloffset 怎么注入、optional missing 怎么处理、secure safe mode 怎么禁用”这些主体语义。官方 Reader 已经处理了相当一部分。

但官方 Reader 不能直接给出当前工具所需的完美 `LineOrigin[]`。验证结果显示：

- full-file include 的 cursor line number 基本可靠。
- tagged include 的输出文本可靠，但复杂 tag 过滤下 line number 可能不是原始物理行。
- line ranges 的输出文本可靠，但不连续 ranges 下 line number 可能被压缩。
- leveloffset 会插入合成行，line number 可能是负数、0 或超出原文件行数。
- escaped include 会被 unescape，如果 logical text 再 parse，会产生二次预处理风险。

所以“复用官方”有两个现实路径。

路径 A：让官方完成一次 parse，`asciidoc-abundant-tree` 不再先构造 logical text 再二次 parse。也就是 book-entry 模式改成 `adapter.loadFile(sourcePath)`，使用 `safe: unsafe` 或受控 safe mode，开启 `sourcemap: true`，让官方 AST 成为结构权威。然后从 AST block 的 `getSourceLocation()` 和 `getSource()` 恢复 source surface。这个路径最符合本仓库已有的健康化设计原则：官方 AST 决定结构，源码文本只补证据与坐标。但它会改变当前 book-entry 模式的设计，因为现有测试 `uses logical text rather than Asciidoctor include sourcemap for book-entry mode` 明确要求不使用官方 include sourcemap。这条测试反映的是旧设计，不是官方能力不足。

路径 B：继续保留 logical source 模型，但 logical source 的 include 展开改为调用官方 Reader。实现上可以 `loadFile(..., { parse:false, safe: ..., sourcemap:true })`，逐行 `readLine()` 得到 official-preprocessed logical lines，同时记录 cursor。这个路径能显著减少手写 include parser，但必须处理两个问题：一是修复 escaped include 的二次预处理风险，二是对 `tag/tags`、`lines`、`leveloffset` 的 source origin 做降级或补偿。如果目标只要求“不因为 tag=main 崩掉 reader page map”，这个路径已经足够；如果目标要求每一行原始物理坐标完全精确，仍需要为 selector 类 include 补映射算法。

路径 C：继续手写 include parser，并补全官方 include 语法。我不建议这个方向。原因不是做不到，而是它会变成复刻 Asciidoctor preprocessor。需要实现 attrlist parser、attribute substitution、conditional preprocessing interaction、tag filtering、lines grammar、leveloffset 合成语义、indent、encoding、URI、safe mode、optional missing、nested include、max include depth、include processors extension、escape/unescape 语义。任何一个细节都可能和官方偏离。当前项目的核心价值是 source-aware projection，不应该把维护成本投到完整 include preprocessor 上。

## 6. 对“代码块区分”的精确判断

如果问题表述为“能不能复用官方识别，区分出代码块，代码块里不解析 include”，答案是否定的，因为这不是官方语义。

如果问题表述为“能不能复用官方识别，让 source block 中的 `include::file[tag=main]` 正常展开为代码内容，同时不把它当成 book-entry 章节 include graph”，答案是肯定的。官方 Reader 已经能做到前半部分。后半部分是 `asciidoc-abundant-tree` 自己的数据建模问题：它不应该在 book-entry graph builder 里把所有 include 都建模成 recursive source file append。include 是 line preprocessor，不是结构 include edge。

在当前失败案例里，`include::../examples/minimal-tool.mjs[tag=main]` 位于 source block 中。官方行为是展开 JS 文件中的 tagged region，让 listing block 显示代码。当前工具行为是看到 `include::... [tag=main]`，因为 attrlist 非空直接 construction error。正确目标不是“忽略这行”，而是“让它按官方预处理变成代码行，并在 page map/section tree 构造时不因为它不是 `.adoc` full-file include 而失败”。

## 7. 当前状态与目标期望的差距表

当前：只支持空 attrlist full-file include。
目标：支持官方 include 预处理结果，至少不因合法 include attrlist 失败。

当前：用正则逐行识别 include。
目标：复用官方 Reader 或官方 AST sourcemap，不把正则作为 include 语义权威。

当前：任何 attrlist 非空抛 construction error。
目标：`tag/tags`、`lines`、`indent`、`leveloffset`、`opts=optional` 等官方属性要么按官方处理，要么明确以 diagnostic 降级，不能把合法官方语法说成 construction failure。

当前：missing include 是 construction error。
目标：行为要决定清楚。如果要做严格工具，可以继续比官方更严格；但 `opts=optional` 必须例外，否则和官方语义冲突。

当前：escaped include 保留反斜杠。
目标：如果复用官方 Reader，必须防止 escaped include 在第二次 parse 中被重新展开；如果改用单次 official AST，就没有这个二次问题。

当前：line origin 对 full-file include 精确。
目标：对 selector include 的 origin 要定义策略。可以分三档：full-file 精确；tag/lines 尽量精确但遇到官方 cursor 压缩时 diagnostic；leveloffset 合成行标记为 generated/control origin，不伪装成真实源行。

当前：documentRoot boundary 是自家实现。
目标：如果改用官方 unsafe include，要重新定义安全边界。官方 `safe: unsafe` 允许更广路径，不能直接放开；需要通过 base_dir、安全模式或 extension/Reader 包装约束 include root。这个点不能忽略。

## 8. 我现在的确信结论

`include.unsupported-attrlist` 的根因不是用户 AsciiDoc 语法错误。`tag=main` 是官方 include 语法。当前错误来自 `asciidoc-abundant-tree` 旧设计：book-entry logical source builder 只实现 full-file include graph，并把 attrlist 非空当作 construction error。

“代码块里 include 不应该解析”这个理解不符合官方语义。官方 include 是 preprocessor directive，不感知 block context；在 verbatim/source block 内也会解析，除非 escape。当前出问题的 source block include，官方应当解析为代码片段。

“完全手写补齐 include”不划算，也会把项目拖向复刻 Asciidoctor preprocessor。更合理的是改 book-entry 构造：让官方 Reader/AST 承担 include 预处理和结构解析权威，`asciidoc-abundant-tree` 只做 source-aware projection 和坐标恢复。

最强的技术证据是本地 Reader 探针：`parse:false` + `reader.readLine()` 可以得到官方预处理后的 logical lines，并用 `getCursor()` 得到 file/path/line。这说明我们有复用官方识别的实际入口。但它不是无损银弹，因为 `tags`/`lines` 的 cursor line number 不总是原始物理行，`leveloffset` 会生成控制行，escaped include 会引入二次预处理风险。

因此，目标期望应当是：不要继续维护当前这个把 attrlist 非空直接判死刑的 include resolver；也不要试图写一个完整 include parser。应把 include 责任转交给 Asciidoctor 的 Reader/AST，同时为 `asciidoc-abundant-tree` 的 source origin 精度制定清楚的降级规则。这样才能既尊重官方语义，又避免在边缘 case 上无限扩张维护成本。
</Assistant>

<User id="2">
\\wsl.localhost\Ubuntu\home\t103o\workbench\micheng-ts\projects\asciidoc-abundant-tree\docs\bookshelf\build\adoc\books\10-book-entry-source-mapped-logical-document.adoc 你可以完整地阅读一下现有的这一套设计，是吧？这是关于大量的为什么的解释啊，都在这里面。你自己完整地阅读一下十号书籍啊，一整本都完整地读一读，读完之后不知道你会有什么新的想法、看法或者改变吗？好，那你看完之后再发个弹窗和我聊聊，不少于3000字或者更多，开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="3">
# 读完 10 号书后的判断修正

我完整读了你指定的 `docs/bookshelf/build/adoc/books/10-book-entry-source-mapped-logical-document.adoc`，661 行都读完了。读完之后，我对刚才 include 调查的判断需要修正，而且这个修正很重要。

我之前说“当前 `asciidoc-abundant-tree` 的 book-entry include 只做了一半”，这句话如果按官方 Asciidoctor include 全量语义作为目标，是成立的；但如果按 10 号书定义的对象边界来评价，就不准确，甚至有点误导。10 号书已经明确说了：这个对象“不实现完整 AsciiDoc reducer”，它“只定义本书支持的 full-file include resolution 与 line origin 规则”。所以当前实现不是“本来想实现完整 include 但只做了一半”，而是“按一份窄语义规约实现了受支持 full-file include graph”。`include.unsupported-attrlist` 不是随手写出来的笨拙错误，而是这份规约里明确设计的 construction error。

这会改变问题的性质：现在不是“怎么补齐一个未完成的 include parser”，而是“10 号书定义的 book-entry source-mapped logical document，是否应该扩展对象边界以支持更多官方 include 语义”。这是一个规约层选择，不只是实现层 bug。

## 10 号书实际定义了什么

这本书在前言就把对象说得很清楚：书稿入口回源逻辑文档从一个 AsciiDoc book entry 出发，解析“受支持的 full-file include directive”，构造一份带 line origin 的 in-memory logical document，并通过 `asciidoc-abundant-tree` 解析器产出可回源的 `AbundantDocument`。

它反复强调两个表面：logical document 是解析表面，line origin 是回源表面。解析器看到的是一份逻辑 AsciiDoc 文档；每个可回源事实仍然必须指向创建它的原始 source file。也就是说，这个对象不是为了“像 Asciidoctor 一样把文档最终渲染出来”，而是为了让 source coordinate 保持原始文件身份。这个目标比“能 include”本身更严格。

第 54 行直接说：本对象不实现完整 AsciiDoc reducer。它只定义本书支持的 full-file include resolution 与 line origin 规则。第 149 行定义支持表面：只支持不带转义前缀的 full-file 完整行 include directive，例如 `include::chapters/01-projection-object.adoc[]`。第 153 到 155 行定义 escaped include：不执行 resolution，作为普通 source line 原文进入 logical document，并保留原始 line origin。

最关键的是第 163 到 170 行：`Unsupported Attrlist`。原文语义是：本对象只定义 full-file include。Include attrlist 如果包含 tag、lines 或其它改变目标文件行集的语义，resolution 不得静默按整文件 include 处理。这些 surface 进入 unsupported include diagnostic。该诊断保护 line origin 的真实性。

这句话是当前实现的真正依据。`include.unsupported-attrlist` 不是遗漏；它是防止“看似成功但 source coordinate 说谎”的硬边界。

第 179 到 181 行也很关键：AsciiDoc include 是预处理器行为，未转义完整行 include directive 是构造 logical document 的输入事实；本对象不实现完整 Asciidoctor preprocessor，只实现本书定义的 full-file include resolution，其它 AsciiDoc 语义由 parser 在 logical document 上解释。

这就解释了为什么实现里没有去复刻 `tag/tags`、`lines`、`leveloffset` 等完整官方 include 属性。按 10 号书，它本来就不该做，除非我们修改这本规约。

## 为什么 attrlist 会被刻意拒绝

10 号书的核心约束是 line origin 和 column 映射。第 196 到 200 行说：logical text 中的非 include 行必须原样复制 source line；不得改写空白、缩进、Unicode 字符或 inline 内容。该规则使 logical column 与 origin column 保持一致，inline occurrence 的 column 可以直接从 logical line 映射到 origin line。

第 284 到 295 行进一步定义 column 映射：logical line 文本原样来自 origin line 时，column 保持不变；如果某种转换需要改写文本，该转换必须同时定义 column map；本对象不包含该转换。

这就是为什么 `tag`、`lines`、`indent`、`leveloffset` 不能被轻易接受。

`tag` 和 `lines` 会改变 included line set。full-file include 的每一行可以直接映射到目标文件同一行；tag 和 lines 选择后，logical line 仍来自目标文件，但 line 集合是被过滤的。理论上可以映射，但需要 selector 到物理行的精确映射。我的官方 Reader 探针已经验证：Reader 输出文本正确，但对复杂 `tags` 和不连续 `lines`，cursor line number 不总是原始物理行。也就是说，不能简单相信 Reader 给出的 line number 就完成 line origin。

`indent` 会改写行文本，column 不再保持一致。10 号书明确说本对象不包含 column map。若支持 `indent`，必须引入 column map，否则 xref sourceSpan、inline occurrence column 会说谎。

`leveloffset` 会插入控制行 `:leveloffset:` / `:leveloffset!:`，并改变 section 解释。我的本地验证里，官方 Reader 给这些合成行的 line number 会出现 `-1`、`0` 或超出原始文件行数。这直接违反 10 号书第 299 到 305 行的不变量：line origin 的 sourceLine 必须位于对应 source file lineTable 范围内。除非把合成行建模为 generated/control origin，否则不能塞进现有 `LineOrigin` 类型。

`opts=optional` 会让 missing include 静默消失。10 号书当前规定 missing include 阻止 logical document 成立。这是更严格但一致的工具语义。要支持 optional，就需要修改 construction error 规则，让一部分 missing target 不再失败。

所以，读完 10 号书后，我认可当前 unsupported attrlist 的设计理由：它不是为了省事，而是为了守住“logical line 原样来自 origin line、column 直接继承、line origin 永远真实”这组不变量。

## 和官方 Asciidoctor 语义的关系

刚才官方 include 调查仍然成立：官方 include 是 preprocessor directive，不感知块上下文；`tag=main` 是合法官方语法；source block 里的 include 也会被处理；`@asciidoctor/core` 能正常渲染这个 code include。

但 10 号书的对象不是“完整官方 include 执行器”。它明确声明只支持 full-file include resolution。这里存在两个不同的正确性标准：

官方 Asciidoctor 正确性：`include::file[tag=main]` 是合法，应被处理。

10 号书 book-entry logical document 正确性：只有不改变行文本、不改变列映射、不引入合成行、不破坏 line origin 不变量的 full-file include 进入受支持集合；其它 include surface 不得静默当作整文件 include，必须失败或诊断。

这两个标准不冲突。冲突来自当前 `asciidoc-multi-book-workspace` 的调用场景：它把 `asciidoc-abundant-tree` 用作 reader page map 的辅助分析器，而输入书稿里包含了官方合法但 10 号书规约明确不支持的 code include。于是官方 HTML 构建能过，但辅助分析器按自己的规约拒绝。这不是官方语法错，也不是随机启发式误判；它是两个工具层的对象边界不一致。

## 我现在对“复用官方 Reader”的判断变化

我之前说“更合理的是改 book-entry 构造，让官方 Reader/AST 承担 include 预处理”。读完 10 号书后，这个建议必须降级成“如果决定扩展对象边界，才考虑这种重构”。不能把它当成当前规约下的直接修复。

为什么？因为 10 号书第 349 到 355 行明确规定：Asciidoctor 应解析 logical text，而不是 entry file；该调用不得再次展开 include；include resolution 已由 book-entry pipeline 完成；raw recovery、xref sourceSpan 和 block source coordinate 不得从 Asciidoctor include sourcemap 推导。

这是一条架构边界。它把官方 Asciidoctor 的职责限定为解析 already-built logical text，提供 official AST、section tree、block context 和 ref catalog。它明确拒绝从 Asciidoctor include sourcemap 推导回源坐标。

所以，如果我说“直接用 `adapter.loadFile(sourcePath, safe: unsafe, sourcemap:true)` 让官方 AST 自己处理 include”，那是在改 10 号书的架构原则，不是修实现 bug。这个方案可能有价值，但它必须先重写规约中的 Asciidoctor 调用边界、line origin 不变量、source file reconstruction surface 和 contract tests。

更温和的“Reader 预处理 logical lines”方案也不是无侵入。它会碰到 escaped include 二次预处理问题；会碰到 `tags`/`lines` line number 不可靠；会碰到 `leveloffset` 合成行；会碰到 `indent` column map。它仍然不是当前 10 号书模型的直接替换。

## 那当前问题到底是什么

当前问题不是 `asciidoc-abundant-tree` 错把官方非法语法当合法，也不是它误以为代码块里 include 应该解析。当前问题更精确地说是：`asciidoc-abundant-tree` 的 book-entry mode 是一个窄规约对象，只接受 full-file include；但 `asciidoc-multi-book-workspace` 的模板书稿中出现了官方合法的 tagged code include，并且调用方把 book-entry mode 的失败当成 reader page map 构建失败来处理。

这个问题有三种层级的处理方向，每一种都对应不同的对象边界。

第一种：保持 10 号书不变。那就承认 `include::../examples/minimal-tool.mjs[tag=main]` 不属于 book-entry mode 支持表面。`asciidoc-multi-book-workspace` 在调用 `parseAbundantTree({ mode: "book-entry" })` 时应当预期这种书稿会失败。当前它已经 fallback 到 cover-only page map，所以行为上没有中断构建，只是降级。若要让 reader page map 不降级，就需要避免在提供给 `asciidoc-abundant-tree` 的 book-entry 输入里出现 unsupported attrlist include。比如在示例书里不用真实 `tag=main` include，或给 reader page map 使用一个不含 code include 的分析入口。但这牺牲了示例对官方 include tag 的展示。

第二种：保持 10 号书的 line-origin 严格性，但扩展一个“非结构 include passthrough/diagnostic”语义。也就是说，仍然不支持 attrlist include 参与 source-mapped logical document，但不把所有 attrlist include 都变成 construction error。对于 `.adoc` full-file 结构 include 以外的 include，例如 target 不是 `.adoc` 或 attrlist 表明它是 code snippet include，可以选择作为普通行保留，或者在 logical text 中保留 escaped 形式，让 parser 不二次展开，同时发 warning。这个方向能避免整个 book-entry page map 因 code snippet include 降级，但它不是完整官方 include 支持，也会使 rendered logical document 和官方最终文档不一致。它适合作为“reader page map 只关心章节结构”的实用模式，但不适合作为严格 `AbundantDocument` projection 的默认行为，除非公共模型明确标注降级。

第三种：修改 10 号书，扩展 book-entry mode 支持官方 include 子集。这个方向才需要引入官方 Reader 或更严肃的 include preprocessing 层。扩展时必须逐项定义：`tag/tags` 如何映射物理行；`lines` 如何映射物理行；`indent` 如何提供 column map；`leveloffset` 合成行如何建模；`opts=optional` 是否改变 missing include error；URI 是否允许；safe mode 如何与 documentRoot 边界共存；escaped include 如何避免二次展开。没有这些定义，就不能说“支持完整 include”。

## 我对“完整 include 是什么”的更新答案

完整 include 不只是 `include::target[]`。官方完整面包括：target 路径或 URL；安全模式限制；`allow-uri-read`；`leveloffset`；`lines` ranges；`tag/tags` filtering；`indent`；`encoding`；`opts=optional`；escape；line-oriented 独占行；不感知 block context；nested include；相对路径按当前 include 文件解析；include processors extension。

而 10 号书定义的 include 不是这个完整集合。它是 deliberately supported subset：不转义、完整行、full-file、空 attrlist、本地路径、documentRoot 内、递归、可检测 cycle、每行原样复制、每行有真实 origin。

两者的差距是有意差距，不是偶然差距。

## 读完后的新看法

我现在认为，`include.unsupported-attrlist` 作为 `asciidoc-abundant-tree` 的核心 book-entry mode 行为，是合理的，前提是我们继续承认 10 号书的对象边界。它保护了 source coordinate 的真实性，避免“看起来能解析，实际坐标已经不可信”。这一点我之前低估了。

但我也认为，把这个严格 book-entry mode 直接用于 `asciidoc-multi-book-workspace` 的 reader page map，有适配问题。reader page map 的需求主要是章节导航和 source bundle，它不一定需要完整 RDF/source coordinate 严格性。它遇到一个合法的 code include 就降级到 cover-only，体验上确实太脆。这里更像是调用方需要一个“结构目录抽取模式”或“宽容模式”，而不是要求 10 号书的严格 book-entry 对象改变自身。

如果要动 `asciidoc-abundant-tree`，我不会再说“直接复用官方 Reader 替换当前 include resolver”。更严谨的方向是先决定要不要新增第二个模式：

- 严格 book-entry mode：继续符合 10 号书，unsupported attrlist 是 construction error。
- 宽容 structure-map mode 或 recovery mode：用官方 AST/Reader 或更宽松策略尽量拿章节结构，遇到 code include 不让整书失败，但 source coordinate 标记为降级或缺失。

这样可以同时保住 10 号书的高标准和 `asciidoc-multi-book-workspace` 的实际预览体验。否则如果直接放宽现有 book-entry mode，把 `tag=main` include 当作普通成功处理，就会破坏 10 号书最核心的“不能输出假精确坐标”的原则。

## 最终修正结论

读完 10 号书后，我的结论从“include resolver 做了一半，应尽快转交官方”修正为：

当前 resolver 是按 10 号书的窄规约实现的；`unsupported attrlist` 是设计边界，不是实现粗心。官方 include 全量语义当然更宽，但 10 号书为了 line origin、column 映射、raw recovery 的真实性，明确拒绝了会改变行集或行文本的 attrlist include。真正需要讨论的是是否新增一个宽容的结构提取路径，或是否正式扩展 10 号书的对象边界；不能把这个当成普通 bug 修。

对这次 `tag=main` 的具体问题，我现在更倾向：不要破坏严格 book-entry mode。要么调用方在 reader page map 构建时使用宽容结构提取；要么 `asciidoc-abundant-tree` 新增一个明确命名的非严格 mode；要么模板中避免让严格 book-entry mode 处理 tagged code include。最不应该做的是在当前严格 mode 里悄悄接受 `tag=main`，却仍然假装所有 line origin 和 column map 都精确。
</Assistant>

<User id="3">
你理解错了，这本书是当时的条件之下，就只能做到那个地步。为什么呢？因为我们这里的环境不是Ruby呀，我们无法去控制解析器的代码，也不好拓展。 然后呢，这个什么官方的，还有这个什么Reducer是不是又不支持新的版本？而且呢，Reducer又不会给这个来源的一些行号列号什么的，是不是？那我们都不符合我们的需求，是不是？所以说临时做了那个，那今天我来找你解决这个问题，是不是？那你又重新去调查了一下这个在JS这边官方的解析器的一些生态的情况嘛，那在这里是不是？那首先呢，那不就是这个首先呢，我们目前的情况是不够健壮的，而且也不完整嘛，是不是？那这里就是啊，看一下，哎，如何啊？让我们的功能更加完整，同时呢啊，不会陷入大量的这种边缘case之中嘛，是吧？所以说你看你之前不是调查到一些可以复用官方解析器的一些情况嘛？那是不是这些就是这些东西啊，你重新的好好想一想啊，好好想一想，那本十号书籍是告诉你东西是这么设计出来的，它是可以改的，它是告诉你它当前要什么东西，而不是说必须要设计成什么。什么样子？你不是必须要设计成什么样子，你看他十号书籍里面他想要的东西是什么？啊？他做到这样的地步是因为有什么样的约束，所以说他才能这么做。你仔细好好想想，想好之后再用弹窗回答我，不少于4000字或者更多，开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="4">
# 重新思考：10 号书真正想要什么，以及现在该怎么升级 include

你这个纠正是对的。我刚才把 10 号书读成了“当前规约就是最终边界”，这个理解太静态了。更准确的读法应该是：10 号书记录的是当时在一组技术约束下，为了守住核心目标而做出的可执行设计。它不是在说“book-entry 永远只能支持空 attrlist full-file include”；它是在说“无论怎么做，都不能丢掉 logical document、line origin、origin raw recovery、source coordinate 真实性这些目标”。

所以现在要重新问的问题不是“当前实现是否符合 10 号书”，而是：10 号书背后的目标是什么？当时为什么只能做到 full-file include？今天 JS 侧官方解析器生态给了哪些新能力？这些能力能不能让我们更完整地支持 include，同时不把项目拖进复刻完整 Asciidoctor preprocessor 的泥潭？

我把这个问题重新想了一遍。下面是新的判断。

## 10 号书的核心目标不是“限制 include”

10 号书真正想守住的是四个对象事实。

第一个事实：书稿在逻辑上是一份文档。作者把一本书拆成 entry、frontmatter、chapters、backmatter、shared attributes 等物理文件，但 parser 需要看到一份 logical document，才能恢复全书级 section tree、xref、target、block 关系。

第二个事实：每个可回源事实必须指向原始 source file。下游看到一个 section、xref occurrence、listing、table、description list，不应该只知道它来自聚合后的临时文本，更不能指向 `build/adoc` 产物。它应该知道自己来自 `chapters/foo.adoc` 第几行第几列。

第三个事实：raw recovery 必须回到原始文件。heading raw、block raw、xref sourceSpan 不能从 logical text 里假切。entry file 的 raw 可以包含 include directive，included file 的 raw 应来自 included file 原文。这个要求是为了让下游工具、修改执行者、诊断信息都能回到作者真正编辑的文件。

第四个事实：不能输出假精确坐标。如果一个转换已经改变了行文本、列位置、行集，系统没有相应的 mapping，就不能继续假装 column 可以直接继承。10 号书里 `unsupported attrlist` 的设计就是为这个事实服务的。

因此，`include.unsupported-attrlist` 的本体理由不是“include attrlist 不重要”，也不是“我们不想支持 tag/lines”。它的理由是：在当时的实现方式里，只有 full-file include 能保证 logical line 原样来自 origin line，column 可以直接继承，line origin 一行对一行成立。任何 tag、lines、indent、leveloffset 都会破坏这个简单不变量，而当时没有可靠机制补上缺失的 mapping，所以宁可失败，也不输出假坐标。

这就解释了为什么 10 号书写得那么硬。它不是产品上的最终愿望，而是当时条件下为了不撒谎必须设的边界。

## 当时的约束是什么

你补充的背景能对上书里的设计选择。当时环境不是 Ruby，不能直接控制 Asciidoctor Ruby 内部实现。官方 reducer 不符合版本或能力需求，而且不能提供我们需要的行号、列号、source coordinate。JS 侧如果只把 Asciidoctor 当普通转换器用，也拿不到足够的回源信息。于是只能自己构造 logical text 和 line origin，再让 Asciidoctor 解析这个 logical text。

这套设计的关键是“自己掌控 line origin”。为了掌控 line origin，实现只能支持那些能被精确映射的 include。full-file include 满足这个条件：目标文件第 N 行复制到 logical document 某一行，origin 就是目标文件第 N 行，column 不变。escaped include 原样进入 logical text，origin 是 entry file 原行，column 也不变。nested include 也是同样规则递归。

但 tag/lines/indent/leveloffset 不满足这个简单条件。不是因为它们不可建模，而是当时没有一个低成本、可靠、官方一致的办法完成建模。手写完整 include reducer 会引入大量官方语义复制：attrlist 解析、tag filtering、line ranges、leveloffset 控制行、encoding、optional missing、URI、安全模式、条件预处理、attribute substitution、include depth、extension include processor。这个成本很高，而且很容易和官方偏离。

所以 10 号书选择了一个小而硬的对象边界：只支持 full-file include，别的合法官方 include 不静默处理。这是当时的合理工程选择。

## 今天新发现的 JS 官方能力改变了什么

这次调查里最重要的新事实，不是 `tag=main` 合法。这个早就可以从官方文档知道。真正重要的新事实是：`@asciidoctor/core` 的 Reader 在 JS 侧是可访问、可驱动、可观察的。

我本地验证过：用 `asciidoctor.loadFile(sourcePath, { parse: false, safe: "unsafe", sourcemap: true })` 得到 document 后，可以拿 `doc.getReader()`，然后逐行调用 `reader.readLine()`。`readLine()` 会触发官方 preprocessor，包括 include expansion。每读一行前调用 `reader.getCursor()`，可以得到当前 cursor 的 file、directory、path、line number。

这意味着：我们不一定要自己识别 include 指令，也不一定要自己实现 tag/lines/indent/leveloffset 的文本输出语义。官方 Reader 可以告诉我们“官方预处理后 logical text 是什么”。这比当时“只能自己拼 logical text”的条件前进了一步。

我用探针验证了这些行为：

- full-file include 会展开，cursor 指向 included file 的真实路径。
- nested include 会展开，路径按包含 include directive 的文件解析。
- source block 内的 `include::file[tag=main]` 会展开，这符合官方“include 是 preprocessor directive，不感知 block context”的语义。
- `tag=main` 能输出 tagged region 内容。
- `lines=2..3` 能输出指定行。
- `indent=2` 会改写输出行缩进。
- `leveloffset=+1` 会在预处理输出里插入 `:leveloffset:` 和 `:leveloffset!:` 控制行。
- `opts=optional` 对 missing include 会跳过。
- escaped include 会被官方 reader unescape，输出成普通 `include::...[]` 文本。

这些事实说明，我们可以复用官方 preprocessor 的“选择和变换文本”能力。这是值得利用的。

但它没有一次性解决全部问题。Reader 给出的 cursor 不等于完整 line-origin 解决方案。我验证到：对复杂 `tags` 过滤和不连续 `lines` ranges，Reader 输出文本是对的，但 cursor line number 不一定是原始物理行号，而可能是筛选后输出中的相对序号。`leveloffset` 的合成行还会出现负数、0 或超出原文件行数的 line number。escaped include 如果被 Reader 输出后再交给 Asciidoctor 做第二次 parse，会被重新当成 include 展开，造成二次预处理错误。

所以现在的生态改变不是“官方已经给了我们完整答案”，而是“官方已经能承担大部分 preprocessor 语义，我们不必完整手写 reducer；但 source mapping 仍然是我们的对象，需要定义清楚”。

## 新的架构判断：不要复刻 reducer，要做官方预处理观察层

我现在认为更好的方向不是继续扩写当前 `parseIncludeDirective()`，也不是完全把 book-entry 改成 `loadFile()` 后相信 Asciidoctor sourcemap。更合理的是引入一个中间层：官方预处理观察层。

这个层的职责不是“自己解析 include”，而是驱动官方 Reader，记录官方预处理结果。它的输出不是简单的 `logicalText`，而是一个更丰富的 `LogicalDocument`：

- `logicalText`：官方预处理后的逻辑文本，或者经过防二次预处理保护的逻辑文本。
- `lineOrigins`：每个 logical line 对应的 origin 信息。
- `sourceFiles`：参与构造的原始 source file table。
- `generatedLines` 或 `controlLines`：例如 leveloffset 注入的行，不能伪装成真实 source line。
- `columnMaps`：当某些行被 indent 或其它变换改写时，记录 logical column 到 origin column 的映射；没有 mapping 时，不输出精确 column。
- `diagnostics`：当官方 Reader 能输出文本但不能给出足够可信的 physical origin 时，明确降级。

这个层的核心价值是：include 的文本语义由官方负责，回源真实性由我们负责。这样不会陷入“复刻完整 include reducer”，也不会放弃 10 号书最重要的 source coordinate 目标。

## 支持能力应该分级，而不是一口吞完整 include

为了不掉进边缘 case，include 支持不能用“全部支持/全部不支持”来设计。应该按可证明的 source mapping 精度分级。

A级：精确支持。

包括空 attrlist full-file include，以及官方 Reader 能给出一行对一行真实物理坐标的普通 include。对这些行，可以保持现有 10 号书模型：logical line 原样来自 origin line，column 不变，raw recovery 精确。

B级：官方文本支持，origin 尽量精确。

包括简单 `tag=main`、简单 `lines=2..5`。这些语义会改变行集，但没有改写行文本。理论上 column 仍然不变，问题在于 selected logical line 到 physical line 的映射。这里不能直接相信 Reader cursor 的 line number，至少对 tag/lines 要自己补一个“小而专门”的 mapping：读取目标文件，按官方选择规则计算被选择的原始 physical lines，再把 Reader 输出行与 physical lines 对齐。

这不是复刻完整 parser。它只是在官方已经决定 include 目标和 attrlist 后，为了 line origin 补 tag/lines 的 source mapping。范围比完整 reducer 小得多。

C级：文本可支持，但 column/raw 降级。

典型是 `indent`。官方 Reader 可以给出正确 logical text，但行文本被改写，column 不再自然继承。如果没有 column map，就不能输出 xref sourceSpan 的精确 column。可以选择支持渲染/结构，但对该行上的 inline occurrence sourceSpan 降级；或者实现 `indent` 的 column map，因为 indent 的映射规则相对简单：logical column 减去增加的 indent 后对应 origin column，前置缩进区域没有 origin column。

D级：结构控制行/生成行。

典型是 `leveloffset`。它不是目标文件真实行，而是官方预处理器注入控制行，并影响后续 section level。这个不能塞进现有 `LineOrigin`。需要扩展 line origin 类型，允许 `originKind: "generated" | "source"`，或者在 logical text 中保留控制行但明确它们没有 origin source coordinate。Parser 看到这些行是为了得到正确 AST；下游 raw recovery 不能把它们当真实文件行。

E级：安全或外部资源边界。

URI include、encoding、custom IncludeProcessor、复杂安全模式属于这个层级。这里不应该急着承诺完整支持。可以先明确 book-entry 默认只允许 documentRoot 内本地文件。即使官方 Reader 支持 URI，也不代表 `asciidoc-abundant-tree` 要允许它进入 source set。因为 source file reconstruction surface 要输出完整原始文本，URI 缓存、稳定性、安全性都是另一个对象。

这个分级的好处是：我们不再因为 `tag=main` 这种常见官方语法直接失败，但也不假装所有 include 都完整精确。每个能力都有对应的 source mapping 质量。

## 最小有价值升级是什么

结合这次 `asciidoc-multi-book-workspace` 的实际问题，最小有价值升级不是“完整支持所有 include”，而是让 book-entry 对合法的 source snippet include 不再整书失败。

具体说，`include::../examples/minimal-tool.mjs[tag=main]` 的 target 是 `.mjs`，它出现在 source block 内，目的不是贡献书籍章节结构，而是贡献 listing 内容。当前严格 full-file resolver 把它当 construction error，导致整本书 page map fallback。更好的行为是：让官方 Reader 展开它，或者至少让结构提取不因它失败。

如果走官方预处理观察层，这个 include 会自然变成 listing block 的代码行。对 reader page map 来说，章节结构仍然可用；对 listing raw/source coordinate 来说，可以选择降级或补 mapping。这个行为比 cover-only fallback 好很多。

如果短期不重构整个 book-entry pipeline，也可以做一个过渡设计：在现有 resolver 里，只把 `.adoc` 空 attrlist include 当结构 include；遇到非 `.adoc` target 或 attrlist include，不作为 construction error，而是保留原行或 escaped line，并发 diagnostic。这个过渡方案能减少 page map fallback，但它不等价于官方输出，因为 code include 不会展开。它适合临时止血，不适合作为长期正确模型。

长期正确模型仍然应该是官方 Reader/AST 参与。

## “官方 AST 一次 parse”还是“官方 Reader 构造 logical text”

这里有两个可行方向，我现在更倾向于后者作为主线，前者作为参考或未来重构。

官方 AST 一次 parse的优点是避免二次预处理。让 Asciidoctor 直接 `loadFile()`，官方处理 include、生成 AST 和 sourcemap。缺点是它会把回源坐标部分交给 Asciidoctor sourcemap，而 10 号书当时明确不想依赖这个。我的探针也显示 AST source location 有些块会回到 include directive 行，不一定精确到我们想要的 raw recovery。比如 included paragraph 有时 source location 指向 entry include 行，而不是 included file 的真实内容行。这个方向可能最终健康，但需要大改 source interval resolver，把 official AST source location 和 origin table 融合，而不是单独相信 AST。

官方 Reader 构造 logical text的优点是更接近 10 号书现有模型。我们仍然给 parser 一个 logical text，仍然保留 line origin table，仍然让 parser core 从 logical line 映射回 origin。变化是 logical text 的 include expansion 不再由手写 resolver 负责，而由官方 Reader 负责。缺点是二次预处理和 generated lines 需要处理。

我更倾向这个方向，因为它保留了 10 号书的主对象：logical document + line origin。我们只是把 include resolution 的文本语义从手写代码迁移到官方 Reader，同时扩展 line origin 模型以描述 source/generated/transformed 行。

## 必须改的模型：LineOrigin 不能只有 sourceLine

当前 `LineOrigin` 是：

```ts
logicalLine: number
absolutePath: string
relativePath: string
sourceLine: number
```

这个形状只适合 full-file 原样复制。要支持更多 include，它需要表达更多事实。至少要能区分：

- source line：来自某个原始文件某一行，文本未改写，column 可继承。
- selected source line：来自某个原始文件某一行，行集被选择过，但文本未改写，column 可继承。
- transformed source line：来自某个原始文件某一行，但文本被 indent 等改写，需要 column map。
- generated control line：例如 leveloffset 控制行，没有原始 physical source line，不能用于 raw recovery。
- unresolved or degraded line：官方能解析，但我们无法证明精确 origin，source coordinate 应缺失并 diagnostic。

这不是为了复杂而复杂，而是因为完整 include 的真实语义已经超过了旧 `LineOrigin` 的表达力。继续硬塞只会制造假精确。

## 怎么避免陷入大量边缘 case

关键是不要把目标定义成“实现 Asciidoctor include”。目标应该定义成：“消费官方预处理结果，并为 `asciidoc-abundant-tree` 需要的 source coordinate 建立可验证映射”。

这意味着：

- include 识别、路径解析、安全模式、tag/lines 文本输出，尽量交给官方 Reader。
- 我们只补 source mapping，不补完整预处理语义。
- 对无法证明映射的情况，输出 diagnostic，不输出假 coordinate。
- 默认支持本地 documentRoot 内文件，不急着支持 URI/custom include processor。
- 对最常见且可控的能力先做精确支持：full-file、tag、lines。
- 对会改写 column 的能力先降级或显式 column map：indent。
- 对会注入控制行的能力扩展 line origin 类型：leveloffset。
- 对 optional missing include 按官方行为处理，但 source set 中不加入 missing target。

这样就不会变成“复刻 reducer”。我们依赖官方决定 include 之后的文本是什么；我们只决定这些文本是否能回源，怎么回源，不能回源时怎么诚实降级。

## 对 10 号书应该怎么改

10 号书不是要推翻，而是要升级。它的核心目标保留，但“本对象只定义 full-file include resolution”这一段应该改成“本对象使用官方 preprocessor 语义构造 logical document，并按 source mapping 等级恢复 line origin”。

具体说，旧的 `Unsupported Attrlist` 一节不应该继续把所有 attrlist 都列为 construction error。它应该改成类似：

- attrlist include 不得静默按 full-file include 处理。
- 支持的 attrlist 必须定义 logical text、line origin、column map 或降级规则。
- `tag/tags`、`lines` 属于 supported selected-line include，要求物理行映射。
- `indent` 属于 transformed-line include，要求 column map 或 sourceSpan 降级。
- `leveloffset` 属于 generated-control include，要求 generated line origin。
- 未建模 attrlist 或无法验证 mapping 的 include 进入 diagnostic；是否阻止 document 成立取决于调用 mode 的严格性。

“Asciidoctor 调用不得再次展开 include”这一段也要重写。旧设计是因为 include resolution 已由自家 pipeline 完成。新设计可以是：book-entry pipeline 可以通过 official Reader 执行一次预处理；parser core 解析 logical text 时必须禁用或防止第二次 include expansion。这里要明确处理 escaped include。比如官方 Reader 输出的 escaped include 行，需要在进入第二次 parse 前重新 escape，或者 parser core 使用一个不会再次 include 的 safe mode，同时又不把 include link 当成真实文本结构。这部分需要实验后定型。

“Line Preservation”也要升级。旧规则是所有非 include 行原样复制。新规则可以分成 source-preserving lines 和 transformed lines。source-preserving lines 继承 column；transformed lines 必须有 column map，否则不输出精确 column。

## 我现在的推荐判断

我现在不建议简单修改现有正则，让 `tag=main` 不报错。那只是把问题从显性失败变成隐性错误。

我也不建议立即承诺“完整支持官方 include”。完整 include 包含 URI、encoding、安全模式、custom include processors、复杂 attribute substitution 等，直接承诺会把工程拖大。

我建议把目标定义成：引入官方 Reader 驱动的 book-entry preprocessor observation，先支持本地 documentRoot 内 include 的常见官方子集，并为每一种 include 输出明确 source mapping 质量。

这个方向同时满足三个要求：

- 功能更完整：`tag=main`、`lines` 这类常见合法 include 不再直接让 book-entry 失败。
- 不陷入边缘 case：文本语义由官方 Reader 处理，我们不手写完整 include reducer。
- 保住 10 号书核心目标：任何 source coordinate 都必须可证明；不能证明就 diagnostic 或缺失，而不是假装精确。

## 回到这次实际报错

`asciidoc-multi-book-workspace` 现在的 reader page map fallback，是因为它把严格 book-entry parser 用在包含 code snippet include 的书稿上。短期可以在调用方接受 fallback，或者做一个宽容结构提取器。但从 `asciidoc-abundant-tree` 长期演进看，这正好暴露了 10 号书旧约束已经不够用了：它把所有 attrlist include 都挡在门外，会让现代 AsciiDoc 书稿里非常常见的 snippet include 破坏整书分析。

所以这不是“用户语法没问题，删掉检查”这么简单；也不是“当前规约说不支持，所以别管”。更准确的判断是：用户语法没问题，当前工具的旧设计边界已经碰到真实需求；应该升级 book-entry include 构造模型，让官方 Reader 负责预处理语义，我们负责 source mapping 真实性。

这是我现在更有信心的看法。10 号书告诉我们不能牺牲什么；这次 JS Reader 调查告诉我们现在可以少手写什么。新的设计应该把这两者合起来，而不是选一边否定另一边。
</Assistant>

<User id="4">
好，那我就采纳你的方案啊，采纳你的范围。那接下来你要思考啊，你要写一份非常详细的设计文档。这个设计文档它要达到什么效果？我会告诉你，一位新来的开发者是新的，这个开发者拿着你的文档，再加上现有的代码，他就能完美的丝滑开发下去，完整的兑现我们所需要的东西，我们的需求，我们的期望。 那你要思考这份文档你要怎么写？首先我会告诉你第一点，这份文档里面没有什么建议、大概、可能、至少，没有。你说一个苹果，人家就实现一个苹果。如果说你说是，至少两个苹果，人家就做半个呢？人家做100个呢？懂我意思吗？该讲的东西讲清楚。 然后呢？没有未来这种东西，没有。啊？他不需要知道未来，你告诉他也就是噪声，你只要告诉他目前现状是什么，期望的状态是什么，哎，就可以了，你不要告诉他什么，哎呀，未来怎么怎么样啊？ 他没有资格知道这些东西。你懂我意思吗？我跟你聊天，是不是聊天记录里面，弹窗里面，你可以跟我聊，聊这个什么官方啊整体怎么样啊？未来发展方向怎么样啊？什么什么什么了，这些你可以跟我说。但是按照你刚才的计划，你思考这份设计文档，你就确定，就直接确定下来，做什么东西？当前的状态是什么？期望的状态是什么？

\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\粉色大象与白熊.md
\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\关于言语沟通.adoc

这些文档读一下，写作规范也读一下啊。 你心里想的是什么呢？你以为说   

> 不要提

人家就不会提了吗？你说这句话本身不就让别人想到了吗？ 所以你仔细思考啊，关于这一份设计文档，你要怎么写？啊？它是一个self-container的啊，因为我直接把它发给下一个开发者，我直接把当前代码库甩给他，他就能开发，懂我意思吧？  你仔细思考一下啊，看一下你要怎么设计怎么安排，每一部分的内容、大纲是吧，以及为什么安排这个大纲的理由，设计依据、来源、理由、看法，以及你做这件事情的注意事项，等等等等，都告诉我。好，把你的这些东西都告诉我。就是你写这份文档，你要怎么做？你要怎么设计？和我对齐一下。啊，好，使用弹窗向我汇报不少于5,000字或者更多。啊，想好了再告诉我。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="5">
# 这份设计文档我会怎么写

我读完了你给的两份笔记，也读了语义写作纪律里的 object model、discourse construction、audit checklist。这里先和你对齐设计文档的写法，不进入正式实现，也不直接写设计正文。

我会把这份文档写成一份可执行的工程规约，而不是讨论稿、建议书、路线图、评审备忘录或聊天摘要。它的目标读者是一位没有参与我们对话的新开发者。这个开发者只拿到当前代码库和这份文档，就能知道：当前对象是什么，当前代码在哪里，当前行为是什么，目标行为是什么，哪些模型要改，哪些接口要出现，哪些诊断必须存在，哪些测试必须覆盖，完成状态如何验收。

文档里不放心理管理式语言，不写“不要陷入某某问题”这种会激活错误对象的句子。它会用正面定义来固定实现方向。例如不写“不要复刻完整 reducer”，而写“include 文本语义由 `@asciidoctor/core` Reader 产生；本项目只记录预处理输出、origin 证据、column 映射和诊断”。这样读者只看到要实现的对象，不需要先在脑子里构造一个错误方案再否定它。

文档里也不写“建议”“可能”“大概”“至少”“未来”“后续”这类词。每个句子都承担一个明确对象功能：定义、输入、输出、规则、不变量、数据形状、错误表面、测试契约、验收命令。需要保留设计依据时，它会写成对象理由，不写成作者过程。例如不写“当时因为做不到所以这么写”，而写“旧实现用 full-file include 维持 `logicalLine -> origin sourceLine` 的一对一映射；该映射无法表达 filtered、transformed、generated logical line”。

## 文档名称和位置

我会把正式文档放在 `docs/plan/` 下，而不是 `docs/superpowers/specs/`。原因是这个仓库已有设计文档和实现计划都在 `docs/plan/` 与 `docs/bookshelf/` 体系里，10 号书也是项目自己的规约资产。新文档应该进入项目已有设计语境，方便后续被书籍化或纳入 bookshelf。

文件名我会用一个对象名，而不是过程名。候选：

```text
docs/plan/book-entry-official-reader-include-preprocessing-design.md
```

这个名字表达三件事：对象是 book-entry，核心变化是 official Reader，主题是 include preprocessing。它不是“修复 tag=main 报错”，也不是“include 支持增强计划”。后者太像任务清单，不能承载完整对象设计。

## 写作总原则

这份文档会遵守四条写作规则。

第一，正面定义对象。每个章节先定义对象是什么，再给规则和数据形状。不会用大段排除邻近方案来建立边界。边界会用“scope surface”“accepted input”“output contract”“failure surface”表达。

第二，区分对象层和证据层。对象层写最终要实现的系统形状；证据层写当前代码和官方行为支撑这个设计的事实。证据不会混进核心定义里。例如官方 Reader 探针结果会出现在“Design Basis”或“Verified Runtime Facts”，不会写进 `LineOrigin` 的定义段。

第三，句子不携带过程噪音。不会写“这次”“现在我们”“以后可以”“为了先解决”。会写“Book-entry preprocessing produces a source-aware logical document”。中文主体也会保持同样风格：对象事实优先，过程叙事退后。

第四，示例只做实例化，不替代规则。比如 `include::../examples/minimal-tool.mjs[tag=main]` 会作为 tagged snippet include 的示例，但规则会单独定义：tagged include 产生 selected source lines；selected source lines 必须映射到 physical source lines；无法证明 physical mapping 的行不得输出 precise source coordinate。

## 文档结构总览

我会把文档分成十二个主章节。顺序不是随意安排，而是让新开发者从对象身份走到实现契约，最后走到测试验收。

结构如下：

```text
1. Purpose
2. Current State
3. Target State
4. Controlled Terms
5. Runtime Facts
6. Architecture
7. Data Model
8. Include Semantics Contract
9. Parsing and Recovery Pipeline
10. Diagnostics
11. Test Contract
12. Acceptance Criteria
Appendix A. Source Locations and Code Map
Appendix B. Example Fixtures
```

每一章的功能如下。

## 1. Purpose

这一章只定义文档要建成的对象，不讲历史，不讲动机散文。

核心句会类似：

```text
This design defines a book-entry preprocessing pipeline that delegates AsciiDoc include text semantics to `@asciidoctor/core` Reader and preserves `asciidoc-abundant-tree` source-coordinate guarantees through explicit origin records, generated-line records, column maps, and diagnostics.
```

中文版本会更贴近项目语境：

```text
本设计定义 book-entry preprocessing pipeline。该 pipeline 使用 `@asciidoctor/core` Reader 产生 include 预处理后的 logical document，并用 origin record、generated-line record、column map 和 diagnostic 保存 `asciidoc-abundant-tree` 的回源坐标契约。
```

这一章必须让新开发者知道：要做的不是单点修正 `include.unsupported-attrlist`，而是替换 book-entry logical source 的构造依据。include 文本语义归官方 Reader，回源真实性归本项目模型。

这一章不会写“不要复刻 reducer”。它会用正面句子表达职责分配：官方 Reader 产生文本语义；本项目产生 source mapping。

## 2. Current State

这一章定义当前代码状态。它必须精确列出文件、函数、当前行为和当前测试契约。

会覆盖这些事实：

- `src/book-entry/include-resolution.ts` 使用 `includeDirectivePattern` 识别完整行 include。
- `parseIncludeDirective()` 对 escaped include 返回 ordinary，对空 attrlist include 返回 include，对非空 attrlist 抛 `include.unsupported-attrlist`。
- `src/book-entry/logical-source-builder.ts` 的 `appendSourceFile()` 递归展开 include，构造 `logicalText`、`lineOrigins`、`sourceFiles`。
- `src/parser.ts` 在 `mode: "book-entry"` 下先调用 `buildLogicalSource()`，再调用 `adapter.loadSource(logicalSource.logicalText)`。
- `test/book-entry/include-resolution.test.ts` 和 `book-entry-negative.test.ts` 把 `tag=main`、`lines=1..4` 作为 unsupported attrlist 失败契约。
- 10 号书当前定义 full-file include，以保护 line origin 真实性。

这一章的作用是让新开发者不用猜当前代码。它不能写成“这个地方比较粗糙”。它会写对象事实：当前 builder 支持哪些 surface，拒绝哪些 surface，拒绝的错误 code 是什么。

## 3. Target State

这一章定义目标状态。它是全文的核心。它会把目标写成确定契约，不写愿望。

目标状态包括：

- Book-entry preprocessing 使用 official Reader 读取 entry file。
- Logical document 由 official Reader 的预处理输出构成。
- Include target resolution、tag filtering、line range filtering、indent insertion、leveloffset control insertion、optional missing include 行为由 official Reader 产生。
- 本项目记录每个 logical line 的 origin kind。
- Source-preserving line 继承 origin column。
- Selected line 映射到原始 physical source line。
- Transformed line 必须有 column map；没有 column map 的 occurrence 不输出 precise column。
- Generated control line 不拥有 source coordinate。
- Source file reconstruction 输出原始 source files，不输出 logical text 作为原始 source file。
- Parser core 解析 logical document 时不得执行第二次 include expansion。

这里会明确目标不是“解析更多 include 就算成功”，而是“官方文本语义 + 项目回源契约同时成立”。

这章也会明确最小支持集合，不使用模糊范围。比如：

```text
Supported local include attributes: `tag`, `tags`, `lines`, `indent`, `leveloffset`, `opts=optional`.
Unsupported include target class in this design: URI target.
```

如果确定不做 URI，就直接写 URI target 的处理规则，例如 diagnostic code。不会写“暂不支持 URI”这种时间性表达。

## 4. Controlled Terms

这一章定义术语，防止新开发者把概念混在一起。

术语会包括：

- `book-entry preprocessing pipeline`
- `official Reader`
- `logical document`
- `logical line`
- `source-preserving line`
- `selected source line`
- `transformed source line`
- `generated control line`
- `origin record`
- `column map`
- `source set`
- `source reconstruction surface`
- `precise source coordinate`
- `degraded source coordinate`

这里要特别定义 `generated control line`，因为 `leveloffset` 会产生这种对象。旧 `LineOrigin` 类型表达不了它。如果术语不先定义，后面数据模型会变得含糊。

这一章也会把 `include directive` 定义为 AsciiDoc preprocessor surface，而不是 book structure edge。然后在具体章节定义“book-entry source set 如何收集参与文件”。这能避免开发者继续把每个 include 当章节图边。

## 5. Runtime Facts

这一章保存已经验证过的运行时事实。它不是聊天摘要，而是设计依据。

会列出：

- `@asciidoctor/core` 版本来自当前依赖，当前项目为 3.0.4。
- `Reader.readLine()` 触发 preprocessor。
- `Reader.getCursor()` 提供 file、directory、path、line number。
- `safe: secure` 禁用 include 并生成 include link。
- `safe: unsafe` 展开本地 include。
- source/listing block 内 include 被 official Reader 处理。
- `tag=main` 输出 tagged region。
- `lines` 输出 selected line ranges。
- `indent` 改写 logical text 的前置空白。
- `leveloffset` 插入 generated control lines。
- `opts=optional` 对 missing include 不产生 included source file。
- escaped include 经 official Reader 输出后不再带反斜杠，因此进入 parser 前需要防止二次 expansion。
- Reader cursor 对 complex tag/lines 的 line number 不作为唯一 physical origin 依据。

这章的理由是：新开发者需要知道哪些结论已经验证，哪些设计约束来自验证。它不会写“我试了一下”。它会写“Runtime fact”。如果正式文档里要放命令，可以放 compact probe 或引用测试 fixture，但不能把文档变成实验日志。

## 6. Architecture

这一章定义模块结构和数据流。它会直接告诉开发者要改哪些模块、引入哪些边界。

目标架构会是：

```text
entry file
  -> official-reader-preprocessor
  -> source-aware logical document
  -> parser core with include expansion disabled
  -> origin-aware source recovery
  -> AbundantDocument
```

模块层会设计成：

- `src/book-entry/official-reader-preprocessor.ts`
- `src/book-entry/include-attribute-model.ts`
- `src/book-entry/line-origin-model.ts`
- `src/book-entry/column-map.ts`
- `src/book-entry/source-set.ts`
- 修改 `src/book-entry/logical-source-builder.ts` 或替换它的职责。
- 修改 `src/parser.ts` 的 book-entry path。
- 修改 recovery 相关模块，使它消费扩展后的 origin record。

我会在文档里明确每个模块的职责和禁止跨界的责任，但不用“不要”句式，而用正面职责描述。例如：

```text
`official-reader-preprocessor.ts` owns official Reader execution and emits logical line records.
`source-set.ts` owns documentRoot-relative source file registration.
`column-map.ts` owns logical-column to origin-column translation for transformed lines.
```

## 7. Data Model

这一章是实现能不能丝滑推进的关键。旧 `LineOrigin` 不够表达新对象，所以文档必须给出明确类型草案。

我会定义类似这些类型：

```ts
type LogicalLineRecord =
  | SourcePreservingLineRecord
  | SelectedSourceLineRecord
  | TransformedSourceLineRecord
  | GeneratedControlLineRecord
  | DegradedLineRecord;
```

每种 record 必须说明字段、不变量、source coordinate 行为。

`SourcePreservingLineRecord`：

- 有 `absolutePath`、`relativePath`、`sourceLine`。
- `logicalText === originLineText`。
- `columnMap.kind === "identity"`。

`SelectedSourceLineRecord`：

- 有真实 physical `sourceLine`。
- 行文本未改写。
- column identity 成立。
- 由 `tag/tags` 或 `lines` 产生。

`TransformedSourceLineRecord`：

- 有真实 physical `sourceLine`。
- 有 `logicalText` 和 `originText`。
- 必须有 `columnMap`。
- `indent` 产生的 record 使用 indent column map。

`GeneratedControlLineRecord`：

- 没有 `sourceLine`。
- 有 `generatedKind`，例如 `leveloffset-push`、`leveloffset-pop`。
- 不输出 source coordinate。
- 允许 parser 消费它。

`DegradedLineRecord`：

- 有 logical text。
- 有 diagnostic code。
- 不输出 precise source coordinate。

这一章还会定义 `SourceFileRecord` 保持原始文本，不记录 generated lines。source reconstruction surface 只输出 source files。

## 8. Include Semantics Contract

这一章逐项定义 include 支持面。它必须写成表格或分节，不能靠散文。

每一项都有四列：

```text
Surface | Official text source | Origin mapping | Diagnostic behavior
```

会覆盖：

- `include::path.adoc[]`
- `include::path.adoc[tag=name]`
- `include::path.adoc[tags=a;b;!c]`
- `include::path.adoc[lines=2..5]`
- `include::path.adoc[lines="1..3,8"]`
- `include::path.txt[indent=2]`
- `include::path.adoc[leveloffset=+1]`
- `include::missing.adoc[opts=optional]`
- escaped include
- URI target
- target outside `documentRoot`
- missing target without optional

这里会明确：URI target 在本设计里产生 diagnostic，不进入 source set。target outside `documentRoot` 是 construction error。missing target without optional 是 construction error 或 official error promoted to construction error，取决于我们最终选择；文档会定一个，不写两种。

对于 `tag/tags` 和 `lines`，文档会要求 source mapper 读取目标文件，按 include attrlist 计算 physical line list，不能只用 Reader cursor line number。这样能避免我探针里看到的 cursor 压缩问题。

对于 `indent`，文档会要求建立 column map。没有 column map 不通过验收。

对于 `leveloffset`，文档会要求 generated control line record。它不参与 source reconstruction，不输出 origin source coordinate。

## 9. Parsing and Recovery Pipeline

这一章定义从 logical line record 到 `AbundantDocument` 的完整数据流。

必须讲清楚二次 include expansion 如何处理。这个问题不能留给开发者猜。

我倾向在设计里规定：official Reader 产出的 logical document 在进入 parser core 前进行 include re-escaping pass。该 pass 只处理来自 escaped include 的 literal include line，使用 record metadata 标识，不靠文本猜测。这样可以保持作者想显示的 `include::...[]` 文本，同时防止 Asciidoctor 第二次展开。

另一种方式是让 parser core 用 safe mode 禁止 include，但 secure mode 会把 include directive 转成 link，可能污染 AST；所以我不会把它作为主设计，除非验证它不会破坏当前 parser。按目前证据，re-escaping pass 更直接。

这一章还会定义 source recovery：

- section heading source coordinate 从 logical line record 映射。
- xref occurrence sourceSpan 通过 column map 映射。
- block raw recovery 要检查 block span 中 line records 的 origin compatibility。
- 多 source file block 不输出假 raw，产生 diagnostic。
- generated control lines 不进入 raw recovery。

## 10. Diagnostics

这一章定义错误和降级，不写泛泛“报错”。每个 diagnostic 都有 code、level、trigger、source surface、effect。

可能的 code：

- `include.outside-document-root`
- `include.missing-target`
- `include.uri-target-unsupported`
- `include.origin-map-unresolved`
- `include.generated-line-origin`
- `include.column-map-missing`
- `include.double-preprocess-guard-failed`
- `source-coordinate.degraded`
- `block-origin.multi-source-span`

旧 `include.unsupported-attrlist` 要么被删除，要么只保留给真正未建模 attrlist。它不能继续覆盖 `tag`、`lines`、`indent`、`leveloffset` 这些设计明确支持的 surface。

这里会规定哪些 diagnostic 阻止 document 成立，哪些允许 `AbundantDocument` 成功但缺失 precise coordinate。这个边界非常重要。

## 11. Test Contract

这一章要让新开发者知道测试怎么写。不是“增加测试”，而是每个对象有对应测试。

测试分组：

1. Official reader preprocessing tests。
2. Include attribute origin mapping tests。
3. Column map tests。
4. Generated control line tests。
5. Parser integration tests。
6. Source coordinate recovery tests。
7. RDF12 source reconstruction tests。
8. Regression tests。
9. Workspace integration fixture test。

必须包含这次触发问题的 fixture：source block 中 `include::../examples/minimal-tool.mjs[tag=main]`。验收不是“构建不报错”而是：book-entry parse 成功，章节 page map 可生成，listing 内容来自 tagged region，source coordinate 对 code include 行按设计输出或降级。

还要包含 escaped include 二次预处理测试：作者写 `\include::escaped.adoc[]`，目标文件存在，parse 后不得展开目标文件。

还要包含 `lines="1..3,8"` 这种不连续 ranges，证明 physical sourceLine 正确，不用 Reader 压缩 line number。

## 12. Acceptance Criteria

这一章只写完成判据。它会列出命令和必需结果。

包括：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:coverage
pnpm smoke:cli
```

如果还要验证 `asciidoc-multi-book-workspace`，会列出跨项目 fixture 或本地 link 方式。但正式文档要小心不要把另一个项目的临时状态写成核心验收。可以写成 integration acceptance：使用包含 tagged source include 的 book-entry fixture 验证 parse 成功。

## Appendix A. Source Locations and Code Map

这个附录列出当前代码路径、函数和测试文件。它是给新开发者快速定位用的，不占核心规则位置。

会列：

- `src/book-entry/include-resolution.ts`
- `src/book-entry/logical-source-builder.ts`
- `src/parser.ts`
- `src/asciidoctor-adapter.ts`
- `src/source-surfaces.ts`
- `src/source-interval-resolver.ts`
- `src/rdf12-projection/source-file-projector.ts`
- `test/book-entry/*`
- `test/parser-include-source-map.test.ts`

## Appendix B. Example Fixtures

这个附录列出应创建的 fixture 文件结构。比如：

```text
test/book-entry/fixtures/official-reader-include/
  book.adoc
  chapters/01-main.adoc
  examples/minimal-tool.mjs
  snippets/tagged.adoc
  snippets/lines.adoc
  escaped-target.adoc
```

每个 fixture 要有明确验证对象，不把多个无关 case 混在一个文件里。

## 文档内部的理由如何安排

你要求“设计依据、来源、理由、看法”也要告诉你。我在正式文档里会把理由放在 `Design Basis` 或每章的 `Object Rationale` 小段里，但不会让理由压过规则。

理由写法会是：

```text
`tag` and `lines` alter the included line set without altering selected line text. The source mapper therefore computes physical line selections from the target file and maps logical columns by identity.
```

这个理由解释了为什么能支持 tag/lines。它不是过程叙事。

对于 `indent`：

```text
`indent` alters leading whitespace. A transformed line requires a column map before inline sourceSpan can be emitted.
```

对于 `leveloffset`：

```text
`leveloffset` emits control lines consumed by the parser. Control lines are generated records and do not carry origin source coordinates.
```

这种写法直接告诉开发者实现理由和对象规则。

## 文档审查方式

正式文档写完后，我会按语义写作纪律做一次自审。

检查项包括：

- 每个定义句是否是 timeless object fact。
- 是否有“建议、可能、大概、至少、未来、后续”之类范围漂移词。
- 是否有否定式心理管理语言。
- 每个章节是否有明确 nucleus。
- 示例是否只是实例化规则。
- diagnostic 是否有 trigger 和 effect。
- 数据模型是否能覆盖所有声明支持的 include surface。
- 测试契约是否对应每个对象规则。
- 验收命令是否明确。

这份文档要达到的状态是：新开发者可以按章节转成实现任务，而不需要问“这里到底要不要做”。

## 我对正式文档的最终写作姿态

正式文档会是一份规约，不是一份讨论记录。它会保留 10 号书的核心精神：logical document、source set、line origin、origin raw recovery、diagnostic honesty。它会改变 10 号书的旧技术边界：full-file include 不再是唯一支持表面；official Reader 成为 include text semantics 的来源；line origin 模型扩展为能表达 selected、transformed、generated logical lines。

这份文档的重点不是说服读者，而是约束实现。它不需要新开发者知道我们怎么聊到这里；它只需要让新开发者知道对象是什么、代码怎么变、测试怎么证明、什么结果算完成。
</Assistant>
