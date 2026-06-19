# 业务知识图谱 JS 样例覆盖报告

本报告列出两篇业务文档共同覆盖的演示特性。每个特性至少由一篇文档展示。

## 文档
- recipe-knowledge-dlist: 家庭食材与菜谱知识库：组成层级 + 描述列表字段；标题层级解释为 `part-of`。
- cold-chain-operations-attrlist: 冷链药品运输知识库：规则约束层级 + attrlist 字段；标题层级解释为 `governed-by`。

## 特性覆盖
- 标题层级按约定解释为业务边: recipe-knowledge-dlist, cold-chain-operations-attrlist
- 描述列表挂载节点字段与 role 字段: recipe-knowledge-dlist
- 标题前 attrlist 挂载节点字段: cold-chain-operations-attrlist
- xref rel 声明显式业务边: recipe-knowledge-dlist, cold-chain-operations-attrlist
- xref named attributes 声明边属性: cold-chain-operations-attrlist
- 输出 Mermaid 业务视角: recipe-knowledge-dlist, cold-chain-operations-attrlist
- 输出 projection TTL 与 business TTL: recipe-knowledge-dlist, cold-chain-operations-attrlist
