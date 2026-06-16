# Book-Entry Official Reader Include Preprocessing Design

## 1. Purpose

This design defines the book-entry include preprocessing pipeline for `asciidoc-abundant-tree`.

The pipeline uses `@asciidoctor/core` Reader to produce the logical document consumed by parser core. The pipeline records source evidence for each logical line as origin records, generated-line records, column maps, source file records, and diagnostics.

The design preserves the book-entry object contract:

- The parser consumes one logical AsciiDoc document.
- Public source coordinates point to author-owned source files.
- Raw recovery reads origin source files.
- Source file reconstruction emits original source files.
- Diagnostics block or mark coordinates whose origin cannot be proven.

The include text semantics are owned by the official Reader. The source-coordinate semantics are owned by `asciidoc-abundant-tree`.

## 2. Current State

Book-entry mode is implemented by a strict full-file include graph builder.

`src/parser.ts` routes `mode: "book-entry"` through `buildLogicalSource()`:

```ts
const logicalSource = buildLogicalSource({
    sourcePath,
    documentRoot: options.documentRoot,
});
const lineTable = buildLineTable(logicalSource.logicalText);
return parseAsciidoctorDocument({
    officialDocument: adapter.loadSource(logicalSource.logicalText),
    adapter,
    lineTable,
    sourcePath,
    sourceText: logicalSource.logicalText,
    sourceFiles: logicalSource.sourceFiles.map((sourceFile) => ({
        relativePath: sourceFile.relativePath,
        raw: sourceFile.text,
    })),
    mode: "book-entry",
});
```

`src/book-entry/include-resolution.ts` recognizes one directive shape:

```ts
const includeDirectivePattern = /^(\\s*)include::([^[]+)\\[([^\\]]*)\\]\\s*$/u;
```

`parseIncludeDirective()` has these current outcomes:

- A missing line number returns `ordinary`.
- A line whose trimmed text starts with `\include::` returns `ordinary`.
- A line that does not match `includeDirectivePattern` returns `ordinary`.
- A matched include with empty attrlist returns `include`.
- A matched include with non-empty attrlist throws `include.unsupported-attrlist`.

`src/book-entry/logical-source-builder.ts` recursively expands each returned include:

- Include target resolution is relative to the containing source file directory.
- Resolved include paths must stay inside `documentRoot`.
- Include cycles throw `include.cycle`.
- Missing included files throw `include.missing-target`.
- Repeated includes emit repeated logical lines and one source file record per absolute source file.
- Each logical line receives one `LineOrigin`.

The current `LineOrigin` shape is source-line only:

```ts
export type LineOrigin = {
    readonly logicalLine: number;
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly sourceLine: number;
};
```

The current model assumes every logical line has one physical source line and that the logical line text equals the origin line text.

Current tests encode the full-file boundary:

- `test/book-entry/include-resolution.test.ts` asserts `tag=main` and `lines=1..4` produce `include.unsupported-attrlist`.
- `test/book-entry/book-entry-negative.test.ts` asserts unsupported attrlist is a construction error.
- `test/book-entry/logical-source-builder.test.ts` asserts escaped includes remain ordinary source lines.
- `test/book-entry/parser-integration.test.ts` asserts book-entry mode uses logical text instead of Asciidoctor include sourcemap.

The current design document `docs/bookshelf/build/adoc/books/10-book-entry-source-mapped-logical-document.adoc` records the reason for the full-file boundary: line origin and column identity are guaranteed only when logical lines are copied from origin lines without filtering or transformation.

## 3. Target State

Book-entry mode uses the official Reader as the include preprocessing authority.

The target pipeline is:

```text
entry source file
  -> official Reader execution
  -> source-aware logical line records
  -> parser-safe logical text
  -> parser core
  -> origin-aware AbundantDocument
```

The official Reader produces the text stream after AsciiDoc preprocessing. The book-entry pipeline records origin records, generated-line records, column maps, source file records, and diagnostics for that text stream.

The target pipeline supports these local include surfaces:

- Full-file include.
- Tagged include with `tag`.
- Tagged include with `tags`.
- Line-range include with `lines`.
- Indented include with `indent`.
- Section-level offset include with `leveloffset`.
- Optional missing include with `opts=optional`.
- Escaped include.

The target pipeline rejects these surfaces:

- Include target outside `documentRoot`.
- URI include target.
- Include attrlist whose source mapping rule is absent from this design.

