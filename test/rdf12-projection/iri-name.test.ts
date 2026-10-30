import { describe, expect, it } from "vitest";
import { nameInIri } from "../../src/rdf12-projection/iri-name";

describe("names written into IRIs", () => {
	it("keeps Chinese text and Chinese punctuation as written", () => {
		for (const name of [
			"难度",
			"葱、姜、蒜的处理",
			"规则：出处",
			"“引号”《书名》——……",
		]) {
			expect(nameInIri(name)).toBe(name);
		}
	});

	it("keeps the English punctuation an IRI fragment allows", () => {
		expect(nameInIri("depends-on")).toBe("depends-on");
		expect(nameInIri("a.b,c:d;e!f?g'h(i)j&k+l=m/n@o~p_q*r$s")).toBe(
			"a.b,c:d;e!f?g'h(i)j&k+l=m/n@o~p_q*r$s",
		);
	});

	it("percent-encodes what an IRI cannot carry, and % itself", () => {
		expect(nameInIri("dockview 适配")).toBe("dockview%20适配");
		expect(nameInIri("5% 盐水")).toBe("5%25%20盐水");
		expect(nameInIri('C# "x" <y> [z] {w} | \\ ^ `v`')).toBe(
			"C%23%20%22x%22%20%3Cy%3E%20%5Bz%5D%20%7Bw%7D%20%7C%20%5C%20%5E%20%60v%60",
		);
		expect(nameInIri("a\tb\u007f\u0085")).toBe("a%09b%7F%C2%85");
		expect(nameInIri("")).toBe("%EE%80%80");
		expect(nameInIri("￾")).toBe("%EF%BF%BE");
	});

	it("keeps supplementary-plane characters inside ucschar", () => {
		expect(nameInIri("𠀀😀")).toBe("𠀀😀");
		expect(nameInIri("\u{f0000}")).toBe("%F3%B0%80%80");
	});

	it("round-trips through one percent-decoding", () => {
		for (const name of [
			"5% 盐水",
			"%E9%9A%BE",
			"C# 入门",
			"über score",
			"x/y",
		]) {
			expect(decodeURIComponent(nameInIri(name))).toBe(name);
		}
	});
});
