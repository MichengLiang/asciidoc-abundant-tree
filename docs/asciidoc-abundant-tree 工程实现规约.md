# asciidoc-abundant-tree 工程实现规约

本文定义 `asciidoc-abundant-tree` 在 `micheng-ts` 工作区中的工程承载方式。人工制品本体、数据模型和公共契约见 `asciidoc-abundant-tree 本体规约.md`。验收口径见 `asciidoc-abundant-tree 验收标准与黑盒测试.md`。

## 1. 工作区事实

当前工作区是：

```text
/home/t103o/workbench/micheng-ts
```

根包名是 `micheng-ts`。包作用域同步使用 `@micheng-ts/*`、`@micheng-ts-experiment/*` 和 `@micheng-ts-project/*`。旧 `@ts-foundry/*` 命名不属于当前工程身份。

`projects/asciidoc-abundant-tree` 是一个内部 Git 仓库。根工作区配置属于外层 `micheng-ts` 仓库；项目源码、项目文档和项目 package 属于内层 `asciidoc-abundant-tree` 仓库。

提交或检查状态时必须分别进入对应仓库。

## 2. 目录身份

该项目位于：

```text
projects/asciidoc-abundant-tree
```

该目录属于 `projects/`，不是 `experiments/`。理由：

- 当前对象已经有明确长期用途。
- 它提供 CLI 和 library API。
- 它会成为后续图投影、lint、引用分析和解释器的事实供给层。
- 它需要纳入根 workspace 的质量门禁。

## 3. Package 身份

package 名称：

```text
@micheng-ts-project/asciidoc-abundant-tree
```

CLI bin 名称：

```text
asciidoc-abundant-tree
```

包是 private workspace package，不对 npm 发布。

## 4. 技术栈

运行时：

```text
Node >= 24
ESM only
```

语言：

```text
TypeScript strict
```

构建：

```text
tsdown
```

测试：

```text
Vitest
v8 coverage
Node environment
```

格式化和 lint：

```text
Biome
```

包管理：

```text
pnpm 10
catalog dependencies
```

## 5. 依赖

运行依赖：

```json
{
	"@asciidoctor/core": "catalog:",
	"parse5": "catalog:"
}
```

开发依赖：

```json
{
	"@arethetypeswrong/cli": "catalog:",
	"@micheng-ts/tsconfig": "workspace:*",
	"@types/node": "catalog:",
	"publint": "catalog:",
	"tsdown": "catalog:",
	"tsx": "catalog:",
	"typescript": "catalog:",
	"vitest": "catalog:"
}
```

根 `pnpm-workspace.yaml` catalog 需要包含：

```yaml
"@asciidoctor/core": "^3.0.4"
"parse5": "^8.0.1"
```

依赖位置规则：

- AsciiDoc parser 和 HTML fragment parser 是项目运行依赖。
- tsdown、tsx、Vitest、publint、ATTW 和 TypeScript 是开发依赖。
- 不引入 React、Tailwind、Playwright、Hono、数据库、ORM、Docker 或部署工具。

## 6. Root 配置要求

根 `pnpm-workspace.yaml` 已经包含：

```yaml
packages:
  - "projects/*"
```

仍需保持以下覆盖：

```ts
// vitest.workspace.ts
export default [
	"packages/*/vitest.config.ts",
	"apps/*/vitest.config.ts",
	"templates/*/vitest.config.ts",
	"experiments/*/vitest.config.ts",
	"projects/*/vitest.config.ts",
];
```

`knip.json` entry 需要覆盖项目 library 和 CLI 入口：

```json
[
	"projects/*/src/index.ts",
	"projects/*/src/cli.ts"
]
```

## 7. 文件结构

初始化后的目录结构：

```text
projects/asciidoc-abundant-tree/
├── docs/
│   ├── asciidoc-abundant-tree 本体规约.md
│   ├── asciidoc-abundant-tree 工程实现规约.md
│   └── asciidoc-abundant-tree 验收标准与黑盒测试.md
├── samples/
│   ├── reference-links.adoc
│   └── interdocument-xref.adoc
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── model.ts
│   └── serializers.ts
├── test/
│   └── cli.test.ts
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── vitest.config.ts
```