The target parser input is a logical document that cannot perform a second include expansion. The preprocessing pipeline marks escaped include output and protects it before parser core receives the logical text.

The target source model distinguishes five logical line classes:

- Source-preserving line.
- Selected source line.
- Transformed source line.
- Generated control line.
- Degraded line.

Precise source coordinates are emitted only for source-preserving, selected, and transformed lines whose column mapping is defined. Generated control lines and degraded lines do not produce precise source coordinates.

## 4. Controlled Terms

### Book-Entry Preprocessing Pipeline

The book-entry preprocessing pipeline reads an entry source file, executes AsciiDoc preprocessing through the official Reader, records logical line evidence, and returns a source-aware logical document for parser core.

### Official Reader

The official Reader is the `@asciidoctor/core` Reader returned from an unparsed Asciidoctor document. The pipeline drives it with `readLine()` and reads location evidence through `getCursor()`.

### Logical Document

The logical document is the in-memory AsciiDoc text consumed by parser core in book-entry mode. It is not an author-owned source file. It is not emitted as a source reconstruction resource.

### Logical Line

A logical line is one 1-based line in the logical document.

### Source-Preserving Line

A source-preserving line is a logical line whose text equals one physical line from one source file. Its column map is identity.

### Selected Source Line

A selected source line is a logical line selected from a source file by include attributes such as `tag`, `tags`, or `lines`. Its text equals one physical line from the selected source file. Its column map is identity.

### Transformed Source Line

A transformed source line is a logical line derived from one physical source line with a deterministic text transformation. `indent` produces transformed source lines. A transformed source line must carry a column map.

### Generated Control Line

A generated control line is a logical line introduced by preprocessing control semantics rather than copied from an author-owned physical source line. `leveloffset` produces generated control lines. Generated control lines are parser input and have no origin source coordinate.

### Degraded Line

A degraded line is a logical line whose text exists in parser input but whose source evidence is insufficient for precise source-coordinate recovery. A degraded line carries diagnostic evidence.

### Origin Record

An origin record describes the source evidence for one logical line. It replaces the current source-line-only `LineOrigin` contract.

### Column Map

A column map translates logical columns to origin source columns for one logical line. Identity column maps translate each logical column to the same origin column. Transformed lines require explicit non-identity column maps.

### Source Set

The source set is the set of author-owned local source files read by the preprocessing pipeline. The source set is emitted through source reconstruction surfaces.

### Source Reconstruction Surface

The source reconstruction surface emits `relativePath` and raw source text for each source file in the source set.

### Precise Source Coordinate

A precise source coordinate identifies one author-owned source file and a line-column span whose mapping is proven by an origin record and column map.

### Degraded Source Coordinate

A degraded source coordinate is an omitted source coordinate paired with a diagnostic explaining the missing mapping.

## 5. Runtime Facts

The current package uses `@asciidoctor/core` version `3.0.4`.

An unparsed Asciidoctor document exposes a Reader through `document.getReader()`.

`Reader.readLine()` consumes and preprocesses lines. Include directives are processed during line reading.

`Reader.getCursor()` exposes cursor fields and methods for file, directory, path, and line number.

`safe: "secure"` disables include expansion and converts include directives to links.

`safe: "safe"` expands local include directives inside the safe-mode jail.

`safe: "safe"` prevents include reads outside the jail rooted at the document base directory.

`safe: "unsafe"` expands local include directives.

An include directive is an AsciiDoc preprocessor directive. It is processed before block structure is parsed. It is not aware of source, listing, literal, or verbatim block context.

An include directive inside a source block is processed by the official Reader unless escaped.

`tag` and `tags` include attributes select tagged regions from the target file.

`lines` selects one or more line ranges from the target file.

`indent` changes leading whitespace in included lines.

`leveloffset` emits level-offset control lines consumed by Asciidoctor.

`opts=optional` skips a missing include target.

An escaped include line is unescaped by the official Reader. A logical line created from an escaped include must be protected before parser core receives the logical document.

Reader cursor line numbers are sufficient evidence for source-preserving full-file include lines. Reader cursor line numbers are not sufficient evidence for complex `tags` selections, non-contiguous `lines` selections, or generated control lines.

## 6. Architecture

### Module Boundary

The book-entry preprocessing implementation is split into these modules:

```text
src/book-entry/
  official-reader-preprocessor.ts
  reader-boundary-policy.ts
  include-attribute-model.ts
  include-selection-mapper.ts
  line-origin-model.ts
  column-map.ts
  source-set.ts
  parser-safe-logical-text.ts
```

