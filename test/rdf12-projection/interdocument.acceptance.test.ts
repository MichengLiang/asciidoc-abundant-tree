import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const interdocumentPath = join(projectRoot, "samples/interdocument-xref.adoc");

describe("rdf12 interdocument xref acceptance", () => {
	it("keeps external selectors and official href evidence without local target bindings", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: interdocumentPath }),
			{ documentRoot: projectRoot },
		);
		const externalXrefs = xrefsWithSelector(
			projection.graph,
			"other.adoc#remote-target",
		);

		expect(externalXrefs).toHaveLength(2);
		for (const xref of externalXrefs) {
			expectStringTriple(
				projection.graph,
				xref,
				"targetSelector",
				"other.adoc#remote-target",
			);
			expectStringTriple(
				projection.graph,
				xref,
				"officialHref",
				"other.html#remote-target",
			);
			expect(
				projection.graph.match({
					subject: iriTerm(xref),
					predicate: iriTerm(`${namespaces.aat}targetNode`),
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					subject: iriTerm(xref),
					predicate: iriTerm(`${namespaces.rdf}reifies`),
				}),
			).toHaveLength(0);
		}
	});

	it("still asserts local relations while leaving interdocument relations unasserted", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: interdocumentPath }),
			{ documentRoot: projectRoot },
		);
		const localXref = xrefsWithSelector(projection.graph, "local-target")[0];
		const localRelation = projection.graph.match({
			subject: iriTerm(localXref ?? ""),
			predicate: iriTerm(`${namespaces.rdf}reifies`),
		})[0]?.object;

		expect(localXref).toBeDefined();
		expect(localRelation?.termType).toBe("triple");
		expect(
			xrefsWithSelector(projection.graph, "other.adoc#remote-target").flatMap(
				(xref) =>
					projection.graph.match({
						subject: iriTerm(xref),
						predicate: iriTerm(`${namespaces.aat}targetNode`),
					}),
			),
		).toHaveLength(0);
	});
});

function xrefsWithSelector(graph: Rdf12Graph, selector: string): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.aat}targetSelector`),
			object: stringLiteral(selector),
		})
		.filter((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}XrefOccurrence`),
				),
			),
		)
		.map((triple) => triple.subject.value);
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}
