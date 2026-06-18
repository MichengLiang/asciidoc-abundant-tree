# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
#   "rich>=13",
# ]
# ///

from __future__ import annotations

import html
import re
import shutil
import subprocess
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

from pyoxigraph import RdfFormat, Store
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

SAMPLE_FILE = "dream-of-red-chamber.adoc"
ORIGINAL_FILE = "source-original.adoc"
SNAPSHOT_FILE = "dream-of-red-chamber.ttl"
REPORT_DIR = "reports"

NS_AAT = "https://micheng.dev/ns/asciidoc-abundant-tree#"
NS_REL = "https://micheng.dev/ns/asciidoc-relation#"
NS_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"

console = Console()

SEVERITY_LABELS = {
    "ERROR": "错误 ERROR",
    "WARNING": "警告 WARNING",
    "INFO": "提示 INFO",
}

LABEL_KIND_LABELS = {
    "address": "手写地址",
    "generated": "生成地址",
    "-": "-",
}


@dataclass(frozen=True)
class Metrics:
    triples: int
    heading_count: int
    xref_count: int
    bound_xref_count: int
    relation_type_count: int
    unresolved_xref_count: int


@dataclass(frozen=True)
class ProjectionContext:
    repo_root: Path
    sample_dir: Path
    source_path: Path
    relative_source_path: str
    ttl: str
    store: Store
    metrics: Metrics


@dataclass(frozen=True)
class Heading:
    iri: str
    order: int
    level: int
    headline: str
    line: int
    label: str
    label_kind: str
    faction: str | None
    gender: str | None
    generation: str | None


@dataclass(frozen=True)
class Relation:
    edge_iri: str
    source_iri: str
    target_iri: str | None
    source_headline: str
    target_headline: str | None
    rel: str
    weight: float | None
    line: int
    raw: str
    target_selector: str
    display_label: str | None
    official_type: str | None
    relative_path: str


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    message: str
    source_headline: str
    target_headline: str | None
    line: int
    relative_path: str
    raw: str
    suggestion: str


@dataclass(frozen=True)
class SourceLine:
    number: int
    text: str


@dataclass(frozen=True)
class SourceExcerpt:
    relative_path: str
    focus_line: int
    lines: list[SourceLine]


def load_context(source_path: Path | None = None, use_snapshot: bool = False) -> ProjectionContext:
    sample_dir = Path(__file__).resolve().parent
    repo_root = find_repo_root(sample_dir)
    source_path = source_path or sample_dir / SAMPLE_FILE
    relative_source_path = source_path.relative_to(repo_root).as_posix()

    ttl = read_snapshot(sample_dir) if use_snapshot else project_source(repo_root, source_path)
    store = load_turtle(ttl)
    return ProjectionContext(
        repo_root=repo_root,
        sample_dir=sample_dir,
        source_path=source_path,
        relative_source_path=relative_source_path,
        ttl=ttl,
        store=store,
        metrics=metrics(store),
    )


def find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "src/cli.ts").is_file():
            return candidate
    raise RuntimeError(f"Could not find asciidoc-abundant-tree repo root from {start}")