`official-reader-preprocessor.ts` owns official Reader execution. It creates an unparsed Asciidoctor document, drives `readLine()`, records cursor evidence, and returns logical line records.

`reader-boundary-policy.ts` owns the official Reader execution policy. It sets safe mode, base directory, attributes, and logger capture rules for book-entry preprocessing.

`include-attribute-model.ts` owns include attribute parsing for source mapping. It parses the include directive surfaces that appear in source files and classifies supported mapping attributes.

`include-selection-mapper.ts` owns physical source-line selection for `tag`, `tags`, and `lines`. It reads target file source text and returns selected physical line numbers.

`line-origin-model.ts` owns origin record types and invariants.

`column-map.ts` owns column map construction and lookup.

`source-set.ts` owns documentRoot-relative path normalization, local source file registration, and source file reconstruction records.

`parser-safe-logical-text.ts` owns the transformation from logical line records to parser input text. It protects escaped include lines from second include expansion.

### Data Flow

Book-entry parsing uses this data flow:

```text
parseAbundantTree({ mode: "book-entry" })
  -> preprocessBookEntryWithOfficialReader()
  -> build parser-safe logical text
  -> buildLineTable(logicalText)
  -> adapter.loadSource(logicalText)
  -> parseAsciidoctorDocument()
  -> recover origin source coordinates from logical line records
```

Parser core receives logical text and logical-line source evidence. Parser core does not receive include directives as the authority for include expansion.

### Adapter Boundary

`src/asciidoctor-adapter.ts` gains a Reader preprocessing entry. The adapter continues to expose parser loading and official xref binding functions.

Required adapter capability:

```ts
export type ReaderLineCursor = {
    readonly file?: string;
    readonly directory?: string;
    readonly path?: string;
    readonly lineNumber?: number;
};

export type OfficialReaderLine = {
    readonly text: string;
    readonly cursor: ReaderLineCursor;
};

export type AsciidoctorParserAdapter = AsciidoctorAdapter & {
    loadSource(sourceText: string): AsciidoctorBlock;
    readPreprocessedLines(options: {
        readonly sourcePath: string;
        readonly baseDir: string;
        readonly attributes?: Record<string, unknown>;
    }): readonly OfficialReaderLine[];
};
```

`readPreprocessedLines()` executes the official Reader in a local-file include mode and returns every line consumed by the Reader with cursor evidence captured before the line is consumed.

### Security Boundary

Book-entry preprocessing accepts local files under `documentRoot`.

The Reader boundary policy executes book-entry preprocessing with `safe: "safe"` and `base_dir` equal to `documentRoot`.

Safe mode admits local includes inside the jail rooted at `documentRoot` and prevents reads outside the jail.

The Reader boundary policy captures official Reader log messages. An include warning or error becomes a book-entry diagnostic with source evidence.

The Reader boundary policy sets no `allow-uri-read` attribute. URI include targets produce official Reader diagnostics and become `include.uri-target-unsupported`.

The Reader boundary policy converts an official include log entry for an ancestor reference or missing outside-root target into `include.outside-document-root`.

The Reader boundary policy rejects a Reader output line whose cursor path resolves outside `documentRoot`.

## 7. Data Model

### Source-Aware Logical Document

```ts
export type SourceAwareLogicalDocument = {
    readonly entryPath: string;
    readonly documentRoot: string;
    readonly logicalText: string;
    readonly lines: readonly LogicalLineRecord[];
    readonly sourceFiles: readonly SourceFileRecord[];
    readonly diagnostics: readonly BookEntryDiagnostic[];
};
```

`logicalText` is the parser-safe text built from `lines`.

`lines.length` equals the number of lines in `logicalText`.

Each `LogicalLineRecord.logicalLine` is 1-based and equals its index in `lines` plus one.

### Logical Line Record

```ts
export type LogicalLineRecord =
    | SourcePreservingLineRecord
    | SelectedSourceLineRecord
    | TransformedSourceLineRecord
    | GeneratedControlLineRecord
    | DegradedLineRecord;
```

### Source-Preserving Line Record

```ts
export type SourcePreservingLineRecord = {
    readonly kind: "source-preserving";
    readonly logicalLine: number;
    readonly text: string;
    readonly origin: PhysicalLineOrigin;
    readonly columnMap: IdentityColumnMap;
};
```

