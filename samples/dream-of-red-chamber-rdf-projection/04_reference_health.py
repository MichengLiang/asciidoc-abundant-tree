# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 4 步：引用健康度。

讲解台词：

    现在进入审计。这个样例故意留了几处问题，方便演示文档怎么被检查。

    第一处是关系名：``Prefers-as-daughter-in-law`` 里有大写字母。
    第二处是显示文本：有一条链接实际指向“贾政”，显示出来却是“贾母”。
    第三处是地址标签：“贾兰”的 ID 写成了 ``jiabaochai``。
    第四处是未解析引用：“巧姐”被引用了，但文章里没有“巧姐”这个标题实体。

    这些问题都有行号，也都有原始证据。后面可以直接回到源文改，
    改完再跑一次审计。

.. 操作::

   记下适合现场修改的位置：

   * 第 71 行：把 ``rel=Prefers-as-daughter-in-law`` 改成小写。
   * 第 121 行：把 ``xref:贾政[贾母,...]`` 的显示文本改成 ``贾政``。
   * 第 183 行：把“贾兰”的 ID 从 ``jiabaochai`` 改成 ``jialan``。
   * 第 454 行：为“巧姐”补 heading，或把 xref 改成已有目标。

   讲完后运行 ``05_source_trace.py``。
"""

from __future__ import annotations

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    findings = common.audit_findings(context.store)
    common.render_header("04 引用健康度 Reference Health", "把 xref 和 heading label 当成可审计的数据资产。")
    common.console.print(common.metrics_table(context.metrics))

    table = Table(title="审计发现 Audit Findings", header_style="bold cyan")
    table.add_column("级别")
    table.add_column("代码 Code")
    table.add_column("来源")
    table.add_column("行号", justify="right")
    table.add_column("说明")
    table.add_column("原始证据 Raw")

    for finding in findings:
        table.add_row(
            f"[{common.finding_style(finding.severity)}]{common.severity_label(finding.severity)}[/]",
            finding.code,
            finding.source_headline,
            str(finding.line),
            finding.message,
            finding.raw,
        )
    common.console.print(table)


if __name__ == "__main__":
    main()
