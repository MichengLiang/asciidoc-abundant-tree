import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	type Rdf12Graph,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import type { Rdf12Projection } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { serializeRdf12ProjectionToTurtle } from "../../src/rdf12-projection/turtle-serializer";

describe("rdf12 Turtle serialization", () => {
	it("serializes a basic project graph as Turtle with prefixes and triple terms", () => {
		const projection = testProjection();
		const turtle = serializeRdf12ProjectionToTurtle(projection);

		expect(turtle).toContain("@prefix aat:");
		expect(turtle).toContain("@prefix rdf:");
		expect(turtle).toContain("@prefix xsd:");
		expect(turtle).toContain("aat:references");
		expect(turtle).toContain("rdf:reifies <<(");
		expect(turtle).toContain('"3. 核心引擎设计"');
		expect(turtle).toContain("aat:startLine 10");
	});

	it("serializes the same graph to identical text across repeated calls", () => {
		const projection = testProjection();

		expect(serializeRdf12ProjectionToTurtle(projection)).toBe(
			serializeRdf12ProjectionToTurtle(projection),
		);
	});

	it("prints multiline aat:raw values as Turtle long string literals", () => {
		const subject = "urn:aat:doc:test#source-file";
		const value = "first line\nsecond line\n";
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "raw", value }]),
		);

		expect(turtle).toSatisfy(
			(output: string) =>
				output.includes('aat:raw """first line\nsecond line\n"""') ||
				output.includes("aat:raw '''first line\nsecond line\n'''"),
		);
		expect(turtle).not.toContain('aat:raw "first line\\nsecond line\\n"');
		expect(rawLiteralValue(parseTurtleToRdf12Graph(turtle), subject)).toBe(
			value,
		);
	});

	it("leaves single-line aat:raw values in normal quoted form", () => {
		const subject = "urn:aat:doc:test#xref-edge";
		const value = "xref:target[label]";
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "raw", value }]),
		);

		expect(countLongRawLiteralOpenings(turtle)).toBe(0);
		expect(turtle).toContain('aat:raw "xref:target[label]"');
		expect(rawLiteralValue(parseTurtleToRdf12Graph(turtle), subject)).toBe(
			value,
		);
	});

	it("does not rewrite multiline non-raw string literals", () => {
		const subject = "urn:aat:doc:test#heading";
		const value = "A\nB\n";
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "headline", value }]),
		);
		const parsed = parseTurtleToRdf12Graph(turtle);

		expect(turtle).toContain('aat:headline "A\\nB\\n"');
		expect(turtle).not.toMatch(/aat:headline\s+(?:"""|''')/u);
		expect(rawLiteralValue(parsed, subject, "headline")).toBe(value);
	});

	it("preserves quotes, backslashes, blank lines, and trailing newline in readable raw literals", () => {
		const subject = "urn:aat:doc:test#listing-payload";
		const value =
			'[source,json]\n----\n{"path":"chapters\\\\overview.adoc","quote":"\\""}\n----\n\n';
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "raw", value }]),
		);

		expect(turtle).toMatch(/\[source,json\]\n----\n/u);
		expect(turtle).toMatch(/----\n\n(?:"""|''')/u);
		expect(rawLiteralValue(parseTurtleToRdf12Graph(turtle), subject)).toBe(
			value,
		);
	});

	it("preserves raw values containing both Turtle long literal delimiter sequences", () => {
		const subject = "urn:aat:doc:test#delimiter-source";
		const value = "before \"\"\" middle ''' after\n";
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "raw", value }]),
		);

		expect(countLongRawLiteralOpenings(turtle)).toBe(1);
		expect(rawLiteralValue(parseTurtleToRdf12Graph(turtle), subject)).toBe(
			value,
		);
	});

	it("preserves raw values containing overlapping Turtle long literal delimiter sequences", () => {
		const subject = "urn:aat:doc:test#overlapping-delimiter-source";
		const value = "double quotes: \"\"\"\" and single quotes: ''''\n";
		const turtle = serializeRdf12ProjectionToTurtle(
			rawProjection([{ subject, predicate: "raw", value }]),
		);

		expect(countLongRawLiteralOpenings(turtle)).toBe(1);
		expect(rawLiteralValue(parseTurtleToRdf12Graph(turtle), subject)).toBe(
			value,
		);
	});

	it("formats many multiline raw literals without excessive overhead", () => {
		const sources = Array.from({ length: 100 }, (_, index) => ({
			subject: `urn:aat:doc:test#source-file-${index}`,
			predicate: "raw",
			value: Array.from(
				{ length: 20 },
				(__, line) => `source ${index} line ${line}`,
			).join("\n"),
		}));
		const projection = rawProjection(sources);

		serializeRdf12ProjectionToTurtle(projection);
		const start = performance.now();
		const turtle = serializeRdf12ProjectionToTurtle(projection);
		const elapsedMs = performance.now() - start;
		const parsed = parseTurtleToRdf12Graph(turtle);

		expect(elapsedMs).toBeLessThan(1000);
		expect(countLongRawLiteralOpenings(turtle)).toBeGreaterThanOrEqual(100);
		expect(parsed.size).toBe(projection.graph.size);
	});
});

