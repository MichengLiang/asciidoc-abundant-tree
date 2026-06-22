# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
#   "typer>=0.25",
# ]
# ///

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated, Callable

import typer
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table

import projection_common as common

app = typer.Typer(
    help="红楼梦 RDF Projection 演示样例的统一命令入口。",
    no_args_is_help=True,
)

SnapshotOption = Annotated[
    bool,
    typer.Option(
        "--snapshot",
        help="读取预生成 dream-of-red-chamber.ttl；默认实时投影 dream-of-red-chamber.adoc。",
    ),
]
SourceOption = Annotated[
    Path | None,
    typer.Option(
        "--source",
        exists=True,
        dir_okay=False,
        readable=True,
        resolve_path=True,
        help="要投影的 AsciiDoc 源文件；默认使用本样例的 dream-of-red-chamber.adoc。",
    ),
]


def load_context(source: Path | None = None, snapshot: bool = False) -> common.ProjectionContext:
    if snapshot and source is not None:
        common.console.print("[bold red]--snapshot 读取固定 TTL，不能同时指定 --source。[/]")
        raise typer.Exit(2)
    try:
        return common.load_context(source_path=source, use_snapshot=snapshot)
    except subprocess.CalledProcessError as error:
        common.console.print(f"[bold red]投影命令失败 Exit {error.returncode}[/]")
        common.console.print(f"[bold]Command:[/] {' '.join(error.cmd)}")
        if error.stderr:
            common.console.print("[bold]stderr:[/]")
            common.console.print(error.stderr.strip())
        raise typer.Exit(1) from error
    except Exception as error:
        common.console.print(f"[bold red]加载投影上下文失败:[/] {error}")
        raise typer.Exit(1) from error


def print_project_overview(context: common.ProjectionContext) -> None:
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


def print_heading_catalog(context: common.ProjectionContext) -> None:
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


def print_relation_inventory(context: common.ProjectionContext) -> None:
    common.render_header("03 关系清单 Relation Inventory", "统计关系类型，并列出权重最高的人物关系边。")

    count_table = Table(title="关系类型计数 Relation Type Counts", header_style="bold cyan")
    count_table.add_column("关系 rel")
    count_table.add_column("数量", justify="right")
    for rel, count in common.relation_counts(context.store).most_common():
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


def print_reference_health(context: common.ProjectionContext) -> None:
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


def print_excerpt(context: common.ProjectionContext, relative_path: str, line: int) -> None:
    excerpt = common.source_excerpt(context.repo_root, relative_path, line, context=2)
    text = "\n".join(
        f"{source_line.number:>4} {'>' if source_line.number == excerpt.focus_line else ' '} {source_line.text}"
        for source_line in excerpt.lines
    )
    common.console.print(Syntax(text, "asciidoc", line_numbers=False, word_wrap=True))


def print_source_trace(context: common.ProjectionContext) -> None:
    common.render_header("05 源文追踪 Source Trace", "从查询结果跳回源文片段，演示 source-aware graph。")

    strong = next(
        relation
        for relation in common.relations(context.store)
        if relation.source_headline == "贾宝玉" and relation.rel == "loves"
    )
    common.console.print(
        Panel(
            f"{strong.source_headline} --{strong.rel}--> {strong.target_headline}\n原始证据 raw: {strong.raw}",
            title="正常关系证据",
        )
    )
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


def print_blast_radius(context: common.ProjectionContext, name: str, depth: int) -> None:
    radius = common.blast_radius(context.store, name, depth=depth)
    common.render_header("06 爆炸半径 Blast Radius", f"从 {name} 出发，展开 {depth} 层人物关系影响范围。")

    table = Table(header_style="bold cyan")
    table.add_column("层数 Depth", justify="right")
    table.add_column("人物 Character")
    for character, character_depth in sorted(radius.items(), key=lambda item: (item[1], item[0])):
        table.add_row(str(character_depth), character)
    common.console.print(table)


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


def print_character_neighborhood(context: common.ProjectionContext, name: str) -> None:
    outgoing, incoming = common.neighborhood(context.store, name)
    common.render_header("07 人物邻域 Character Neighborhood", f"人物 {name} 的出边 outgoing / 入边 incoming 关系画像。")
    common.console.print(relation_table("出边 Outgoing", outgoing, incoming=False))
    common.console.print(relation_table("入边 Incoming", incoming, incoming=True))


def print_faction_matrix(context: common.ProjectionContext) -> None:
    common.render_header("08 阵营矩阵 Faction Matrix", "按来源阵营 source faction 和目标阵营 target faction 聚合人物关系。")

    table = Table(header_style="bold cyan")
    table.add_column("来源阵营 Source Faction")
    table.add_column("目标阵营 Target Faction")
    table.add_column("关系数 Edges", justify="right")
    for (source, target), count in sorted(common.faction_matrix(context.store).items()):
        table.add_row(source, target, str(count))
    common.console.print(table)


