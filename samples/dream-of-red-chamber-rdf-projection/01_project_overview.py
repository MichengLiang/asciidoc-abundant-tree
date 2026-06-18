# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 1 步：开场总览。

讲解台词：

    先看总览。这里的输入是一篇《红楼梦》人物志，格式还是 AsciiDoc；
    运行投影之后，它已经变成一张 RDF 图。

    这张表先给出规模感。Triples 是图里的事实数量，Headings 是标题实体数量，
    Xref edges 是文中交叉引用的数量。Bound xrefs 表示已经找到目标的引用，
    Unresolved xrefs 表示还没有找到目标的引用。

    所以第一眼能看到两件事：这篇文章已经可以被查询；它里面也已经有一个
    可以拿来演示的坏引用。后面几步就从标题、关系、审计、回源这条线展开。

.. 操作::

   开场运行本脚本。讲完后运行 ``02_heading_catalog.py``。
"""

from __future__ import annotations

import projection_common as common


def main() -> None:
    context = common.load_context()
    common.render_header(
        "01 项目总览 Project Overview",
        "一篇红楼梦人物志，从普通 AsciiDoc 变成带源文证据的 RDF12 heading projection。",
    )
    common.console.print(common.metrics_table(context.metrics))
    common.console.print()
    common.console.print(f"[bold]源文件 Source:[/] {context.relative_source_path}")
    common.console.print(
        f"[bold]引用绑定率 Binding rate:[/] {context.metrics.bound_xref_count}/{context.metrics.xref_count} xrefs"
    )


if __name__ == "__main__":
    main()
