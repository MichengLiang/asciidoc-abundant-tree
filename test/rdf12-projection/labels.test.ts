import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 label projection", () => {
	it("uses generated address labels to locate generated-id sections", () => {
		const projection = referenceProjection();
		const match = ownersForLabel(
			projection.graph,
			"GeneratedAddressLabel",
			"_1_引言",
		);

		expect(match.owners).toHaveLength(1);
		expect(match.owners[0]).toContain("#section-l8-o0");
		expectLabelHasSourceLocation(projection.graph, match.labels[0] ?? "", 8, 8);
	});

	it("uses address labels to locate source-id sections and listings", () => {
		const projection = referenceProjection();
		const section = ownersForLabel(
			projection.graph,
			"AddressLabel",
			"section-basics",
		);
		const listing = ownersForLabel(
			projection.graph,
			"AddressLabel",
			"engine-code",
		);

		expect(section.owners).toEqual([
			expect.stringContaining("#section-l12-o0"),
		]);
		expect(listing.owners).toEqual([
			expect.stringContaining("#listing-l29-o0"),
		]);
	});

	it("uses title labels to locate sections", () => {
		const projection = referenceProjection();
		const match = ownersForLabel(
			projection.graph,
			"TitleLabel",
			"3. 核心引擎设计",
		);

		expect(match.owners).toEqual([expect.stringContaining("#section-l25-o0")]);
		expectLabelHasSourceLocation(
			projection.graph,
			match.labels[0] ?? "",
			25,
			25,
		);
	});

	it("uses anchor labels to locate anchor target resources", () => {
		const projection = referenceProjection();
		const match = ownersForLabel(
			projection.graph,
			"AnchorLabel",
			"warning-text",
		);

		expect(match.owners).toEqual([
			expect.stringContaining("#anchor-l56-c27-o0"),
		]);
	});

	it("projects role labels from metadata without using label values in IRIs", () => {
		const projection = projectAbundantDocumentToRdf12(roleDocument(), {
			documentRoot: projectRoot,
		});
		const match = ownersForLabel(projection.graph, "RoleLabel", "science");

		expect(match.owners).toEqual([expect.stringContaining("#listing-l2-o0")]);
		expect(match.labels).toHaveLength(1);
		expect(match.labels[0]).not.toContain("science");
		expectLabelHasSourceLocation(projection.graph, match.labels[0] ?? "", 2, 2);
	});

	it("does not put label values into label or structure resource IRIs", () => {
		const projection = referenceProjection();
		const labels = [
			ownersForLabel(projection.graph, "GeneratedAddressLabel", "_1_引言"),
			ownersForLabel(projection.graph, "AddressLabel", "section-basics"),
			ownersForLabel(projection.graph, "TitleLabel", "3. 核心引擎设计"),
			ownersForLabel(projection.graph, "AnchorLabel", "warning-text"),
		];

		for (const match of labels) {
			for (const label of match.labels) {
				expect(label).not.toContain(match.value);
			}
			for (const owner of match.owners) {
				expect(owner).not.toContain(match.value);
			}
		}
	});

	it("does not project TargetNode as an independent resource", () => {
		const projection = referenceProjection();

		expect(
			projection.graph.match({
				object: iriTerm(`${namespaces.aat}TargetNode`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph
				.toArray()
				.map((triple) => triple.subject.value)
				.some((subject) => subject.includes("#target")),
		).toBe(false);
	});
});

function referenceProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: referencePath }),
		{
			documentRoot: projectRoot,
		},
	);
}

function ownersForLabel(
	graph: Rdf12Graph,
	classLocalName: string,
	value: string,
): { value: string; labels: string[]; owners: string[] } {
	const labels = graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}value`),
			object: stringLiteral(value),
		})
		.filter((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}${classLocalName}`),
				),
			),
		)
		.map((triple) => triple.subject.value);
	const owners = labels.flatMap((label) =>
		graph
			.match({
				predicate: iriTerm(`${namespaces.aat}hasLabel`),
				object: iriTerm(label),
			})
			.map((triple) => triple.subject.value),
	);

	return { value, labels, owners };
}

function expectLabelHasSourceLocation(
	graph: Rdf12Graph,
	label: string,
	startLine: number,
	endLine: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(label),
				iriTerm(`${namespaces.aat}relativePath`),
				stringLiteral("samples/reference-links.adoc"),
			),
		),
	).toBe(true);
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(label),
				iriTerm(`${namespaces.aat}startLine`),
				stringLiteral(startLine.toString()),
			),
		),
	).toBe(false);
	expect(
		graph
			.match({
				subject: iriTerm(label),
				predicate: iriTerm(`${namespaces.aat}startLine`),
			})
			.map((triple) => triple.object.value),
	).toEqual([startLine.toString()]);
	expect(
		graph
			.match({
				subject: iriTerm(label),
				predicate: iriTerm(`${namespaces.aat}endLine`),
			})
			.map((triple) => triple.object.value),
	).toEqual([endLine.toString()]);
}

function roleDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: join(projectRoot, "samples/reference-links.adoc"),
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "listing",
				ids: [],
				span: { startLine: 2, endLine: 4 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "attrlist",
						raw: "[source.science]",
						line: 2,
						roles: ["science"],
						source: {
							raw: "[source.science]",
							line: 2,
							sourceSpan: {
								start: { line: 2, column: 1 },
								end: { line: 2, column: 17 },
							},
						},
					},
				],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}
