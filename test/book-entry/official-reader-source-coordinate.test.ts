import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import type { SourceAwareLogicalDocument } from "../../src/book-entry/line-origin-model";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import { recoverSourceAwarePointSourceLayer } from "../../src/book-entry/source-aware-coordinate";
import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const fixtureRoot = join(
	process.cwd(),
	"test/book-entry/fixtures/official-reader-book",
);
const entryPath = join(fixtureRoot, "book.adoc");

describe("book-entry official Reader source coordinate recovery", () => {
	it("maps xrefs in selected tagged includes to target physical lines", () => {
		const document = parseOfficialReaderBook();
		const xref = xrefByRaw(document, "xref:preface[Tagged Preface]");

		expect(xref.source?.relativePath).toBe("snippets/tagged-xref.adoc");
		expect(xref.sourceSpan?.start.line).toBe(3);
		expect(xref.sourceSpan?.start.column).toBe(8);
	});

	it("maps xrefs in non-contiguous lines includes to selected physical lines", () => {
		const document = parseOfficialReaderBook();
		const xref = xrefByRaw(document, "xref:preface[Preface from line five]");

		expect(xref.source?.relativePath).toBe("snippets/lines.adoc");
		expect(xref.sourceSpan?.start.line).toBe(5);
		expect(xref.sourceSpan?.start.column).toBe(1);
	});

	it("maps transformed indentation content through offset column maps", () => {
		const document = parseOfficialReaderBook();
		const xref = xrefByRaw(document, "xref:preface[Indented Preface]");

		expect(xref.source?.relativePath).toBe("snippets/indented.adoc");
		expect(xref.sourceSpan?.start.line).toBe(1);
		expect(xref.sourceSpan?.start.column).toBe(3);
	});

	it("reports inserted indentation columns as unmapped through point recovery", () => {
		const sourceAwareDocument = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const transformed = sourceAwareDocument.lines.find(
			(line) =>
				line.kind === "transformed-source" &&
				line.origin.relativePath === "snippets/indented.adoc",
		);
		if (!transformed) {
			throw new Error("Missing transformed indentation record");
		}
		// Parser xrefs begin at the macro token, not in inserted whitespace.
		// This direct point recovery covers the column-map contract for that whitespace.
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			{
				start: { line: transformed.logicalLine, column: 1 },
				end: { line: transformed.logicalLine, column: 1 },
			},
			"",
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected inserted indentation column to be unmapped");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.column-unmapped",
				level: "warning",
			}),
		);
		expect(recovered.sourceLayer).toEqual(
			expect.objectContaining({
				relativePath: "snippets/indented.adoc",
				line: 1,
			}),
		);
	});

	it("omits precise source coordinates for generated control lines", () => {
		const sourceAwareDocument = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const generated = sourceAwareDocument.lines.find(
			(line) => line.kind === "generated-control",
		);
		if (!generated) {
			throw new Error("Missing generated control record");
		}
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			{
				start: { line: generated.logicalLine, column: 1 },
				end: { line: generated.logicalLine, column: 1 },
			},
			"",
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected generated control line to be unmapped");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.generated-line",
				level: "warning",
			}),
		);
		expect(recovered.sourceLayer).toBeUndefined();
		expect(recovered).not.toHaveProperty("relativePath");
		expect(recovered).not.toHaveProperty("sourceSpan");
	});

	it("omits precise source coordinates for degraded lines", () => {
		const sourceAwareDocument: SourceAwareLogicalDocument = {
			entryPath: "/virtual/book.adoc",
			documentRoot: "/virtual",
			logicalText: "degraded",
			lines: [
				{
					kind: "degraded",
					logicalLine: 1,
					text: "degraded",
					evidence: {},
					diagnostic: {
						level: "warning",
						code: "source-coordinate.degraded-line",
						message: "Degraded line fixture.",
					},
				},
			],
			sourceFiles: [],
			diagnostics: [],
		};
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			{
				start: { line: 1, column: 1 },
				end: { line: 1, column: 1 },
			},
			"",
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected degraded line to be unmapped");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.degraded-line",
				level: "warning",
			}),
		);
		expect(recovered.sourceLayer).toBeUndefined();
		expect(recovered).not.toHaveProperty("relativePath");
		expect(recovered).not.toHaveProperty("sourceSpan");
	});

	it("emits multi-source diagnostics and omits listing raw for source block snippet includes", () => {
		const document = parseOfficialReaderBook();
		const listing = collectNodes(document.children, "listing").find((node) =>
			(node as ListingNode).content?.includes("describeBook"),
		) as ListingNode | undefined;

		expect(listing?.source).toBeUndefined();
		expect(document.toolDiagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "block-origin.multi-source-span",
					level: "warning",
				}),
			]),
		);
	});
});

function parseOfficialReaderBook(): AbundantDocument {
	return parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});
}

function xrefByRaw(
	document: AbundantDocument,
	raw: string,
): XrefOccurrenceNode {
	const xref = document.xrefOccurrences.find(
		(candidate) => candidate.raw === raw,
	);
	if (!xref) {
		throw new Error(`Missing xref: ${raw}`);
	}
	return xref;
}

function collectNodes(
	nodes: readonly AbundantNode[],
	kind: string,
): AbundantNode[] {
	const result: AbundantNode[] = [];
	for (const node of nodes) {
		if (node.kind === kind) {
			result.push(node);
		}
		result.push(...collectNodes(node.children ?? [], kind));
	}
	return result;
}