def print_global_audit(context: common.ProjectionContext) -> None:
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


def export_audit_report(context: common.ProjectionContext) -> Path:
    report_path = common.write_html_report(context)
    common.render_header("10 导出审计报告 Export Audit Report", "已生成可打印的 HTML 审计报告。")
    common.console.print(f"[bold]报告文件 Report:[/] {report_path}")
    common.console.print("[bold]浏览器打开 Open in browser:[/] 直接打开上面的 HTML 文件即可。")
    return report_path


@app.command()
def overview(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """01 项目总览：打印投影指标和引用绑定率。"""
    print_project_overview(load_context(source, snapshot))


@app.command()
def headings(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """02 标题目录：列出标题实体、地址标签、阵营字段和源文行号。"""
    print_heading_catalog(load_context(source, snapshot))


@app.command()
def relations(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """03 关系清单：统计关系类型，并显示最高权重关系。"""
    print_relation_inventory(load_context(source, snapshot))


@app.command()
def health(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """04 引用健康度：显示 xref、关系名和 heading label 审计发现。"""
    print_reference_health(load_context(source, snapshot))


@app.command()
def trace(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """05 源文追踪：把关系和审计发现定位回 AsciiDoc 源文片段。"""
    print_source_trace(load_context(source, snapshot))


@app.command("blast-radius")
def blast_radius(
    name: Annotated[str, typer.Argument(help="起点人物。")] = "贾宝玉",
    depth: Annotated[int, typer.Option("--depth", min=1, help="关系展开层数。")] = 2,
    source: SourceOption = None,
    snapshot: SnapshotOption = False,
) -> None:
    """06 爆炸半径：查看某个人物的关系影响范围。"""
    print_blast_radius(load_context(source, snapshot), name, depth)


@app.command()
def neighborhood(
    name: Annotated[str, typer.Argument(help="要查看的人物。")] = "林黛玉",
    source: SourceOption = None,
    snapshot: SnapshotOption = False,
) -> None:
    """07 人物邻域：显示某个人物的出边和入边。"""
    print_character_neighborhood(load_context(source, snapshot), name)


@app.command("faction-matrix")
def faction_matrix(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """08 阵营矩阵：按来源阵营和目标阵营聚合关系。"""
    print_faction_matrix(load_context(source, snapshot))


@app.command()
def audit(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """09 全局审计：汇总审计发现和重复关系证据。"""
    print_global_audit(load_context(source, snapshot))


@app.command("export-report")
def export_report(source: SourceOption = None, snapshot: SnapshotOption = False) -> None:
    """10 导出 A4 风格 HTML 审计报告。"""
    export_audit_report(load_context(source, snapshot))


@app.command("restore-source")
def restore_source() -> None:
    """11 恢复主演示文件：用 source-original.adoc 覆盖 dream-of-red-chamber.adoc。"""
    restored = common.restore_source()
    common.console.print(
        Panel(
            f"已从 source-original.adoc 恢复 {restored.name}",
            title="源文已恢复 Source Restored",
            border_style="green",
        )
    )


@app.command()
def snapshot(source: SourceOption = None) -> None:
    """重新实时投影源文，并写回 dream-of-red-chamber.ttl。"""
    context = load_context(source, snapshot=False)
    snapshot_path = common.write_snapshot(context)
    common.console.print(f"[bold green]TTL snapshot 已更新:[/] {snapshot_path}")


@app.command("run-all")
def run_all(
    source: SourceOption = None,
    snapshot: SnapshotOption = False,
    blast_name: Annotated[str, typer.Option("--blast-name", help="爆炸半径步骤使用的人物。")] = "贾宝玉",
    blast_depth: Annotated[int, typer.Option("--blast-depth", min=1, help="爆炸半径步骤展开层数。")] = 2,
    neighborhood_name: Annotated[str, typer.Option("--neighborhood-name", help="人物邻域步骤使用的人物。")] = "林黛玉",
) -> None:
    """按 01 到 10 的演示顺序运行全部查询和报告导出；不会恢复源文。"""
    context = load_context(source, snapshot)
    steps: list[Callable[[], None]] = [
        lambda: print_project_overview(context),
        lambda: print_heading_catalog(context),
        lambda: print_relation_inventory(context),
        lambda: print_reference_health(context),
        lambda: print_source_trace(context),
        lambda: print_blast_radius(context, blast_name, blast_depth),
        lambda: print_character_neighborhood(context, neighborhood_name),
        lambda: print_faction_matrix(context),
        lambda: print_global_audit(context),
        lambda: export_audit_report(context),
    ]
    for index, step in enumerate(steps, start=1):
        if index > 1:
            common.console.rule(style="dim")
        step()


if __name__ == "__main__":
    app()
