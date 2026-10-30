import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { nameInIri } from "../../src/rdf12-projection/iri-name";
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

	it("records only heading owners in the selector label catalog", async () => {
		const projection = await referenceProjection();
		const headingOwners = new Set(
			resourcesOfType(projection.graph, aatTerm("Heading")).map(
				(heading) => heading.value,
			),
		);

		expect(projection.labelCatalog.entries().length).toBeGreaterThan(0);
		for (const entry of projection.labelCatalog.entries()) {
			expect(headingOwners.has(entry.owner.value)).toBe(true);
			expect([
				"headline",
				"addressPath",
				"addressLabel",
				"generatedAddressLabel",
			]).toContain(entry.labelKind);
			expect("label" in entry).toBe(false);
		}
	});

	it("projects local non-heading target ids as owning heading address labels", async () => {
		const projection = await referenceProjection();

		const [engineCodeOwner] = projection.labelCatalog.owners("engine-code");
		const [perfTableOwner] = projection.labelCatalog.owners("perf-table");
		const [warningTextOwner] = projection.labelCatalog.owners("warning-text");

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
		const [relDeliveryOwner] = payloadProjection.labelCatalog.owners(
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
			expect(projection.labelCatalog.owners(value)).toEqual([]);
		}

		const payloadProjection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);

		expect(payloadProjection.labelCatalog.owners("policy")).toEqual([]);
		expect(
			payloadProjection.labelCatalog.owners("policy-risk-profile"),
		).toEqual([]);
		expect(payloadProjection.labelCatalog.owners("relation-evidence")).toEqual(
			[],
		);
	});

	it("names headings after their address, not after their aliases", async () => {
		const projection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const deliveryPolicy = projection.labelCatalog.owners("delivery");
		const capacityRule = projection.labelCatalog.owners("capacity");
		const nestedGenerated = projection.labelCatalog.owners("_我是3级标题");

		expect(deliveryPolicy).toEqual([expect.any(Object)]);
		expect(capacityRule).toEqual([expect.any(Object)]);
		expect(nestedGenerated).toEqual([expect.any(Object)]);
		// 名字取最短的唯一地址路径，custom ID 与生成 ID 是别名，不进名字（06 号书第 2 章「身份」）。
		expect(deliveryPolicy[0]?.value).toBe(
			`${projection.headingNamespace}${nameInIri("配送策略")}`,
		);
		expect(capacityRule[0]?.value).toBe(
			`${projection.headingNamespace}${nameInIri("运力规则")}`,
		);
		expect(nestedGenerated[0]?.value).toBe(
			`${projection.headingNamespace}${nameInIri("我是3级标题")}`,
		);
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
		const [heading] = projection.labelCatalog.owners("delivery-policy");

		expect(heading?.value).toBe(`${projection.headingNamespace}配送策略`);
		expect(projection.labelCatalog.owners("section")).toEqual([]);
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
