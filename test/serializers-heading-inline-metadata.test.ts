import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import {
	formatAbundantTree,
	serializeAbundantTreeToJson,
} from "../src/serializers";
import { writeFixture } from "./helpers";

describe("heading inline metadata serialization", () => {
	it("includes the document-level hmeta occurrence catalog in JSON", () => {
		const json = serializeAbundantTreeToJson(hmetaDocument());

		expect(json.headingInlineMetadataOccurrences).toEqual([
			expect.objectContaining({
				kind: "headingInlineMetadata",
				field: "status",
				value: "active",
				label: "生效",
			}),
		]);
	});

	it("includes hmeta occurrences as paragraph children in JSON", () => {
		const json = serializeAbundantTreeToJson(hmetaDocument());
		const section = json.children.find((node) => node.kind === "section");
		const paragraph = section?.children?.find(
			(node) => node.kind === "paragraph",
		);

		expect(paragraph?.children).toEqual([
			expect.objectContaining({
				kind: "headingInlineMetadata",
				field: "status",
				value: "active",
			}),
		]);
	});

	it("omits fallback labels when source omits label", () => {
		const json = serializeAbundantTreeToJson(
			hmetaDocument("Owner hmeta:owner[docs-team]."),
		);
		const occurrence = json.headingInlineMetadataOccurrences[0];

		expect(occurrence).toEqual(
			expect.objectContaining({
				field: "owner",
				value: "docs-team",
			}),
		);
		expect(occurrence).not.toHaveProperty("label");
	});

	it("formats hmeta occurrence field and value in the pretty tree", () => {
		const output = formatAbundantTree(hmetaDocument());
		const hmetaLine = output
			.split("\n")
			.find((line) => line.includes("<headingInlineMetadata "));

		expect(hmetaLine).toContain("<headingInlineMetadata ");
		expect(hmetaLine).toContain('field="status"');
		expect(hmetaLine).toContain('value="active"');
	});
});

function hmetaDocument(
	body = "Status hmeta:status[active, label=生效].",
): ReturnType<typeof parseAbundantTree> {
	const path = writeFixture(
		`serializers-heading-inline-metadata-${Math.random().toString(36).slice(2)}.adoc`,
		`= Probe

[#rule]
== Rule

${body}
`,
	);
	return parseAbundantTree({ sourcePath: path });
}
