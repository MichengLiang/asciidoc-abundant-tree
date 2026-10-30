import { type Rdf12Graph, rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { StructureProjection } from "./structure-projector";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectLabelsInput = {
	readonly graph: Rdf12Graph;
	readonly structure: StructureProjection;
};

// selector 的全部拥有者：label 空间里与它整串相等的标题节点（06 号书第 5 章「Target Heading」）。
export type HeadingOwners = (selector: string) => readonly Rdf12IriTerm[];

// label 空间就是标题的地址（06 号书第 2 章「地址与 Label 空间」），全部写进图：消费者只拿得到图，要按同一套地址反查、
// 绑定指向别的文档的引用。图上的标签与投影器自己绑定用的拥有者都出自同一份地址簿，二者不会说法不一。
// aat:headline 不在这里写：它由 structure-projector 写，headline 为空的标题也要有 aat:headline ""，而地址簿不收空串。
export function projectLabels(input: ProjectLabelsInput): HeadingOwners {
	const { nodeIndex, addressBook } = input.structure;

	for (const address of addressBook.addresses) {
		const owner = nodeIndex.get(address.owner);
		if (owner !== undefined && address.kind !== "headline") {
			input.graph.add(
				rdf12Triple(
					owner,
					iriTerm(`${namespaces.aat}${address.kind}`),
					stringLiteral(address.value),
				),
			);
		}
	}

	return (selector) =>
		addressBook.owners(selector).flatMap((heading) => {
			const owner = nodeIndex.get(heading);
			return owner === undefined ? [] : [owner];
		});
}