Invariant:

```text
record.text === sourceFile.lineTable.lines[record.origin.sourceLine - 1].text
```

### Selected Source Line Record

```ts
export type SelectedSourceLineRecord = {
    readonly kind: "selected-source";
    readonly logicalLine: number;
    readonly text: string;
    readonly origin: PhysicalLineOrigin;
    readonly selector: IncludeLineSelector;
    readonly columnMap: IdentityColumnMap;
};
```

`selector` records the include attribute responsible for selecting the line.

Invariant:

```text
record.text === sourceFile.lineTable.lines[record.origin.sourceLine - 1].text
```

### Transformed Source Line Record

```ts
export type TransformedSourceLineRecord = {
    readonly kind: "transformed-source";
    readonly logicalLine: number;
    readonly text: string;
    readonly originText: string;
    readonly origin: PhysicalLineOrigin;
    readonly transform: IncludeLineTransform;
    readonly columnMap: ColumnMap;
};
```

`indent` produces `transform.kind === "indent"`.

Invariant:

```text
record.text !== record.originText
record.columnMap.kind !== "identity"
```

### Generated Control Line Record

```ts
export type GeneratedControlLineRecord = {
    readonly kind: "generated-control";
    readonly logicalLine: number;
    readonly text: string;
    readonly generatedKind: "leveloffset-push" | "leveloffset-pop";
    readonly relatedInclude?: IncludeDirectiveEvidence;
};
```

Generated control line records do not contain `origin`.

Generated control line records do not produce precise source coordinates.

### Degraded Line Record

```ts
export type DegradedLineRecord = {
    readonly kind: "degraded";
    readonly logicalLine: number;
    readonly text: string;
    readonly evidence: ReaderLineCursor;
    readonly diagnostic: BookEntryDiagnostic;
};
```

Degraded line records do not produce precise source coordinates.

### Physical Line Origin

```ts
export type PhysicalLineOrigin = {
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly sourceLine: number;
};
```

Invariant:

```text
sourceLine >= 1
sourceLine <= sourceFile.lineTable.lines.length
```

### Column Map

```ts
export type ColumnMap =
    | IdentityColumnMap
    | OffsetColumnMap
    | UnmappedColumnMap;

export type IdentityColumnMap = {
    readonly kind: "identity";
};

export type OffsetColumnMap = {
    readonly kind: "offset";
    readonly logicalStartColumn: number;
    readonly originStartColumn: number;
};

export type UnmappedColumnMap = {
    readonly kind: "unmapped";
    readonly diagnostic: BookEntryDiagnostic;
};
```

Identity maps logical column `N` to origin column `N`.

Offset maps logical columns greater than or equal to `logicalStartColumn` to origin columns by:

```text
originColumn = logicalColumn - logicalStartColumn + originStartColumn
```

Columns before `logicalStartColumn` have no origin column.

Unmapped column maps block precise column output.

### Include Directive Evidence

```ts
export type IncludeDirectiveEvidence = {
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly sourceLine: number;
    readonly target: string;
    readonly attributes: IncludeAttributes;
};
```

Include directive evidence identifies the authored include line that caused selected, transformed, generated, optional, or rejected preprocessing behavior.

### Source File Record

```ts
export type SourceFileRecord = {
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly text: string;
    readonly lineTable: LineTable;
};
```

Source file records contain author-owned source files only. Generated control lines are not source file records.

## 8. Include Semantics Contract

### Full-File Local Include

Surface:

```adoc
include::chapters/01.adoc[]
```

Official Reader emits every included line.

Each emitted included line is a `source-preserving` line when Reader cursor path and source line identify the same physical source line.

The included file is registered in the source set.

### Tagged Include With `tag`

Surface:

```adoc
include::examples/tool.mjs[tag=main]
```

Official Reader emits lines inside the selected tagged region.

`include-selection-mapper.ts` reads the target file and maps the selected tag region to physical line numbers.

Each emitted selected line is a `selected-source` line.

The target file is registered in the source set.

Tag directive lines are not emitted as selected source lines.

### Tagged Include With `tags`

Surface:

```adoc
include::examples/tool.mjs[tags=a;b;!skip]
```

Official Reader emits lines selected by the tag filter expression.

`include-selection-mapper.ts` maps the filter expression to physical source lines from the target file.

Each emitted selected line is a `selected-source` line.

The mapper supports:

- Semicolon-separated tag names.
- Negated tag names using `!`.
- Single wildcard `*`.
- Double wildcard `**`.
- Negated wildcard forms accepted by Asciidoctor.

The mapper output order equals the physical order of selected lines in the target file.

### Line-Range Include

Surface:

```adoc
include::snippets/example.adoc[lines=2..5]
include::snippets/example.adoc[lines="1..3,8"]
include::snippets/example.adoc[lines=7;14..25;28..43]
```

Official Reader emits selected lines.

`include-selection-mapper.ts` maps each range item to physical source lines.

Supported range items:

- Single line number.
- Closed range `start..end`.
- Open-ended range `start..`.
- Last-line endpoint `-1`.
- Comma-separated range list inside quotes.
- Semicolon-separated range list.

Each emitted selected line is a `selected-source` line.

The target file is registered in the source set.

### Indented Include

Surface:

```adoc
include::snippets/code.txt[indent=2]
```

Official Reader emits transformed lines.

The source mapper identifies the physical source line corresponding to each emitted line.

Each emitted transformed line is a `transformed-source` line with `transform.kind === "indent"`.

The column map is an `offset` map.

The target file is registered in the source set.

### Level-Offset Include

Surface:

```adoc
include::chapters/chapter.adoc[leveloffset=+1]
```

Official Reader emits level-offset control lines and included content lines.

Control lines are `generated-control` records.

Included content lines use `source-preserving` or `selected-source` records according to their include selection behavior.

Generated control lines do not produce source coordinates.

The target file is registered in the source set.

### Optional Missing Include

Surface:

```adoc
include::missing.adoc[opts=optional]
```

Official Reader emits no source line for the missing target.

The missing target is not registered in the source set.

The authored include directive line is recorded as optional include evidence.

No construction error is emitted for the missing target.

### Escaped Include

Surface:

```adoc
\include::chapters/example.adoc[]
```

Official Reader emits literal include text without the escape backslash.

The logical line is recorded as `source-preserving` with an escaped-include marker.

`parser-safe-logical-text.ts` restores the escape backslash before parser core receives the logical text.

The escaped target is not registered as an included source file.

### URI Include Target

Surface:

```adoc
include::https://example.com/file.adoc[]
```

URI targets produce `include.uri-target-unsupported`.

URI targets do not enter the source set.

URI target diagnostics block successful book-entry document construction.

### Target Outside `documentRoot`

An include target whose resolved local path is outside `documentRoot` produces `include.outside-document-root`.

Outside-root diagnostics block successful book-entry document construction.

### Missing Include Without Optional

A missing local include target without `opts=optional` produces `include.missing-target`.

Missing-target diagnostics block successful book-entry document construction.

### Unmapped Include Attribute

An include attrlist member without a mapping rule in this contract produces `include.attrlist-unmapped`.

Unmapped-attrlist diagnostics block successful book-entry document construction.

## 9. Parser-Safe Logical Text

Parser core receives one logical text string.

The logical text is built from `LogicalLineRecord.text` with parser-safety transformations applied.

Escaped include records are written with a leading backslash. This prevents second include expansion during `adapter.loadSource(logicalText)`.

Generated control line records are written as their official Reader text.

Degraded line records are written as their text when their diagnostic level allows parser construction.

The parser-safe text builder returns:

```ts
export type ParserSafeLogicalText = {
    readonly text: string;
    readonly lineRecords: readonly LogicalLineRecord[];
};
```

`text.split(/\r?\n/u).length` equals `lineRecords.length`.

## 10. Source Coordinate Recovery

Parser core observes logical line and logical column positions.

Source coordinate recovery translates each logical position through the logical line record.

### Source-Preserving Lines

Source-preserving lines use identity column mapping.

Logical line `L`, column `C` maps to:

```text
relativePath = record.origin.relativePath
line = record.origin.sourceLine
column = C
```

### Selected Source Lines

Selected source lines use identity column mapping.

Logical line `L`, column `C` maps to:

```text
relativePath = record.origin.relativePath
line = record.origin.sourceLine
column = C
```

### Transformed Source Lines

Transformed source lines use their `columnMap`.

If `columnMap` returns an origin column, recovery emits a precise source coordinate.

If `columnMap` returns no origin column, recovery omits the source coordinate and emits `source-coordinate.column-unmapped`.

### Generated Control Lines

Generated control lines produce no source coordinate.

Parser structures whose source interval includes generated control lines ignore those lines for raw recovery.

