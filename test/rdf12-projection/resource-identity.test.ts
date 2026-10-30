import { describe, expect, it } from "vitest";
import {
	DEFAULT_RDF12_BASE_IRI,
	normalizeRdf12Options,
} from "../../src/rdf12-projection/options";
import {
	createOrdinalAllocator,
	documentIriFor,
	documentResourceIri,
	makeHeadingLocalId,
	makePayloadLocalId,
	makeXrefEdgeResourceLocalId,
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

	it("names the document by its readable relative path", () => {
		expect(documentIriFor("urn:aat:doc:", "books/07-菜谱/book.adoc")).toBe(
			"urn:aat:doc:books/07-菜谱/book.adoc",
		);
		// 路径在 # 之前：? 会被读成查询部分的开头，# 会被读成片段的开头。
		expect(documentIriFor("urn:aat:doc:", "a?b#c d.adoc")).toBe(
			"urn:aat:doc:a%3Fb%23c%20d.adoc",
		);
	});

	it("puts every resource under <document IRI># with projector-made local ids", () => {
		const document = "urn:aat:doc:book.adoc";

		expect(makeHeadingLocalId(3)).toBe("heading-3");
		expect(documentResourceIri(document, makeHeadingLocalId(3)).value).toBe(
			"urn:aat:doc:book.adoc#heading-3",
		);
		expect(documentResourceIri(document, "source").value).toBe(
			"urn:aat:doc:book.adoc#source",
		);
	});

	it("builds projector local ids from source coordinates", () => {
		expect(
			makeXrefEdgeResourceLocalId({
				startLine: 10,
				startColumn: 60,
				ordinal: 1,
			}),
		).toBe("xref-edge-l10-c60-o1");
		expect(makePayloadLocalId({ startLine: 12, ordinal: 0 })).toBe(
			"payload-l12-o0",
		);
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
		expect(allocator.next({ kind: "payload", startLine: 10 })).toBe(0);
	});
});
