# AsciiDoc AST Viewer 正式开工前规约

这份说明是开工前的正式规约。它把我们前面讨论过的事实、边界、依据、设计理由、字段含义、测试样例、风险控制和执行顺序全部收束成一套确定方案。接下来如果你批准，我会按这份规约写失败测试，然后实现，不再临场改变对象边界。

## 0. 当前结论

当前要做的不是“换一个 npm 包”，而是把 `notes/关于AsciiDoc/asciidoc-ast-viewer` 改造成一个单文件 AsciiDoc 结构树恢复器。

它读取一个 `.adoc` 文件，输出一棵接近 docutils / MyST `pformat()` 的树。这棵树保留两类事实：

```text
source layer：原始语法表面、raw、line、span、source_span、metadata 表面、xref occurrence。
asciidoctor layer：官方 Asciidoctor.js 给出的 block 结构、section 层级、id、title、refs catalog、官方 xref href/reftext。
```

这棵树不做 lint，不做图投影，不做跨文件工程解析，不判断写法好坏。它只恢复当前单文件中的结构事实，并把官方已经给出的处理结果作为带来源标记的字段放进去。

一句话版本：

```text
用 Asciidoctor.js 取得官方单文件结构骨架和官方绑定结果，用原文 span enhancer 恢复 CST-like raw surface，把两层事实并排投影成 pformat-style tree。
```

## 1. 人工制品边界

当前人工制品是 CLI：

```bash
pnpm ast
pnpm ast samples/资料1.adoc
pnpm ast samples/interdocument-xref.adoc
```

输入是一个 AsciiDoc 文件。输出是这个文件的结构树文本。它的直接消费者是人和后续程序：你可以直接看输出；后续图投影器、lint、引用分析器、作用域解释器也可以消费输出。

当前对象不负责：

- 不负责生成 HTML/PDF/站点。
- 不负责跨文件构建。
- 不负责打开被 xref 指向的其他 `.adoc` 文件。
- 不负责判断引用是否“推荐”或“不推荐”。
- 不负责给自然标题引用做风格建议。
- 不负责构造最终图模型。
- 不负责解释业务语义。
- 不负责完整恢复 strong/emphasis/literal 等全部 inline formatting AST。

当前对象负责：

- 单文件读取。
- document title。
- section 层级。
- section id、title、level、span、title_span。
- block metadata raw surface。
- listing/table/paragraph 的官方 block 结构。
- listing/table 的 id/title/language/rows/source。
- refs catalog。
- xref occurrence 的 raw、syntax、target、label、source_span。
- inline anchor occurrence 的 raw、ids、source_span。
- Asciidoctor 官方 xref href/reftext/resolved id/resolved type。
- 输出 pformat-style tree。

这个边界是为了让“第一棵树”干净。后续解释器可以建立在它之上，而不是被它提前替代。

## 2. 官方 parser 选择

使用 `@asciidoctor/core@3.0.4`。

依据：

- 它是 Asciidoctor 官方 JavaScript core 包。
- npm 描述是 `Asciidoctor - the core library`。
- 包 README 写明它提供 parser、built-in converters、extensions。
- 它对应官方仓库 `https://github.com/asciidoctor/asciidoctor.js`。
- 本地验证它能正确解析 `samples/资料1.adoc` 的 document title、section、listing、table、refs catalog。

不使用 `@ggrossetie/haddock` 的原因：

- Haddock 对 AsciiDoc 常用语法支持不完整。
- 它不能稳定提供 section 容器。
- 它不能把 block metadata 稳定吸附到主体 block。
- 它不能完整覆盖 `<<...>>`、`[[...]]` 等我们当前关心的引用/锚点表面。
- 继续围绕 Haddock 补派生规则，会把项目变成对不完整 parser 的补丁集合。

不使用其他 npm parser 的原因：

- npm 搜索中存在 `@friends-library/parser`、`gitbook-asciidoc`、`@honkit/asciidoc` 等，但它们不是 Asciidoctor 官方 core parser。
- `@antora/asciidoc-loader` 是 Antora pipeline 的 loader，它仍然以 Asciidoctor Document object 为核心，不适合当前小工具直接替代 core。
- 当前需求是官方主流 AsciiDoc 解析，不是某个站点框架或 GitBook/HonKit 生态解析。

