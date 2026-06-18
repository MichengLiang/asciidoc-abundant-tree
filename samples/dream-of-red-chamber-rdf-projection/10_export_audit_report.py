# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 10 步：导出 A4 风格 HTML 报告。

讲解台词：

    现在把审计结果导出成 HTML。这个报告做成 A4 纸张风格，可以投影，
    也可以打印。

    报告里有投影指标、审计发现、关系类型分布和阵营关系矩阵。
    终端适合现场排查，HTML 适合发给别人看。两边的数据来自同一张 RDF 图。

.. 操作::

   运行后打开：

   .. code-block:: text

      samples/dream-of-red-chamber-rdf-projection/reports/dream-audit-report.html

   报告文件是生成物，已被 ``reports/.gitignore`` 忽略。
   讲完后运行 ``11_restore_source.py``。
"""

from __future__ import annotations

import projection_common as common


def main() -> None:
    context = common.load_context()
    report_path = common.write_html_report(context)
    common.render_header("10 导出审计报告 Export Audit Report", "已生成可打印的 HTML 审计报告。")
    common.console.print(f"[bold]报告文件 Report:[/] {report_path}")
    common.console.print("[bold]浏览器打开 Open in browser:[/] 直接打开上面的 HTML 文件即可。")


if __name__ == "__main__":
    main()
