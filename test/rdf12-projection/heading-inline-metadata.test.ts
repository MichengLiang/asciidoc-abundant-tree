import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";
import {
	aatTerm,
	expectLiteralValue,
	literalValues,
	rdfTerm,
	resourcesOfType,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();

describe("rdf12 heading inline metadata projection", () => {
	it("projects explicit-label status hmeta as a heading direct field", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Status hmeta:status[active, label=生效].
`);

		expectLiteralValue(graph, heading, aatTerm("status"), "active");
	});

	it("projects value-only priority hmeta as a heading direct field", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Priority hmeta:priority[normal].
`);

		expectLiteralValue(graph, heading, aatTerm("priority"), "normal");
	});

	it("projects role hmeta through the normal role field predicate", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Role hmeta:role[rule, label=规则节点].
`);

		expectLiteralValue(graph, heading, aatTerm("role"), "rule");
	});

	it("uses value rather than label as the RDF object", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Status hmeta:status[active, label=生效].
`);

		expectLiteralValue(graph, heading, aatTerm("status"), "active");
		expect(
			graph.has(rdf12Triple(heading, aatTerm("status"), stringLiteral("生效"))),
		).toBe(false);
	});

	it("uses the owner heading as the public hmeta direct field subject", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Status hmeta:status[active].
`);

		expect(graph.match({ predicate: aatTerm("status") })).toEqual([
			rdf12Triple(heading, aatTerm("status"), stringLiteral("active")),
		]);
		expect(resourcesOfType(graph, aatTerm("HeadingInlineMetadata"))).toEqual(
			[],
		);
		expect(resourcesOfType(graph, aatTerm("HeadingMetadataEntry"))).toEqual([]);
	});

	it("preserves multiple hmeta values for the same field", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Status hmeta:status[active] and hmeta:status[ready].
`);

		expect(literalValues(graph, heading, aatTerm("status")).sort()).toEqual([
			"active",
			"ready",
		]);
	});

	it("preserves attrlist and hmeta values with the same predicate", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule, status=draft]
== Rule

Status hmeta:status[ready].
`);

		expect(literalValues(graph, heading, aatTerm("status")).sort()).toEqual([
			"draft",
			"ready",
		]);
	});

	it("preserves description metadata and hmeta values with the same predicate", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

status:: active

Status hmeta:status[ready].
`);

		expect(literalValues(graph, heading, aatTerm("status")).sort()).toEqual([
			"active",
			"ready",
		]);
	});

	it("projects duplicate description metadata entries from entries", () => {
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

owner:: ops
owner:: platform
`);

		expect(literalValues(graph, heading, aatTerm("owner")).sort()).toEqual([
			"ops",
			"platform",
		]);
	});

	it("uses encoded field predicates for unsafe hmeta field names", () => {
		const unsafeField = "9priority";
		const { graph, heading } = projectSource(`= Probe

[#rule]
== Rule

Priority hmeta:${unsafeField}[urgent].
`);

		expectLiteralValue(graph, heading, fieldPredicate(unsafeField), "urgent");
		expect(
			graph.match({
				subject: heading,
				predicate: iriTerm(`${namespaces.aat}${unsafeField}`),
			}),
		).toHaveLength(0);
	});
});

function projectSource(source: string): {
	readonly graph: Rdf12Graph;
	readonly heading: Rdf12IriTerm;
} {
	const path = writeFixture(
		`rdf12-heading-inline-metadata-${Math.random().toString(36).slice(2)}.adoc`,
		source,
	);
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: path }),
		{ documentRoot: projectRoot },
	);
	return {
		graph: projection.graph,
		heading: onlyHeadingWithHeadline(projection.graph, "Rule"),
	};
}

function onlyHeadingWithHeadline(
	graph: Rdf12Graph,
	headline: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: aatTerm("headline"),
			object: stringLiteral(headline),
		})
		.map((triple) => triple.subject)
		.filter((subject) =>
			graph.has(rdf12Triple(subject, rdfTerm("type"), aatTerm("Heading"))),
		);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}