## 3. HTML fragment parser 选择

使用 `parse5@8.0.1`。

理由：Asciidoctor 的普通 paragraph 不暴露完整 inline AST，但 `block.getContent()` 会返回经过官方 inline substitutions 后的 HTML fragment。为了结构化读取官方生成的 `<a href="...">`，需要 HTML parser。项目约定也要求结构化文本优先用结构化解析器，不用正则硬解析 HTML。

`parse5` 只负责解析 Asciidoctor 生成的 HTML fragment。它不解析 AsciiDoc，不决定 block 结构，不解释 xref 语义。

它的职责很窄：

```text
输入：Asciidoctor block.getContent() 的 HTML fragment。
输出：文档顺序中的 <a> 元素、href、id、文本内容。
用途：提取官方 xref 绑定结果。
```

## 4. 官方解析器的耦合事实

Asciidoctor.js 不是纯 CST parser。它在 parse/load/convert 过程中已经做了语言解释。这个事实必须正面承认。

已确认的耦合点：

1. heading 被解释成 section 节点。
2. section 层级由官方 parser 维护。
3. `[#id]`、`.title`、`[source,python]` 会被吸附到后续 block。
4. 自动 section id 会生成，例如 `== 1. 引言` 生成 `_1_引言`。
5. refs catalog 会建立，包含 section、listing、table、inline anchor。
6. inline xref 的 href/reftext 会在 conversion-time inline substitutions 中生成。
7. ordinary paragraph 不提供完整 inline children AST。

因此当前工具不能假装拿到的是纯 CST。正确做法是把官方结果标记为官方层字段，同时补回 raw 层字段。

字段命名规则：

```text
raw/source/span/syntax/target/label        -> source layer
asciidoctor_*                              -> official Asciidoctor layer
```

例如：

```text
<xref raw="<<3. 核心引擎设计>>" target="3. 核心引擎设计" asciidoctor_href="#_3_核心引擎设计" asciidoctor_resolved_id="_3_核心引擎设计">
```

这样下游消费者可以选择信任官方绑定，也可以忽略官方字段重新解释 raw。

## 5. 单文件模式

工具以单文件为边界。

加载策略：

```js
asciidoctor.loadFile(inputPath, {
  safe: 'secure',
  sourcemap: true,
  to_file: false,
})
```

同时工具会自己读取原始文件文本，建立 line table，用于 raw/span/source_span。

使用 `safe: 'secure'` 的理由：

- 当前对象是单文件结构恢复器。
- `secure` 更接近“不展开外部文件、不让 include 改变当前文件树”的边界。
- 对当前样例，`safe` 与 `secure` 下 section/id/ref catalog 结果一致，我已经验证过。
- 如果后续源文件包含 include，当前工具仍然应当把它作为当前文件内的语法表面处理，而不是变成跨文件构建器。

输出中会明确：

```text
<document source="samples/资料1.adoc" mode="single-file" parser="@asciidoctor/core" parser_version="3.0.4">
```

## 6. 第一棵树不做诊断

你明确指出：第一棵树是结构恢复，不是解释器。这个判断进入规约。

因此：

- 输出树里不默认放 `<diagnostic>` 节点。
- 不判断引用是否稳定。
- 不判断自然标题引用是否应该改写。
- 不判断跨文件引用是否能解析成功。
- 不判断列表是不是“写错了”。

如果工具内部抽取失败，例如 source occurrence 与 official anchor 无法按 block 对齐，那是工具自身错误，不是文档诊断。CLI 可以抛错，测试应该失败，但不把它伪装成文档树的一部分。

如果官方没有给出本地绑定，树可以这样表达事实：

```text
<xref raw="..." target="..." scope="external" asciidoctor_href="other.html#target">
```

这不是说它对或错，只是说它不属于当前文件 refs catalog。

## 7. source span 是公共契约

raw 和 span 不是调试信息。它们是当前工具的核心输出。

