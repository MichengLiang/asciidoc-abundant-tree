import { describe, expect, it } from "vitest";
import { parseAbundantTreeFromSource } from "../src/browser";
import type {
	AbundantDocument,
	AbundantNode,
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	HeadingDescriptionMetadataNode,
	HeadingInlineMetadataOccurrenceNode,
	ListingNode,
	MetadataNode,
	ParagraphNode,
	SectionNode,
	SourceLayer,
	TargetNode,
	ToolDiagnostic,
	XrefOccurrenceNode,
} from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

const fixture = `= 浏览器解析夹具

[#source.policy, status=active, owner=docs]
== 来源节点

priority:: high
summary::
来源节点说明第一行。
来源节点说明第二行。

来源节点引用 xref:target.rule[目标节点, rel=requires, weight=0.7]。

[#target.rule, status=draft]
== 目标节点

[#target-json]
[source,json]
----
{"kind":"rule","status":"draft"}
----
`;

describe("browser source parser equivalence", () => {
	it("matches the Node single-file parser on normalized consumer fields", () => {
		const sourcePath = writeFixture("browser-parser-equivalence.adoc", fixture);
		const nodeDocument = parseAbundantTree({ sourcePath });
		const browserDocument = parseAbundantTreeFromSource({
			sourceText: fixture,
			sourcePath: "fixture.adoc",
		});

		const nodeNormalized = normalizeDocumentForBrowserEquivalence(nodeDocument);
		const browserNormalized =
			normalizeDocumentForBrowserEquivalence(browserDocument);

		expect(browserNormalized).toEqual(nodeNormalized);
		expect(browserNormalized.title).toBe("浏览器解析夹具");
		expect(browserNormalized.sections.map((section) => section.title)).toEqual([
			"来源节点",
			"目标节点",
		]);
		expect(browserNormalized.sections[0]?.metadata).toEqual([
			expect.objectContaining({
				ids: ["source"],
				roles: ["policy"],
				attributes: { status: "active", owner: "docs" },
			}),
		]);
		expect(browserNormalized.sections[0]?.descriptionMetadata?.fields).toEqual({
			priority: "high",
			summary: "来源节点说明第一行。\n来源节点说明第二行。",
		});
		expect(browserNormalized.listings).toEqual([
			expect.objectContaining({
				ids: ["target-json"],
				style: "source",
				language: "json",
				content: '{"kind":"rule","status":"draft"}',
			}),
		]);
		expect(browserNormalized.xrefs).toEqual([
			expect.objectContaining({
				raw: "xref:target.rule[目标节点, rel=requires, weight=0.7]",
				target: "target.rule",
				label: "目标节点",
				attributes: { rel: "requires", weight: "0.7" },
				containingSectionId: "source",
				sourceSpan: expect.objectContaining({
					start: expect.objectContaining({ line: 11 }),
				}),
			}),
		]);
		expect(browserNormalized.targets.map((target) => target.id)).toEqual(
			expect.arrayContaining(["source", "target", "target-json"]),
		);
		expect(browserNormalized.headingInlineMetadataOccurrences).toEqual([]);
		expect(browserNormalized.toolDiagnostics).toEqual([]);
	});
});

function normalizeDocumentForBrowserEquivalence(document: AbundantDocument) {
	return {
		kind: document.kind,
		mode: document.mode,
		title: document.title?.text,
		parser: {
			name: document.parser.name,
		},
		sections: collectNodes(document.children, "section").map(normalizeSection),
		listings: collectNodes(document.children, "listing").map(normalizeListing),
		children: document.children.map(normalizeNode),
		targets: document.targets.map(normalizeTarget),
		xrefs: document.xrefOccurrences.map(normalizeXref),
		anchors: document.anchorOccurrences.map(normalizeAnchor),
		headingInlineMetadataOccurrences:
			document.headingInlineMetadataOccurrences.map(
				normalizeHeadingInlineMetadataOccurrence,
			),
		toolDiagnostics: document.toolDiagnostics.map(normalizeDiagnostic),
	};
}

function normalizeNode(node: AbundantNode): unknown {
	switch (node.kind) {
		case "section":
			return normalizeSection(node);
		case "listing":
			return normalizeListing(node);
		case "paragraph":
			return normalizeParagraph(node);
		case "descriptionList":
			return {
				kind: node.kind,
				ids: node.ids,
				title: node.title,
				style: node.style,
				delimiter: node.delimiter,
				metadata: node.metadata?.map(normalizeMetadata) ?? [],
				source: normalizeSourceLayer(node.source),
				asciidoctor: normalizeAsciidoctorLayer(node.asciidoctor),
				children: node.children?.map(normalizeNode) ?? [],
			};
		default:
			return {
				kind: node.kind,
				source: normalizeSourceLayer(node.source),
				asciidoctor: normalizeAsciidoctorLayer(node.asciidoctor),
				children: node.children?.map(normalizeNode) ?? [],
			};
	}
}

function normalizeSection(section: SectionNode) {
	return {
		kind: section.kind,
		title: section.title,
		level: section.level,
		ids: section.ids,
		idOrigin: section.idOrigin,
		line: section.line,
		span: section.span,
		titleSpan: section.titleSpan,
		metadata: section.metadata?.map(normalizeMetadata) ?? [],
		descriptionMetadata: normalizeDescriptionMetadata(
			section.descriptionMetadata,
		),
		source: normalizeSourceLayer(section.source),
		asciidoctor: normalizeAsciidoctorLayer(section.asciidoctor),
		children: section.children?.map(normalizeNode) ?? [],
	};
}

