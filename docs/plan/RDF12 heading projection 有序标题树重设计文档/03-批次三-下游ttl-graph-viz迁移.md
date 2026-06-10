# 批次三：下游 ttl-graph-viz 消费迁移

## 目标

本批次迁移 `micheng-ts/experiments/ttl-graph-viz` 的 TTL parser，使其消费 `aat:childOrder` 和 `aat:documentOrder`。

迁移完成后，下游不再通过 `aat:previousSibling` 或 `relativePath + startLine` 推断 book order。

## 设计依据

读取并遵守：

- `docs/plan/RDF12 heading projection 有序标题树重设计文档/00-有序标题树重设计规约.md`
- `docs/plan/RDF12 heading projection 有序标题树重设计文档/02-批次二-上游RDF投影实现.md`

## 写入范围

允许修改：

- `/home/t103o/workbench/micheng-ts/experiments/ttl-graph-viz/src/lib/ttl-parser.ts`
- `/home/t103o/workbench/micheng-ts/experiments/ttl-graph-viz/src/lib/__tests__/ttl-parser.test.ts`
- `/home/t103o/workbench/micheng-ts/experiments/ttl-graph-viz/public/data/*.ttl`，仅在需要更新 fixtures 时修改

不得修改：

- UI 组件布局，除非类型变化必须传播。
- graph rendering 语义，除非当前排序来源必须替换。
- 官方 HTML rendering 路径。

## 必做事项

### 1. 扩展数据模型

`GraphNode` 和 `DocumentNode` 应考虑暴露：

```ts
documentOrder: number;
childOrder: number | null;
```

若 UI 暂不需要显示，可在 parser 内保留排序字段，但测试必须能观察到排序行为。

### 2. 替换 children 排序

当前 `sortChildIds` 使用 `previousSibling` 链，并在剩余节点上退回 source position。

新规则：

- `containsDirectly` 的 children 必须按 numeric `aat:childOrder` 排序。
- 缺少 `childOrder` 的 contained child 应触发诊断或明确失败路径。
- 不再读取 `aat:previousSibling`。
- 不再用 `relativePath + startLine` 修复 book order。

允许保留 `sortHeadingIdsBySourcePosition` 只服务 SourceFile fallback 或单文件 raw reconstruction，但不得用于 `containsDirectly` children order。

### 3. 使用 documentOrder

全局 heading 顺序应按 numeric `aat:documentOrder`。

使用场景包括：

- `nodes` 默认排列。
- 搜索结果或图谱初始顺序，如果当前代码有顺序依赖。
- rootless headings 的线性展示。

若当前 UI 不显式依赖 nodes 顺序，测试仍应覆盖 parser 可按 `documentOrder` 输出稳定结果。

### 4. 更新测试 fixtures

测试 TTL 应包含：

```ttl
<urn:book#root> a aat:Heading ;
  aat:headline "Ordered Book" ;
  aat:headingLevel 0 ;
  aat:documentOrder 1 ;
  aat:containsDirectly <urn:book#part-one>, <urn:book#preface>, <urn:book#index> .

<urn:book#preface> a aat:Heading ;
  aat:headline "Preface" ;
  aat:headingLevel 1 ;
  aat:documentOrder 2 ;
  aat:childOrder 1 .

<urn:book#part-one> a aat:Heading ;
  aat:headline "Part One" ;
  aat:headingLevel 0 ;
  aat:documentOrder 3 ;
  aat:childOrder 2 .

<urn:book#index> a aat:Heading ;
  aat:headline "Index" ;
  aat:headingLevel 1 ;
  aat:documentOrder 8 ;
  aat:childOrder 3 .
```

Object list 顺序应故意打乱，证明 parser 不依赖 Turtle object order。

### 5. 删除 previousSibling 测试

删除或改写：

- `orders document children by previousSibling evidence`
- fixtures 中用于排序的 `aat:previousSibling`

替换为：

- `orders document children by childOrder evidence`
- `does not fall back to source position for contained children`

## 诊断策略

若 `containsDirectly` 指向的 child 缺少 `childOrder`，parser 可以采用以下任一方式：

- 抛出错误。
- 返回 `GraphData` 时携带 diagnostics。
- 在测试环境中 fail fast。

本批次不要求设计完整诊断 UI。必须避免静默 fallback 到 source line。

## 验收标准

本批次完成时：

- `ttl-parser.ts` 不再读取 `aat:previousSibling`。
- `containsDirectly` children 按 `childOrder` 排序。
- `relativePath + startLine` 不再用于 book tree children order。
- 测试 fixture 的 Turtle object order 打乱时，document tree 顺序仍正确。
- 缺少 `childOrder` 的 contained child 不被静默修复。
- `documentOrder` 被读取并可用于全局 heading 顺序。

## 审核重点

审核者应拒绝以下实现：

- 读取 `previousSibling` 作为兼容路径。
- 在 order 缺失时退回 source line 并继续正常显示。
- 通过 TTL object list 顺序通过测试。
- 把 source coordinate 当作 book order。
- 修改 UI 表面掩盖 parser contract 问题。
