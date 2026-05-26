# asciidoc-abundant-tree 验收标准与黑盒测试

本文定义 `asciidoc-abundant-tree` 的验收标准、黑盒测试面和完成条件。人工制品本体见 `asciidoc-abundant-tree 本体规约.md`。工程承载见 `asciidoc-abundant-tree 工程实现规约.md`。

## 1. 完成声明规则

完成声明必须同时满足三类证据：

- 对象证据：公共 TypeScript 模型、pretty text 序列化和 JSON 序列化符合本体规约。
- 行为证据：黑盒命令和 library API 测试通过。
- 工程证据：项目局部门禁和相关根门禁通过。

只完成 package scaffold 不能声明 abundant tree 已经完成。只输出 pretty text 不能声明机器消费契约完成。只输出 JSON 不能声明人工观察契约完成。只跑局部测试不能声明根工作区健康。

## 2. 初始化完成条件

初始化工作完成时必须满足：

- 项目 package 名是 `@micheng-ts-project/asciidoc-abundant-tree`。
- CLI bin 名是 `asciidoc-abundant-tree`。
- 根 catalog 包含 `@asciidoctor/core` 和 `parse5`。
- `projects/*/vitest.config.ts` 进入根 Vitest workspace。
- `projects/*/src/cli.ts` 进入 Knip entry。
- 项目存在 `package.json`、`tsconfig.json`、`tsdown.config.ts`、`vitest.config.ts`。
- 项目存在公共 TypeScript model 文件。
- CLI 参数面有测试。
- pretty text 和 JSON serializer 有最小对象测试。
- 完整 parser 未实现时，错误必须明确表达为未实现，不能返回伪造成功文档。

初始化完成不等于核心解析器完成。

## 3. 核心功能完成条件

核心解析器完成时必须满足：

- `parseAbundantTree({ sourcePath })` 返回 `AbundantDocument`。
- pretty text 和 JSON 均来自同一个 `AbundantDocument`。
- `samples/reference-links.adoc` 的 document title 被恢复。
- `samples/reference-links.adoc` 的 section tree 被恢复。
- explicit section id 被标记为 `idOrigin = "source"`。
- generated section id 被标记为 `idOrigin = "asciidoctor-generated"`。
- listing 的 id、title、language、metadataSpan、contentSpan 和 span 被恢复。
- table 的 id、title、rows 和 span 被恢复。
- inline anchor occurrence 被恢复。
- 8 个核心 xref occurrence 被恢复。
- local xref 的 official binding 被写入 official layer。
- interdocument xref 不读取外部文件。
- interdocument xref 保留 raw target 和 official href。
- target catalog 包含 section、listing、table 和 inline anchor。
- 工具错误不作为文档 tree 节点输出。

## 4. 黑盒 CLI 测试

### 4.1 Help

命令：

```bash
asciidoc-abundant-tree --help
```

期望：

- exit code 0。
- stdout 包含命令用法。
- stdout 包含 `--json`。
- stdout 包含 `--format tree|json`。

### 4.2 未传文件

命令：

```bash
asciidoc-abundant-tree
```

期望：

- exit code 1。
- stderr 或 structured error 表达缺少输入文件。
- 不输出成功文档。

### 4.3 默认 pretty text

命令：

```bash
asciidoc-abundant-tree samples/reference-links.adoc
```

期望：

- exit code 0。
- stdout 以 `<document` 开始。
- stdout 包含 `<title`。
- stdout 包含 `<section`。
- stdout 包含 `<xref`。
- stdout 不包含 JSON 顶层 `{`。

### 4.4 JSON 快捷入口

命令：

```bash
asciidoc-abundant-tree samples/reference-links.adoc --json
```

期望：

- exit code 0。
- stdout 是合法 JSON。
- JSON 顶层 `kind` 是 `document`。
- JSON 顶层 `mode` 是 `single-file`。
- JSON 顶层包含 `children`、`targets`、`xrefOccurrences` 和 `anchorOccurrences`。

### 4.5 显式 JSON 格式

命令：

```bash
asciidoc-abundant-tree samples/reference-links.adoc --format json
```

期望与 `--json` 等价。

### 4.6 显式 tree 格式

命令：

```bash
asciidoc-abundant-tree samples/reference-links.adoc --format tree
```

期望与默认 pretty text 等价。

### 4.7 非法格式

命令：

```bash
asciidoc-abundant-tree samples/reference-links.adoc --format xml
```

期望：

