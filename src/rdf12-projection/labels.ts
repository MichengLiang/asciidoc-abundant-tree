import { type Rdf12Graph, rdf12Triple } from "./graph";
import {
	createRdf12LabelCatalog,
	type Rdf12LabelCatalog,
} from "./label-catalog";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { StructureProjection } from "./structure-projector";
import { iriTerm } from "./terms";

export type ProjectLabelsInput = {
	readonly graph: Rdf12Graph;
	readonly structure: StructureProjection;
};

// label 空间就是标题的地址（06 号书第 2 章「地址与 Label 空间」），全部写进图：消费者只拿得到图，要按同一套地址反查、
// 绑定指向别的文档的引用。headline、custom ID 与生成 ID 由 structure-projector 写出，这里补上两段以上的地址路径与
// 归属到标题的本地 target ID；绑定用的目录与图上的标签出自同一份地址簿。
export function projectLabels(input: ProjectLabelsInput): Rdf12LabelCatalog {
	const { nodeIndex, addressBook, targetAliases } = input.structure;
	const catalog = createRdf12LabelCatalog();

	for (const address of addressBook.addresses) {
		const owner = nodeIndex.get(address.owner);
		if (owner !== undefined) {
			catalog.add({ owner, labelKind: address.kind, value: address.value });
			if (address.kind === "addressPath") {
				input.graph.add(
					rdf12Triple(
						owner,
						iriTerm(`${namespaces.aat}addressPath`),
						stringLiteral(address.value),
					),
				);
			}
		}
	}
	for (const alias of targetAliases) {
		const owner = nodeIndex.get(alias.owner);
		if (owner !== undefined) {
			input.graph.add(
				rdf12Triple(
					owner,
					iriTerm(`${namespaces.aat}addressLabel`),
					stringLiteral(alias.id),
				),
			);
		}
	}

	return catalog;
}
