import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";
import {
	aatTerm,
	expectLiteralValue,
	expectResourceTypeCount,
	expectTriple,
	rdfTerm,
	resourcesOfType,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 heading label space", () => {
	it("projects heading label values as direct heading fields", () => {
		const projection = referenceProjection();
		const generatedHeading = headingWithHeadline(projection.graph, "1. 引言");
		const manualHeading = headingWithHeadline(projection.graph, "2. 基础概念");
		const titleHeading = headingWithHeadline(
			projection.graph,
			"3. 核心引擎设计",
		);

		expectLiteralValue(
			projection.graph,
			generatedHeading,
			aatTerm("generatedAddressLabel"),
			"_1_引言",
		);
		expectLiteralValue(
			projection.graph,
			manualHeading,
			aatTerm("addressLabel"),
			"section-basics",
		);
		expectLiteralValue(
			projection.graph,
			titleHeading,
			aatTerm("headline"),
			"3. 核心引擎设计",
		);
	});

	it("does not project public label resources or rdf:value label expressions", () => {
		const projection = referenceProjection();

		for (const labelType of [
			"TitleLabel",
			"AddressLabel",
			"GeneratedAddressLabel",
			"BlockTitleLabel",
			"AnchorLabel",
			"ReftextLabel",
			"XrefDisplayLabel",
			"RoleLabel",
		]) {
			expectResourceTypeCount(projection.graph, aatTerm(labelType), 0);
		}
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}hasLabel`),
			}),
		).toHaveLength(0);
		expect(rdfValueLabelExpressionCount(projection.graph)).toBe(0);
	});

	it("records only heading owners in the selector label catalog", () => {
		const projection = referenceProjection();
		const headingOwners = new Set(
			resourcesOfType(projection.graph, aatTerm("Heading")).map(
				(heading) => heading.value,
			),
		);

		expect(projection.labelCatalog.entries().length).toBeGreaterThan(0);
		for (const entry of projection.labelCatalog.entries()) {
			expect(headingOwners.has(entry.owner.value)).toBe(true);
			expect(["headline", "addressLabel", "generatedAddressLabel"]).toContain(
				entry.labelKind,
			);
			expect("label" in entry).toBe(false);
		}
	});

	it("excludes listing ids, table ids, inline anchors, xref display text, roles, and payload ids from selector labels", () => {
		const projection = referenceProjection();

		for (const value of [
			"engine-code",
			"perf-table",
			"warning-text",
			"代码清单 3-1",
			"重力井的危险性",
		]) {
			expect(projection.labelCatalog.owners(value)).toEqual([]);
		}

		const payloadProjection = projectAbundantDocumentToRdf12(
			parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);

		expect(payloadProjection.labelCatalog.owners("payload")).toEqual([]);
		expect(
			payloadProjection.labelCatalog.owners("delivery-policy-payload"),
		).toEqual([]);
		expect(
			payloadProjection.labelCatalog.owners("rel-delivery-capacity"),
		).toEqual([]);
	});

	it("does not use label values in heading IRIs", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const deliveryPolicy = projection.labelCatalog.owners("delivery-policy");
		const capacityRule = projection.labelCatalog.owners("capacity-rule");
		const nestedGenerated = projection.labelCatalog.owners("_我是3级标题");

		expect(deliveryPolicy).toEqual([expect.any(Object)]);
		expect(capacityRule).toEqual([expect.any(Object)]);
		expect(nestedGenerated).toEqual([expect.any(Object)]);
		for (const owner of [
			...deliveryPolicy,
			...capacityRule,
			...nestedGenerated,
		]) {
			expect(owner.value).toContain("#heading-l");
			expect(owner.value).not.toContain("delivery-policy");
			expect(owner.value).not.toContain("capacity-rule");
			expect(owner.value).not.toContain("我是3级标题");
		}
	});

	it("uses attrlist shorthand ids with roles as heading address labels only", () => {
		const path = writeFixture(
			"rdf12-label-attrlist-id-role.adoc",
			`= Probe

[#delivery-policy.section, kind=policy]
== 配送策略
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);
		const [heading] = projection.labelCatalog.owners("delivery-policy");

		expect(heading?.value).toContain("#heading-l3-o0");
		expect(projection.labelCatalog.owners("section")).toEqual([]);
		expectTriple(
			projection.graph,
			heading ?? iriTerm(""),
			aatTerm("addressLabel"),
			stringLiteral("delivery-policy"),
		);
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

function headingWithHeadline(
	graph: Rdf12Graph,
	headline: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: aatTerm("headline"),
			object: stringLiteral(headline),
		})
		.filter((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					aatTerm("Heading"),
				),
			),
		)
		.map((triple) => triple.subject);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("");
}

function rdfValueLabelExpressionCount(graph: Rdf12Graph): number {
	const labelTypes = new Set([
		"TitleLabel",
		"AddressLabel",
		"GeneratedAddressLabel",
		"BlockTitleLabel",
		"AnchorLabel",
		"ReftextLabel",
		"XrefDisplayLabel",
		"RoleLabel",
	]);

	return graph
		.match({ predicate: rdfTerm("value") })
		.filter((triple) =>
			graph
				.match({ subject: triple.subject, predicate: rdfTerm("type") })
				.some(
					(typeTriple) =>
						typeTriple.object.termType === "iri" &&
						typeTriple.object.value.startsWith(namespaces.aat) &&
						labelTypes.has(
							typeTriple.object.value.slice(namespaces.aat.length),
						),
				),
		).length;
}
