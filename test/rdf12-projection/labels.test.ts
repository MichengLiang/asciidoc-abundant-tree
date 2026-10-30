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
	headingStartingAt,
	labelOwners,
	rdfTerm,
	resourcesOfType,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 heading label space", () => {
	it("projects heading label values as direct heading fields", async () => {
		const projection = await referenceProjection();
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

	it("does not project public label resources or rdf:value label expressions", async () => {
		const projection = await referenceProjection();

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

	it("writes label values only on heading nodes", async () => {
		const projection = await referenceProjection();
		const headingOwners = new Set(
			resourcesOfType(projection.graph, aatTerm("Heading")).map(
				(heading) => heading.value,
			),
		);
		const labelTriples = [
			"headline",
			"addressPath",
			"addressLabel",
			"generatedAddressLabel",
		].flatMap((name) => projection.graph.match({ predicate: aatTerm(name) }));

		expect(labelTriples.length).toBeGreaterThan(0);
		for (const triple of labelTriples) {
			expect(headingOwners.has(triple.subject.value)).toBe(true);
			expect(triple.object.termType).toBe("literal");
		}
	});

	it("projects local non-heading target ids as owning heading address labels", async () => {
		const projection = await referenceProjection();

		const [engineCodeOwner] = labelOwners(projection.graph, "engine-code");
		const [perfTableOwner] = labelOwners(projection.graph, "perf-table");
		const [warningTextOwner] = labelOwners(projection.graph, "warning-text");

		expect(engineCodeOwner).toEqual(headingStartingAt(projection.graph, 25));
		expect(perfTableOwner).toEqual(headingStartingAt(projection.graph, 40));
		expect(warningTextOwner).toEqual(headingStartingAt(projection.graph, 40));
		expectLiteralValue(
			projection.graph,
			engineCodeOwner ?? iriTerm("urn:missing"),
			aatTerm("addressLabel"),
			"engine-code",
		);
		expectLiteralValue(
			projection.graph,
			perfTableOwner ?? iriTerm("urn:missing"),
			aatTerm("addressLabel"),
			"perf-table",
		);
		expectLiteralValue(
			projection.graph,
			warningTextOwner ?? iriTerm("urn:missing"),
			aatTerm("addressLabel"),
			"warning-text",
		);

		const payloadProjection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const [relDeliveryOwner] = labelOwners(
			payloadProjection.graph,
			"rel-delivery-capacity",
		);

		expect(relDeliveryOwner).toEqual(
			headingStartingAt(payloadProjection.graph, 5),
		);
		expectLiteralValue(
			payloadProjection.graph,
			relDeliveryOwner ?? iriTerm("urn:missing"),
			aatTerm("addressLabel"),
			"rel-delivery-capacity",
		);
	});

	it("keeps non-address surfaces out of selector labels", async () => {
		const projection = await referenceProjection();

		for (const value of ["代码清单 3-1", "重力井的危险性"]) {
			expect(labelOwners(projection.graph, value)).toEqual([]);
		}

		const payloadProjection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);

		expect(labelOwners(payloadProjection.graph, "policy")).toEqual([]);
		expect(labelOwners(payloadProjection.graph, "policy-risk-profile")).toEqual(
			[],
		);
		expect(labelOwners(payloadProjection.graph, "relation-evidence")).toEqual(
			[],
		);
	});

	it("treats custom IDs and generated IDs as labels of the same heading, not as its identity", async () => {
		const projection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);

		expect(labelOwners(projection.graph, "delivery")).toEqual(
			labelOwners(projection.graph, "配送策略"),
		);
		expect(labelOwners(projection.graph, "capacity")).toEqual(
			labelOwners(projection.graph, "运力规则"),
		);
		expect(labelOwners(projection.graph, "_我是3级标题")).toEqual(
			labelOwners(projection.graph, "我是3级标题"),
		);
		for (const [owner] of [
			labelOwners(projection.graph, "delivery"),
			labelOwners(projection.graph, "capacity"),
		]) {
			expect(owner?.value).toMatch(/#heading-\d+$/u);
		}
	});

	it("uses attrlist shorthand ids with roles as heading address labels only", async () => {
		const path = writeFixture(
			"rdf12-label-attrlist-id-role.adoc",
			`= Probe

[#delivery-policy.section, kind=policy]
== 配送策略
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);
		const [heading] = labelOwners(projection.graph, "delivery-policy");

		expect(heading?.value).toBe(`${projection.documentIri}#heading-2`);
		expect(labelOwners(projection.graph, "section")).toEqual([]);
		expectTriple(
			projection.graph,
			heading ?? iriTerm(""),
			aatTerm("addressLabel"),
			stringLiteral("delivery-policy"),
		);
	});
});

async function referenceProjection() {
	return projectAbundantDocumentToRdf12(
		await parseAbundantTree({ sourcePath: referencePath }),
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