### Degraded Lines

Degraded lines produce no precise source coordinate.

Parser structures whose required source position is a degraded line receive a missing source coordinate and the degraded line diagnostic.

### Heading Raw

Heading raw recovery uses the origin source file line table.

The heading start line is recovered from the logical line record for the heading line.

The heading raw end line is computed inside the same origin source file.

Generated control lines do not extend heading raw.

### Xref Occurrence

Xref occurrence recovery maps the occurrence line through its logical line record.

Occurrence columns are translated through the line record column map.

An occurrence on an unmapped column does not emit precise `sourceSpan`.

### Block Raw

Block raw recovery inspects every logical line record in the block interval.

A block emits raw source coordinates when all content-bearing records in the interval map to one origin source file and their source lines form a recoverable source interval.

A block interval containing multiple origin files emits `block-origin.multi-source-span` and omits raw coordinates.

A block interval containing generated control lines ignores those generated lines for raw recovery.

A block interval containing degraded lines emits the degraded diagnostics and omits raw coordinates.

## 11. Source Set Reconstruction

The source set contains author-owned local source files whose text contributes to preprocessing or source mapping.

The source set includes:

- Entry file.
- Full-file include targets.
- Tagged include targets.
- Line-range include targets.
- Indented include targets.
- Level-offset include targets.
- Shared attributes files read through local include.

The source set excludes:

- Missing optional include targets.
- URI targets.
- Generated control lines.
- Parser-safe logical text.

Each source reconstruction resource contains:

```ts
type SourceFileNode = {
    readonly relativePath: string;
    readonly raw: string;
};
```

The entry file reconstruction preserves authored include directive lines.

Included file reconstruction preserves complete target file raw text, including tag directive lines and non-selected lines.

## 12. Diagnostics

Each diagnostic has `code`, `level`, `message`, and available source evidence.

### Construction Errors

Construction errors block successful `AbundantDocument` construction.

#### `entry.missing-source`

Trigger: entry source file does not exist.

Effect: no logical document.

#### `include.missing-target`

Trigger: local include target does not exist and include attrlist does not contain `opts=optional`.

Effect: no successful book-entry document.

#### `include.outside-document-root`

Trigger: a local include target resolves outside `documentRoot`.

Effect: no successful book-entry document.

#### `include.uri-target-unsupported`

Trigger: include target has URI scheme.

Effect: no successful book-entry document.

#### `include.official-reader-error`

Trigger: official Reader emits an include-related error that has no more specific book-entry diagnostic code.

Effect: no successful book-entry document.

#### `include.target-unresolved-attribute`

Trigger: include target contains an attribute reference after boundary-auditor attribute resolution.

Effect: no successful book-entry document.

#### `include.attrlist-unmapped`

Trigger: include attrlist contains an attribute without a mapping rule in this design.

Effect: no successful book-entry document.

#### `logical-line-record.count-mismatch`

Trigger: logical text line count differs from logical line record count.

Effect: no successful book-entry document.

#### `line-origin.source-file-missing`

Trigger: a source-backed logical line references a source file absent from source file table.

Effect: no successful book-entry document.

#### `line-origin.source-line-out-of-range`

Trigger: a source-backed logical line references a physical line outside the source file line table.

Effect: no successful book-entry document.

### Recovery Diagnostics

Recovery diagnostics allow `AbundantDocument` construction and block only the affected precise coordinate.

#### `source-coordinate.column-unmapped`

Trigger: a transformed line column has no origin column.

Effect: affected source coordinate is absent.

#### `source-coordinate.generated-line`

Trigger: a parser source position resolves to a generated control line.

Effect: affected source coordinate is absent.

#### `source-coordinate.degraded-line`

Trigger: a parser source position resolves to a degraded line.

Effect: affected source coordinate is absent.

#### `block-origin.multi-source-span`

Trigger: a block interval maps to more than one origin source file.

Effect: affected block raw coordinate is absent.

#### `origin-map.selection-mismatch`

Trigger: official Reader emitted selected text that cannot be aligned with mapper-selected physical lines.

Effect: affected selected lines are degraded.

## 13. Test Contract

Tests are organized by object responsibility.

### Official Reader Preprocessing Tests

File:

```text
test/book-entry/official-reader-preprocessor.test.ts
```

Required cases:

