import {
	type AbundantDocument,
	type AbundantNode,
	parseAbundantTreeFromSource,
	type SectionNode,
	type SourceSpan,
	type TargetNode,
	type XrefOccurrenceNode,
} from "asciidoc-abundant-tree/browser";

export type DisplayField = {
	readonly key: string;
	readonly value: string;
};

export type TeachingNode = {
	readonly id: string;
	readonly title: string;
	readonly role?: string;
	readonly level: number;
	readonly fields: readonly DisplayField[];
};

export type TeachingEdge = {
	readonly id: string;
	readonly source: string;
	readonly target: string;
	readonly rel: string;
	readonly title: string;
	readonly fields: readonly DisplayField[];
	readonly sourceSpan?: SourceSpan;
};

export type TeachingProjection = {
	readonly nodes: readonly TeachingNode[];
	readonly edges: readonly TeachingEdge[];
	readonly diagnostics: readonly string[];
};

type ProjectionIndex = {
	readonly sections: readonly SectionNode[];
	readonly nodeByAlias: ReadonlyMap<string, TeachingNode>;
	readonly targetNodeIdByTargetId: ReadonlyMap<string, string>;
};

const REL_LABELS: Record<string, string> = {
	documents: "说明",
	references: "引用",
	requires: "要求",
};

