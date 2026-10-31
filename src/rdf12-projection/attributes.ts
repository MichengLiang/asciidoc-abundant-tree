import type {
	AbundantDocument,
	AbundantNode,
	MetadataNode,
	SectionNode,
	SourceLayer,
	SourceSpan,
} from "../model";
import { definedObject } from "../object-utils";
import { fieldPredicate } from "./field-predicate";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { integerLiteral, stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";
import { addReifierTriple } from "./reifier";
import {
	documentResourceIri,
	makeFieldEvidenceLocalId,
} from "./resource-identity";
import {
	addLineSpanTriples,
	sourceRelativePathOrFallback,
} from "./source-location";
import { iriTerm } from "./terms";
import type { Rdf12XrefIndex } from "./xref-projector";

export type ProjectSurfaceAttributesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly documentIri: string;
	readonly relativePath: string;
	readonly nodeIndex: Rdf12NodeIndex;
	readonly xrefIndex: Rdf12XrefIndex;
};

// 字段写在哪种表面，是字段证据的 aat:surface（06 号书第 6 章「字段证据」）；role 只写在 attrlist 里，不是字段。
type FieldSurface = "attrlist" | "description-list" | "heading-inline";

type SourceLines = {
	readonly relativePath: string;
	readonly startLine: number;
	readonly endLine: number;
};

type HeadingFieldFact = {
	readonly owner: SectionNode;
	readonly field: string;
	readonly value: string;
	readonly surface: FieldSurface | "role";
	readonly lines?: SourceLines;
};

// role 是投影器词表里的事实，落在 aat:role；其余都是书的字段，落在 field: 下（06 号书《Field Predicate》）。
const rolePredicate = iriTerm(`${namespaces.aat}role`);

export function projectSurfaceAttributes(
	input: ProjectSurfaceAttributesInput,
): void {
	const sections = new Map<AbundantNode, Rdf12NodeIndexEntry>(
		input.nodeIndex
			.entries()
			.filter((entry) => entry.kind === "section")
			.map((entry) => [entry.node, entry]),
	);
	// 字段在所属标题内的源顺序：收集的次序就是 attrlist、描述列表、hmeta: 宏，各表面内按源文档顺序。
	const fieldOrders = new Map<SectionNode, number>();
	for (const fact of collectHeadingFieldFacts(input)) {
		const entry = sections.get(fact.owner);
		if (entry === undefined) {
			continue;
		}
		if (fact.surface === "role") {
			input.graph.add(
				rdf12Triple(entry.iri, rolePredicate, stringLiteral(fact.value)),
			);
			continue;
		}
		const triple = rdf12Triple(
			entry.iri,
			fieldPredicate(fact.field),
			stringLiteral(fact.value),
		);
		input.graph.add(triple);
		const fieldOrder = fieldOrders.get(fact.owner) ?? 0;
		fieldOrders.set(fact.owner, fieldOrder + 1);
		// 同一个名字、同一个值写两处时三元组只有一条，证据仍是两个，各 reify 它。所属标题就是三元组的主语，不另写。
		const evidence = documentResourceIri(
			input.documentIri,
			makeFieldEvidenceLocalId({
				documentOrder: entry.documentOrder,
				fieldOrder,
			}),
		);
		input.graph.add(
			rdf12Triple(
				evidence,
				iriTerm(`${namespaces.rdf}type`),
				iriTerm(`${namespaces.aat}FieldEvidence`),
			),
		);
		addReifierTriple(input.graph, evidence, triple);
		addString(input.graph, evidence, "fieldName", fact.field);
		addString(input.graph, evidence, "surface", fact.surface);
		input.graph.add(
			rdf12Triple(
				evidence,
				iriTerm(`${namespaces.aat}fieldOrder`),
				integerLiteral(fieldOrder),
			),
		);
		if (fact.lines !== undefined) {
			addLineSpanTriples({
				graph: input.graph,
				subject: evidence,
				relativePath: fact.lines.relativePath,
				span: fact.lines,
			});
		}
	}
}

function collectHeadingFieldFacts(
	input: ProjectSurfaceAttributesInput,
): HeadingFieldFact[] {
	const facts: HeadingFieldFact[] = [];
	for (const node of input.document.children) {
		collectNodeHeadingFieldFacts(input, facts, node);
	}
	facts.push(...headingInlineMetadataFacts(input));
	return facts;
}

