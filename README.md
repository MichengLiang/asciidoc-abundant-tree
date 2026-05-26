# asciidoc-abundant-tree

`asciidoc-abundant-tree` is a single-file AsciiDoc structure recovery tool. It reads one `.adoc` source file and returns an `AbundantDocument` object that preserves source surfaces, source spans, Asciidoctor official bindings, and the section-scoped block tree needed by downstream analysis.

The TypeScript object is the primary artifact. Pretty text and JSON are projections of the same object.

## Scope

The parser recovers these document facts:

- document title and section tree
- paragraph, listing, and table blocks
- block metadata such as IDs, titles, attribute lists, roles, and languages
- xref occurrences and anchor occurrences with raw source spans
- target catalog entries for sections, blocks, listings, tables, and anchors
- official Asciidoctor href, resolved ID, resolved type, and reftext for xrefs

The parser does not recover a complete inline CST, validate cross-file targets, lint document style, or generate HTML/PDF/site output.

## CLI

```bash
asciidoc-abundant-tree <file.adoc>
asciidoc-abundant-tree <file.adoc> --json
asciidoc-abundant-tree <file.adoc> --format tree
asciidoc-abundant-tree <file.adoc> --format json
asciidoc-abundant-tree --help
```

Default output is pretty text:

```text
<document sourcePath="..." mode="single-file">
    <title ...>
    <section ...>
        <paragraph ...>
            <xref ...>
        <listing ...>
            content:
                first line
                second line
```

JSON output preserves the same object fields and omits `undefined` values.

During local development, run the CLI through the package script:

```bash
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree dev samples/reference-links.adoc
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree dev samples/reference-links.adoc --json
```

## Library API

```ts
import {
	formatAbundantTree,
	parseAbundantTree,
	serializeAbundantTreeToJson,
} from "@micheng-ts-project/asciidoc-abundant-tree";

const document = parseAbundantTree({
	sourcePath: "samples/reference-links.adoc",
});

const text = formatAbundantTree(document);
const json = serializeAbundantTreeToJson(document);
```

`parseAbundantTree` reads only the supplied source file. Interdocument xrefs keep their raw target and official href, but the parser does not open the referenced `.adoc` file.

## Source And Official Layers

Source-layer fields describe the authored file surface: raw text, line, span, source span, syntax, target, label, IDs, roles, attributes, metadata span, and content span.

Official-layer fields describe Asciidoctor results: context, node name, href, resolved ID, resolved type, and reftext.

These layers are separate. Raw xref targets are not overwritten by official bindings, and official xref data is not inferred from ordinary links in a converted block. Each source xref occurrence receives its official binding from an Asciidoctor xref conversion for that occurrence.

## Verification

Project-level checks:

```bash
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree test
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree typecheck
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree build
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree pack:check
pnpm --filter @micheng-ts-project/asciidoc-abundant-tree lint
```

Workspace checks:

```bash
pnpm lint
pnpm deps:check
pnpm check
```

The detailed object contract, engineering contract, and acceptance criteria live in `docs/`.
