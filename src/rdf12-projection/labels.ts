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

// label 空间就是标题的地址（06 号书第 2 章「地址与 Label 空间」）：地址路径、custom ID、归属到标题的本地 target ID
// 与生成 ID。它们由 structure-projector 定名字时的同一份地址簿给出，绑定与命名用的是同一套地址。
export function projectLabels(input: ProjectLabelsInput): Rdf12LabelCatalog {
	const { nodeIndex, addressBook, targetAliases } = input.structure;
	const catalog = createRdf12LabelCatalog();

	for (const address of addressBook.addresses) {
		const owner = nodeIndex.get(address.owner);
		if (owner !== undefined) {
			catalog.add({ owner, labelKind: address.kind, value: address.value });
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
