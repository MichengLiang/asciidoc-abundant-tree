import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	SectionNode,
} from "../model";

export function collectAnimationScriptTextBySectionId(
	document: AbundantDocument,
): Map<string, string> {
	const scripts = new Map<string, string>();
	collectFromNodes(document.children, scripts);
	return scripts;
}

function collectFromNodes(
	nodes: readonly AbundantNode[],
	scripts: Map<string, string>,
): void {
	for (const node of nodes) {
		if (node.kind === "section") {
			collectFromSection(node, scripts);
		}
		if (node.children !== undefined) {
			collectFromNodes(node.children, scripts);
		}
	}
}

function collectFromSection(
	section: SectionNode,
	scripts: Map<string, string>,
): void {
	const sectionId = section.ids[0];
	if (sectionId === undefined || section.children === undefined) {
		return;
	}

	const scriptBlocks = section.children.filter(isAnimationScriptListing);
	if (scriptBlocks.length === 0) {
		return;
	}

	scripts.set(
		sectionId,
		scriptBlocks
			.map((block) => block.content?.trim())
			.filter((content): content is string => Boolean(content))
			.join("\n\n"),
	);
}

function isAnimationScriptListing(node: AbundantNode): node is ListingNode {
	return node.kind === "listing" && node.style === "animation-script";
}