def project_source(repo_root: Path, source_path: Path) -> str:
    relative_source = source_path.relative_to(repo_root)
    result = subprocess.run(
        ["pnpm", "--silent", "dev", relative_source.as_posix(), "--format", "rdf12"],
        cwd=repo_root,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout


def read_snapshot(sample_dir: Path) -> str:
    return (sample_dir / SNAPSHOT_FILE).read_text(encoding="utf-8")


def write_snapshot(context: ProjectionContext) -> Path:
    snapshot = context.sample_dir / SNAPSHOT_FILE
    snapshot.write_text(context.ttl, encoding="utf-8")
    return snapshot


def restore_source() -> Path:
    sample_dir = Path(__file__).resolve().parent
    source = sample_dir / SAMPLE_FILE
    original = sample_dir / ORIGINAL_FILE
    shutil.copyfile(original, source)
    return source


def load_turtle(ttl: str) -> Store:
    store = Store()
    store.load(ttl, format=RdfFormat.TURTLE)
    return store


def metrics(store: Store) -> Metrics:
    return Metrics(
        triples=len(store),
        heading_count=count(store, "?h a aat:Heading"),
        xref_count=count(store, "?e a aat:XrefEdge"),
        bound_xref_count=count(store, "?e a aat:XrefEdge ; aat:targetHeading ?t"),
        relation_type_count=len(relation_counts(store)),
        unresolved_xref_count=count(
            store,
            "?e a aat:XrefEdge . FILTER NOT EXISTS { ?e aat:targetHeading ?t }",
        ),
    )


def count(store: Store, where: str) -> int:
    row = next(
        iter(
            store.query(
                f"""
                PREFIX aat: <{NS_AAT}>
                SELECT (COUNT(*) AS ?count) WHERE {{ {where} }}
                """
            )
        )
    )
    return int(value(row["count"]))


def headings(store: Store) -> list[Heading]:
    rows = store.query(
        f"""
        PREFIX aat: <{NS_AAT}>
        SELECT ?heading ?order ?level ?headline ?line ?label ?generated ?faction ?gender ?generation WHERE {{
          ?heading a aat:Heading ;
                   aat:documentOrder ?order ;
                   aat:headingLevel ?level ;
                   aat:headingLine ?line ;
                   aat:headline ?headline .
          OPTIONAL {{ ?heading aat:addressLabel ?label }}
          OPTIONAL {{ ?heading aat:generatedAddressLabel ?generated }}
          OPTIONAL {{ ?heading aat:faction ?faction }}
          OPTIONAL {{ ?heading aat:gender ?gender }}
          OPTIONAL {{ ?heading aat:generation ?generation }}
        }}
        ORDER BY ?order ?label ?generated
        """
    )

    seen: set[str] = set()
    result: list[Heading] = []
    for row in rows:
        iri = value(row["heading"])
        if iri in seen:
            continue
        seen.add(iri)
        label_term = optional(row, "label")
        generated_term = optional(row, "generated")
        label = value(label_term) if label_term is not None else value(generated_term) if generated_term is not None else "-"
        label_kind = "address" if label_term is not None else "generated" if generated_term is not None else "-"
        result.append(
            Heading(
                iri=iri,
                order=int(value(row["order"])),
                level=int(value(row["level"])),
                headline=value(row["headline"]),
                line=int(value(row["line"])),
                label=label,
                label_kind=label_kind,
                faction=optional_value(row, "faction"),
                gender=optional_value(row, "gender"),
                generation=optional_value(row, "generation"),
            )
        )
    return result


def relations(store: Store) -> list[Relation]:
    rows = store.query(
        f"""
        PREFIX aat: <{NS_AAT}>
        SELECT ?edge ?source ?target ?sourceHeadline ?targetHeadline ?rel ?weight ?line ?raw
               ?targetSelector ?displayLabel ?officialType ?relativePath WHERE {{
          ?edge a aat:XrefEdge ;
                aat:sourceHeading ?source ;
                aat:startLine ?line ;
                aat:raw ?raw ;
                aat:targetSelector ?targetSelector ;
                aat:relativePath ?relativePath .
          ?source aat:headline ?sourceHeadline .
          OPTIONAL {{
            ?edge aat:targetHeading ?target .
            ?target aat:headline ?targetHeadline .
          }}
          OPTIONAL {{ ?edge aat:rel ?rel }}
          OPTIONAL {{ ?edge aat:weight ?weight }}
          OPTIONAL {{ ?edge aat:displayLabel ?displayLabel }}
          OPTIONAL {{ ?edge aat:officialResolvedType ?officialType }}
        }}
        ORDER BY ?line ?edge
        """
    )
    result: list[Relation] = []
    for row in rows:
        weight_text = optional_value(row, "weight")
        result.append(
            Relation(
                edge_iri=value(row["edge"]),
                source_iri=value(row["source"]),
                target_iri=optional_value(row, "target"),
                source_headline=value(row["sourceHeadline"]),
                target_headline=optional_value(row, "targetHeadline"),
                rel=optional_value(row, "rel") or "references",
                weight=float(weight_text) if weight_text is not None else None,
                line=int(value(row["line"])),
                raw=value(row["raw"]),
                target_selector=value(row["targetSelector"]),
                display_label=optional_value(row, "displayLabel"),
                official_type=optional_value(row, "officialType"),
                relative_path=value(row["relativePath"]),
            )
        )
    return result


def relation_counts(store: Store) -> Counter[str]:
    return Counter(relation.rel for relation in relations(store) if relation.target_iri is not None)


def faction_matrix(store: Store) -> dict[tuple[str, str], int]:
    heading_by_iri = {heading.iri: heading for heading in headings(store)}
    matrix: dict[tuple[str, str], int] = defaultdict(int)
    for relation in relations(store):
        if relation.target_iri is None:
            continue
        source = heading_by_iri.get(relation.source_iri)
        target = heading_by_iri.get(relation.target_iri)
        if source is None or target is None:
            continue
        source_faction = source.faction or "未标注"
        target_faction = target.faction or "未标注"
        matrix[(source_faction, target_faction)] += 1
    return dict(matrix)


def audit_findings(store: Store) -> list[Finding]:
    findings: list[Finding] = []
    for relation in relations(store):
        if relation.target_iri is None:
            findings.append(
                Finding(
                    severity="ERROR",
                    code="xref.unresolved",
                    message=f"引用目标未解析: {relation.target_selector}",
                    source_headline=relation.source_headline,
                    target_headline=None,
                    line=relation.line,
                    relative_path=relation.relative_path,
                    raw=relation.raw,
                    suggestion="为目标补一个 heading，或把 xref 改成已有 heading/ID。",
                )
            )
        if (
            relation.target_headline is not None
            and relation.display_label is not None
            and relation.display_label != relation.target_headline
        ):
            findings.append(
                Finding(
                    severity="WARNING",
                    code="xref.display-label-mismatch",
                    message=f"显示文本是 {relation.display_label}，但目标是 {relation.target_headline}",
                    source_headline=relation.source_headline,
                    target_headline=relation.target_headline,
                    line=relation.line,
                    relative_path=relation.relative_path,
                    raw=relation.raw,
                    suggestion="讲解时可现场把 xref 显示文本改成目标人物，或说明这是刻意放入的坏数据。",
                )
            )
        if relation.rel != "references" and not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", relation.rel):
            findings.append(
                Finding(
                    severity="WARNING",
                    code="relation.name-style",
                    message=f"关系名不符合小写 kebab-case: {relation.rel}",
                    source_headline=relation.source_headline,
                    target_headline=relation.target_headline,
                    line=relation.line,
                    relative_path=relation.relative_path,
                    raw=relation.raw,
                    suggestion=f"建议改成 {relation.rel.lower()}。",
                )
            )

    for heading in headings(store):
        if heading.headline == "贾兰" and heading.label == "jiabaochai":
            findings.append(
                Finding(
                    severity="WARNING",
                    code="heading.label-suspicious",
                    message="标题是贾兰，但 addressLabel 是 jiabaochai，适合作为 ID 健康度讲解样本。",
                    source_headline=heading.headline,
                    target_headline=None,
                    line=heading.line,
                    relative_path=source_relative_path(store),
                    raw=f"heading label={heading.label}",
                    suggestion="讲解时可现场把 ID 改成 jialan，再重新运行审计。",
                )
            )
    return sorted(findings, key=lambda finding: (finding.line, finding.code))


def source_relative_path(store: Store) -> str:
    rows = store.query(
        f"""
        PREFIX aat: <{NS_AAT}>
        SELECT ?path WHERE {{ ?source a aat:AsciiDocSourceDocument ; aat:relativePath ?path }}
        LIMIT 1
        """
    )
    for row in rows:
        return value(row["path"])
    return SAMPLE_FILE


def source_excerpt(repo_root: Path, relative_path: str, focus_line: int, context: int = 2) -> SourceExcerpt:
    source_path = repo_root / relative_path
    lines = source_path.read_text(encoding="utf-8").splitlines()
    start = max(1, focus_line - context)
    end = min(len(lines), focus_line + context)
    return SourceExcerpt(
        relative_path=relative_path,
        focus_line=focus_line,
        lines=[SourceLine(number=index, text=lines[index - 1]) for index in range(start, end + 1)],
    )


def neighborhood(store: Store, name: str) -> tuple[list[Relation], list[Relation]]:
    outgoing: list[Relation] = []
    incoming: list[Relation] = []
    for relation in relations(store):
        if relation.source_headline == name:
            outgoing.append(relation)
        if relation.target_headline == name:
            incoming.append(relation)
    return outgoing, incoming


def blast_radius(store: Store, name: str, depth: int = 2) -> dict[str, int]:
    adjacency: dict[str, set[str]] = defaultdict(set)
    for relation in relations(store):
        if relation.target_headline is None:
            continue
        adjacency[relation.source_headline].add(relation.target_headline)
        adjacency[relation.target_headline].add(relation.source_headline)

    result = {name: 0}
    queue: deque[tuple[str, int]] = deque([(name, 0)])
    while queue:
        current, current_depth = queue.popleft()
        if current_depth >= depth:
            continue
        for neighbor in sorted(adjacency[current]):
            if neighbor in result:
                continue
            result[neighbor] = current_depth + 1
            queue.append((neighbor, current_depth + 1))
    return result


def top_weighted_relations(store: Store, limit: int = 12) -> list[Relation]:
    weighted = [relation for relation in relations(store) if relation.weight is not None]
    return sorted(weighted, key=lambda relation: (-relation.weight, relation.line))[:limit]


def duplicate_relations(store: Store) -> list[tuple[tuple[str, str, str], list[Relation]]]:
    groups: dict[tuple[str, str, str], list[Relation]] = defaultdict(list)
    for relation in relations(store):
        if relation.target_headline is None:
            continue
        groups[(relation.source_headline, relation.rel, relation.target_headline)].append(relation)
    return [(key, rows) for key, rows in groups.items() if len(rows) > 1]


def render_header(title: str, subtitle: str) -> None:
    console.print(Panel(Text(subtitle, style="white"), title=f"[bold cyan]{title}[/]", border_style="cyan"))


def metrics_table(metrics_value: Metrics) -> Table:
    table = Table(title="投影指标 Projection Metrics", show_header=True, header_style="bold cyan")
    table.add_column("指标")
    table.add_column("数值", justify="right")
    table.add_row("三元组 Triples", str(metrics_value.triples))
    table.add_row("标题实体 Headings", str(metrics_value.heading_count))
    table.add_row("交叉引用 Xref edges", str(metrics_value.xref_count))
    table.add_row("已绑定引用 Bound xrefs", str(metrics_value.bound_xref_count))
    table.add_row("未解析引用 Unresolved xrefs", str(metrics_value.unresolved_xref_count))
    table.add_row("关系类型 Relation types", str(metrics_value.relation_type_count))
    return table


def finding_style(severity: str) -> str:
    return {"ERROR": "bold red", "WARNING": "yellow", "INFO": "blue"}.get(severity, "white")


def severity_label(severity: str) -> str:
    return SEVERITY_LABELS.get(severity, severity)


def label_kind_label(label_kind: str) -> str:
    return LABEL_KIND_LABELS.get(label_kind, label_kind)


def html_report(context: ProjectionContext, findings: list[Finding]) -> str:
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    relation_rows = "".join(
        f"<tr><td>{html.escape(rel)}</td><td>{count_value}</td></tr>"
        for rel, count_value in relation_counts(context.store).most_common()
    )
    finding_rows = "".join(
        "<tr>"
        f"<td class='{finding.severity.lower()}'>{html.escape(severity_label(finding.severity))}</td>"
        f"<td>{html.escape(finding.code)}</td>"
        f"<td>{html.escape(finding.source_headline)}</td>"
        f"<td>{finding.line}</td>"
        f"<td>{html.escape(finding.message)}</td>"
        f"<td><code>{html.escape(finding.raw)}</code></td>"
        f"<td>{html.escape(finding.suggestion)}</td>"
        "</tr>"
        for finding in findings
    )
    matrix_rows = "".join(
        f"<tr><td>{html.escape(source)}</td><td>{html.escape(target)}</td><td>{count_value}</td></tr>"
        for (source, target), count_value in sorted(faction_matrix(context.store).items())
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>红楼梦 RDF 投影审计报告</title>
<style>
body {{ background: #e7e5df; margin: 0; font-family: 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif; color: #24211d; }}
.page {{ width: 210mm; min-height: 297mm; margin: 16px auto; padding: 18mm; background: #fffdf8; box-shadow: 0 8px 28px rgba(40, 34, 24, .18); box-sizing: border-box; }}
h1 {{ margin: 0 0 8px; font-size: 28px; }}
h2 {{ margin-top: 28px; border-bottom: 1px solid #d8d0c0; padding-bottom: 6px; }}
.meta {{ color: #6b6254; font-size: 13px; }}
.kpis {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }}
.kpi {{ border: 1px solid #d8d0c0; padding: 10px; background: #faf6ed; }}
.kpi strong {{ display: block; font-size: 22px; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }}
th, td {{ border: 1px solid #d8d0c0; padding: 6px 7px; vertical-align: top; }}
th {{ background: #efe7d8; text-align: left; }}
code {{ font-family: 'Noto Sans Mono CJK SC', monospace; font-size: 11px; }}
.error {{ color: #a12222; font-weight: 700; }}
.warning {{ color: #8a5a00; font-weight: 700; }}
@media print {{ body {{ background: white; }} .page {{ margin: 0; box-shadow: none; }} }}
</style>
</head>
<body>
<main class="page">
<h1>红楼梦 RDF 投影审计报告</h1>
<div class="meta">生成时间：{generated_at}<br>源文件：{html.escape(context.relative_source_path)}</div>
<section class="kpis">
<div class="kpi"><span>三元组 Triples</span><strong>{context.metrics.triples}</strong></div>
<div class="kpi"><span>标题实体 Headings</span><strong>{context.metrics.heading_count}</strong></div>
<div class="kpi"><span>交叉引用 Xref Edges</span><strong>{context.metrics.xref_count}</strong></div>
<div class="kpi"><span>已绑定 Bound Xrefs</span><strong>{context.metrics.bound_xref_count}</strong></div>
<div class="kpi"><span>未解析 Unresolved</span><strong>{context.metrics.unresolved_xref_count}</strong></div>
<div class="kpi"><span>发现 Findings</span><strong>{len(findings)}</strong></div>
</section>
<h2>审计发现</h2>
<table>
<thead><tr><th>级别</th><th>代码</th><th>来源</th><th>行</th><th>说明</th><th>证据</th><th>讲解/修复建议</th></tr></thead>
<tbody>{finding_rows}</tbody>
</table>
<h2>关系类型分布</h2>
<table><thead><tr><th>关系</th><th>数量</th></tr></thead><tbody>{relation_rows}</tbody></table>
<h2>阵营关系矩阵</h2>
<table><thead><tr><th>来源阵营</th><th>目标阵营</th><th>关系数</th></tr></thead><tbody>{matrix_rows}</tbody></table>
</main>
</body>
</html>
"""


def write_html_report(context: ProjectionContext) -> Path:
    findings = audit_findings(context.store)
    report_dir = context.sample_dir / REPORT_DIR
    report_dir.mkdir(exist_ok=True)
    report_path = report_dir / "dream-audit-report.html"
    report_path.write_text(html_report(context, findings), encoding="utf-8")
    return report_path


def value(term) -> str:
    return term.value


def optional(row, key: str):
    try:
        return row[key]
    except KeyError:
        return None


def optional_value(row, key: str) -> str | None:
    term = optional(row, key)
    return None if term is None else value(term)


def unique(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))