- exit code 1。
- 错误消息说明 format 只接受 `tree` 或 `json`。

### 4.8 文件不存在

命令：

```bash
asciidoc-abundant-tree samples/missing.adoc
```

期望：

- exit code 1。
- 错误消息包含文件不存在或无法读取。
- 不输出成功文档。

## 5. 黑盒 Library API 测试

### 5.1 Parse API

调用：

```ts
const document = parseAbundantTree({
	sourcePath: "samples/reference-links.adoc",
});
```

期望：

- `document.kind === "document"`。
- `document.mode === "single-file"`。
- `document.parser.name === "@asciidoctor/core"`。
- `document.children` 是数组。
- `document.targets` 是数组。
- `document.xrefOccurrences` 是数组。

### 5.2 Pretty Serializer

调用：

```ts
const output = formatAbundantTree(document);
```

期望：

- output 是字符串。
- output 包含 `<document`。
- output 包含 `<section`。
- output 包含 `<xref`。
- output 不要求是 XML。

### 5.3 JSON Serializer

调用：

```ts
const json = serializeAbundantTreeToJson(document);
```

期望：

- json 可由 `JSON.stringify` 序列化。
- json 不包含 `undefined` 字段。
- json 保留 source layer。
- json 保留 official layer。

## 6. 核心样例断言

`samples/reference-links.adoc` 必须产生以下 target：

```text
_1_引言             section         generated id
section-basics      section         explicit id
_3_核心引擎设计     section         generated id
engine-code         listing         explicit id
troubleshooting     section         explicit id
perf-table          table           explicit id
warning-text        inline-anchor   inline anchor
conclusion-section  section         explicit id
```

必须产生以下 xref occurrence：

```text
<<3. 核心引擎设计>>
<<conclusion-section, 最终结论>>
<<1. 引言>>
<<engine-code, 代码清单 3-1>>
<<perf-table>>
<<section-basics>>
xref:engine-code[查看 Python 脚本]
<<warning-text, 重力井的危险性>>
```

必须产生以下 anchor occurrence：

```text
[[warning-text]]
```

## 7. 跨文档样例断言

`samples/interdocument-xref.adoc` 必须覆盖：

```asciidoc
= 单文件跨文档引用样例

== 本文件标题

这个本地引用指向 <<local-target, 本文件目标>>。

[#local-target]
== 本文件目标

这个跨文档引用指向 xref:other.adoc#remote-target[远程目标]。

这个跨文档短写引用指向 <<other.adoc#remote-target, 远程目标短写>>。
```

断言：

- local xref 绑定到当前文件 target。
- macro interdocument xref 输出 `scope = "external"`。
- macro interdocument xref 保留 raw target `other.adoc#remote-target`。
- macro interdocument xref 的 official href 是 `other.html#remote-target`。
- shorthand interdocument xref 也保留 raw target 和 official href。
- 工具不读取 `other.adoc`。

## 8. 不通过条件

出现以下任一情况，不得声明完成：

- pretty text 和 JSON 来自不同内部对象。
- JSON 只是 pretty text 字符串的包装。
- source span 使用 0-based 坐标。
- xref occurrence 丢失 raw。
- anchor occurrence 丢失 sourceSpan。
- official binding 覆盖 raw target。
- 跨文档 xref 被静默当成本地 target。
- parser 未实现但 CLI 返回 exit code 0。
- 文档 lint 诊断被混进 abundant tree 核心节点。
- root workspace 没有覆盖项目测试配置。

## 9. 验证命令

项目验证：

```bash
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree test
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree typecheck
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree build
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree pack:check
```

根验证：

```bash
pnpm lint
pnpm deps:check
pnpm check
```

涉及根配置、workspace、catalog、模板命名或 lockfile 时，完整验证使用：

```bash
pnpm check:full
```

大输出命令写入 `tmp/logs`。

## 10. 完成定义

核心功能完成需要同时满足：

- 文档规约与实现一致。
- TypeScript public model 是唯一核心数据模型。
- CLI 默认输出 pretty text。
- CLI `--json` 输出 JSON。
- library API 可直接返回 `AbundantDocument`。
- `samples/reference-links.adoc` 和 `samples/interdocument-xref.adoc` 黑盒测试通过。
- 局部门禁通过。
- 根相关门禁通过。
- 剩余非目标被明确归档为相邻人工制品或后续独立任务。

任何完成报告必须列出实际运行的命令和结果。未运行的验证不能被写成通过。
