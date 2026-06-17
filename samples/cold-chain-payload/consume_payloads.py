# /// script
# dependencies = [
#   "pydantic>=2.12,<3",
#   "pyoxigraph>=0.5.8,<0.6",
#   "PyYAML>=6.0,<7",
# ]
# ///

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pyoxigraph import RdfFormat, Store


SAMPLE_FILE = "cold-chain-release.adoc"


class TemperatureWindow(BaseModel):
    min: int
    max: int


class CheckRule(BaseModel):
    code: str
    required: bool
    signals: list[str]


class ReleasePolicyConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    temperature_window_celsius: TemperatureWindow = Field(
        alias="temperatureWindowCelsius"
    )
    checks: list[CheckRule]
    manual_review_when: list[str] = Field(alias="manualReviewWhen")


class ReviewPlaybook(BaseModel):
    review_team: str
    steps: list[str]


class DependencyEvidence(BaseModel):
    source: str
    required_signals: list[str]
    risk_level: str
    reason: str


FIELD_MODELS: dict[str, type[BaseModel]] = {
    "release-policy-config": ReleasePolicyConfig,
    "review-playbook": ReviewPlaybook,
    "dependency-evidence": DependencyEvidence,
}


def main() -> None:
    repo_root = find_repo_root(Path(__file__).resolve())
    sample_path = Path(__file__).with_name(SAMPLE_FILE)
    ttl = project_sample(repo_root, sample_path)
    store = load_turtle(ttl)

    print("RDF12 cold-chain complex property report")
    print(f"Triples: {len(store)}")
    print()
    print_policy_report(store)
    print()
    print_relation_report(store)
    print()
    print_alias_report(store)


def find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "src").is_dir():
            return candidate
    raise RuntimeError(f"Could not find repository root from {start}")


def project_sample(repo_root: Path, sample_path: Path) -> str:
    relative_sample = sample_path.relative_to(repo_root)
    result = subprocess.run(
        [
            "pnpm",
            "--silent",
            "dev",
            relative_sample.as_posix(),
            "--format",
            "rdf12",
        ],
        cwd=repo_root,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout


def load_turtle(ttl: str) -> Store:
    store = Store()
    store.load(ttl, format=RdfFormat.TURTLE)
    return store


def print_policy_report(store: Store) -> None:
    heading = one(
        store,
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?heading ?headline WHERE {
          ?heading aat:addressLabel "cold-chain-release" ;
                   aat:headline ?headline .
        }
        """,
    )
    print(f"Policy: cold-chain-release / {value(heading['headline'])}")

    for field in ("release-policy-config", "review-playbook"):
        row = one(
            store,
            f"""
            PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
            SELECT ?format ?raw WHERE {{
              ?heading aat:addressLabel "cold-chain-release" ;
                       aat:{field} ?value .
              ?value aat:format ?format ;
                     aat:raw ?raw .
            }}
            """,
        )
        raw_format = value(row["format"])
        parsed = parse_field_value(field, raw_format, value(row["raw"]))
        print(f"  heading field {field} [{raw_format}]")
        print_field_summary(parsed)


def print_relation_report(store: Store) -> None:
    edge = one(
        store,
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?sourceHeadline ?targetHeadline ?sourceValueId ?format ?raw WHERE {
          ?edge aat:sourceHeading ?source ;
                aat:targetHeading ?target ;
                aat:dependency-evidence ?value .
          ?source aat:headline ?sourceHeadline .
          ?target aat:headline ?targetHeadline .
          ?value aat:sourceValueId ?sourceValueId ;
                 aat:format ?format ;
                 aat:raw ?raw .
        }
        """
    )
    raw_format = value(edge["format"])
    evidence = parse_field_value(
        "dependency-evidence",
        raw_format,
        value(edge["raw"]),
    )
    print(
        "Relation: "
        f"{value(edge['sourceHeadline'])} --depends-on--> "
        f"{value(edge['targetHeadline'])}"
    )
    print(f"  source value id: {value(edge['sourceValueId'])}")
    print(f"  edge field dependency-evidence [{raw_format}]")
    print_field_summary(evidence)


def print_alias_report(store: Store) -> None:
    print("Local target aliases:")
    for row in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?label ?headline WHERE {
          ?heading aat:headline ?headline ;
                   aat:addressLabel ?label .
          FILTER(?label IN ("rel-release-temperature-audit", "sensor-check-schema"))
        }
        ORDER BY ?label
        """
    ):
        print(f"  {value(row['label'])} -> {value(row['headline'])}")


def parse_field_value(field_name: str, raw_format: str, raw: str) -> BaseModel:
    model = FIELD_MODELS[field_name]
    data = parse_raw(raw_format, raw)
    try:
        return model.model_validate(data)
    except ValidationError as error:
        raise RuntimeError(f"{field_name} raw value failed validation: {error}") from error


def parse_raw(raw_format: str, raw: str) -> Any:
    match raw_format:
        case "json":
            return json.loads(raw)
        case "yaml" | "yml":
            return yaml.safe_load(raw)
        case _:
            raise RuntimeError(f"Unsupported raw value format: {raw_format}")


def print_field_summary(field_value: BaseModel) -> None:
    match field_value:
        case ReleasePolicyConfig():
            window = field_value.temperature_window_celsius
            required_checks = [
                check.code for check in field_value.checks if check.required
            ]
            signal_fields = sorted(
                {signal for check in field_value.checks for signal in check.signals}
            )
            print(
                f"    temperature window: {window.min}..{window.max} C"
            )
            print("    required checks: " + ", ".join(required_checks))
            print("    signal fields: " + ", ".join(signal_fields))
            print(
                "    manual review when: "
                + ", ".join(field_value.manual_review_when)
            )
        case ReviewPlaybook():
            print(f"    review team: {field_value.review_team}")
            print(f"    steps: {len(field_value.steps)}")
        case DependencyEvidence():
            print(f"    source: {field_value.source}")
            print(f"    risk level: {field_value.risk_level}")
            print(
                "    required signals: " + ", ".join(field_value.required_signals)
            )
            print(f"    reason: {field_value.reason}")


def one(store: Store, query: str):
    rows = list(store.query(query))
    if len(rows) != 1:
        raise RuntimeError(f"Expected one query result, got {len(rows)}")
    return rows[0]


def value(term) -> str:
    return term.value


if __name__ == "__main__":
    main()
