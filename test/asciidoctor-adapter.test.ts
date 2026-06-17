import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";

describe("Asciidoctor adapter xref bindings", () => {
	it("resolves document targets through refs, fallback ids, and interdocument links", () => {
		const adapter = createAsciidoctorAdapter();
		const document: AsciidoctorBlock = {
			getRefs: () => ({
				known: {},
			}),
			$resolve_id: (target) =>
				target === "generated title" ? "generated-title" : undefined,
		};

		expect(adapter.resolveXrefTarget(document, "known")).toBe("#known");
		expect(adapter.resolveXrefTarget(document, "generated title")).toBe(
			"#generated-title",
		);
		expect(adapter.resolveXrefTarget(document, "chapter.adoc#intro")).toBe(
			"chapter.html#intro",
		);
		expect(adapter.resolveXrefTarget(document, "missing")).toBeUndefined();
	});

	it("uses explicit labels, official reftext, and unresolved fallbacks when creating xref bindings", () => {
		const adapter = createAsciidoctorAdapter();
		const document = adapter.loadSource(
			["= Book", "", "[#known]", "== Known Reftext", "", "body"].join("\n"),
		);
		const parent = document.getBlocks?.()[0] as AsciidoctorBlock;

		expect(
			adapter.resolveXrefBinding(document, parent, {
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
			adapter.resolveXrefBinding(document, parent, {
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
			adapter.resolveXrefBinding(document, parent, {
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
			adapter.resolveXrefBinding(document, parent, {
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
