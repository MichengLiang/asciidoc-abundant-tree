import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../src/model";
import {
	formatAbundantTree,
	serializeAbundantTreeToJson,
} from "../src/serializers";

const document: AbundantDocument = {
	kind: "document",
	sourcePath: "samples/reference-links.adoc",
	mode: "single-file",
	parser: {
		name: "@asciidoctor/core",
		version: "3.0.4",
	},
	children: [
		{
			kind: "section",
			level: 1,
			ids: ["section-basics"],
			title: "基础概念",
			idOrigin: "source",
			children: [],
		},
	],
	targets: [],
	xrefOccurrences: [],
	anchorOccurrences: [],
	toolDiagnostics: [],
};

describe("serializers", () => {
	it("formats a pretty tree", () => {
		const output = formatAbundantTree(document);

		expect(output).toMatch(/^<document /);
		expect(output).toMatch(/\n {4}<parser /);
		expect(output).toMatch(/\n {4}children\[\]/);
	});

	it("formats multiline scalar text as indented body lines", () => {
		const output = formatAbundantTree({
			...document,
			children: [
				{
					kind: "listing",
					ids: ["example"],
					content: 'first line\n    print("hello")\nlast line',
				},
			],
		});

		expect(output).not.toContain('content="first line\n');
		expect(output).toContain(
			[
				"        <listing>",
				"            content:",
				"                first line",
				'                    print("hello")',
				"                last line",
			].join("\n"),
		);
	});

	it("serializes to plain JSON-safe data", () => {
		const json = serializeAbundantTreeToJson(document);

		expect(json.kind).toBe("document");
		expect(json.parser.name).toBe("@asciidoctor/core");
		expect(JSON.parse(JSON.stringify(json))).toEqual(json);
	});
});
