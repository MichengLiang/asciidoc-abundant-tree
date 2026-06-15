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


class ReleasePolicyConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    temperature_window_celsius: tuple[int, int] = Field(
        alias="temperatureWindowCelsius"
    )
    max_offline_minutes: int = Field(alias="maxOfflineMinutes")
    manual_review_when: list[str] = Field(alias="manualReviewWhen")


class ReviewPlaybook(BaseModel):
    review_team: str
    steps: list[str]


class DependencyEvidence(BaseModel):
    source: str
    required_signals: list[str]
    risk_level: str
    reason: str


PAYLOAD_MODELS: dict[str, type[BaseModel]] = {
    "release-policy-config": ReleasePolicyConfig,
    "review-playbook": ReviewPlaybook,
    "dependency-evidence": DependencyEvidence,
}


def main() -> None:
    repo_root = find_repo_root(Path(__file__).resolve())
    sample_path = Path(__file__).with_name(SAMPLE_FILE)
    ttl = project_sample(repo_root, sample_path)
    store = load_turtle(ttl)

    print("RDF12 cold-chain payload report")
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

    for payload in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?payload ?role ?format ?raw WHERE {
          ?heading aat:addressLabel "cold-chain-release" ;
                   aat:payload ?payload .
          ?payload aat:payloadKind "node" ;
                   aat:role ?role ;
                   aat:format ?format ;
                   aat:raw ?raw .
        }
        ORDER BY ?payload
        """
    ):
        role = value(payload["role"])
        payload_format = value(payload["format"])
        parsed = parse_payload(role, payload_format, value(payload["raw"]))
        print(f"  node payload {role} [{payload_format}]")
        print_payload_summary(parsed)


def print_relation_report(store: Store) -> None:
    edge = one(
        store,
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?sourceHeadline ?targetHeadline ?selector ?role ?format ?raw WHERE {
          ?edge aat:sourceHeading ?source ;
                aat:targetHeading ?target ;
                aat:payloadSelector ?selector ;
                aat:payload ?payload .
          ?source aat:headline ?sourceHeadline .
          ?target aat:headline ?targetHeadline .
          ?payload aat:payloadKind "edge" ;
                   aat:role ?role ;
                   aat:format ?format ;
                   aat:raw ?raw .
        }
        """
    )
    role = value(edge["role"])
    payload_format = value(edge["format"])
    evidence = parse_payload(role, payload_format, value(edge["raw"]))
    print(
        "Relation: "
        f"{value(edge['sourceHeadline'])} --depends-on--> "
        f"{value(edge['targetHeadline'])}"
    )
    print(f"  payload selector: {value(edge['selector'])}")
    print(f"  edge payload {role} [{payload_format}]")
    print_payload_summary(evidence)


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


def parse_payload(role: str, payload_format: str, raw: str) -> BaseModel:
    model = PAYLOAD_MODELS[role]
    data = parse_raw(payload_format, raw)
    try:
        return model.model_validate(data)
    except ValidationError as error:
        raise RuntimeError(f"{role} payload failed validation: {error}") from error


def parse_raw(payload_format: str, raw: str) -> Any:
    match payload_format:
        case "json":
            return json.loads(raw)
        case "yaml" | "yml":
            return yaml.safe_load(raw)
        case _:
            raise RuntimeError(f"Unsupported payload format: {payload_format}")


def print_payload_summary(payload: BaseModel) -> None:
    match payload:
        case ReleasePolicyConfig():
            low, high = payload.temperature_window_celsius
            print(f"    temperature window: {low}..{high} C")
            print(f"    max offline minutes: {payload.max_offline_minutes}")
            print(
                "    manual review when: "
                + ", ".join(payload.manual_review_when)
            )
        case ReviewPlaybook():
            print(f"    review team: {payload.review_team}")
            print(f"    steps: {len(payload.steps)}")
        case DependencyEvidence():
            print(f"    source: {payload.source}")
            print(f"    risk level: {payload.risk_level}")
            print(
                "    required signals: " + ", ".join(payload.required_signals)
            )
            print(f"    reason: {payload.reason}")


def one(store: Store, query: str):
    rows = list(store.query(query))
    if len(rows) != 1:
        raise RuntimeError(f"Expected one query result, got {len(rows)}")
    return rows[0]


def value(term) -> str:
    return term.value


if __name__ == "__main__":
    main()
