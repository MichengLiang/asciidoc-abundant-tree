# asciidoc-abundant-tree

[![npm version](https://img.shields.io/npm/v/asciidoc-abundant-tree.svg)](https://www.npmjs.com/package/asciidoc-abundant-tree)
[![CI](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml)
[![Pages](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/pages.yml/badge.svg)](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/pages.yml)
[![License](https://img.shields.io/npm/l/asciidoc-abundant-tree.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/asciidoc-abundant-tree.svg)](./package.json)

`asciidoc-abundant-tree` turns an AsciiDoc source file, or an explicit book-entry include graph, into a source-aware, analysis-ready document tree.

The package exists for tools that need more than rendered HTML and less than a full AsciiDoc language server. Asciidoctor is excellent at conversion and official reference resolution, but its public output surfaces are not shaped as a compact source map for downstream static analysis. This package keeps Asciidoctor as the authority for AsciiDoc semantics, then adds a TypeScript object model that preserves the authored surface, source spans, block structure, target catalog, xref occurrences, and official xref bindings in one object.

The pretty tree format is designed for terminal reading. Its shape is intentionally close to the `docutils` `pformat()` style: object headlines carry compact scalar attributes, nested objects keep stable indentation, and multiline source text is printed as an indented body instead of being squeezed into an escaped attribute.

## What It Gives You

- A single `AbundantDocument` object for a `.adoc` file.
- Section, paragraph, description list, listing, table, title, metadata, target, anchor, and xref nodes.
- Raw source text and source spans for recoverable authored surfaces.
- A target catalog for sections, blocks, listings, tables, inline anchors, and block anchors.
- Xref occurrence records that keep raw target text, labels, local/external/unresolved scope, containing section, and resolved target kind.
- Official Asciidoctor binding data for xrefs: `href`, `resolvedId`, `resolvedType`, and `reftext`.
- Pretty tree output for terminal inspection and JSON output for automation.
- Explicit book-entry mode for parsing an entry file plus supported full-file includes with origin source coordinates.
- RDF 1.2 graph, Turtle, and JSON-LD output through the single `rdf12` projection for source-aware graph queries, frontend consumption, and line-based edit loops.

The primary artifact is the TypeScript object. Pretty text, JSON, RDF 1.2 Turtle, and RDF 1.2 JSON-LD are projections of the same parsed document.

## Documentation

- Live bookshelf: <https://michengliang.github.io/asciidoc-abundant-tree/>
- RDF 1.2 heading projection specification: [AsciiDoc `AbundantDocument` 到 RDF 1.2 标题投影图规约](https://michengliang.github.io/asciidoc-abundant-tree/books/06-rdf12-line-projection/book.html)
- Generated book source: [`docs/bookshelf/build/adoc/books/06-rdf12-line-projection.adoc`](./docs/bookshelf/build/adoc/books/06-rdf12-line-projection.adoc)
- Compact preview sample: [`samples/rdf12-projection-preview.adoc`](./samples/rdf12-projection-preview.adoc)
- Basic RDF toolchain sample: [`samples/basic-rdf-projection/README.md`](./samples/basic-rdf-projection/README.md)
- Complex property consumer sample: [`samples/cold-chain-payload/README.md`](./samples/cold-chain-payload/README.md)
- Book-entry sample: [`samples/book-entry-demo/book.adoc`](./samples/book-entry-demo/book.adoc)
- Source: [`docs/bookshelf`](./docs/bookshelf/)

The RDF 1.2 projection book specifies the graph vocabulary and query contract used by the package runtime. The public runtime surface exposes that projection through the `rdf12(document, options)` API and CLI `--format rdf12` / `--format rdf12-json-ld`.

## When To Use It

Use this package when you are building:

- documentation analyzers
- xref and anchor audits
- source-aware migration tools
- documentation inventory scripts
- authoring diagnostics that need line and column evidence
- experiments that compare authored AsciiDoc with Asciidoctor's resolved model

It is especially useful when a tool needs to answer questions such as:

- Where is this xref written in the source file?
- Does this target come from a section, listing, table, block ID, or inline anchor?
- Which section contains this occurrence?
- What did Asciidoctor resolve this xref to?
- What source text produced this block or metadata layer?
- Which RDF resources and reified relations represent the same source interval, xref occurrence, or authored surface?

## RDF 1.2 Projection

The `rdf12` projection derives an RDF 1.2 graph from an `AbundantDocument`. The source document remains the fact source, `AbundantDocument` is the input contract, and the RDF graph is the queryable projection.

Projection resources use deterministic IRIs generated from the document coordinate system, not author strings or ordering facts. Heading nodes expose their label space directly through `aat:addressLabel`, `aat:generatedAddressLabel`, and `aat:headline`. Query code can use those fields to find headings, then read `relativePath`, `startLine`, and `endLine` for source inspection or patching.

The graph includes source document provenance, heading nodes, direct heading containment, same-parent child order, global heading preorder, selector binding, xref edge evidence, RDF 1.2 reifiers for resolved xref relations, direct field predicates, and raw value objects. `aat:containsDirectly` expresses direct parent-child heading relationships, `aat:childOrder` orders direct children within the same parent, and `aat:documentOrder` orders all headings by logical preorder. Source coordinate fields such as `relativePath`, `startLine`, `endLine`, `headingLine`, and `raw` describe the origin source location and slice; they are not a heading order fallback. Xref edges keep raw selectors and official Asciidoctor evidence as separate facts. Attribute lists such as `[#delivery.policy, status=active]` preserve the explicit ID as `aat:addressLabel`, `.policy` as `aat:role`, and named fields as direct `aat:` predicates such as `aat:status`.

Local non-heading target IDs from listings, tables, blocks, inline anchors, and source value blocks become `aat:addressLabel` values on the owning heading. They participate in the heading label space without creating listing, table, block, anchor, or source-value-block structure resources.

The RDF 1.2 heading projection does not emit `aat:previousSibling`. Consumers that need ordered document trees should read `aat:containsDirectly`, sort each parent’s direct children by numeric `aat:childOrder`, and use numeric `aat:documentOrder` for whole-document preorder. IRI lexical order, Turtle textual order, `relativePath`, and source line values are not ordering contracts.

Heading complex properties use a `for` or `forSelector` marker to bind a raw value object to a heading through a field predicate. A marker with a selector value queries the heading label space; a no-value marker binds by source ownership. Edge complex properties use a named xref attribute such as `relation-evidence=<source-value-id>` and a source value block id to bind a raw value object to xref edge evidence through a field predicate. Field names come from source roles or xref named attribute keys; they determine the public query entry. Raw value format comes from the source block language such as `[source,json]` or `[source,yaml]`; raw value objects preserve raw text and source coordinates without separate kind, id, or role predicates. Raw value objects are opaque and are not expanded into business RDF predicates.

Ordinary xref target selectors and xref field values use separate spaces. The xref target selector queries `aat:addressLabel`, `aat:generatedAddressLabel`, and `aat:headline`; a named xref attribute value queries source value ids. The `rel` control field is retained as `aat:rel` while selecting the main relation predicate, and xref named attribute keys become field predicates; neither is emitted as a legacy surface-attribute resource.

JSON-LD output is a frontend-friendly projection of the same RDF graph. RDF 1.2 triple terms are represented as structured `rdf12:TripleTerm` objects rather than flattened strings.

The preview sample below keeps the source small enough to skim while still showing the main projection surfaces. It is trimmed from the actual CLI output of [`samples/rdf12-projection-preview.adoc`](./samples/rdf12-projection-preview.adoc).

Source AsciiDoc:

```adoc
= 投影预览

[#delivery.policy, status=active]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, relation-evidence=rel-delivery-capacity]。

[.policy-risk-profile, for=delivery]
[source,json]
----
{"owner":{"team":"ops"},"risk":{"signals":["capacity"]}}
----

[#rel-delivery-capacity]
[source,yaml]
----
reason: risk-control
signals:
  - capacity
----

[#capacity.rule, status=active]
== 运力规则

运力规则决定是否降级。
```

Projected Turtle:

```turtle
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<urn:aat:doc:...#heading-l3-o0> a aat:Heading;
    aat:addressLabel "delivery", "rel-delivery-capacity";
    aat:headline "配送策略";
    aat:role "policy";
    aat:policy-risk-profile <urn:aat:doc:...#payload-l8-o0>;
    rel:depends-on <urn:aat:doc:...#heading-l22-o0>.

<urn:aat:doc:...#payload-l8-o0> aat:forSelector "delivery";
    aat:format "json";
    aat:raw "{\"owner\":{\"team\":\"ops\"},\"risk\":{\"signals\":[\"capacity\"]}}".

<urn:aat:doc:...#xref-edge-l6-c8-o0> rdf:reifies <<(<urn:aat:doc:...#heading-l3-o0> rel:depends-on <urn:aat:doc:...#heading-l22-o0>)>>;
    a aat:XrefEdge;
    aat:sourceHeading <urn:aat:doc:...#heading-l3-o0>;
    aat:targetHeading <urn:aat:doc:...#heading-l22-o0>;
    aat:targetSelector "capacity";
    aat:relation-evidence <urn:aat:doc:...#payload-l14-o0>;
    aat:rel "depends-on".

<urn:aat:doc:...#payload-l14-o0> aat:sourceValueId "rel-delivery-capacity";
    aat:format "yaml";
    aat:raw "reason: risk-control\nsignals:\n  - capacity".
```

Release validation covers the RDF projection with semantic graph comparison, Turtle roundtrip checks, JSON-LD shape checks, selector ambiguity cases, source-span boundary cases, complex property binding rules, relation predicate fallback, and CLI `rdf12` / `rdf12-json-ld` smoke output.

## Current Boundaries

This package is intentionally narrow.

- By default it reads one source file at a time.
- It expands a supported full-file include graph only when `mode: "book-entry"` or `--mode book-entry` is explicitly selected.
- It does not validate interdocument xref targets by opening other files.
- It does not expose a complete inline CST.
- It does not lint prose style.
- It does not interpret raw value text or expand raw value data into a business RDF graph.
- It does not generate HTML, PDF, EPUB, or a static site.
- It does not replace Asciidoctor; it uses Asciidoctor as the official parser and resolver layer.

The model is designed for static analysis and source inspection. It is not a complete AsciiDoc implementation.

## Install

```bash
pnpm add asciidoc-abundant-tree
```

```bash
npm install asciidoc-abundant-tree
```

## CLI

Try it without installing a project dependency:

```bash
npx asciidoc-abundant-tree path/to/file.adoc --format tree
```

```bash
asciidoc-abundant-tree <file.adoc>
asciidoc-abundant-tree <file.adoc> --json
asciidoc-abundant-tree <file.adoc> --format tree
asciidoc-abundant-tree <file.adoc> --format json
asciidoc-abundant-tree <file.adoc> --format rdf12
asciidoc-abundant-tree <file.adoc> --format rdf12-json-ld
asciidoc-abundant-tree <file.adoc> --mode book-entry --document-root <root> --format json
asciidoc-abundant-tree --help
```

Default output is a pretty tree:

```text
<document mode="single-file" sourcePath="samples/reference-links.adoc">
    <parser name="@asciidoctor/core" version="3.0.4">
    children[]
        <section idOrigin="source" ids="section-basics" level=1 title="基础概念">
            <source>
                <sourceSpan>
                    <end column=10 line=19>
                    <start column=1 line=19>
            children[]
```

JSON output preserves the same object fields and omits `undefined` values:

```bash
asciidoc-abundant-tree docs/index.adoc --json > tree.json
```

RDF 1.2 output writes Turtle text directly to stdout:

```bash
asciidoc-abundant-tree docs/index.adoc --format rdf12 > projection.ttl
```

RDF 1.2 JSON-LD output writes the same graph as a JSON document for frontend consumers:

```bash
asciidoc-abundant-tree docs/index.adoc --format rdf12-json-ld > projection.jsonld
```

Book-entry mode parses an entry file and supported full-file include directives into one logical document. It is always explicit:

```bash
asciidoc-abundant-tree samples/book-entry-demo/book.adoc \
  --mode book-entry \
  --document-root samples/book-entry-demo \
  --format json
```

When `--document-root` is omitted in book-entry mode, the CLI uses the current working directory. In single-file mode, `--document-root` does not change parser input construction; RDF output still uses it as the projection root.

The demo book keeps the entry file, included chapters, and an assets directory under one sample tree. Its JSON, pretty tree, and RDF 1.2 outputs expose origin `relativePath` values such as `chapters/01-overview.adoc` and `chapters/02-operations.adoc` instead of treating the entry file as the source for every node.

The CLI exposes only `rdf12` and `rdf12-json-ld` for RDF output. It does not accept `rdf`, `ttl`, or `turtle` as public format aliases.

## Library API

```ts
import {
	formatAbundantTree,
	parseAbundantTree,
	rdf12,
	serializeAbundantTreeToJson,
} from "asciidoc-abundant-tree";

const document = parseAbundantTree({
	sourcePath: "docs/index.adoc",
});

const book = parseAbundantTree({
	sourcePath: "samples/book-entry-demo/book.adoc",
	mode: "book-entry",
	documentRoot: "samples/book-entry-demo",
});

const prettyText = formatAbundantTree(document);
const jsonData = serializeAbundantTreeToJson(document);
const projection = rdf12(document, {
	documentRoot: process.cwd(),
});

const graph = projection.graph;
const ttl = projection.ttl;
const jsonLd = projection.jsonLd;
```

`parseAbundantTree` reads only the supplied source file. Interdocument xrefs keep their raw target and official href when Asciidoctor exposes one, but this package does not open the referenced `.adoc` file.

Browser tools that already hold AsciiDoc source text can use the browser-safe subpath:

```ts
import { parseAbundantTreeFromSource } from "asciidoc-abundant-tree/browser";

const document = parseAbundantTreeFromSource({
	sourceText,
	sourcePath: "document.adoc",
});
```

`parseAbundantTreeFromSource` is the `sourceText -> AbundantDocument` API. `sourcePath` is a source identity and display coordinate for diagnostics, source surfaces, and frontend views; when omitted, it defaults to `document.adoc`.

Frontend graph and projection tools, including `projection-teacher` style consumers, should treat `AbundantDocument` as the upstream fact object. Graphs, teaching views, audits, and other projections are downstream derived data.

The public `rdf12(document, options)` call returns one projection result containing `graph`, `ttl`, and `jsonLd`. The `graph` is the project-owned RDF 1.2 graph model; the Turtle 1.2 text in `ttl` preserves RDF 1.2 reifier semantics by writing `rdf:reifies` objects as triple terms, not string literals. The JSON-LD text in `jsonLd` preserves the same triple-term structure with explicit `rdf12:TripleTerm` objects. The projection is for source-aware query contracts: it records heading slices, xref edge evidence, direct field predicates, and opaque raw value text, but it does not lint documents, validate cross-file targets, or interpret raw value content.

## Object Layers

The output separates authored source facts from official Asciidoctor facts.

Source-layer fields describe the file surface: raw text, source line, line span, source span, syntax, target, label, IDs, roles, attributes, metadata span, and content span.

Official-layer fields describe Asciidoctor results: context, node name, href, resolved ID, resolved type, and reftext.

The separation matters. Raw xref targets are not overwritten by official bindings, and official xref data is not inferred from ordinary links in converted HTML. Each source xref occurrence receives its official binding from the Asciidoctor xref conversion for that occurrence.

## Example Tasks

List unresolved local xrefs:

```ts
import { parseAbundantTree } from "asciidoc-abundant-tree";

const document = parseAbundantTree({ sourcePath: "docs/index.adoc" });

for (const xref of document.xrefOccurrences) {
	if (xref.scope === "unresolved") {
		console.log(`${xref.target} at line ${xref.sourceSpan?.start.line}`);
	}
}
```

Inspect target kinds:

```ts
import { parseAbundantTree } from "asciidoc-abundant-tree";

const document = parseAbundantTree({ sourcePath: "docs/index.adoc" });

const byKind = new Map<string, number>();
for (const target of document.targets) {
	byKind.set(target.targetType, (byKind.get(target.targetType) ?? 0) + 1);
}

console.log(Object.fromEntries(byKind));
```

## Development

```bash
pnpm install
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm build
pnpm pack:check
```

Run the CLI from source:

```bash
pnpm dev samples/reference-links.adoc
pnpm dev samples/reference-links.adoc --json
pnpm dev samples/reference-links.adoc --format rdf12
pnpm dev samples/book-entry-demo/book.adoc --mode book-entry --document-root samples/book-entry-demo --format json
```

## Release State

The package is usable for single-file source analysis, explicit book-entry include graphs, xref/target auditing, and RDF 1.2 heading projection. The object model and RDF vocabulary are intentionally small and conservative. Prefer pinning a minor version in production workflows and checking the JSON and RDF shapes against your own fixtures before relying on it for large document systems.

The GitHub Actions publish workflow runs on `v*` tag pushes, publishes to npm with provenance, and creates a GitHub Release from `CHANGELOG.md` when the release does not already exist.

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
