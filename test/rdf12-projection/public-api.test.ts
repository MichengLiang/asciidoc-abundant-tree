import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree, rdf12 } from "../../src/index";
import { rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 public API", () => {
	it("returns graph and Turtle from the single public rdf12 call", () => {
		const document = parseAbundantTree({ sourcePath });
		const result = rdf12(document, {
			documentRoot: projectRoot,
		});

		expect(result.graph).toBeDefined();
		expect(result.ttl).toContain("@prefix aat:");
		expect(result.ttl).toContain("rdf:reifies <<(");
		expect(parseTurtleToRdf12Graph(result.ttl).size).toBe(result.graph.size);
	});

	it("uses parsed document source text for document title raw without explicit sourceText", () => {
		const structuralPayloadPath = join(
			projectRoot,
			"samples/structural-payload.adoc",
		);
		const document = parseAbundantTree({ sourcePath: structuralPayloadPath });
		const result = rdf12(document, { documentRoot: projectRoot });
		const root = iriTerm(
			`${result.documentIri.slice(0, result.documentIri.indexOf("#"))}#heading-l1-o0`,
		);

		expect(
			result.graph.has(
				rdf12Triple(
					root,
					iriTerm(`${namespaces.aat}raw`),
					stringLiteral(`= root

一段摘要

`),
				),
			),
		).toBe(true);
		expect(
			result.graph.has(
				rdf12Triple(
					root,
					iriTerm(`${namespaces.aat}contentStartLine`),
					integerLiteral(3),
				),
			),
		).toBe(true);
		expect(
			result.graph.has(
				rdf12Triple(
					root,
					iriTerm(`${namespaces.aat}contentEndLine`),
					integerLiteral(3),
				),
			),
		).toBe(true);
	});

	it("honors explicit sourceText when projecting raw heading slices", () => {
		const structuralPayloadPath = join(
			projectRoot,
			"samples/structural-payload.adoc",
		);
		const sourceText = `= supplied root

supplied body
`;
		const document = parseAbundantTree({ sourcePath: structuralPayloadPath });
		const result = rdf12(document, { documentRoot: projectRoot, sourceText });
		const root = iriTerm(
			`${result.documentIri.slice(0, result.documentIri.indexOf("#"))}#heading-l1-o0`,
		);

		expect(
			result.graph.has(
				rdf12Triple(
					root,
					iriTerm(`${namespaces.aat}raw`),
					stringLiteral(`${sourceText}\n`),
				),
			),
		).toBe(true);
	});

	it("returns JSON-LD from the single public rdf12 call", () => {
		const document = parseAbundantTree({ sourcePath });
		const result = rdf12(document, {
			documentRoot: projectRoot,
		});

		const jsonLd = JSON.parse(result.jsonLd);

		expect(jsonLd["@context"].rdf12).toBe(
			"https://micheng.dev/ns/asciidoc-abundant-tree/rdf12-json-ld#",
		);
		expect(jsonLd["@graph"]).toHaveLength(result.graph.size);
		expect(jsonLd["@graph"]).toContainEqual(
			expect.objectContaining({
				"@type": "rdf12:Triple",
				object: expect.objectContaining({
					"@type": "rdf12:TripleTerm",
					triple: expect.any(Object),
				}),
			}),
		);
	});
});