节点字段规则：

```text
line="N"                 节点官方起始行或 occurrence 起始行。
span="A:B"               源文件行范围，闭区间。
source_span="L:C-L:C"    行列范围，用于 inline occurrence。
raw="..."                原始语法片段。
```

行号采用 1-based。列号采用 1-based Unicode code point column。闭区间是否包含结束列，实现在测试里固定。为了人类阅读，我会采用“start 到 end 均指向原文片段覆盖范围”的表达，而不是半开区间术语。

为什么需要 span enhancer：Asciidoctor 的 sourcemap 不提供完整 CST span。

已验证：listing 的 `getSourceLocation()` 是 line 32，也就是 delimiter 行；`getSourceLines()` 只给 line 33-35 的 literal 内容。但这个 block 的完整 raw span 是 line 29-36，包括：

```text
29 [#engine-code]
30 .曲率引擎启动序列
31 [source,python]
32 ----
33 def start_warp_drive():
34     print("Engaging warp drive...")
35     return True
36 ----
```

所以需要 source-span enhancer 从原文恢复：

```text
span="29:36"
metadata_span="29:31"
content_span="33:35"
```

section 也是类似。`[#section-basics]` 在 line 12，section heading 在 line 13。官方 section line 是 13，但完整 section 起点应包含 line 12 的 metadata。输出应表达：

```text
<section ids="section-basics" line="13" span="12:23" title_span="13:4-13:10">
    <metadata raw="[#section-basics]" line="12" source_span="12:1-12:17">
```

## 8. section 作用域规则

section 是当前树中最重要的作用域容器。图投影依赖它判断某个 block 或 xref 属于哪个标题。

section span 推导规则：

- section 的 title line 来自 Asciidoctor source location。
- 如果标题前有紧邻 metadata，例如 `[#id]` 或 `[[id]]`，section span 从 metadata line 开始。
- section span 结束于下一个同级或更高级 section 的前一行。
- 如果没有后续同级或更高级 section，结束于父 section 结束行或文档结束行。
- document title 对应 level 0 header，不和一级 section 混淆。

输出字段：

```text
<section ids="_3_核心引擎设计" names="3. 核心引擎设计" level="1" line="25" span="25:38" title_span="25:4-25:12" id_origin="asciidoctor-generated">
```

显式 id section：

```text
<section ids="section-basics" names="2. 基础概念" level="1" line="13" span="12:23" id_origin="source" id_source_span="12:1-12:17">
```

这里 `names` 使用标题文本，贴近 docutils pformat。

## 9. block metadata 规则

block metadata 必须原样保留，同时也保留官方解释后的属性。

metadata surface 包括当前范围内至少这些形式：

```text
[#id]
[id=id]
[[id]]
.title
[source,python]
[style#id.role,key=value]
```

当前实现不需要完整解释所有 attrlist 组合成最终语义，但要保留 raw，并尽量从官方 node attributes 中取出已经解释好的字段。

listing 输出目标：

```text
<listing ids="engine-code" names="曲率引擎启动序列" style="source" language="python" line="32" span="29:36" metadata_span="29:31" content_span="33:35">
    <metadata kind="id" raw="[#engine-code]" ids="engine-code" line="29" source_span="29:1-29:14">
    <metadata kind="title" raw=".曲率引擎启动序列" line="30" source_span="30:1-30:10">
    <metadata kind="attrlist" raw="[source,python]" line="31" source_span="31:1-31:15">
    <title>
        曲率引擎启动序列
    <literal_block xml:space="preserve" span="33:35">
        def start_warp_drive():
            print("Engaging warp drive...")
            return True
```

Table 输出目标：

```text
<table ids="perf-table" names="引擎性能指标对比" line="47" span="45:52" metadata_span="45:46">
    <metadata kind="id" raw="[#perf-table]" ids="perf-table" line="45">
    <metadata kind="title" raw=".引擎性能指标对比" line="46">
    <title>
        引擎性能指标对比
    <tgroup cols="3">
```

## 10. xref occurrence 规则