function testProjection(): Rdf12Projection {
	const graph = createRdf12Graph();
	const source = iriTerm("urn:aat:doc:test#heading-l1-o0");
	const target = iriTerm("urn:aat:doc:test#heading-l3-o0");
	const references = iriTerm(`${namespaces.aat}references`);
	const xref = iriTerm("urn:aat:doc:test#xref-edge-l10-c60-o0");
	const relation = rdf12Triple(source, references, target);

	graph.add(relation);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.rdf}reifies`),
			rdf12TripleTerm(relation),
		),
	);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.aat}targetSelector`),
			stringLiteral("3. 核心引擎设计"),
		),
	);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.aat}startLine`),
			integerLiteral(10),
		),
	);
	graph.add(
		rdf12Triple(
			source,
			iriTerm(`${namespaces.aat}raw`),
			stringLiteral("= Heading\n\nbody\n"),
		),
	);

	return {
		graph,
		prefixes: namespaces,
		relativePath: "samples/reference-links.adoc",
		documentIri: "urn:aat:doc:test#document",
		sourceDocumentIri: "urn:aat:doc:test#source",
		projectionIri: "urn:aat:doc:test#projection",
		projectionActivityIri: "urn:aat:doc:test#activity",
		abundantDocumentIri: "urn:aat:doc:test#abundant-document",
		nodeIndex: {
			get: () => undefined,
			findByTarget: () => undefined,
			entries: () => [],
		},
		labelCatalog: {
			add: () => undefined,
			find: () => [],
			owners: () => [],
			entries: () => [],
		},
	};
}

function rawProjection(
	entries: readonly {
		readonly subject: string;
		readonly predicate: string;
		readonly value: string;
	}[],
): Rdf12Projection {
	const graph = createRdf12Graph();

	for (const entry of entries) {
		graph.add(
			rdf12Triple(
				iriTerm(entry.subject),
				iriTerm(`${namespaces.aat}${entry.predicate}`),
				stringLiteral(entry.value),
			),
		);
	}

	return {
		graph,
		prefixes: namespaces,
		relativePath: "samples/reference-links.adoc",
		documentIri: "urn:aat:doc:test#document",
		sourceDocumentIri: "urn:aat:doc:test#source",
		projectionIri: "urn:aat:doc:test#projection",
		projectionActivityIri: "urn:aat:doc:test#activity",
		abundantDocumentIri: "urn:aat:doc:test#abundant-document",
		nodeIndex: {
			get: () => undefined,
			findByTarget: () => undefined,
			entries: () => [],
		},
		labelCatalog: {
			add: () => undefined,
			find: () => [],
			owners: () => [],
			entries: () => [],
		},
	};
}

function rawLiteralValue(
	graph: Rdf12Graph,
	subjectIri: string,
	localPredicate = "raw",
): string {
	const values = graph
		.match({
			subject: iriTerm(subjectIri),
			predicate: iriTerm(`${namespaces.aat}${localPredicate}`),
		})
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}

function countLongRawLiteralOpenings(turtle: string): number {
	return turtle.match(/aat:raw\s+(?:"""|''')/gu)?.length ?? 0;
}