- Full-file local include emits included lines with cursor evidence.
- Nested include emits nested file lines.
- Include in source block emits target snippet content.
- `tag=main` emits selected tagged region.
- `tags=a;b;!skip` emits selected and filtered regions.
- `lines=2..5` emits selected line range.
- `lines="1..3,8"` emits non-contiguous selected lines.
- `indent=2` emits transformed indentation.
- `leveloffset=+1` emits generated control lines.
- `opts=optional` missing target emits no target line.
- Escaped include emits literal include text and escaped include evidence.

### Reader Boundary Policy Tests

File:

```text
test/book-entry/reader-boundary-policy.test.ts
```

Required cases:

- Local include inside `documentRoot` is expanded in `safe: "safe"` mode.
- Include target outside `documentRoot` produces `include.outside-document-root`.
- URI include target produces `include.uri-target-unsupported`.
- Missing include target without `opts=optional` produces `include.missing-target`.
- Missing include target with `opts=optional` produces optional include evidence.
- Include target containing unresolved attribute reference produces `include.target-unresolved-attribute`.
- Official Reader include error without a specific mapping produces `include.official-reader-error`.

### Include Selection Mapping Tests

File:

```text
test/book-entry/include-selection-mapper.test.ts
```

Required cases:

- `tag=main` maps emitted lines to physical source lines.
- `tags=a;b` maps multiple regions in physical order.
- `tags=a;b;!skip` excludes nested skip region.
- `tag=*` maps all tagged regions.
- `tag=**` maps all lines except tag directive lines.
- `lines=2..5` maps closed range.
- `lines=12..` maps through last line.
- `lines=12..-1` maps through last line.
- `lines="1..3,8"` maps quoted comma-separated ranges.
- `lines=7;14..25;28..43` maps semicolon-separated ranges.
- Selection mismatch produces `origin-map.selection-mismatch`.

### Column Map Tests

File:

```text
test/book-entry/column-map.test.ts
```

Required cases:

- Identity map returns same column.
- Indent offset map returns origin columns for content columns.
- Indent offset map returns no origin column for inserted indentation columns.
- Unmapped map blocks precise column output.

### Logical Document Model Tests

File:

```text
test/book-entry/source-aware-logical-document.test.ts
```

Required cases:

- Logical text line count equals logical line record count.
- Source-preserving record text equals origin physical line.
- Selected source record text equals origin physical line.
- Transformed source record carries origin text and column map.
- Generated control record has no origin.
- Degraded record carries diagnostic.
- Source file table contains every source-backed record file.
- Source-backed records reference in-range physical source lines.

### Parser-Safe Logical Text Tests

File:

```text
test/book-entry/parser-safe-logical-text.test.ts
```

Required cases:

- Escaped include record is written with leading backslash.
- Parser-safe text does not expand escaped include target during parser load.
- Generated control lines remain in parser-safe text.
- Parser-safe line count equals logical line record count.

### Parser Integration Tests

File:

```text
test/book-entry/official-reader-parser-integration.test.ts
```

Required fixture:

```text
test/book-entry/fixtures/official-reader-book/
  book.adoc
  frontmatter/preface.adoc
  chapters/01-main.adoc
  chapters/02-snippet-include.adoc
  chapters/nested/section.adoc
  examples/minimal-tool.mjs
  snippets/lines.adoc
  escaped-target.adoc
```

Required cases:

- Included headings appear in `AbundantDocument` section tree.
- Entry heading source relativePath points to entry file.
- Chapter heading source relativePath points to chapter file.
- Nested include heading source relativePath points to nested file.
- Source block tagged include does not fail book-entry parse.
- Listing content from `tag=main` appears in parsed listing node.
- Escaped include target is not parsed as included document.
- `leveloffset` produces correct section hierarchy.
- Missing optional include does not add source file record.

### Source Coordinate Recovery Tests

File:

```text
test/book-entry/official-reader-source-coordinate.test.ts
```

Required cases:

- Xref in selected tagged include maps to target file physical line.
- Xref in non-contiguous `lines` include maps to physical selected line.
- Xref on transformed indentation content maps through offset column map.
- Xref on inserted indentation column omits precise column with diagnostic.
- Parser position on generated control line omits source coordinate.
- Block spanning source block delimiter file and included snippet file emits `block-origin.multi-source-span`.

### RDF12 Source Reconstruction Tests

File:

```text
test/rdf12-projection/book-entry-official-reader-source-reconstruction.test.ts
```

Required cases:

