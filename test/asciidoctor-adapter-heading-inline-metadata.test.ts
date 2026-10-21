import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("Asciidoctor adapter heading inline metadata conversion", () => {
	it("converts hmeta to the explicit label", async () => {
		const html = await convertSource(`= Probe

Status hmeta:status[active, label=生效].
`);

		expect(html).toContain("<mark>生效</mark>");
	});

	it("converts hmeta to the value when label is absent", async () => {
		const html = await convertSource(`= Probe

Owner hmeta:owner[docs-team].
`);

		expect(html).toContain("<mark>docs-team</mark>");
	});

	it("does not leak raw hmeta syntax for valid hmeta conversion", async () => {
		const html = await convertSource(`= Probe

Status hmeta:status[active, label=生效].
`);

		expect(html).not.toContain("hmeta:status[active, label=生效]");
		expect(html).toContain("生效");
	});

	it("registers hmeta in the current secure adapter load mode", async () => {
		const adapter = createAsciidoctorAdapter();
		const document = await adapter.loadSource(`= Probe

Status hmeta:status[active, label=生效].
`);

		expect(await document.getContent?.()).toContain("<mark>生效</mark>");
	});

	it("does not alter parser source text or scanner-based occurrence extraction", async () => {
		const path = writeFixture(
			"asciidoctor-adapter-hmeta-structural-source.adoc",
			`= Probe

[#rule]
== Rule

Status hmeta:status[active, label=生效].
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section");
		const paragraph = section?.children?.find(
			(node) => node.kind === "paragraph",
		);

		expect(document.sourceText).toContain("hmeta:status[active, label=生效]");
		expect(paragraph).toEqual(
			expect.objectContaining({
				text: "Status hmeta:status[active, label=生效].",
			}),
		);
		expect(document.headingInlineMetadataOccurrences).toEqual([
			expect.objectContaining({
				raw: "hmeta:status[active, label=生效]",
				field: "status",
				value: "active",
				label: "生效",
			}),
		]);
	});
});

async function convertSource(source: string): Promise<string> {
	const document = await createAsciidoctorAdapter().loadSource(source);
	const converted = await document.getContent?.();
	if (typeof converted !== "string") {
		throw new Error("expected converted content");
	}
	return converted;
}