当前 xref scanner 负责识别 raw occurrence，不负责最终解释语义。它识别这些表面：

```text
<<target>>
<<target,label>>
xref:target[label]
[[id]]
[[id,reftext]]
anchor:id[]
```

分类规则：

- `<<...>>`：`syntax="shorthand"`。
- `xref:...[]`：`syntax="macro"`。
- `[[...]]`：作为 anchor occurrence，`syntax="double-bracket"`。
- `anchor:id[]`：作为 anchor occurrence，`syntax="macro"`。

对 `<<target,label>>`，raw 层提取：

```text
target="target"
label="label"
```

对 `<<target>>`，raw 层提取：

```text
target="target"
```

对 `xref:target[label]`，raw 层提取：

```text
target="target"
label="label"
```

`target_kind` 是词法级帮助字段，不是语义判断：

- target 含 `.adoc` 或 `#` 路径片段时可标 `document-target`。
- target 看起来是标题文本时可标 `natural-title-candidate`。
- 普通 id-like target 可标 `id-or-anchor`。

这个字段不替代官方绑定。

## 11. 官方 xref binding 规则

官方 binding 来自 Asciidoctor conversion result。

对每个可转换文本 block：

1. 读取 `block.getSource()`，扫描 raw xref occurrence。
2. 读取 `block.getContent()`，用 `parse5` 解析 HTML fragment。
3. 按文档顺序提取 `<a>`。
4. 对 `href` 以 `#` 开头的 `<a>`，标记为同文件官方绑定。
5. 对 `href` 不以 `#` 开头的 `<a>`，标记为外部官方链接。
6. 将同一个 block 内的 raw xref occurrence 与 official anchors 按顺序配对。
7. 用 `doc.getRefs()[id]` 给同文件绑定补 `asciidoctor_resolved_type`。

字段：

```text
asciidoctor_href="#engine-code"
asciidoctor_resolved_id="engine-code"
asciidoctor_resolved_type="listing"
asciidoctor_reftext="代码清单 3-1"
```

跨文档：

```text
asciidoctor_href="other.html#target"
scope="external"
```

注意：`scope="external"` 不是说错误，只是说该 href 不属于当前单文件 refs catalog。

## 12. 当前主样例 `samples/资料1.adoc`

这个样例必须作为核心验收输入。

它包含以下目标：

```text
_1_引言             section         generated id, title=1. 引言
section-basics      section         explicit id, title=2. 基础概念
_3_核心引擎设计     section         generated id, title=3. 核心引擎设计
engine-code         listing         explicit id, title=曲率引擎启动序列, language=python
troubleshooting     section         explicit id, title=4. 故障排除与数据
perf-table          table           explicit id, title=引擎性能指标对比
warning-text        inline_anchor   inline anchor in paragraph
conclusion-section  section         explicit id, title=5. 最终结论
```

它包含 8 个 xref usage：

```text
line 10: <<3. 核心引擎设计>>
line 10: <<conclusion-section, 最终结论>>
line 23: <<1. 引言>>
line 38: <<engine-code, 代码清单 3-1>>
line 54: <<perf-table>>
line 62: <<section-basics>>
line 63: xref:engine-code[查看 Python 脚本]
line 64: <<warning-text, 重力井的危险性>>
```

它包含 1 个 inline anchor occurrence：

```text
line 56: [[warning-text]]
```

这些必须全部输出。

## 13. 新增跨文档 xref 样例

你建议补一个跨文档交叉链接作为例子并测试。这个建议我采纳。

我会新增：

```text
samples/interdocument-xref.adoc
```

建议内容：

```asciidoc
= 单文件跨文档引用样例

== 本文件标题

这个本地引用指向 <<local-target, 本文件目标>>。

[#local-target]
== 本文件目标

这个跨文档引用指向 xref:other.adoc#remote-target[远程目标]。

这个跨文档短写引用指向 <<other.adoc#remote-target, 远程目标短写>>。
```

为什么加两个跨文档 occurrence：