- Entry file raw is emitted with authored include directives.
- Full-file included source raw is emitted.
- Tagged snippet target raw is emitted in full, including tag directives and non-selected lines.
- Line-range target raw is emitted in full, including non-selected lines.
- Optional missing target is absent from reconstruction output.
- Generated control lines are absent from reconstruction output.

### Regression Tests

Existing regression guarantees remain active:

- Single-file mode does not expand include.
- Single-file external source location diagnostics remain unchanged.
- `:doctype: book` does not trigger implicit book-entry mode.
- Existing parser, serializer, RDF12, and animation YAML tests continue passing.

### Workspace-Style Fixture Test

One fixture reproduces the page-map failure class:

```adoc
[source,js]
----
include::../examples/minimal-tool.mjs[tag=main]
----
```

Book-entry parsing succeeds for this fixture.

The section tree includes the chapter containing the source block.

The listing node contains the tagged code.

The source coordinate behavior of the listing node matches the block raw recovery contract.

## 14. Acceptance Criteria

The implementation is complete when these commands pass in the `asciidoc-abundant-tree` project:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:coverage
pnpm smoke:cli
```

The implementation is complete when the CLI can parse a book-entry fixture containing a tagged source include:

```bash
node dist/cli.mjs test/book-entry/fixtures/official-reader-book/book.adoc \
  --mode book-entry \
  --document-root test/book-entry/fixtures/official-reader-book \
  --format json
```

The JSON output from that command contains:

- A section from an included chapter file.
- A listing node whose content comes from `examples/minimal-tool.mjs[tag=main]`.
- Source file reconstruction entries for the entry file, included chapter file, and snippet target file.
- No `include.unsupported-attrlist` diagnostic for `tag`, `tags`, `lines`, `indent`, `leveloffset`, or `opts=optional`.

The implementation is complete when `asciidoc-multi-book-workspace` can use the updated package to build reader page map data for a book containing a source-block tagged include.

## Appendix A. Code Map

### Current Files

`src/book-entry/include-resolution.ts`

Current include directive recognition and unsupported attrlist construction error.

`src/book-entry/logical-source-builder.ts`

Current recursive full-file include expansion and line origin construction.

`src/book-entry/model.ts`

Current `LineOrigin`, `SourceFileRecord`, and `LogicalSource` types.

`src/parser.ts`

Current book-entry mode orchestration.

`src/asciidoctor-adapter.ts`

Current Asciidoctor adapter and `loadSource()` entry.

`src/parser-core.ts`

Parser core entry that combines official AST projection and source surface projection.

`src/source-surfaces.ts`

Source surface projection and inline occurrence discovery.

`src/source-interval-resolver.ts`

Source interval resolution for official blocks.

`src/rdf12-projection/source-file-projector.ts`

Source file reconstruction projection.

### Current Tests

`test/book-entry/include-resolution.test.ts`

Current include recognition and unsupported attrlist behavior.

`test/book-entry/logical-source-builder.test.ts`

Current logical text and line origin invariants.

`test/book-entry/book-entry-negative.test.ts`

Current construction error contracts.

`test/book-entry/parser-integration.test.ts`

Current book-entry parser integration behavior.

`test/parser-include-source-map.test.ts`

Current include source-map behavior in single-file and source surface filtering.

## Appendix B. Fixture Surfaces

### Tagged Source Include

```adoc
== Code Include

[source,js]
----
include::../examples/minimal-tool.mjs[tag=main]
----
```

```js
outside();
// tag::main[]
export function describeBook(id) {
  return `book:${id}`;
}
// end::main[]
outsideAgain();
```

Expected logical listing content:

```js
export function describeBook(id) {
  return `book:${id}`;
}
```

### Non-Contiguous Line Include

```adoc
include::../snippets/lines.adoc[lines="1..2,5"]
```

The selected logical lines map to physical source lines 1, 2, and 5.

### Indented Include

```adoc
[source]
----
include::../snippets/text.txt[indent=2]
----
```

Inserted indentation columns do not map to origin columns.

Content columns after inserted indentation map through the offset column map.

### Level Offset Include

```adoc
include::../chapters/chapter-as-document.adoc[leveloffset=+1]
```

Reader-emitted leveloffset control lines are generated control records.

Section headings from the target file retain physical source origin records.

### Escaped Include

```adoc
\include::escaped-target.adoc[]
```

Parser-safe logical text contains the escaped include line.

`escaped-target.adoc` is not included in the logical document or source set.
