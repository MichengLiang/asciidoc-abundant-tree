# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 8 步：阵营关系矩阵。

讲解台词：

    现在把视角拉高。前面看的是人物和人物之间的边；这里看阵营和阵营之间的边。

    阵营来自标题字段 ``faction``，关系来自 xref。把两者放在一起，
    就能看到荣国府内部关系最多，也能看到荣国府和林家、薛家、尤家之间
    有哪些跨阵营连接。

    这一步适合说明聚合分析：局部写作标记可以变成整体结构。

.. 操作::

   指出“荣国府 -> 荣国府”的关系数，再指出跨阵营关系。
   讲完后运行 ``09_global_audit.py``。
"""

from __future__ import annotations

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    common.render_header("08 阵营矩阵 Faction Matrix", "按来源阵营 source faction 和目标阵营 target faction 聚合人物关系。")

    table = Table(header_style="bold cyan")
    table.add_column("来源阵营 Source Faction")
    table.add_column("目标阵营 Target Faction")
    table.add_column("关系数 Edges", justify="right")
    for (source, target), count in sorted(common.faction_matrix(context.store).items()):
        table.add_row(source, target, str(count))
    common.console.print(table)


if __name__ == "__main__":
    main()
