import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree, rdf12 } from "../src/index";
import { writeFixture } from "./helpers";
import { aatTerm } from "./rdf12-projection/helpers/graph-matchers";

// 09 号书「Anchor Occurrence」：锚点照 Asciidoctor 4.1.1 rx.js 的 InlineAnchorScanRx 与 InlineBiblioAnchorRx 识别。
const source = [
	"= Anchors",
	"",
	"== Body",
	"",
	"Cites <<parnas1972>> and <<inline-one>>.",
	"Inline [[inline-one]]anchor, escaped \\[[escaped-one]] and anchor:macro-one[Macro].",
	"Not anchors: [[1digit]], \\anchor:escaped-macro[] and [[[outside-bibliography]]].",
	"",
	"* [[[not-a-bibliography]]] a plain list item.",
	"",
	"[bibliography]",
	"== References",
	"",
	"* [[[parnas1972]]] Parnas, D. L. 1972.",
	"* [[[knuth1984, Knuth]]] Knuth, D. E. 1984.",
	"",
].join("\n");

describe("anchor recognition", () => {
	it("reads anchor IDs the way Asciidoctor does", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture("anchor-recognition.adoc", source),
		});

		expect(
			document.anchorOccurrences.map((anchor) => [
				anchor.ids,
				anchor.syntax,
				anchor.reftext,
				anchor.containingSectionId,
			]),
		).toEqual([
			[["inline-one"], "double-bracket", undefined, "_body"],
			[["macro-one"], "macro", "Macro", "_body"],
			[["parnas1972"], "bibliography", undefined, "_references"],
			[["knuth1984"], "bibliography", "Knuth", "_references"],
		]);
	});

	it("binds a citation to the heading that holds the bibliography entry", async () => {
		const sourcePath = writeFixture("anchor-recognition-rdf.adoc", source);
		const { graph } = rdf12(await parseAbundantTree({ sourcePath }), {
			documentRoot: dirname(sourcePath),
		});
		const literal = (predicate: string) =>
			graph
				.match({ predicate: aatTerm(predicate) })
				.flatMap((triple) =>
					triple.object.termType === "literal"
						? [{ subject: triple.subject, value: triple.object.value }]
						: [],
				);
		const labels = literal("addressLabel").map((entry) => entry.value);
		const citation = literal("raw").find(
			(entry) => entry.value === "<<parnas1972>>",
		)?.subject;
		const references = literal("headline").find(
			(entry) => entry.value === "References",
		)?.subject;
		if (!citation) {
			throw new Error("Missing citation edge");
		}

		expect(labels).toEqual(
			expect.arrayContaining(["parnas1972", "knuth1984", "inline-one"]),
		);
		expect(labels.filter((label) => label.startsWith("["))).toEqual([]);
		expect(
			graph.match({ subject: citation, predicate: aatTerm("targetHeading") })[0]
				?.object,
		).toEqual(references);
	});
});
