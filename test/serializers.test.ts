import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../src/model";
import {
	formatAbundantTree,
	serializeAbundantTree,
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

	it("prints one sourceSpan when a node source layer carries the same span", () => {
		const sourceSpan = {
			start: { line: 10, column: 100 },
			end: { line: 10, column: 128 },
		};
		const output = formatAbundantTree({
			...document,
			xrefOccurrences: [
				{
					kind: "xref",
					syntax: "shorthand",
					raw: "<<conclusion-section, 最终结论>>",
					target: "conclusion-section",
					label: "最终结论",
					sourceSpan,
					source: {
						raw: "<<conclusion-section, 最终结论>>",
						line: 10,
						sourceSpan,
					},
				},
			],
		});

		const xrefOutput = output.slice(output.indexOf("<xref "));
		expect(xrefOutput.match(/<sourceSpan>/g)).toHaveLength(1);
		expect(xrefOutput).toContain(
			[
				'            <source line=10 raw="&lt;&lt;conclusion-section, 最终结论&gt;&gt;">',
				"                <sourceSpan>",
				"                    <end column=128 line=10>",
				"                    <start column=100 line=10>",
			].join("\n"),
		);
	});

	it("serializes to plain JSON-safe data", () => {
		const json = serializeAbundantTreeToJson(document);

		expect(json.kind).toBe("document");
		expect(json.parser.name).toBe("@asciidoctor/core");
		expect(JSON.parse(JSON.stringify(json))).toEqual(json);
	});

	it("keeps mirrored source spans in JSON data", () => {
		const sourceSpan = {
			start: { line: 10, column: 100 },
			end: { line: 10, column: 128 },
		};
		const json = serializeAbundantTreeToJson({
			...document,
			xrefOccurrences: [
				{
					kind: "xref",
					syntax: "shorthand",
					raw: "<<conclusion-section, 最终结论>>",
					target: "conclusion-section",
					sourceSpan,
					source: {
						raw: "<<conclusion-section, 最终结论>>",
						line: 10,
						sourceSpan,
					},
				},
			],
		});

		expect(json.xrefOccurrences[0]?.sourceSpan).toEqual(sourceSpan);
		expect(json.xrefOccurrences[0]?.source?.sourceSpan).toEqual(sourceSpan);
	});

	it("serializes json format with a trailing newline", () => {
		const output = serializeAbundantTree(document, "json");

		expect(output.endsWith("\n")).toBe(true);
		expect(JSON.parse(output).kind).toBe("document");
	});

	it("prints undefined scalar values explicitly in the pretty tree", () => {
		const output = formatAbundantTree({
			...document,
			children: [
				{
					kind: "section",
					level: 1,
					ids: [],
					title: "No origin",
					idOrigin: "unknown",
					line: undefined as unknown as number,
				},
			],
		});

		expect(output).toContain('title="No origin"');
		expect(output).toContain("line=undefined");
	});

	it("uses the property label as headline for nested objects without kind", () => {
		const output = formatAbundantTree({
			...document,
			children: [
				{
					kind: "paragraph",
					text: "Bad span.",
					source: {
						raw: "Bad span.",
						line: 1,
						sourceSpan: {
							start: { line: 1, column: 1 },
							end: { line: 1, column: 10 },
						},
					},
				},
			],
		});

		expect(output).toContain("<sourceSpan>");
		expect(output).toContain("<start column=1 line=1>");
		expect(output).toContain('<source line=1 raw="Bad span.">');
	});
});