function collectNodeHeadingFieldFacts(
	input: ProjectSurfaceAttributesInput,
	facts: HeadingFieldFact[],
	node: AbundantNode,
): void {
	if (node.kind === "section") {
		facts.push(...headingMetadataFacts(input, node));
		facts.push(...headingDescriptionMetadataFacts(input, node));
	}

	for (const child of node.children ?? []) {
		collectNodeHeadingFieldFacts(input, facts, child);
	}
}

function headingMetadataFacts(
	input: ProjectSurfaceAttributesInput,
	owner: SectionNode,
): HeadingFieldFact[] {
	const facts: HeadingFieldFact[] = [];
	for (const item of owner.metadata ?? []) {
		for (const role of item.roles ?? []) {
			facts.push({ owner, field: "role", value: role, surface: "role" });
		}
		if (item.metadataKind !== "attrlist" || item.attributes === undefined) {
			continue;
		}
		const lines = metadataLines(input, item);
		for (const [name, value] of Object.entries(item.attributes)) {
			facts.push(
				definedObject({
					owner,
					field: name,
					value: String(value),
					surface: "attrlist",
					lines,
				}) as HeadingFieldFact,
			);
		}
	}
	return facts;
}

// 与描述列表、hmeta: 同一种取法：读元数据节点回源以后的 source 层（book-entry 下 [preface] 这类元数据可以写在
// book.adoc 里，修饰 include 进来的标题，所以不从标题的位置去推）。
function metadataLines(
	input: ProjectSurfaceAttributesInput,
	item: MetadataNode,
): SourceLines | undefined {
	return sourceLines(input, item.source, item.source?.sourceSpan);
}

function headingDescriptionMetadataFacts(
	input: ProjectSurfaceAttributesInput,
	owner: SectionNode,
): HeadingFieldFact[] {
	return (owner.descriptionMetadata?.entries ?? []).map(
		(entry) =>
			definedObject({
				owner,
				field: entry.key,
				value: entry.value,
				surface: "description-list",
				// term 顶层的坐标是逻辑行，源文件里的行在它的 source 层；单文件时两者相同、source 层可能缺。
				lines: sourceLines(
					input,
					entry.term.source,
					entry.term.source?.sourceSpan ??
						(input.document.mode === "single-file"
							? entry.term.sourceSpan
							: undefined),
				),
			}) as HeadingFieldFact,
	);
}

function headingInlineMetadataFacts(
	input: ProjectSurfaceAttributesInput,
): HeadingFieldFact[] {
	const sectionById = sectionBySourceId(input.nodeIndex);
	return input.document.headingInlineMetadataOccurrences.flatMap(
		(occurrence) => {
			if (occurrence.containingSectionId === undefined) {
				return [];
			}
			const owner = sectionById.get(occurrence.containingSectionId);
			if (!owner) {
				return [];
			}
			return [
				definedObject({
					owner,
					field: occurrence.field,
					value: occurrence.value,
					surface: "heading-inline" as const,
					// 与 xref 边证据同一种取法：行内扫描的 sourceSpan 就是源文件里的坐标。
					lines: sourceLines(input, occurrence.source, occurrence.sourceSpan),
				}) as HeadingFieldFact,
			];
		},
	);
}

function sourceLines(
	input: ProjectSurfaceAttributesInput,
	source: SourceLayer | undefined,
	span: SourceSpan | undefined,
): SourceLines | undefined {
	const relativePath = sourceRelativePathOrFallback(
		source,
		input.relativePath,
		input.document.mode,
	);
	if (relativePath === undefined || span === undefined) {
		return undefined;
	}
	return { relativePath, startLine: span.start.line, endLine: span.end.line };
}

function sectionBySourceId(
	nodeIndex: Rdf12NodeIndex,
): Map<string, SectionNode> {
	const sections = new Map<string, SectionNode>();
	for (const entry of nodeIndex.entries()) {
		if (entry.kind !== "section") {
			continue;
		}
		for (const id of entry.node.ids) {
			sections.set(id, entry.node);
		}
	}
	return sections;
}

function addString(
	graph: Rdf12Graph,
	subject: ReturnType<typeof documentResourceIri>,
	predicateLocalName: string,
	value: string,
): void {
	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			stringLiteral(value),
		),
	);
}
