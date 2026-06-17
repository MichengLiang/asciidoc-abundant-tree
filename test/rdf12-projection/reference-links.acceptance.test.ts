import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	iriTerm,
	type Rdf12IriTerm,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 reference-links query contract acceptance", () => {
	it("answers heading label lookup queries", () => {
		const projection = referenceProjection();

		const intro = onlyHeadingForLabel(
			projection.graph,
			"generatedAddressLabel",
			"_1_引言",
		);
		const basics = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"section-basics",
		);
		const core = onlyHeadingForLabel(
			projection.graph,
			"headline",
			"3. 核心引擎设计",
		);
		expect(intro.value).toContain("#heading-l8-o0");
		expectLineSpan(projection.graph, intro, 8, 11);
		expect(basics.value).toContain("#heading-l12-o0");
		expectLineSpan(projection.graph, basics, 12, 24);
		expect(core.value).toContain("#heading-l25-o0");
		expectLineSpan(projection.graph, core, 25, 39);
	});

	it("answers local non-heading target alias lookup queries", () => {
		const projection = referenceProjection();
		const core = onlyHeadingForLabel(
			projection.graph,
			"headline",
			"3. 核心引擎设计",
		);
		const troubleshooting = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"troubleshooting",
		);

		expect(
			onlyHeadingForLabel(projection.graph, "addressLabel", "engine-code"),
		).toEqual(core);
		expect(
			onlyHeadingForLabel(projection.graph, "addressLabel", "perf-table"),
		).toEqual(troubleshooting);
		expect(
			onlyHeadingForLabel(projection.graph, "addressLabel", "warning-text"),
		).toEqual(troubleshooting);
	});

	it("answers direct containment and file-line reverse lookup queries", () => {
		const projection = referenceProjection();
		const root = onlyHeadingForLabel(
			projection.graph,
			"headline",
			"宇宙探索器：AsciiDoc 交叉引用演示指南",
		);
		const intro = onlyHeadingForLabel(
			projection.graph,
			"generatedAddressLabel",
			"_1_引言",
		);
		const basics = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"section-basics",
		);
		const core = onlyHeadingForLabel(
			projection.graph,
			"headline",
			"3. 核心引擎设计",
		);
		const troubleshooting = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"troubleshooting",
		);
		const conclusion = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"conclusion-section",
		);
		const coveringLine35 = resourcesCoveringFileLine(
			projection.graph,
			"samples/reference-links.adoc",
			35,
		);

		expectDirectChildren(projection.graph, root, [
			intro,
			basics,
			core,
			troubleshooting,
			conclusion,
		]);
		expect(coveringLine35).toContain(core.value);
		expect(coveringLine35).not.toContain(projection.documentIri);
	});

	it("answers xref edge, outgoing relation, and reifier queries", () => {
		const projection = referenceProjection();
		const intro = onlyHeadingForLabel(
			projection.graph,
			"generatedAddressLabel",
			"_1_引言",
		);
		const core = onlyHeadingForLabel(
			projection.graph,
			"headline",
			"3. 核心引擎设计",
		);
		const relation = rdf12Triple(
			intro,
			iriTerm(`${namespaces.aat}references`),
			core,
		);
		const edge = onlyXrefEdgeForSelector(projection.graph, "3. 核心引擎设计");
		const [reifier] = projection.graph.match({
			subject: edge,
			predicate: iriTerm(`${namespaces.rdf}reifies`),
		});

		expectStringTriple(
			projection.graph,
			edge,
			"targetSelector",
			"3. 核心引擎设计",
		);
		expectLineSpan(projection.graph, edge, 10, 10);
		expectTriple(projection.graph, edge, "sourceHeading", intro);
		expectTriple(projection.graph, edge, "targetHeading", core);
		expect(projection.graph.has(relation)).toBe(true);
		expect(reifier?.object.termType).toBe("triple");
		expect(reifier?.object).toEqual(rdf12TripleTerm(relation));
	});

	it("answers direct field predicate queries without attribute resources", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const deliveryPolicy = onlyHeadingForLabel(
			projection.graph,
			"addressLabel",
			"delivery",
		);
		const edge = onlyXrefEdgeForSelector(projection.graph, "capacity");

		expectStringTriple(projection.graph, deliveryPolicy, "role", "policy");
		expectStringTriple(projection.graph, deliveryPolicy, "status", "active");
		expectStringTriple(projection.graph, deliveryPolicy, "owner", "ops");
		expectStringTriple(projection.graph, edge, "weight", "0.8");
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}payloadSelector`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}payload`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.rdf}type`),
				object: iriTerm(`${namespaces.aat}SurfaceAttribute`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}hasAttribute`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({ predicate: iriTerm(`${namespaces.rdf}value`) }),
		).toHaveLength(0);
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

function onlyHeadingForLabel(
	graph: Rdf12Graph,
	predicateLocalName: "addressLabel" | "generatedAddressLabel" | "headline",
	value: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
			object: stringLiteral(value),
		})
		.map((triple) => triple.subject)
		.filter((subject) =>
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}Heading`),
				),
			),
		);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}

function onlyXrefEdgeForSelector(
	graph: Rdf12Graph,
	selector: string,
): Rdf12IriTerm {
	const edges = graph
		.match({
			predicate: iriTerm(`${namespaces.aat}targetSelector`),
			object: stringLiteral(selector),
		})
		.map((triple) => triple.subject)
		.filter((subject) =>
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}XrefEdge`),
				),
			),
		);

	expect(edges).toHaveLength(1);
	return edges[0] ?? iriTerm("urn:missing-xref-edge");
}

function resourcesCoveringFileLine(
	graph: Rdf12Graph,
	relativePath: string,
	line: number,
): string[] {
	return graph
		.match({ predicate: iriTerm(`${namespaces.aat}startLine`) })
		.filter((triple) => {
			const hasRelativePath = graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.aat}relativePath`),
					stringLiteral(relativePath),
				),
			);
			const endLine = graph.match({
				subject: triple.subject,
				predicate: iriTerm(`${namespaces.aat}endLine`),
			})[0]?.object.value;

			return (
				hasRelativePath &&
				Number(triple.object.value) <= line &&
				Number(endLine) >= line
			);
		})
		.map((triple) => triple.subject.value);
}

function expectDirectChildren(
	graph: Rdf12Graph,
	parent: Rdf12IriTerm,
	children: readonly Rdf12IriTerm[],
): void {
	expect(
		graph
			.match({
				subject: parent,
				predicate: iriTerm(`${namespaces.aat}containsDirectly`),
			})
			.map((triple) => triple.object.value)
			.sort(),
	).toEqual(children.map((child) => child.value).sort());
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	startLine: number,
	endLine: number,
): void {
	expectIntegerTriple(graph, subject, "startLine", startLine);
	expectIntegerTriple(graph, subject, "endLine", endLine);
	expectStringTriple(
		graph,
		subject,
		"relativePath",
		"samples/reference-links.adoc",
	);
}

function expectTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(
		graph.has(
			rdf12Triple(
				subject,
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				object,
			),
		),
	).toBe(true);
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				subject,
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectIntegerTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				subject,
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				integerLiteral(value),
			),
		),
	).toBe(true);
}
