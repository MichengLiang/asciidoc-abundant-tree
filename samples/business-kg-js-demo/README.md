# Business KG JS Demo

这个样例展示用 AsciiDoc 文档录入业务知识图谱，并用本地 JS 脚本生成 TTL、Mermaid 和报告。

它承接 `samples/basic-rdf-projection/` 的结构夹具。basic 示例说明投影器能忠实拿到标题、属性、xref、边证据和 RDF 事实；本样例说明这些事实如何进入业务建模和下游消费。

## 建模表面

本样例采用以下约定：

- 标题投影为图节点。
- role 是节点类型标记，例如 `.recipe`、`.ingredient`、`.shipment`、`.policy`。
- 标题前 attrlist 可以写少量短节点字段。
- 标题下第一个扁平描述列表可以写节点字段，适合字段较多或需要多行文本的场景。
- `xref` 的 `rel` 是边谓词。
- `xref` named attributes 是边属性。
- 标题层级只提供物理 `containsDirectly` 事实；业务含义由每份文档的建模约定解释。

## Fixtures

| 文件 | 业务域 | 标题层级解释 | 节点字段写法 |
|---|---|---|---|
| `fixtures/recipe-knowledge-dlist.adoc` | 家庭食材与菜谱 | `part-of` | 标题下描述列表，包含 `role::` |
| `fixtures/cold-chain-operations-attrlist.adoc` | 冷链药品运输 | `governed-by` | 标题前 attrlist |

两篇文档分摊演示特性。菜谱文档展示亲切主题、描述列表字段、`role::` 节点类型字段和组成层级解释；冷链文档展示专业主题、attrlist 字段、规则约束层级和边属性。

## Generate

在项目根目录运行：

```bash
node samples/business-kg-js-demo/scripts/generate-demo.mjs
```

输出目录：

```text
samples/business-kg-js-demo/generated/
├── ttl/
│   ├── *.projection.ttl
│   └── *.business.ttl
├── mermaid/
│   └── *.mmd
└── reports/
    ├── *.json
    └── coverage.md
```

`*.projection.ttl` 是投影器忠实输出的 RDF12 图。`*.business.ttl` 是 JS 脚本按建模约定解释后的业务图。Mermaid 文件是讲解用视角，JSON 报告保留节点字段、边字段、来源行号，`coverage.md` 说明两篇文档覆盖的演示特性。

## Talk Track

讲解顺序：

1. 打开一份 fixture，看作者如何用标题、role、attrlist、描述列表和 xref 写业务知识。
2. 打开对应 `*.projection.ttl`，说明投影器只忠实保留源文档事实。
3. 打开对应 `*.business.ttl`，说明建模规则如何把标题层级解释成业务边。
4. 打开 Mermaid 文件，展示分类、组成、规则或监控视角。
5. 打开 `generated/reports/coverage.md`，说明两个主题如何分摊展示描述列表字段、attrlist 字段、边属性和层级解释。

这个样例不要求作者手写 TTL，也不要求使用图数据库录入前端。下游拿到 TTL 后仍可接 RDF store、SPARQL、SHACL 或图数据库导入流程。
