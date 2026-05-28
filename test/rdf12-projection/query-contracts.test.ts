import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli";
import { parseAbundantTree, rdf12 } from "../../src/index";
import { assertRdf12GraphsEquivalent } from "../../src/rdf12-projection/graph-canonicalization";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { iriTerm } from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectResourceTypeCount,
	rdfTerm,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 query contract end-to-end acceptance", () => {
	it("roundtrips the public rdf12 result through the parser as graph facts and locks the Batch 00 legacy baseline", () => {
		const result = rdf12(parseAbundantTree({ sourcePath: referencePath }), {
			documentRoot: projectRoot,
		});
		const parsed = parseTurtleToRdf12Graph(result.ttl);

		expect(() =>
			assertRdf12GraphsEquivalent(result.graph, parsed),
		).not.toThrow();
		expectResourceTypeCount(parsed, aatTerm("Section"), 5);
		expectResourceTypeCount(parsed, aatTerm("Paragraph"), 11);
		expectResourceTypeCount(parsed, aatTerm("ListingBlock"), 1);
		expectResourceTypeCount(parsed, aatTerm("TableBlock"), 1);
		expectResourceTypeCount(parsed, aatTerm("AnchorTarget"), 1);
		expectResourceTypeCount(parsed, aatTerm("XrefOccurrence"), 8);
		expectResourceTypeCount(parsed, aatTerm("SurfaceAttribute"), 2);
		expectResourceTypeCount(parsed, aatTerm("PayloadBlock"), 0);
		expect(
			parsed.match({
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			})[0]?.object.termType,
		).toBe("triple");
	});

	it("parses CLI rdf12 stdout and asserts graph facts rather than Turtle formatting", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--format",
			"rdf12",
		]);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout.trim().length).toBeGreaterThan(0);

		const graph = parseTurtleToRdf12Graph(result.stdout);

		expectResourceTypeCount(graph, aatTerm("Section"), 5);
		expectResourceTypeCount(graph, aatTerm("XrefOccurrence"), 8);
		expect(
			graph.match({
				predicate: aatTerm("containsDirectly"),
			}).length,
		).toBe(19);
		expect(
			graph.match({
				predicate: rdfTerm("reifies"),
			})[0]?.object.termType,
		).toBe("triple");
	});
});