export function projectTeachingGraph(source: string): TeachingProjection {
	try {
		return projectTeachingGraphFromDocument(
			parseAbundantTreeFromSource({
				sourceText: source,
				sourcePath: "projection-teacher.adoc",
			}),
		);
	} catch (error) {
		return {
			nodes: [],
			edges: [],
			diagnostics: [
				`解析失败: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
}

export function projectTeachingGraphFromDocument(
	document: AbundantDocument,
): TeachingProjection {
	const sections = collectSections(document.children);
	const nodes = sections.map(sectionToTeachingNode);
	const index = buildProjectionIndex(document, sections, nodes);
	const diagnostics = document.toolDiagnostics.map(
		(diagnostic) =>
			`${diagnostic.level} ${diagnostic.code}: ${diagnostic.message}`,
	);
	const edges = document.xrefOccurrences.flatMap((xref, indexInDocument) => {
		const edge = xrefToTeachingEdge(xref, indexInDocument, index, diagnostics);
		return edge ? [edge] : [];
	});

	return {
		nodes,
		edges,
		diagnostics,
	};
}

function sectionToTeachingNode(section: SectionNode): TeachingNode {
	const role = firstSectionRole(section);
	return {
		id: graphNodeId(section),
		title: section.title,
		...(role ? { role } : {}),
		level: section.level,
		fields: sectionFields(section),
	};
}

function sectionFields(section: SectionNode): DisplayField[] {
	const fields: DisplayField[] = [];
	for (const metadata of section.metadata ?? []) {
		for (const role of metadata.roles ?? []) {
			appendField(fields, "role", role);
		}
		for (const [key, value] of Object.entries(metadata.attributes ?? {})) {
			appendField(fields, key, stringifyFieldValue(value));
		}
	}
	for (const [key, value] of Object.entries(
		section.descriptionMetadata?.fields ?? {},
	)) {
		appendField(fields, key, value);
	}
	return fields;
}

function xrefToTeachingEdge(
	xref: XrefOccurrenceNode,
	indexInDocument: number,
	index: ProjectionIndex,
	diagnostics: string[],
): TeachingEdge | undefined {
	const source = xref.containingSectionId
		? index.nodeByAlias.get(xref.containingSectionId)
		: undefined;
	if (!source) {
		diagnostics.push(
			`未解析 xref source: ${xref.raw} 缺少可映射的 containingSectionId`,
		);
		return undefined;
	}

	const target = targetNodeForXref(xref, index);
	if (!target) {
		diagnostics.push(`未解析 xref target: ${xref.target}`);
		return undefined;
	}

	const rel = relationForXref(xref);
	const fields = xrefFields(xref, rel);
	return {
		id: `${source.id}-${rel}-${target.id}-${indexInDocument}`,
		source: source.id,
		target: target.id,
		rel,
		title: REL_LABELS[rel] ?? rel,
		fields,
		...(xref.sourceSpan ? { sourceSpan: xref.sourceSpan } : {}),
	};
}

function xrefFields(xref: XrefOccurrenceNode, rel: string): DisplayField[] {
	const fields: DisplayField[] = [];
	if (xref.label) {
		appendField(fields, "label", xref.label);
	}
	appendField(fields, "rel", rel);
	for (const [key, value] of Object.entries(xref.attributes ?? {})) {
		appendField(fields, key, stringifyFieldValue(value));
	}
	if (xref.sourceSpan) {
		appendField(fields, "sourceLine", String(xref.sourceSpan.start.line));
		appendField(fields, "sourceColumn", String(xref.sourceSpan.start.column));
	}
	return fields;
}

function relationForXref(xref: XrefOccurrenceNode): string {
	const rel = xref.attributes?.rel;
	return typeof rel === "string" && rel.length > 0 ? rel : "references";
}

function targetNodeForXref(
	xref: XrefOccurrenceNode,
	index: ProjectionIndex,
): TeachingNode | undefined {
	const candidates = [
		xref.asciidoctor?.resolvedId,
		xref.target,
		targetIdWithoutRole(xref.target),
	].filter((value): value is string => Boolean(value));
	for (const candidate of candidates) {
		const node =
			index.nodeByAlias.get(candidate) ??
			targetNodeForCatalogTarget(candidate, index);
		if (node) {
			return node;
		}
	}
	return undefined;
}

function targetNodeForCatalogTarget(
	targetId: string,
	index: ProjectionIndex,
): TeachingNode | undefined {
	const nodeId = index.targetNodeIdByTargetId.get(targetId);
	return nodeId ? index.nodeByAlias.get(nodeId) : undefined;
}

function buildProjectionIndex(
	document: AbundantDocument,
	sections: readonly SectionNode[],
	nodes: readonly TeachingNode[],
): ProjectionIndex {
	const nodeByAlias = new Map<string, TeachingNode>();
	for (let index = 0; index < sections.length; index += 1) {
		const section = sections[index];
		const node = nodes[index];
		if (!section || !node) {
			continue;
		}
		for (const alias of sectionAliases(section)) {
			nodeByAlias.set(alias, node);
		}
	}
	const targetNodeIdByTargetId = new Map<string, string>();
	for (const target of document.targets) {
		const owner = owningNodeForTarget(target, document.children, nodeByAlias);
		if (owner) {
			targetNodeIdByTargetId.set(target.id, owner.id);
		}
	}
	return { sections, nodeByAlias, targetNodeIdByTargetId };
}

function owningNodeForTarget(
	target: TargetNode,
	nodes: readonly AbundantNode[],
	nodeByAlias: ReadonlyMap<string, TeachingNode>,
): TeachingNode | undefined {
	if (target.targetType === "section") {
		return nodeByAlias.get(target.id);
	}
	return containingSectionForTarget(nodes, target.id, nodeByAlias);
}

function containingSectionForTarget(
	nodes: readonly AbundantNode[],
	targetId: string,
	nodeByAlias: ReadonlyMap<string, TeachingNode>,
	currentSection?: SectionNode,
): TeachingNode | undefined {
	for (const node of nodes) {
		const nextSection = node.kind === "section" ? node : currentSection;
		if (node.kind === "listing" && node.ids.includes(targetId) && nextSection) {
			return teachingNodeForSection(nextSection, nodeByAlias);
		}
		const found = node.children
			? containingSectionForTarget(
					node.children,
					targetId,
					nodeByAlias,
					nextSection,
				)
			: undefined;
		if (found) {
			return found;
		}
	}
	return undefined;
}

function teachingNodeForSection(
	section: SectionNode,
	nodeByAlias: ReadonlyMap<string, TeachingNode>,
): TeachingNode | undefined {
	for (const alias of sectionAliases(section)) {
		const node = nodeByAlias.get(alias);
		if (node) {
			return node;
		}
	}
	return undefined;
}

function collectSections(nodes: readonly AbundantNode[]): SectionNode[] {
	const sections: SectionNode[] = [];
	for (const node of nodes) {
		if (node.kind === "section") {
			sections.push(node);
		}
		if (node.children) {
			sections.push(...collectSections(node.children));
		}
	}
	return sections;
}

function graphNodeId(section: SectionNode): string {
	return (
		section.ids[0] ??
		section.asciidoctor?.resolvedId ??
		`_${section.title.replace(/\s+/g, "-")}`
	);
}

function sectionAliases(section: SectionNode): string[] {
	const aliases = new Set<string>();
	aliases.add(graphNodeId(section));
	if (section.asciidoctor?.resolvedId) {
		aliases.add(section.asciidoctor.resolvedId);
	}
	aliases.add(section.title);
	for (const id of section.ids) {
		aliases.add(id);
		for (const role of section.metadata?.flatMap(
			(entry) => entry.roles ?? [],
		) ?? []) {
			aliases.add(`${id}.${role}`);
		}
	}
	return [...aliases].filter((alias) => alias.length > 0);
}

function targetIdWithoutRole(target: string): string | undefined {
	const [id, role] = target.split(".");
	return id && role ? id : undefined;
}

function firstSectionRole(section: SectionNode): string | undefined {
	return section.metadata?.flatMap((entry) => entry.roles ?? [])[0];
}

function appendField(fields: DisplayField[], key: string, value: string): void {
	if (!value.trim()) {
		return;
	}
	if (fields.some((field) => field.key === key && field.value === value)) {
		return;
	}
	fields.push({ key, value });
}

function stringifyFieldValue(value: string | number | boolean): string {
	return String(value);
}
