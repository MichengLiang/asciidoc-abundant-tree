# 批次一：上游契约测试与 HeadingTreeProjection 计划对象

## 目标

本批次在 `asciidoc-abundant-tree` 上游项目中建立 ordered heading tree 的测试基线和内部 plan 对象。

本批次不要求完成 RDF 输出迁移。它必须先把设计对象固定下来，使后续实现不再从 source line 排序推断结构。

## 设计依据

读取并遵守：

- `docs/plan/RDF12 heading projection 有序标题树重设计文档/00-有序标题树重设计规约.md`
- `docs/plan/RDF12 heading projection 有序标题树重设计文档/资料1.md`

## 写入范围

允许修改：

- `src/rdf12-projection/structure-projector.ts`
- 新增 `src/rdf12-projection/heading-tree.ts` 或等价模块
- `src/rdf12-projection/node-index.ts`
- `test/rdf12-projection/*`
- `test/book-entry/fixtures/*` 或 `test/rdf12-projection/fixtures/*`

不得修改：

- `src/book-entry/*` 的 include resolution 行为
- `src/asciidoctor-adapter.ts` 的 HTML/xref binding 行为
- public serializer 行为，除非测试需要读取 graph 中 triples

## 必做事项

### 1. 新增 book-entry 多文件 fixture

Fixture 必须故意制造 origin line collision。多个 included files 的 heading 应位于第 1 行或第 2 行。

建议结构：

```text
test/rdf12-projection/fixtures/ordered-book/
├── book.adoc
├── frontmatter/
│   └── preface.adoc
├── parts/
│   ├── 100/
│   │   ├── 010-first.adoc
│   │   └── 020-second.adoc
│   └── 200/
│       └── 010-third.adoc
└── backmatter/
    └── index.adoc
```

`book.adoc`：

```adoc
= Ordered Book
:doctype: book

[preface]
include::frontmatter/preface.adoc[]

= Part One

include::parts/100/010-first.adoc[]
include::parts/100/020-second.adoc[]

= Part Two

include::parts/200/010-third.adoc[]

[index]
include::backmatter/index.adoc[]
```

Expected heading order:

```text
1 Ordered Book
2 Preface
3 Part One
4 First
5 Second
6 Part Two
7 Third
8 Index
```

### 2. 新增 HeadingTreeProjection 内部对象

新增 `src/rdf12-projection/heading-tree.ts`。

建议 public-internal API：

```ts
import type { AbundantDocument, SectionNode, TitleNode } from "../model";

export type HeadingTreeEntry = {
  readonly node: TitleNode | SectionNode;
  readonly kind: "document-title" | "section";
  readonly parent?: HeadingTreeEntry;
  readonly children: readonly HeadingTreeEntry[];
  readonly documentOrder: number;
  readonly childOrder?: number;
};

export type HeadingTreeProjection = {
  readonly entries: readonly HeadingTreeEntry[];
  readonly roots: readonly HeadingTreeEntry[];
};

export function buildHeadingTreeProjection(
  document: AbundantDocument,
): HeadingTreeProjection;
```

`entries` 必须按 preorder 排列。

`roots` 表示无 parent heading 的 top-level entries。存在 document title 时，`roots` 通常只有 document title。无 document title 时，`roots` 是顶层 sections。

### 3. 测试 HeadingTreeProjection

测试不应依赖 RDF IRI。

断言：

- document title 存在时 document title 的 `documentOrder` 为 `1`。
- document title 没有 `childOrder`。
- `Preface`、`Part One`、`Part Two`、`Index` 是 `Ordered Book` 的 direct children。
- `First` 和 `Second` 是 `Part One` 的 direct children。
- `Third` 是 `Part Two` 的 direct child。
- 同父 children 的 `childOrder` 从 `1` 连续递增。
- `entries.map(entry => headline)` 等于 expected heading order。

### 4. 更新 node index 类型

`Rdf12NodeIndexEntry` 应增加：

```ts
readonly documentOrder: number;
readonly childOrder?: number;
```

本批次若尚未完整输出 RDF triples，至少应让类型和后续结构可承载这些字段。

## 必须失败的旧假设

本批次测试应能暴露以下旧假设错误：

- source line collision 不得改变 document order。
- `relativePath + startLine` 不得作为 book order。
- node index insertion order 或 heading tree preorder 是结构顺序，source line sort 不是结构顺序。

## 验收标准

本批次完成时：

- 存在独立的 heading tree projection builder。
- heading tree projection builder 的测试覆盖 book-entry 多文件 origin line collision。
- `documentOrder` 和 `childOrder` 的定义在类型层可表达。
- 未引入 `bookOutlineRaw`。
- 未把排序语义写入 IRI。
- 未扩大 HTML parse 或 SourceFile 渲染职责。

## 审核重点

审核者应拒绝以下实现：

- 继续在核心结构算法中使用 `startLine` 排序。
- 通过 fixture 文件名排序得到 expected order。
- 通过 IRI local id 判断顺序。
- 把 `previousSibling` 当作新 plan 的核心字段。
- 把大纲字符串作为测试主对象。
