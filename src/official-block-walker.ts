import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { childBlocksOf } from "./official-block-utils";

export type OfficialBlockSurface = {
	block: AsciidoctorBlock;
	context: string | undefined;
	nodeName: string | undefined;
	level: number | undefined;
	title: string | undefined;
	id: string | undefined;
	sourceLine: number | undefined;
	sourceFile?: string | undefined;
	sourcePath?: string | undefined;
	sourceDirectory?: string | undefined;
	parent?: OfficialBlockSurface;
	siblings?: OfficialBlockSurface[];
	children: OfficialBlockSurface[];
	indexInParent: number;
};

export function walkOfficialBlocks(
	officialDocument: AsciidoctorBlock,
): OfficialBlockSurface[] {
	const roots = childBlocksOf(officialDocument).map((block, index) =>
		walkBlock(block, undefined, index),
	);
	for (const root of roots) {
		root.siblings = roots;
	}
	return roots.flatMap(flattenSurface);
}

function walkBlock(
	block: AsciidoctorBlock,
	parent: OfficialBlockSurface | undefined,
	indexInParent: number,
): OfficialBlockSurface {
	const sourceLocation = block.getSourceLocation?.();
	const surface: OfficialBlockSurface = {
		block,
		context: block.getContext?.(),
		nodeName: block.getNodeName?.(),
		level: block.getLevel?.(),
		title: block.getTitle?.(),
		id: block.getId?.(),
		sourceLine: sourceLocation?.getLineNumber?.(),
		sourceFile: sourceLocation?.getFile?.(),
		sourcePath: sourceLocation?.getPath?.(),
		sourceDirectory: sourceLocation?.getDirectory?.(),
		children: [],
		indexInParent,
	};
	if (parent) {
		surface.parent = parent;
	}
	surface.children = childBlocksOf(block).map((child, index) =>
		walkBlock(child, surface, index),
	);
	return surface;
}

function flattenSurface(surface: OfficialBlockSurface): OfficialBlockSurface[] {
	return [surface, ...surface.children.flatMap(flattenSurface)];
}
