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
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 reference-links query contract acceptance", () => {
	it("answers label lookup queries for sections, listings, and anchors", () => {
		const projection = referenceProjection();

		const intro = onlyOwnerForLabel(
			projection.graph,
			"GeneratedAddressLabel",
			"_1_引言",
		);
		const basics = onlyOwnerForLabel(
			projection.graph,
			"AddressLabel",
			"section-basics",
		);
		const core = onlyOwnerForLabel(
			projection.graph,
			"TitleLabel",
			"3. 核心引擎设计",
		);
		const listing = onlyOwnerForLabel(
			projection.graph,
			"AddressLabel",
			"engine-code",
		);
		const warning = onlyOwnerForLabel(
			projection.graph,
			"AnchorLabel",
			"warning-text",
		);

		expect(intro).toBe(resourceIri(projection.documentIri, "section-l8-o0"));
		expectLineSpan(projection.graph, intro, 8, 11);
		expect(basics).toBe(resourceIri(projection.documentIri, "section-l12-o0"));
		expectLineSpan(projection.graph, basics, 12, 24);
		expect(core).toBe(resourceIri(projection.documentIri, "section-l25-o0"));
		expectLineSpan(projection.graph, core, 25, 39);
		expect(listing).toBe(resourceIri(projection.documentIri, "listing-l29-o0"));
		expectLineSpan(projection.graph, listing, 29, 36);
		expectIntegerTriple(projection.graph, listing, "contentStartLine", 33);
		expectIntegerTriple(projection.graph, listing, "contentEndLine", 35);
		expect(warning).toBe(
			resourceIri(projection.documentIri, "anchor-l56-c27-o0"),
		);
		expectLineSpan(projection.graph, warning, 56, 56);
	});

	it("answers direct containment and file-line reverse lookup queries", () => {
		const projection = referenceProjection();
		const core = resourceIri(projection.documentIri, "section-l25-o0");
		const listing = resourceIri(projection.documentIri, "listing-l29-o0");
		const coveringLine35 = resourcesCoveringLine(projection.graph, 35);

		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(core),
					iriTerm(`${namespaces.aat}containsDirectly`),
					iriTerm(listing),
				),
			),
		).toBe(true);
		expect(coveringLine35).toEqual(expect.arrayContaining([core, listing]));
		expect(coveringLine35).not.toContain(projection.documentIri);
	});

	it("answers xref occurrence, outgoing relation, and reifier queries", () => {
		const projection = referenceProjection();
		const intro = iriTerm(resourceIri(projection.documentIri, "section-l8-o0"));
		const core = iriTerm(resourceIri(projection.documentIri, "section-l25-o0"));
		const xref = resourceIri(projection.documentIri, "xref-l10-c60-o0");
		const relation = rdf12Triple(
			intro,
			iriTerm(`${namespaces.aat}references`),
			core,
		);
		const [reifier] = projection.graph.match({
			subject: iriTerm(xref),
			predicate: iriTerm(`${namespaces.rdf}reifies`),
		});

		expectStringTriple(
			projection.graph,
			xref,
			"targetSelector",
			"3. 核心引擎设计",
		);
		expectLineSpan(projection.graph, xref, 10, 10);
		expect(projection.graph.has(relation)).toBe(true);
		expect(reifier?.object.termType).toBe("triple");
		expect(reifier?.object.value).toEqual(relation);
	});

	it("answers surface attribute queries without treating control fields as attributes", () => {
		const projection = referenceProjection();
		const listing = resourceIri(projection.documentIri, "listing-l29-o0");
		const style = onlySurfaceAttribute(projection.graph, "style");
		const language = onlySurfaceAttribute(projection.graph, "language");

		expectRdfValue(projection.graph, style, "source");
		expectRdfValue(projection.graph, language, "python");
		expectLineSpan(projection.graph, style, 31, 31);
		expectLineSpan(projection.graph, language, 31, 31);
		expectHasAttribute(projection.graph, listing, style);
		expectHasAttribute(projection.graph, listing, language);
		expect(surfaceAttributesNamed(projection.graph, "rel")).toHaveLength(0);
		expect(surfaceAttributesNamed(projection.graph, "payload")).toHaveLength(0);
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

function onlyOwnerForLabel(
	graph: Rdf12Graph,
	classLocalName: string,
	value: string,
): string {
	const owners = graph
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
		.flatMap((triple) =>
			graph.match({
				predicate: iriTerm(`${namespaces.aat}hasLabel`),
				object: triple.subject,
			}),
		)
		.map((triple) => triple.subject.value);

	expect(owners).toHaveLength(1);
	return owners[0] ?? "";
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function resourcesCoveringLine(graph: Rdf12Graph, line: number): string[] {
	return graph
		.match({ predicate: iriTerm(`${namespaces.aat}startLine`) })
		.filter((triple) => {
			const endLine = graph.match({
				subject: triple.subject,
				predicate: iriTerm(`${namespaces.aat}endLine`),
			})[0]?.object.value;

			return Number(triple.object.value) <= line && Number(endLine) >= line;
		})
		.map((triple) => triple.subject.value);
}

function onlySurfaceAttribute(graph: Rdf12Graph, name: string): string {
	const attributes = surfaceAttributesNamed(graph, name);
	expect(attributes).toHaveLength(1);
	return attributes[0] ?? "";
}

function surfaceAttributesNamed(graph: Rdf12Graph, name: string): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.aat}name`),
			object: stringLiteral(name),
		})
		.filter((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}SurfaceAttribute`),
				),
			),
		)
		.map((triple) => triple.subject.value);
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: string,
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

function expectIntegerTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				integerLiteral(value),
			),
		),
	).toBe(true);
}

function expectRdfValue(
	graph: Rdf12Graph,
	subject: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.rdf}value`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectHasAttribute(
	graph: Rdf12Graph,
	owner: string,
	attribute: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(owner),
				iriTerm(`${namespaces.aat}hasAttribute`),
				iriTerm(attribute),
			),
		),
	).toBe(true);
}
