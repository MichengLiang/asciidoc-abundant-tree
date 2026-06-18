# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///
"""
第 5 步：从图回到源文。

讲解台词：

    现在从图回到原文。前面看到的是表格和关系，这里直接把证据行打印出来。

    第一段是正常关系：贾宝玉指向林黛玉，原文第 105 行就是这条关系的来源。
    第二段是显示文本问题：目标是贾政，但显示文本写成了贾母。
    第三段是未解析引用：刘姥姥引用巧姐，证据行存在，但目标标题不存在。

    这一步很重要。图谱不是把文本抽走以后就不管原文了；每条关系都能回到
    原文位置，能看到上下文，也能看到 raw xref。

.. 操作::

   演示手动修复时，打开 ``dream-of-red-chamber.adoc``：

   * 第 121 行：把 ``xref:贾政[贾母, rel=son-of, weight=0.3]`` 改成
     ``xref:贾政[贾政, rel=son-of, weight=0.3]``。
   * 第 454 行：在“刘姥姥”之前或之后补一个 ``== 巧姐`` heading，并加上
     合适的 ID 和字段。

   修改后重新运行 ``04_reference_health.py`` 或 ``09_global_audit.py``。
   讲完源文定位后运行 ``06_blast_radius.py``。
"""

from __future__ import annotations

from rich.panel import Panel
from rich.syntax import Syntax

import projection_common as common


def print_excerpt(context: common.ProjectionContext, relative_path: str, line: int) -> None:
    excerpt = common.source_excerpt(context.repo_root, relative_path, line, context=2)
    text = "\n".join(
        f"{source_line.number:>4} {'>' if source_line.number == excerpt.focus_line else ' '} {source_line.text}"
        for source_line in excerpt.lines
    )
    common.console.print(Syntax(text, "asciidoc", line_numbers=False, word_wrap=True))


def main() -> None:
    context = common.load_context()
    common.render_header("05 源文追踪 Source Trace", "从查询结果跳回源文片段，演示 source-aware graph。")

    strong = next(
        relation
        for relation in common.relations(context.store)
        if relation.source_headline == "贾宝玉" and relation.rel == "loves"
    )
    common.console.print(Panel(f"{strong.source_headline} --{strong.rel}--> {strong.target_headline}\n原始证据 raw: {strong.raw}", title="正常关系证据"))
    print_excerpt(context, strong.relative_path, strong.line)

    for finding in common.audit_findings(context.store):
        if finding.code in {"xref.display-label-mismatch", "xref.unresolved"}:
            common.console.print()
            common.console.print(
                Panel(
                    f"{finding.message}\n原始证据 raw: {finding.raw}\n讲解/修复建议: {finding.suggestion}",
                    title=f"{common.severity_label(finding.severity)} {finding.code}",
                    border_style="yellow" if finding.severity == "WARNING" else "red",
                )
            )
            print_excerpt(context, finding.relative_path, finding.line)


if __name__ == "__main__":
    main()
