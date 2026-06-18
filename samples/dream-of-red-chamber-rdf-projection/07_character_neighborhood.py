# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 7 步：人物邻域。

讲解台词：

    现在看单个人物。默认人物是林黛玉。

    出边表示“林黛玉这一节里，她主动指向了谁”。入边表示“其他章节里，
    谁又指向了林黛玉”。这两个方向分开以后，人物画像会清楚很多。

    比如她的出边里有贾宝玉、王夫人、薛宝钗、贾母；入边里也有贾母、
    王夫人、贾宝玉、薛宝钗、史湘云。一个人物不再只是一个段落，
    而是关系网络里的节点。

.. 操作::

   可以换一个人物演示：

   .. code-block:: bash

      uv run samples/dream-of-red-chamber-rdf-projection/07_character_neighborhood.py 王熙凤

   讲完后运行 ``08_faction_matrix.py``。
"""

from __future__ import annotations

import sys

from rich.table import Table

import projection_common as common


def relation_table(title: str, rows: list[common.Relation], incoming: bool) -> Table:
    table = Table(title=title, header_style="bold cyan")
    table.add_column("对方人物")
    table.add_column("Rel")
    table.add_column("权重", justify="right")
    table.add_column("行号", justify="right")
    for relation in rows:
        other = relation.source_headline if incoming else relation.target_headline or relation.target_selector
        table.add_row(
            other,
            relation.rel,
            "-" if relation.weight is None else f"{relation.weight:.2f}",
            str(relation.line),
        )
    return table


def main() -> None:
    context = common.load_context()
    name = sys.argv[1] if len(sys.argv) > 1 else "林黛玉"
    outgoing, incoming = common.neighborhood(context.store, name)
    common.render_header("07 人物邻域 Character Neighborhood", f"人物 {name} 的出边 outgoing / 入边 incoming 关系画像。")
    common.console.print(relation_table("出边 Outgoing", outgoing, incoming=False))
    common.console.print(relation_table("入边 Incoming", incoming, incoming=True))


if __name__ == "__main__":
    main()
