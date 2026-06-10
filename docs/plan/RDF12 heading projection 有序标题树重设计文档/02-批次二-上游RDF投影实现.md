# 批次二：上游 RDF 投影实现

## 目标

本批次把上游 RDF12 heading projection 迁移到 ordered heading tree graph 契约。

实现完成后，RDF graph 必须输出：

- `aat:containsDirectly`
- `aat:childOrder`
- `aat:documentOrder`

实现完成后，RDF graph 不再输出：

- `aat:previousSibling`

## 设计依据

读取并遵守：

- `docs/plan/RDF12 heading projection 有序标题树重设计文档/00-有序标题树重设计规约.md`
- `docs/plan/RDF12 heading projection 有序标题树重设计文档/01-批次一-上游契约测试与heading-tree-plan.md`

## 写入范围

允许修改：

- `src/rdf12-projection/structure-projector.ts`
- `src/rdf12-projection/heading-tree.ts`
- `src/rdf12-projection/node-index.ts`
- `src/rdf12-projection/literals.ts` 仅在整数 literal 支持不足时修改
- `test/rdf12-projection/*`

不得修改：

- `src/rdf12-projection/resource-identity.ts`，除非发现无法创建唯一 resource。不得把 order 编进 IRI。
- `src/rdf12-projection/turtle-serializer.ts`，除非现有 serializer 无法输出合法 triples。
- `src/book-entry/*`。

## 必做事项

### 1. 使用 HeadingTreeProjection 驱动结构投影

`projectStructureResources` 应从 heading tree plan 生成 heading resources。

实现应满足：

- 创建 heading resource 时保留现有 resource identity strategy。
- heading facts 继续输出 `headline`、`headingLevel`、source coordinate、raw、labels。
- 每个 heading 输出 `aat:documentOrder`。
- 有 parent 的 heading 输出 `aat:childOrder`。
- parent 对 child 输出 `aat:containsDirectly`。

### 2. 删除 source-line structure sort

删除 `projectHeadingStructureEdges` 中基于 `startLine` 的排序。

不得用 book-entry 特判替代该排序。single-file 与 book-entry 应使用同一 heading tree plan。

### 3. 停止输出 previousSibling

删除或停止调用：

```ts
iriTerm(`${namespaces.aat}previousSibling`)
```

保留旧 helper 没有价值时应删除，避免旧概念继续占据实现表面。

### 4. 更新 RDF acceptance tests

改写以下测试中的旧断言：

- `test/rdf12-projection/containment.test.ts`
- `test/rdf12-projection/heading-projection.acceptance.test.ts`
- `test/rdf12-projection/query-contracts.test.ts`
- `test/rdf12-projection/payload.acceptance.test.ts`

断言方向：

- `containsDirectly` 仍只连接 heading。
- direct children 可按 `childOrder` 得到 expected order。
- 全部 headings 可按 `documentOrder` 得到 expected preorder。
- graph 中不存在 `aat:previousSibling`。
- book-entry multi-file fixture 不因 source line collision 乱序。

### 5. 保持 source coordinate 合同

必须确认以下行为仍成立：

- heading `relativePath` 是 origin source file。
- heading `startLine/endLine/headingLine` 是 origin source file 内坐标。
- heading `raw` 是 origin file slice。
- entry file 中 part heading 的 raw 可包含 include directive。
- source coordinate 不被 `documentOrder` 替代。

## 推荐测试 helper

可以新增语义定位 helper，避免测试依赖 local id：

```ts
function headingByHeadline(graph: Rdf12Graph, headline: string): Rdf12IriTerm;
function integerValue(graph: Rdf12Graph, subject: Rdf12IriTerm, predicate: Rdf12IriTerm): number;
function directChildrenInOrder(graph: Rdf12Graph, parent: Rdf12IriTerm): Rdf12IriTerm[];
function headingsByDocumentOrder(graph: Rdf12Graph): Rdf12IriTerm[];
```

测试应优先通过 `headline`、`addressLabel`、`documentOrder` 定位语义，不通过 `heading-l1-o16` 定位结构语义。

## 验收标准

本批次完成时：

- 上游 RDF graph 输出 `documentOrder`。
- 有 parent heading 的 heading 输出 `childOrder`。
- `containsDirectly` 由 logical heading tree 生成。
- `previousSibling` 不再输出。
- book-entry 多文件 fixture 的 order 正确。
- single-file 现有 heading projection 测试通过且语义更新。
- source coordinate 相关测试仍通过。

## 审核重点

审核者应重点检查：

- 是否仍存在 `.toSorted((left, right) => left.startLine - right.startLine)` 参与 heading structure edge。
- 是否出现 `previousSibling` 新输出。
- 是否通过 IRI 或 Turtle textual order 偷偷证明顺序。
- 是否把 `bookOutlineRaw` 引入 core graph。
- 是否修改了 source coordinate 的含义。
