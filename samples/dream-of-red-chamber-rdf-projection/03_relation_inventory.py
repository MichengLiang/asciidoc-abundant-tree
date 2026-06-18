# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 3 步：关系清单。

讲解台词：

    现在看关系。文档里的 xref 在页面上是链接，在图里就是人物之间的边。
    ``rel`` 是边的类型，``weight`` 是这条边的强度，行号就是证据所在的位置。

    上半部分是关系类型计数。可以看到婚姻、母子、兄弟、服侍、相爱这些关系。
    下半部分按权重排序，最醒目的是贾宝玉和林黛玉的 ``loves``，
    还有秦可卿和贾珍的 ``scandal-with``。

    这一步的意思很简单：文档作者写的是链接，消费端拿到的是人物关系图。
    链接没有丢，反而多了类型、权重和证据行号。

.. 操作::

   指出 ``刘姥姥 --rescues--> 巧姐`` 这条高权重关系。
   下一步会看到它为什么有证据、却还没有成功绑定目标。
   讲完后运行 ``04_reference_health.py``。
"""

from __future__ import annotations

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    common.render_header("03 关系清单 Relation Inventory", "统计关系类型，并列出权重最高的人物关系边。")

    counts = common.relation_counts(context.store)
    count_table = Table(title="关系类型计数 Relation Type Counts", header_style="bold cyan")
    count_table.add_column("关系 rel")
    count_table.add_column("数量", justify="right")
    for rel, count in counts.most_common():
        count_table.add_row(rel, str(count))
    common.console.print(count_table)

    edge_table = Table(title="最高权重关系 Top Weighted Edges", header_style="bold magenta")
    edge_table.add_column("来源 Source")
    edge_table.add_column("Rel")
    edge_table.add_column("目标 Target")
    edge_table.add_column("权重", justify="right")
    edge_table.add_column("行号", justify="right")
    for relation in common.top_weighted_relations(context.store):
        edge_table.add_row(
            relation.source_headline,
            relation.rel,
            relation.target_headline or relation.target_selector,
            "-" if relation.weight is None else f"{relation.weight:.2f}",
            str(relation.line),
        )
    common.console.print(edge_table)


if __name__ == "__main__":
    main()
