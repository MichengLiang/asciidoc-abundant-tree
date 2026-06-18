# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 9 步：全局深度审计。

讲解台词：

    现在看全局审计。前面的几个问题在这里集中出现：关系名风格、显示文本错配、
    可疑 ID、未解析引用。

    下面还有一条重复关系证据。它表示同一个来源、同一种关系、同一个目标，
    在两个位置都出现了证据。重复不一定是错，但它值得被看见。

    这一页最适合演示闭环：先发现问题，再看行号，再改源文，再重新运行脚本。
    如果问题真的修好了，它就会从这张表里消失。

.. 操作::

   现场修复的最小闭环：

   1. 打开 ``dream-of-red-chamber.adoc``。
   2. 修改第 121 行，把 xref 显示文本从 ``贾母`` 改成 ``贾政``。
   3. 重新运行本脚本，观察 ``xref.display-label-mismatch`` 是否消失。
   4. 演示结束后运行 ``11_restore_source.py`` 恢复原始测试数据。

   讲完后运行 ``10_export_audit_report.py``。
"""

from __future__ import annotations

from rich.table import Table

import projection_common as common


def main() -> None:
    context = common.load_context()
    findings = common.audit_findings(context.store)
    duplicates = common.duplicate_relations(context.store)
    common.render_header("09 全局审计 Global Audit", "把引用健康度、命名风格、重复证据汇总成审计视图。")

    finding_table = Table(title="审计发现 Findings", header_style="bold cyan")
    finding_table.add_column("级别")
    finding_table.add_column("代码 Code")
    finding_table.add_column("行号", justify="right")
    finding_table.add_column("说明")
    finding_table.add_column("讲解/修复建议")
    for finding in findings:
        finding_table.add_row(
            f"[{common.finding_style(finding.severity)}]{common.severity_label(finding.severity)}[/]",
            finding.code,
            str(finding.line),
            finding.message,
            finding.suggestion,
        )
    common.console.print(finding_table)

    duplicate_table = Table(title="重复关系证据 Duplicate Relation Evidence", header_style="bold magenta")
    duplicate_table.add_column("来源 Source")
    duplicate_table.add_column("Rel")
    duplicate_table.add_column("目标 Target")
    duplicate_table.add_column("行号 Lines")
    for (source, rel, target), rows in duplicates:
        duplicate_table.add_row(source, rel, target, ", ".join(str(row.line) for row in rows))
    common.console.print(duplicate_table)


if __name__ == "__main__":
    main()
