# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 6 步：爆炸半径。

讲解台词：

    现在看影响范围。默认从“贾宝玉”出发，先找直接相连的人物，
    再继续往外扩一层。

    如果要改贾宝玉这一段，第一层人物就是最需要关注的地方：
    林黛玉、薛宝钗、王夫人、王熙凤、袭人、晴雯、贾母、贾政等。
    第二层人物说明影响还会继续扩散。

    这个查询适合做文档维护。它回答的不是文学解释问题，而是一个工程问题：
    改这个节点，哪些地方可能一起受影响。

.. 操作::

   可以换一个人物演示：

   .. code-block:: bash

      uv run samples/dream-of-red-chamber-rdf-projection/06_blast_radius.py 林黛玉

   讲完后运行 ``07_character_neighborhood.py``。
"""

from __future__ import annotations

import sys

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    name = sys.argv[1] if len(sys.argv) > 1 else "贾宝玉"
    radius = common.blast_radius(context.store, name, depth=2)
    common.render_header("06 爆炸半径 Blast Radius", f"从 {name} 出发，展开两层人物关系影响范围。")

    table = Table(header_style="bold cyan")
    table.add_column("层数 Depth", justify="right")
    table.add_column("人物 Character")
    for character, depth in sorted(radius.items(), key=lambda item: (item[1], item[0])):
        table.add_row(str(depth), character)
    common.console.print(table)


if __name__ == "__main__":
    main()
