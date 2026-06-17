import { describe, expect, it } from "vitest";
import type { SectionNode } from "../../src/model";
import { findInnermostHeadingBySourceLine } from "../../src/rdf12-projection/heading-ownership";
import type {
	Rdf12NodeIndex,
	Rdf12NodeIndexEntry,
} from "../../src/rdf12-projection/node-index";
import { iriTerm } from "../../src/rdf12-projection/terms";

describe("rdf12 heading ownership lookup", () => {
	it("chooses the innermost source span and breaks ties by later start then stable order", () => {
		const broad = entry("broad", 1, 20);
		const nested = entry("nested", 5, 10);
		const laterTie = entry("later-tie", 7, 12);
		const sourceAware = {
			...entry("source-aware", 1, 99),
			sourceStartLine: 6,
			sourceEndLine: 8,
		};
		const otherFile = {
			...entry("other", 1, 2),
			relativePath: "other.adoc",
		};
		const nodeIndex = index([broad, nested, laterTie, sourceAware, otherFile]);

		expect(
			findInnermostHeadingBySourceLine({
				nodeIndex,
				relativePath: "book.adoc",
				line: 7,
			}),
		).toBe(sourceAware);
		expect(
			findInnermostHeadingBySourceLine({
				nodeIndex,
				relativePath: "book.adoc",
				line: 11,
			}),
		).toBe(laterTie);
		expect(
			findInnermostHeadingBySourceLine({
				nodeIndex,
				relativePath: "missing.adoc",
				line: 7,
			}),
		).toBeUndefined();
	});
});

function entry(
	id: string,
	startLine: number,
	endLine: number,
): Rdf12NodeIndexEntry {
	const node: SectionNode = {
		kind: "section",
		level: 1,
		ids: [id],
		title: id,
		idOrigin: "source",
	};
	return {
		node,
		iri: iriTerm(`urn:test#${id}`),
		localId: id,
		kind: "section",
		documentOrder: 0,
		relativePath: "book.adoc",
		startLine,
		endLine,
		targetType: "section",
	};
}

function index(entries: readonly Rdf12NodeIndexEntry[]): Rdf12NodeIndex {
	return {
		get: () => undefined,
		findByTarget: () => undefined,
		entries: () => entries,
	};
}