- `xref:other.adoc#remote-target[远程目标]` 是官方文档推荐的 inter-document xref 形式。
- `<<other.adoc#remote-target, 远程目标短写>>` 我本地验证 Asciidoctor 也会生成 `other.html#remote-target`，但它不作为推荐核心语法，只作为我们 scanner 对 shorthand 形态的覆盖。

官方 inter-document xref 文档说明：

- inline xref macro 可以链接到其他 AsciiDoc 文档中的 ID。
- 形式是 `xref:document-b.adoc#section-b[Section B]`。
- 目标 ID 放在 `#` 后，`#` 前是目标文档名。
- interdocument xref 当前需要 link text。
- HTML backend 下默认把 `.adoc` 转成 `.html`。
- `relfilesuffix` 可以控制输出 suffix。

本地验证结果：

```text
xref:other.adoc#target[Other Target]
=> <a href="other.html#target">Other Target</a>
```

设置 `relfilesuffix: '.adoc'` 时：

```text
=> <a href="other.adoc#target">Other Target</a>
```

当前工具默认不设置 `relfilesuffix`，所以测试应锁定官方默认 `other.html#remote-target`。但 raw 层仍保留 `target="other.adoc#remote-target"`。

跨文档输出目标：

```text
<xref syntax="macro" raw="xref:other.adoc#remote-target[远程目标]" target="other.adoc#remote-target" label="远程目标" scope="external" asciidoctor_href="other.html#remote-target" asciidoctor_reftext="远程目标">
```

短写跨文档输出目标：

```text
<xref syntax="shorthand" raw="<<other.adoc#remote-target, 远程目标短写>>" target="other.adoc#remote-target" label="远程目标短写" scope="external" asciidoctor_href="other.html#remote-target" asciidoctor_reftext="远程目标短写">
```

这能明确单文件边界：我们不会去打开 `other.adoc`，但会保留 raw target 和官方 href。

## 14. 输出格式契约

输出是 pformat-style tree，不是严格 XML。

格式规则：

- 每个节点一行开始：`<node attr="value">`。
- 子内容缩进 4 个空格，贴近 docutils pformat。
- 文本内容独立缩进行。
- 属性值做 XML escaping。
- 不输出 closing tag，保持 pformat 风格。
- 节点名使用稳定小写名称：`document`、`section`、`title`、`paragraph`、`xref`、`anchor`、`metadata`、`listing`、`literal_block`、`table`、`tgroup`、`thead`、`tbody`、`row`、`entry`、`targets`、`target`。

示例骨架：

```text
<document source="samples/资料1.adoc" mode="single-file" parser="@asciidoctor/core" parser_version="3.0.4">
    <title line="1" source_span="1:3-1:23">
        宇宙探索器：AsciiDoc 交叉引用演示指南
    <section ids="_1_引言" names="1. 引言" level="1" line="8" span="8:10" id_origin="asciidoctor-generated">
        <title>
            1. 引言
        <paragraph line="10" span="10:10">
            欢迎阅读本指南。编写长篇技术文档时，我们经常需要指引读者跳转到文档的其他部分。例如，如果你想直接看核心代码，请跳转到
            <xref syntax="shorthand" raw="<<3. 核心引擎设计>>" target="3. 核心引擎设计" target_kind="natural-title-candidate" asciidoctor_href="#_3_核心引擎设计" asciidoctor_resolved_id="_3_核心引擎设计" asciidoctor_resolved_type="section" asciidoctor_reftext="3. 核心引擎设计">
```

## 15. ID origin 规则

每个可引用目标尽量标记 id 来源：

```text
id_origin="source"                 原文显式声明。
id_origin="asciidoctor-generated"  官方自动生成。
id_origin="unknown"                无法稳定判定。
```

判定方式：

- refs target 有对应 metadata raw `[#id]`、`[id=id]`、`[[id]]`、inline anchor occurrence，则 `source`。
- section id 没有显式 metadata，且来自标题自动生成，则 `asciidoctor-generated`。
- 复杂情况下无法判定，保守输出 `unknown`，但当前样例不应出现。

## 16. 表格输出规则

Table 使用 Asciidoctor 官方 table model，不用自己解析 raw table。

输出：

