import { getVersion } from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import {
	type AsciidoctorBlock,
	createAsciidoctorAdapter,
} from "../src/asciidoctor-adapter";

describe("Asciidoctor adapter parser version", () => {
	it("reports the @asciidoctor/core version it runs on", () => {
		expect(createAsciidoctorAdapter().parserVersion).toBe(getVersion());
		expect(getVersion()).toMatch(/^4\./u);
	});
});

describe("Asciidoctor adapter xref bindings", () => {
	it("resolves document targets through refs, titles, and interdocument links", async () => {
		const adapter = createAsciidoctorAdapter();
		const document = await adapter.loadSource(
			["= Book", "", "[#known]", "== Known", "", "== Generated Title", ""].join(
				"\n",
			),
		);

		expect(adapter.resolveXrefTarget(document, "known")).toBe("#known");
		expect(adapter.resolveXrefTarget(document, "Generated Title")).toBe(
			"#_generated_title",
		);
		expect(adapter.resolveXrefTarget(document, "chapter.adoc#intro")).toBe(
			"chapter.html#intro",
		);
		expect(adapter.resolveXrefTarget(document, "missing")).toBeUndefined();
	});

	it("uses explicit labels, official reftext, and unresolved fallbacks when creating xref bindings", async () => {
		const adapter = createAsciidoctorAdapter();
		const document = await adapter.loadSource(
			["= Book", "", "[#known]", "== Known Reftext", "", "body"].join("\n"),
		);
		const parent = document.getBlocks?.()[0] as AsciidoctorBlock;

		expect(
			await adapter.resolveXrefBinding(document, parent, {
				target: "known",
			}),
		).toEqual(
			expect.objectContaining({
				href: "#known",
				resolvedId: "known",
				reftext: "Known Reftext",
			}),
		);
		expect(
			await adapter.resolveXrefBinding(document, parent, {
				target: "known",
				label: "Explicit",
			}),
		).toEqual(
			expect.objectContaining({
				href: "#known",
				resolvedId: "known",
				reftext: "Explicit",
			}),
		);
		expect(
			await adapter.resolveXrefBinding(document, parent, {
				target: "chapter.adoc#intro",
			}),
		).toEqual(
			expect.objectContaining({
				href: "chapter.html#intro",
				resolvedId: "intro",
				reftext: "[chapter.adoc#intro]",
			}),
		);
		expect(
			await adapter.resolveXrefBinding(document, parent, {
				target: "missing",
			}),
		).toEqual(
			expect.objectContaining({
				href: "#missing",
				resolvedId: "missing",
				reftext: "[missing]",
			}),
		);
	});
});
