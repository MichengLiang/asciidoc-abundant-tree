import { describe, expect, it } from "vitest";
import {
	DEFAULT_RDF12_BASE_IRI,
	normalizeRdf12Options,
} from "../../src/rdf12-projection/options";
import {
	createOrdinalAllocator,
	documentResourceLocalId,
	makeActivityLocalId,
	makeAttributeLocalId,
	makeBlockResourceLocalId,
	makeLabelLocalId,
	makeOccurrenceResourceLocalId,
	makeProjectionLocalId,
	makeResourceIri,
	makeSourceLocalId,
} from "../../src/rdf12-projection/resource-identity";
import { normalizeSourceDigest } from "../../src/rdf12-projection/source-digest";

describe("rdf12 resource identity", () => {
	it("uses the default base IRI when none is provided", () => {
		const options = normalizeRdf12Options({
			documentRoot: "/repo/docs",
		});

		expect(options.baseIri).toBe(DEFAULT_RDF12_BASE_IRI);
		expect(options.relationPrefixMap).toEqual({});
	});

	it("rejects blank document roots", () => {
		expect(() => normalizeRdf12Options({ documentRoot: "   " })).toThrow(
			/RDF 1\.2 projection requires documentRoot/u,
		);
	});

	it("preserves explicit optional projection options", () => {
		const options = normalizeRdf12Options({
			documentRoot: "/repo/docs",
			baseIri: "https://example.test/doc/",
			relationPrefixMap: { ex: "https://example.test/relation/" },
			sourceText: "source",
			sourceDigest: "sha256:manual",
		});

		expect(options).toEqual({
			documentRoot: "/repo/docs",
			baseIri: "https://example.test/doc/",
			relationPrefixMap: { ex: "https://example.test/relation/" },
			sourceText: "source",
			sourceDigest: "sha256:manual",
		});
	});

	it("does not create a source digest placeholder when absent", () => {
		expect(normalizeSourceDigest({})).toBeUndefined();
	});

	it("normalizes source digest from provided sourceText", () => {
		expect(normalizeSourceDigest({ sourceText: "hello" })).toMatch(
			/^sha256:[a-f0-9]{64}$/u,
		);
	});

	it("builds resource IRIs from baseIri, documentKey, and local id only", () => {
		const iri = makeResourceIri({
			baseIri: "https://example.test/doc/",
			documentKey: "doc-key",
			localId: makeBlockResourceLocalId({
				kind: "section",
				startLine: 12,
				ordinal: 0,
			}),
		});

		expect(iri.value).toBe("https://example.test/doc/doc-key#section-l12-o0");
		expect(iri.value).not.toContain("section-basics");
		expect(iri.value).not.toContain("2. 基础概念");
		expect(iri.value).not.toContain("sha256:");
	});

	it("builds occurrence local ids with columns", () => {
		expect(
			makeOccurrenceResourceLocalId({
				kind: "xref",
				startLine: 10,
				startColumn: 60,
				ordinal: 1,
			}),
		).toBe("xref-l10-c60-o1");
	});

	it("provides stable local id helpers for non-structure resources", () => {
		expect(documentResourceLocalId()).toBe("document");
		expect(makeLabelLocalId({ startLine: 12, ordinal: 0 })).toBe(
			"label-l12-o0",
		);
		expect(makeAttributeLocalId({ startLine: 12, ordinal: 0 })).toBe(
			"attribute-l12-o0",
		);
		expect(makeProjectionLocalId()).toBe("projection");
		expect(makeActivityLocalId()).toBe("activity");
		expect(makeSourceLocalId()).toBe("source");
	});

	it("allocates stable ordinals for same kind, line, and column collisions", () => {
		const allocator = createOrdinalAllocator();

		expect(
			allocator.next({ kind: "xref", startLine: 10, startColumn: 60 }),
		).toBe(0);
		expect(
			allocator.next({ kind: "xref", startLine: 10, startColumn: 60 }),
		).toBe(1);
		expect(
			allocator.next({ kind: "xref", startLine: 10, startColumn: 61 }),
		).toBe(0);
		expect(allocator.next({ kind: "section", startLine: 10 })).toBe(0);
	});
});
