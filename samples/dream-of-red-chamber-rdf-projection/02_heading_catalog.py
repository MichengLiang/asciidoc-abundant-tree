# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 2 步：标题实体目录。

讲解台词：

    现在看标题。这里每一行都是一个标题实体。它有顺序、有层级、有标题文本，
    也有源文行号。

    再看中间几列：阵营、性别、代际都来自标题上的属性。比如“贾母”这一行，
    她属于荣国府，性别是女，代际是第二代。这些信息原来写在文档里，
    投影以后就能直接查询。

    这里还有一个故意保留的问题：“贾兰”的标题是贾兰，但地址标签写成了
    ``jiabaochai``。先记住这个点，后面的审计脚本会把它抓出来。

.. 操作::

   指出“行号”列和“贾兰 / jiabaochai”这一行。
   讲完后运行 ``03_relation_inventory.py``。
"""

from __future__ import annotations

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    common.render_header("02 标题目录 Heading Catalog", "按文档顺序列出所有标题实体和它们的投影字段。")

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("#", justify="right")
    table.add_column("层级")
    table.add_column("标题 Headline")
    table.add_column("地址 Label")
    table.add_column("阵营 Faction")
    table.add_column("性别")
    table.add_column("代际 Generation")
    table.add_column("行号", justify="right")

    for heading in common.headings(context.store):
        label = f"{heading.label} ({common.label_kind_label(heading.label_kind)})"
        table.add_row(
            str(heading.order),
            str(heading.level),
            heading.headline,
            label,
            heading.faction or "-",
            heading.gender or "-",
            heading.generation or "-",
            str(heading.line),
        )

    common.console.print(table)


if __name__ == "__main__":
    main()