```text
<table ids="perf-table" names="引擎性能指标对比" line="47" span="45:52">
    <metadata kind="id" raw="[#perf-table]" line="45">
    <metadata kind="title" raw=".引擎性能指标对比" line="46">
    <title>
        引擎性能指标对比
    <tgroup cols="3">
        <thead>
            <row>
                <entry line="48">
                    状态
                <entry line="48">
                    能量消耗 (太瓦)
                <entry line="48">
                    稳定性
        <tbody>
            <row>
                <entry line="50">
                    待机
```

如果 Asciidoctor table cell 提供 source line，就打印 line。当前验证中 table_cell line 可取到 line 48、50、51。

## 17. paragraph 与普通文本规则

Paragraph 输出保留普通文本，并在 xref/anchor occurrence 位置插入节点。

实现上会用 scanner occurrence 的 offset 把原文切成：

```text
text segment
xref node
text segment
anchor node
text segment
```

不把所有 inline formatting 转成 AST。例如 `**警告**` 当前可以作为文本保留。原因是当前完整性目标是标题作用域与引用绑定，不是完整 inline formatting parser。

如果后续要把 `**strong**`、`_emphasis_`、`` `literal` `` 也恢复成节点，那是第二阶段人工制品，需要单独定义语法边界和验证样例。

## 18. 依赖与文件改动

预计改动：

```text
package.json
pnpm-lock.yaml
print-asciidoc-ast.mjs
README.md
src/*.mjs
test/*.test.mjs
samples/interdocument-xref.adoc
```

计划新增或重命名模块：

```text
src/asciidoctor-document.mjs
src/source-spans.mjs
src/xref-occurrences.mjs
src/asciidoctor-bindings.mjs
src/pformat-tree.mjs
```

也可能为了减少文件数合并相邻模块，但职责不变。

旧文件 `src/format-haddock-tree.mjs` 不应继续保留 Haddock 命名。如果保留旧名，会误导后续阅读。倾向于删除或替换为新命名 formatter。

依赖变化：

```json
"@asciidoctor/core": "3.0.4",
"parse5": "8.0.1"
```

移除：

```json
"@ggrossetie/haddock": "0.3.1"
```

## 19. TDD 测试计划

先写失败测试，再实现。

### 19.1 `资料1.adoc` 核心结构测试

断言：

- document title。
- top-level sections。
- explicit section ids。
- generated section ids。
- section spans。
- listing `engine-code`。
- listing metadata raw lines 29-31。
- listing content span 33-35。
- table `perf-table`。
- table metadata raw lines 45-46。
- inline anchor `warning-text`。
- targets catalog。

### 19.2 `资料1.adoc` xref 测试

断言 8 个 xref usage 全部出现，并且 raw/asciidoctor binding 正确：

```text
<<3. 核心引擎设计>>              -> asciidoctor_resolved_id="_3_核心引擎设计", type=section
<<conclusion-section, 最终结论>> -> conclusion-section, type=section
<<1. 引言>>                      -> _1_引言, type=section
<<engine-code, 代码清单 3-1>>    -> engine-code, type=listing
<<perf-table>>                   -> perf-table, type=table
<<section-basics>>               -> section-basics, type=section
xref:engine-code[查看 Python 脚本] -> engine-code, type=listing
<<warning-text, 重力井的危险性>> -> warning-text, type=inline_anchor
```

### 19.3 跨文档样例测试

新增 `samples/interdocument-xref.adoc`，断言：

- local xref 绑定到当前文件 target。
- interdocument macro xref 输出 `scope="external"`。
- interdocument macro xref 保留 raw target `other.adoc#remote-target`。
- official href 为 `other.html#remote-target`。
- shorthand interdocument xref 也保留 raw 和 official href。
- 工具不尝试读取 `other.adoc`。

### 19.4 输出风格测试

断言输出包含：

```text
<document
    <title
    <section
        <paragraph
            <xref
```

断言不再出现旧 Haddock 风格：

```text
heading type="block"
attributeReference type="inline"
```

### 19.5 默认样例回归测试

更新 `samples/default.adoc` 相关测试，让它验证新 pformat 输出。