初始化只建立工程边界、公共类型、CLI 参数面和序列化入口。完整 parser、source span enhancer、xref scanner、binding merger 和 table renderer 属于后续实现任务。

## 8. 模块职责

`src/model.ts` 定义公共 TypeScript 数据模型。该文件是 library API 和 serializer 的共享类型来源。

`src/index.ts` 导出公共 API：

```ts
export type * from "./model";
export { formatAbundantTree, serializeAbundantTreeToJson } from "./serializers";
export { parseAbundantTree } from "./parser";
```

初始化阶段可以暂不提供完整 `parser.ts`。如果导出 `parseAbundantTree`，它必须明确抛出未实现错误，不能返回伪造成功树。

`src/serializers.ts` 只负责把 `AbundantDocument` 投影为 pretty text 或 JSON-ready object。它不读取文件，不调用 Asciidoctor，不扫描 source。

`src/cli.ts` 负责：

- 解析 CLI 参数。
- 识别 `--help`。
- 识别 `--json`。
- 识别 `--format tree|json`。
- 调用 library API。
- 将结果写成 stdout/stderr 字符串和 exit code。

CLI 不包含 parser 逻辑。

## 9. CLI 行为

公共命令：

```bash
asciidoc-abundant-tree <file.adoc>
asciidoc-abundant-tree <file.adoc> --json
asciidoc-abundant-tree <file.adoc> --format tree
asciidoc-abundant-tree <file.adoc> --format json
asciidoc-abundant-tree --help
```

默认格式：

```text
tree
```

`--json` 是 `--format json` 的快捷入口。

错误规则：

- 未传文件：exit code 1。
- 未知参数：exit code 1。
- `--format` 缺值：exit code 1。
- `--format` 值不是 `tree` 或 `json`：exit code 1。
- 输入文件不存在：exit code 1。
- parser 未实现或内部不变量失败：exit code 1。

初始化阶段允许 file parse 路径返回明确的未实现错误。该错误必须出现在 stderr 或 structured error 中，不能伪装成成功树。

## 10. 构建输出

tsdown 输出：

```text
dist/index.mjs
dist/index.d.mts
dist/cli.mjs
dist/cli.d.mts
```

`package.json` exports：

```json
{
	".": {
		"types": "./dist/index.d.mts",
		"import": "./dist/index.mjs"
	},
	"./package.json": "./package.json"
}
```

`bin`：

```json
{
	"asciidoc-abundant-tree": "./dist/cli.mjs"
}
```

## 11. 测试布局

初始化测试覆盖 CLI 参数和 serializer 边界。

后续实现测试按责任拆分：

- source line table。
- source span recovery。
- metadata attachment。
- section scope。
- xref occurrence scanner。
- anchor occurrence scanner。
- official binding extraction。
- target catalog。
- pretty text serializer。
- JSON serializer。
- CLI integration。

测试文件放在 `test/`，不要全部塞进 `src/index.test.ts`。

## 12. 样例文件

`samples/reference-links.adoc` 来自旧 `notes/关于AsciiDoc/asciidoc-ast-viewer/samples/资料1.adoc`，内容保留中文，文件名使用稳定英文。

`samples/interdocument-xref.adoc` 覆盖 single-file 模式下的跨文档 xref。

样例文件是测试 fixture，不是用户文档。

## 13. 质量门禁

项目局部门禁：

```bash
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree test
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree typecheck
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree build
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree pack:check
```

根门禁：

```bash
pnpm lint
pnpm deps:check
pnpm check
```

根配置、workspace、catalog 或模板命名变化后，完整证据是：

```bash
pnpm check:full
```

大输出命令按 `micheng-ts/GUIDE.md` 写入 `tmp/logs`，再用 `tail` 和 `rg` 摘要。

## 14. 实现顺序

后续核心实现按 TDD 进入：

1. 为一个结构行为写失败测试。
2. 运行目标测试确认失败原因正确。
3. 写最小实现。
4. 运行目标测试确认通过。
5. 运行相关 typecheck。
6. 保持 public model、pretty serializer 和 JSON serializer 对同一对象工作。

实现顺序不能改变对象边界。新的发现必须归档为事实、约束、风险、规格缺口或相邻对象，再决定是否进入当前人工制品。
