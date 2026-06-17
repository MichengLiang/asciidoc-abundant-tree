import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import type { SourceAwareLogicalDocument } from "../../src/book-entry/line-origin-model";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import {
	recoverSourceAwareDocumentTitleSourceLayer,
	recoverSourceAwarePointSourceLayer,
	recoverSourceAwareSectionSourceLayer,
	recoverSourceAwareSourceLayer,
	recoverSourceAwareTitleSpan,
	sourceScopeFromSourceAwareInterval,
} from "../../src/book-entry/source-aware-coordinate";
import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { buildLineTable } from "../../src/source-lines";

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

	it("rejects source-aware block spans that cross origin files", () => {
		const sourceAwareDocument = makeTwoFileSourceAwareDocument();
		const recovered = recoverSourceAwareSourceLayer(
			sourceAwareDocument,
			{ startLine: 1, endLine: 2 },
			{
				diagnosticContext: "cross-file fixture block",
				logicalSourceSpan: {
					start: { line: 1, column: 1 },
					end: { line: 2, column: 6 },
				},
				raw: true,
			},
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected cross-file block span to be rejected");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "block-origin.multi-source-span",
				level: "warning",
			}),
		);
		expect(recovered).not.toHaveProperty("sourceLayer");
		expect(recovered).not.toHaveProperty("relativePath");
	});

	it("rejects source-aware point spans that start and end in different origin files", () => {
		const sourceAwareDocument = makeTwoFileSourceAwareDocument();
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			{
				start: { line: 1, column: 1 },
				end: { line: 2, column: 6 },
			},
			"alpha\nbeta",
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected cross-file point span to be rejected");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "block-origin.multi-source-span",
				level: "warning",
			}),
		);
		expect(recovered.sourceLayer).toBeUndefined();
		expect(recovered).not.toHaveProperty("sourceSpan");
	});

	it("reports out-of-range logical point recovery without fake source evidence", () => {
		const sourceAwareDocument = makeTwoFileSourceAwareDocument();
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			{
				start: { line: 3, column: 1 },
				end: { line: 3, column: 1 },
			},
			"",
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected out-of-range point to be rejected");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.degraded-line",
				level: "warning",
			}),
		);
		expect(recovered.sourceLayer).toBeUndefined();
		expect(recovered).not.toHaveProperty("relativePath");
	});

	it("reports out-of-range block spans without source reconstruction", () => {
		const sourceAwareDocument = makeTwoFileSourceAwareDocument();
		const recovered = recoverSourceAwareSourceLayer(
			sourceAwareDocument,
			{ startLine: 1, endLine: 3 },
			{
				diagnosticContext: "out-of-range block",
				raw: true,
			},
		);

		expect(recovered.ok).toBe(false);
		if (recovered.ok) {
			throw new Error("Expected out-of-range block to be rejected");
		}
		expect(recovered.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.degraded-line",
				level: "warning",
			}),
		);
		expect(recovered).not.toHaveProperty("sourceLayer");
	});

	it("reports generated-only and degraded block spans without precise coordinates", () => {
		const sourceAwareDocument = makeGeneratedAndDegradedSourceAwareDocument();

		const generated = recoverSourceAwareSourceLayer(
			sourceAwareDocument,
			{ startLine: 1, endLine: 1 },
			{
				diagnosticContext: "generated-only block",
				logicalSourceSpan: {
					start: { line: 1, column: 1 },
					end: { line: 1, column: 15 },
				},
			},
		);
		const degraded = recoverSourceAwareSourceLayer(
			sourceAwareDocument,
			{ startLine: 2, endLine: 2 },
			{
				diagnosticContext: "degraded block",
				logicalSourceSpan: {
					start: { line: 2, column: 1 },
					end: { line: 2, column: 8 },
				},
			},
		);

		expect(generated.ok).toBe(false);
		if (generated.ok) {
			throw new Error("Expected generated block to be rejected");
		}
		expect(generated.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.generated-line",
				level: "warning",
			}),
		);
		expect(generated).not.toHaveProperty("sourceLayer");

		expect(degraded.ok).toBe(false);
		if (degraded.ok) {
			throw new Error("Expected degraded block to be rejected");
		}
		expect(degraded.diagnostic).toEqual(
			expect.objectContaining({
				code: "source-coordinate.degraded-line",
				source: {
					start: { line: 2, column: 1 },
					end: { line: 2, column: 8 },
				},
			}),
		);
		expect(degraded).not.toHaveProperty("sourceLayer");
	});

	it("recovers source-aware section raw from metadata through the line before the next origin heading", () => {
		const sourceAwareDocument = makeSectionSourceAwareDocument();
		const recovered = recoverSourceAwareSectionSourceLayer(
			sourceAwareDocument,
			2,
			1,
			{
				start: { line: 2, column: 4 },
				end: { line: 2, column: 8 },
			},
			5,
		);

		expect(recovered.ok).toBe(true);
		if (!recovered.ok) {
			throw new Error("Expected section source to recover");
		}
		expect(recovered.relativePath).toBe("chapter.adoc");
		expect(recovered.lineSpan).toEqual({ startLine: 1, endLine: 4 });
		expect(recovered.sourceSpan).toEqual({
			start: { line: 2, column: 4 },
			end: { line: 2, column: 8 },
		});
		expect(recovered.sourceLayer.raw).toBe("[#intro]\n== Intro\nbody\n\n");
	});

	it("reports source-aware section recovery failures without fabricated raw", () => {
		const sourceAwareDocument = makeGeneratedAndDegradedSourceAwareDocument();
		const missingSourceFile = {
			...makeSectionSourceAwareDocument(),
			sourceFiles: [],
		};
		const sourceSpanFailure = recoverSourceAwareSectionSourceLayer(
			makeSectionSourceAwareDocument(),
			2,
			1,
			{
				start: { line: 2, column: 4 },
				end: { line: 99, column: 1 },
			},
			undefined,
		);

		expect(
			recoverSourceAwareSectionSourceLayer(
				sourceAwareDocument,
				1,
				1,
				undefined,
				undefined,
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-coordinate.generated-line",
				}),
			}),
		);
		expect(
			recoverSourceAwareSectionSourceLayer(
				missingSourceFile,
				2,
				1,
				undefined,
				undefined,
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "line-origin.source-file-missing",
				}),
			}),
		);
		expect(sourceSpanFailure).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-coordinate.degraded-line",
				}),
			}),
		);
	});

	it("reports missing source files and source span failures for source-aware block recovery", () => {
		const missingSourceFile = {
			...makeTwoFileSourceAwareDocument(),
			sourceFiles: [],
		};

		expect(
			recoverSourceAwareSourceLayer(
				missingSourceFile,
				{ startLine: 1, endLine: 1 },
				{
					diagnosticContext: "missing file block",
				},
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "line-origin.source-file-missing",
				}),
			}),
		);
		expect(
			recoverSourceAwareSourceLayer(
				makeTwoFileSourceAwareDocument(),
				{ startLine: 1, endLine: 1 },
				{
					diagnosticContext: "bad source span",
					logicalSourceSpan: {
						start: { line: 1, column: 1 },
						end: { line: 99, column: 1 },
					},
				},
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-coordinate.degraded-line",
				}),
			}),
		);
	});

	it("recovers document title raw from logical text and omits failed title spans", () => {
		const sourceAwareDocument = makeSectionSourceAwareDocument();

		expect(
			recoverSourceAwareDocumentTitleSourceLayer(sourceAwareDocument, {
				start: { line: 2, column: 4 },
				end: { line: 2, column: 8 },
			}),
		).toEqual(
			expect.objectContaining({
				ok: true,
				sourceLayer: expect.objectContaining({
					raw: "== Intro",
					relativePath: "chapter.adoc",
				}),
			}),
		);
		expect(
			recoverSourceAwareTitleSpan(sourceAwareDocument, {
				start: { line: 2, column: 4 },
				end: { line: 99, column: 1 },
			}),
		).toBeUndefined();
	});

	it("omits title recovery when no logical title span exists", () => {
		const sourceAwareDocument = makeSectionSourceAwareDocument();

		expect(recoverSourceAwareTitleSpan(sourceAwareDocument, undefined)).toBe(
			undefined,
		);
		expect(
			recoverSourceAwareDocumentTitleSourceLayer(
				sourceAwareDocument,
				undefined,
			),
		).toBe(undefined);
	});

	it("builds source scopes from source-aware intervals without crossing origin files", () => {
		const sourceAwareDocument = makeSourceScopeFixtureDocument();

		expect(
			sourceScopeFromSourceAwareInterval(
				sourceAwareDocument,
				{ startLine: 1, endLine: 3 },
				1,
			),
		).toEqual({
			relativePath: "chapter.adoc",
			startLine: 1,
			endLine: 2,
		});
		expect(
			sourceScopeFromSourceAwareInterval(
				sourceAwareDocument,
				{ startLine: 2, endLine: 3 },
				4,
			),
		).toBeUndefined();
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

function makeTwoFileSourceAwareDocument(): SourceAwareLogicalDocument {
	const entry = sourceFile("/virtual/book.adoc", "book.adoc", "alpha\n");
	const chapter = sourceFile("/virtual/chapter.adoc", "chapter.adoc", "beta\n");
	return {
		entryPath: entry.absolutePath,
		documentRoot: "/virtual",
		logicalText: "alpha\nbeta",
		sourceFiles: [entry, chapter],
		diagnostics: [],
		lines: [
			sourceLineRecord(1, "alpha", entry, 1),
			sourceLineRecord(2, "beta", chapter, 1),
		],
	};
}

function makeGeneratedAndDegradedSourceAwareDocument(): SourceAwareLogicalDocument {
	return {
		entryPath: "/virtual/book.adoc",
		documentRoot: "/virtual",
		logicalText: ":leveloffset: +1\nunknown",
		sourceFiles: [],
		diagnostics: [],
		lines: [
			{
				kind: "generated-control",
				logicalLine: 1,
				text: ":leveloffset: +1",
				generatedKind: "leveloffset-push",
			},
			{
				kind: "degraded",
				logicalLine: 2,
				text: "unknown",
				evidence: {},
				diagnostic: {
					level: "warning",
					code: "source-coordinate.degraded-line",
					message: "Degraded line fixture.",
				},
			},
		],
	};
}

function makeSectionSourceAwareDocument(): SourceAwareLogicalDocument {
	const chapter = sourceFile(
		"/virtual/chapter.adoc",
		"chapter.adoc",
		"[#intro]\n== Intro\nbody\n\n== Next\nnext\n",
	);
	return {
		entryPath: "/virtual/book.adoc",
		documentRoot: "/virtual",
		logicalText: "[#intro]\n== Intro\nbody\n\n== Next\nnext",
		sourceFiles: [chapter],
		diagnostics: [],
		lines: [
			sourceLineRecord(1, "[#intro]", chapter, 1),
			sourceLineRecord(2, "== Intro", chapter, 2),
			sourceLineRecord(3, "body", chapter, 3),
			sourceLineRecord(4, "", chapter, 4),
			sourceLineRecord(5, "== Next", chapter, 5),
			sourceLineRecord(6, "next", chapter, 6),
		],
	};
}

function makeSourceScopeFixtureDocument(): SourceAwareLogicalDocument {
	const chapter = sourceFile(
		"/virtual/chapter.adoc",
		"chapter.adoc",
		"== Intro\nbody\n",
	);
	const snippet = sourceFile(
		"/virtual/snippet.adoc",
		"snippet.adoc",
		"snippet\n",
	);
	return {
		entryPath: "/virtual/book.adoc",
		documentRoot: "/virtual",
		logicalText: "== Intro\nbody\nsnippet",
		sourceFiles: [chapter, snippet],
		diagnostics: [],
		lines: [
			sourceLineRecord(1, "== Intro", chapter, 1),
			sourceLineRecord(2, "body", chapter, 2),
			sourceLineRecord(3, "snippet", snippet, 1),
		],
	};
}

function sourceFile(
	absolutePath: string,
	relativePath: string,
	text: string,
): SourceAwareLogicalDocument["sourceFiles"][number] {
	return {
		absolutePath,
		relativePath,
		text,
		lineTable: buildLineTable(text),
	};
}

function sourceLineRecord(
	logicalLine: number,
	text: string,
	sourceFileRecord: SourceAwareLogicalDocument["sourceFiles"][number],
	sourceLine: number,
): SourceAwareLogicalDocument["lines"][number] {
	return {
		kind: "source-preserving",
		logicalLine,
		text,
		origin: {
			absolutePath: sourceFileRecord.absolutePath,
			relativePath: sourceFileRecord.relativePath,
			sourceLine,
		},
		columnMap: { kind: "identity" },
	};
}
