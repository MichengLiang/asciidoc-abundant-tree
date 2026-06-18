# 红楼梦 RDF Projection 演示样例

这个目录是一套面向讲解的 RDF12 heading projection 大闭环样例。`dream-of-red-chamber.adoc` 保留了若干刻意设计的问题结构，用来演示审计、定位、现场修复和复查。

## 推荐演示顺序

从 `01_project_overview.py` 到 `11_restore_source.py` 依次运行。每个脚本顶部 docstring 都写了现场讲法、观众应看什么、下一步运行什么。

```bash
uv run samples/dream-of-red-chamber-rdf-projection/01_project_overview.py
uv run samples/dream-of-red-chamber-rdf-projection/02_heading_catalog.py
uv run samples/dream-of-red-chamber-rdf-projection/03_relation_inventory.py
uv run samples/dream-of-red-chamber-rdf-projection/04_reference_health.py
uv run samples/dream-of-red-chamber-rdf-projection/05_source_trace.py
uv run samples/dream-of-red-chamber-rdf-projection/06_blast_radius.py
uv run samples/dream-of-red-chamber-rdf-projection/07_character_neighborhood.py
uv run samples/dream-of-red-chamber-rdf-projection/08_faction_matrix.py
uv run samples/dream-of-red-chamber-rdf-projection/09_global_audit.py
uv run samples/dream-of-red-chamber-rdf-projection/10_export_audit_report.py
uv run samples/dream-of-red-chamber-rdf-projection/11_restore_source.py
```

可现场手动修改 `dream-of-red-chamber.adoc` 后重新运行审计脚本。讲完后运行 `11_restore_source.py`，它会从 `source-original.adoc` 恢复主演示文件。

## 重新生成 TTL

```bash
pnpm --silent dev samples/dream-of-red-chamber-rdf-projection/dream-of-red-chamber.adoc --format rdf12 > samples/dream-of-red-chamber-rdf-projection/dream-of-red-chamber.ttl
```

## 文件

- `dream-of-red-chamber.adoc`：主演示文档。
- `source-original.adoc`：复原基准。
- `dream-of-red-chamber.ttl`：预生成 RDF12 Turtle。
- `projection_common.py`：共享投影、查询、审计和 Rich 渲染逻辑。
- `01_*.py` 到 `11_*.py`：单动作演示脚本。
- `reports/`：HTML 审计报告输出目录。