### 19.6 structural payload 回归测试

更新 `samples/structural-payload.adoc` 测试，验证：

- section metadata raw。
- source JSON listing metadata raw。
- xref macro raw occurrence。
- official local binding。

## 20. 实现顺序

执行顺序固定如下：

1. 添加/修改测试，确认失败。
2. 更新依赖。
3. 实现 loader，使用 Asciidoctor.js 单文件加载。
4. 实现基础 pformat renderer，先输出 document/section/paragraph/listing/table。
5. 实现 source line table 与 span helpers。
6. 实现 metadata span recovery。
7. 实现 section scope span recovery。
8. 实现 xref/anchor occurrence scanner。
9. 实现 parse5 official anchor extraction。
10. 实现 occurrence 与 official binding 合成。
11. 实现 target catalog 输出。
12. 更新 README。
13. 运行 `pnpm test`。
14. 根据失败收敛实现。
15. 完成后弹窗汇报。

## 21. 风险与处理

### 风险 1：source span recovery 不可能 100% 覆盖所有 AsciiDoc 语法

处理：当前测试锁定我们关心的语法：section metadata、listing metadata、table metadata、paragraph xref、inline anchor、interdocument xref。未覆盖的复杂语法不宣称完整 CST。

### 风险 2：官方自动 id 未来版本变化

处理：锁定 `@asciidoctor/core@3.0.4`，测试固定当前行为。未来升级会由测试暴露变化。

### 风险 3：xref raw occurrence 与 official anchor 对齐失败

处理：这是工具内部错误，不是 AST 诊断。CLI 抛错，测试失败。不会在 pformat tree 里静默输出错误绑定。

### 风险 4：HTML fragment 里有普通链接

处理：local binding 只认 `href` 以 `#` 开头的 `<a>`。外部 href 保留为 `scope="external"`。

### 风险 5：Asciidoctor paragraph 把某些看似 list 的文本当 paragraph

处理：尊重官方 block tree，不擅自改成 list。`samples/资料1.adoc` 第 61-64 行就是这种情况，因为正文后没有空行，官方解析为 paragraph。工具会保留 paragraph source，并识别其中 xref。

### 风险 6：输出字段过多

处理：当前目标是结构观察和下游消费，不是最终用户阅读文档。raw/span/asciidoctor_* 字段是必要信息。README 会说明字段层次。

## 22. 成功标准

完成时必须满足：

1. `@ggrossetie/haddock` 已移除。
2. `@asciidoctor/core@3.0.4` 是 AsciiDoc 官方 parser。
3. `parse5@8.0.1` 用于 official HTML fragment anchor extraction。
4. CLI 仍是 `pnpm ast`。
5. 输出是 pformat-style tree。
6. `samples/资料1.adoc` 的 section scope 正确。
7. `samples/资料1.adoc` 的 listing/table metadata raw 与 official attributes 都保留。
8. `samples/资料1.adoc` 的 8 个 xref usage 全部输出。
9. `warning-text` inline anchor 输出为 occurrence 和 target。
10. 新增跨文档样例并测试 external xref。
11. 输出字段区分 source layer 与 asciidoctor layer。
12. 不做 lint 诊断。
13. `pnpm test` 通过。
14. README 更新，说明单文件边界和字段含义。
15. 完成后用弹窗汇报改动、测试结果、剩余边界。

## 23. 我现在仍然认为需要保留的确定边界

这份规约里没有留下需要实现时再猜的点。以下边界已经固定：

- 单文件，不跨文件读取 xref target。
- 官方 parser 是 `@asciidoctor/core`。
- HTML fragment parser 是 `parse5`。
- 输出不是严格 XML，而是 pformat-style tree。
- 第一棵树不做 lint。
- raw/span 是核心输出。
- official binding 字段必须带 `asciidoctor_` 前缀。
- target catalog 来自 `doc.getRefs()`。
- xref occurrence 来自 source scanner。
- xref binding 来自 Asciidoctor converted anchors。
- 跨文档 xref 要有测试样例。
- 当前不完整恢复 general inline formatting。