function normalizeListing(listing: ListingNode) {
	return {
		kind: listing.kind,
		ids: listing.ids,
		title: listing.title,
		style: listing.style,
		language: listing.language,
		content: listing.content,
		metadataSpan: listing.metadataSpan,
		contentSpan: listing.contentSpan,
		span: listing.span,
		metadata: listing.metadata?.map(normalizeMetadata) ?? [],
		source: normalizeSourceLayer(listing.source),
		asciidoctor: normalizeAsciidoctorLayer(listing.asciidoctor),
		children: listing.children?.map(normalizeNode) ?? [],
	};
}

function normalizeParagraph(paragraph: ParagraphNode) {
	return {
		kind: paragraph.kind,
		text: paragraph.text,
		source: normalizeSourceLayer(paragraph.source),
		asciidoctor: normalizeAsciidoctorLayer(paragraph.asciidoctor),
		children: paragraph.children?.map(normalizeNode) ?? [],
	};
}

function normalizeMetadata(metadata: MetadataNode) {
	return {
		kind: metadata.kind,
		metadataKind: metadata.metadataKind,
		raw: metadata.raw,
		line: metadata.line,
		ids: metadata.ids ?? [],
		roles: metadata.roles ?? [],
		attributes: metadata.attributes ?? {},
		source: normalizeSourceLayer(metadata.source),
		asciidoctor: normalizeAsciidoctorLayer(metadata.asciidoctor),
	};
}

function normalizeDescriptionMetadata(
	metadata: HeadingDescriptionMetadataNode | undefined,
) {
	if (!metadata) {
		return undefined;
	}
	return {
		kind: metadata.kind,
		fields: metadata.fields,
		entries: metadata.entries.map((entry) => ({
			key: entry.key,
			value: entry.value,
			term: {
				text: entry.term.text,
				line: entry.term.line,
				sourceSpan: entry.term.sourceSpan,
				source: normalizeSourceLayer(entry.term.source),
			},
			description: entry.description
				? {
						text: entry.description.text,
						line: entry.description.line,
						sourceSpan: entry.description.sourceSpan,
						source: normalizeSourceLayer(entry.description.source),
					}
				: undefined,
		})),
		source: normalizeSourceLayer(metadata.source),
		asciidoctor: normalizeAsciidoctorLayer(metadata.asciidoctor),
	};
}

function normalizeTarget(target: TargetNode) {
	return {
		kind: target.kind,
		id: target.id,
		targetType: target.targetType,
		idOrigin: target.idOrigin,
		title: target.title,
		sourceSpan: target.sourceSpan,
		source: normalizeSourceLayer(target.source),
		asciidoctor: normalizeAsciidoctorLayer(target.asciidoctor),
	};
}

function normalizeXref(xref: XrefOccurrenceNode) {
	return {
		kind: xref.kind,
		syntax: xref.syntax,
		raw: xref.raw,
		target: xref.target,
		label: xref.label,
		attributes: xref.attributes ?? {},
		scope: xref.scope,
		targetKind: xref.targetKind,
		sourceSpan: xref.sourceSpan,
		containingSectionId: xref.containingSectionId,
		source: normalizeSourceLayer(xref.source),
		asciidoctor: normalizeAsciidoctorLayer(xref.asciidoctor),
	};
}

function normalizeAnchor(anchor: AnchorOccurrenceNode) {
	return {
		kind: anchor.kind,
		syntax: anchor.syntax,
		raw: anchor.raw,
		ids: anchor.ids,
		reftext: anchor.reftext,
		sourceSpan: anchor.sourceSpan,
		containingSectionId: anchor.containingSectionId,
		anchorScope: anchor.anchorScope,
		source: normalizeSourceLayer(anchor.source),
		asciidoctor: normalizeAsciidoctorLayer(anchor.asciidoctor),
	};
}

function normalizeHeadingInlineMetadataOccurrence(
	occurrence: HeadingInlineMetadataOccurrenceNode,
) {
	return {
		kind: occurrence.kind,
		syntax: occurrence.syntax,
		raw: occurrence.raw,
		field: occurrence.field,
		value: occurrence.value,
		label: occurrence.label,
		sourceSpan: occurrence.sourceSpan,
		containingSectionId: occurrence.containingSectionId,
		source: normalizeSourceLayer(occurrence.source),
		asciidoctor: normalizeAsciidoctorLayer(occurrence.asciidoctor),
	};
}

function normalizeDiagnostic(diagnostic: ToolDiagnostic) {
	return {
		code: diagnostic.code,
		level: diagnostic.level,
		message: diagnostic.message,
		source: diagnostic.source,
	};
}

function normalizeSourceLayer(source: SourceLayer | undefined) {
	if (!source) {
		return undefined;
	}
	return {
		line: source.line,
		span: source.span,
		sourceSpan: source.sourceSpan,
	};
}

function normalizeAsciidoctorLayer(layer: AsciidoctorLayer | undefined) {
	if (!layer) {
		return undefined;
	}
	return {
		context: layer.context,
		nodeName: layer.nodeName,
		href: layer.href,
		resolvedId: layer.resolvedId,
		resolvedType: layer.resolvedType,
		reftext: layer.reftext,
	};
}

function collectNodes<K extends AbundantNode["kind"]>(
	nodes: readonly AbundantNode[],
	kind: K,
): Extract<AbundantNode, { kind: K }>[] {
	const collected: Extract<AbundantNode, { kind: K }>[] = [];
	for (const node of nodes) {
		if (node.kind === kind) {
			collected.push(node as Extract<AbundantNode, { kind: K }>);
		}
		if (node.children) {
			collected.push(...collectNodes(node.children, kind));
		}
	}
	return collected;
}
