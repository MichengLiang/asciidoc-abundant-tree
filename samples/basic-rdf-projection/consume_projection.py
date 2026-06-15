# /// script
# dependencies = [
#   "pyoxigraph>=0.5.8,<0.6",
# ]
# ///

from __future__ import annotations

import subprocess
from pathlib import Path

from pyoxigraph import RdfFormat, Store


SAMPLE_FILE = "basic-projection.adoc"
NS_AAT = "https://micheng.dev/ns/asciidoc-abundant-tree#"


def main() -> None:
    repo_root = find_repo_root(Path(__file__).resolve())
    sample_path = Path(__file__).with_name(SAMPLE_FILE)
    ttl = project_sample(repo_root, sample_path)
    store = load_turtle(ttl)

    print("RDF12 basic projection report")
    print(f"Triples: {len(store)}")
    print()
    print_headings(store)
    print()
    print_containment(store)
    print()
    print_xref_edges(store)
    print()
    print_local_aliases(store)


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


def print_headings(store: Store) -> None:
    print("Headings by document order:")
    for row in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?heading ?order ?level ?headline WHERE {
          ?heading a aat:Heading ;
                   aat:documentOrder ?order ;
                   aat:headingLevel ?level ;
                   aat:headline ?headline .
        }
        ORDER BY ?order
        """
    ):
        heading = value(row["heading"])
        labels = literal_values(store, heading, "addressLabel")
        generated = literal_values(store, heading, "generatedAddressLabel")
        roles = literal_values(store, heading, "role")
        statuses = literal_values(store, heading, "status")
        label_text = ", ".join(labels or generated) or "-"
        role_text = f" role={roles[0]}" if roles else ""
        status_text = f" status={statuses[0]}" if statuses else ""
        print(
            f"  {value(row['order'])}. "
            f"[level {value(row['level'])}] "
            f"{value(row['headline'])} "
            f"labels={label_text}{role_text}{status_text}"
        )


def print_containment(store: Store) -> None:
    print("Containment:")
    for row in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?parentHeadline ?childHeadline ?childOrder WHERE {
          ?parent aat:containsDirectly ?child ;
                  aat:headline ?parentHeadline .
          ?child aat:headline ?childHeadline ;
                 aat:childOrder ?childOrder .
        }
        ORDER BY ?parentHeadline ?childOrder
        """
    ):
        print(
            f"  {value(row['parentHeadline'])} "
            f"--child {value(row['childOrder'])}--> "
            f"{value(row['childHeadline'])}"
        )


def print_xref_edges(store: Store) -> None:
    print("Xref edges:")
    for row in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?sourceHeadline ?targetHeadline ?targetSelector ?rel ?weight ?officialType WHERE {
          ?edge a aat:XrefEdge ;
                aat:sourceHeading ?source ;
                aat:targetHeading ?target ;
                aat:targetSelector ?targetSelector ;
                aat:officialResolvedType ?officialType .
          ?source aat:headline ?sourceHeadline .
          ?target aat:headline ?targetHeadline .
          OPTIONAL { ?edge aat:rel ?rel }
          OPTIONAL { ?edge aat:weight ?weight }
        }
        ORDER BY ?sourceHeadline ?targetSelector
        """
    ):
        rel = optional_value(row, "rel") or "references"
        weight = optional_value(row, "weight")
        suffix = f" weight={weight}" if weight is not None else ""
        print(
            f"  {value(row['sourceHeadline'])} "
            f"--{rel}--> "
            f"{value(row['targetHeadline'])} "
            f"(selector={value(row['targetSelector'])}, "
            f"resolvedType={value(row['officialType'])}{suffix})"
        )


def print_local_aliases(store: Store) -> None:
    print("Local target aliases:")
    for row in store.query(
        """
        PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
        SELECT ?label ?headline WHERE {
          ?heading aat:headline ?headline ;
                   aat:addressLabel ?label .
          FILTER(?label IN ("stock-query-example"))
        }
        ORDER BY ?label
        """
    ):
        print(f"  {value(row['label'])} -> {value(row['headline'])}")


def literal_values(store: Store, subject: str, predicate_local_name: str) -> list[str]:
    rows = store.query(
        f"""
        PREFIX aat: <{NS_AAT}>
        SELECT ?value WHERE {{
          <{subject}> aat:{predicate_local_name} ?value .
        }}
        ORDER BY ?value
        """
    )
    return [value(row["value"]) for row in rows]


def optional_value(row, key: str) -> str | None:
    try:
        term = row[key]
    except KeyError:
        return None
    return None if term is None else value(term)


def value(term) -> str:
    return term.value


if __name__ == "__main__":
    main()
