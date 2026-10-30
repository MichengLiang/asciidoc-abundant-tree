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

describe("Asciidoctor adapter xref probing", () => {
	it("recognizes only the candidates Asciidoctor turns into xrefs, with the official facts", async () => {
		const adapter = createAsciidoctorAdapter();
		const text =
			"见 xref:known[Known, rel=a--b] 与 +xref:known[]+ 与 \\xref:known[] 与 <<chapter.adoc#intro>>";
		const document = await adapter.loadSource(
			["= Book", "", "[#known]", "== Known Reftext", "", text].join("\n"),
		);
		const [section] = (document.getBlocks?.() ?? []) as AsciidoctorBlock[];
		const [paragraph] = (section?.getBlocks?.() ?? []) as AsciidoctorBlock[];

		const [result] = await adapter.probeXrefs(document, [
			{
				owner: paragraph as AsciidoctorBlock,
				title: false,
				text,
				candidates: candidatesOf(text),
			},
		]);

		expect(result?.recognized.map((xref) => xref.candidate)).toEqual([0, 3]);
		expect(result?.recognized[0]).toEqual({
			candidate: 0,
			official: {
				href: "#known",
				refid: "known",
				path: undefined,
				fragment: "known",
				resolved: true,
				reftext: "Known",
			},
			expandedTarget: "known",
			label: "Known",
			// 值取源文本：官方转换会把 -- 替换成破折号。
			attributes: { rel: "a--b" },
		});
		expect(result?.recognized[1]?.official).toEqual(
			expect.objectContaining({
				href: "chapter.html#intro",
				path: "chapter.html",
				fragment: "intro",
				resolved: false,
			}),
		);
		expect(result?.withoutSource).toEqual([]);
	});

	it("expands targets with the attribute values at their position and reports xrefs with no source text", async () => {
		const adapter = createAsciidoctorAdapter();
		const text = "见 xref:{sec}[] 与 {ref}";
		const document = await adapter.loadSource(
			[
				"= Book",
				":sec: early",
				"",
				"== Target",
				"",
				":sec: Target",
				":ref: xref:Target[]",
				text,
			].join("\n"),
		);
		const [section] = (document.getBlocks?.() ?? []) as AsciidoctorBlock[];
		const [paragraph] = (section?.getBlocks?.() ?? []) as AsciidoctorBlock[];

		const [result] = await adapter.probeXrefs(document, [
			{
				owner: paragraph as AsciidoctorBlock,
				title: false,
				text,
				candidates: candidatesOf(text),
			},
		]);

		expect(result?.recognized).toEqual([
			expect.objectContaining({ candidate: 0, expandedTarget: "Target" }),
		]);
		// 官方解析成功自然引用后把 refid 改写成生成的 ID，作者写下的 Target 只在源文里。
		expect(result?.withoutSource).toEqual([
			expect.objectContaining({ refid: "_target", resolved: true }),
		]);
	});

	it("refuses documents it did not load", async () => {
		await expect(createAsciidoctorAdapter().probeXrefs({}, [])).rejects.toThrow(
			/loaded by this adapter/u,
		);
	});
});

function candidatesOf(text: string) {
	return [...text.matchAll(/\\*(xref:|<<)([^[>]+)(?:\[([^\]]*)\]|>>)/gu)].map(
		(match) => ({
			offset: match.index,
			syntax: match[1] === "<<" ? ("shorthand" as const) : ("macro" as const),
			target: match[2] ?? "",
			...(match[3] ? { label: match[3] } : {}),
		}),
	);
}
