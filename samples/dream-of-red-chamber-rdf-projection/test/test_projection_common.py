from __future__ import annotations

from pathlib import Path

import sys

SAMPLE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SAMPLE_DIR))

import projection_common as common


def test_demo_projection_keeps_intentional_audit_findings() -> None:
    context = common.load_context()

    assert context.metrics.triples > 1500
    assert context.metrics.heading_count == 27
    assert context.metrics.xref_count == 52
    assert context.metrics.bound_xref_count == 51

    findings = common.audit_findings(context.store)
    codes = {finding.code for finding in findings}

    assert "xref.unresolved" in codes
    assert "xref.display-label-mismatch" in codes
    assert "relation.name-style" in codes
    assert "heading.label-suspicious" in codes


def test_source_trace_for_display_label_mismatch_points_to_line_121() -> None:
    context = common.load_context()
    mismatch = next(
        finding
        for finding in common.audit_findings(context.store)
        if finding.code == "xref.display-label-mismatch"
    )

    assert mismatch.line == 121
    assert mismatch.source_headline == "贾宝玉"
    assert "xref:贾政[贾母" in mismatch.raw

    excerpt = common.source_excerpt(context.repo_root, mismatch.relative_path, mismatch.line)

    assert excerpt.focus_line == 121
    assert any("xref:贾政[贾母" in line.text for line in excerpt.lines)
