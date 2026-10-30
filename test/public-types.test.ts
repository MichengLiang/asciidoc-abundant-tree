import { describe, expectTypeOf, it } from "vitest";
import type {
	NodeBase as BrowserNodeBase,
	UnknownNode as BrowserUnknownNode,
} from "../src/browser";
import type {
	AbundantNode,
	NodeBase,
	Rdf12Graph,
	Rdf12IriTerm,
	Rdf12LiteralTerm,
	Rdf12NodeIndex,
	Rdf12NodeIndexEntry,
	Rdf12Options,
	Rdf12PrefixMap,
	Rdf12Projection,
	Rdf12Result,
	Rdf12Term,
	Rdf12Triple,
	Rdf12TriplePattern,
	Rdf12TripleTerm,
	rdf12,
	UnknownNode,
} from "../src/index";

// 公共签名里出现的每个类型，使用方都能从入口按名字导入（09 号书第 10 章「下游投影出口」）。这里的 import 由
// typecheck 核对：哪个名字没从入口导出，这份文件就过不了。
describe("public type names", () => {
	it("names every type the rdf12 signature and its result expose", () => {
		expectTypeOf<Parameters<typeof rdf12>[1]>().toEqualTypeOf<Rdf12Options>();
		expectTypeOf<Rdf12Result>().toMatchTypeOf<Rdf12Projection>();
		expectTypeOf<Rdf12Projection["graph"]>().toEqualTypeOf<Rdf12Graph>();
		expectTypeOf<Rdf12Projection["prefixes"]>().toEqualTypeOf<Rdf12PrefixMap>();
		expectTypeOf<
			Rdf12Projection["nodeIndex"]
		>().toEqualTypeOf<Rdf12NodeIndex>();
		expectTypeOf<
			ReturnType<Rdf12NodeIndex["entries"]>[number]
		>().toEqualTypeOf<Rdf12NodeIndexEntry>();
		expectTypeOf<
			NonNullable<Parameters<Rdf12Graph["match"]>[0]>
		>().toEqualTypeOf<Rdf12TriplePattern>();
		expectTypeOf<
			ReturnType<Rdf12Graph["toArray"]>[number]
		>().toEqualTypeOf<Rdf12Triple>();
		expectTypeOf<Rdf12Triple["subject"]>().toMatchTypeOf<Rdf12IriTerm>();
		expectTypeOf<Rdf12Triple["object"]>().toEqualTypeOf<Rdf12Term>();
		expectTypeOf<Rdf12Term>().toEqualTypeOf<
			Rdf12IriTerm | Rdf12LiteralTerm | Rdf12TripleTerm
		>();
	});

	it("names the node types the AbundantNode union is built from", () => {
		expectTypeOf<UnknownNode>().toMatchTypeOf<AbundantNode>();
		expectTypeOf<UnknownNode>().toMatchTypeOf<NodeBase>();
		expectTypeOf<BrowserUnknownNode>().toEqualTypeOf<UnknownNode>();
		expectTypeOf<BrowserNodeBase>().toEqualTypeOf<NodeBase>();
	});
});
