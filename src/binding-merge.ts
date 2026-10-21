import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
	OfficialXrefBinding,
} from "./asciidoctor-adapter";
import type {
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	TargetNode,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";

// 投影时登记、投影后取回：一个块里的 xref 要问转换器它们的官方链接。转换是异步的，投影是同步的——投影只登记，
// 不等；xref 节点是同一批对象，取回后原地写上 asciidoctor 层，bindXrefs 在这之后再按 resolvedId 认目标。
export type OfficialBindingRequest = {
	readonly block: AsciidoctorBlock;
	readonly xrefs: XrefOccurrenceNode[];
};

export async function resolveOfficialBindings(
	requests: readonly OfficialBindingRequest[],
	officialDocument: AsciidoctorBlock,
	adapter: Pick<AsciidoctorAdapter, "resolveXrefBinding">,
): Promise<void> {
	for (const { block, xrefs } of requests) {
		const bindings = [];
		for (const xref of xrefs) {
			bindings.push(
				await adapter.resolveXrefBinding(officialDocument, block, xref),
			);
		}
		applyOfficialBindings(xrefs, bindings);
	}
}

export function addTarget(targets: TargetNode[], target: TargetNode): void {
	if (!target.id || targets.some((existing) => existing.id === target.id)) {
		return;
	}
	targets.push(target);
}

export function addAnchorTargets(
	targets: TargetNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (const anchor of anchorOccurrences) {
		for (const id of anchor.ids) {
			const existing = targets.find((target) => target.id === id);
			const targetType =
				existing || anchor.anchorScope === "block" ? "block" : "inline-anchor";
			addTarget(
				targets,
				definedObject({
					kind: "target",
					id,
					targetType,
					title: anchor.reftext,
					idOrigin: "source",
					sourceSpan: anchor.sourceSpan,
					containingSectionId: anchor.containingSectionId,
					asciidoctor: definedObject({
						resolvedId: id,
						resolvedType: targetType,
						reftext: anchor.reftext,
					}) as AsciidoctorLayer,
				}) as TargetNode,
			);
		}
	}
}

function applyOfficialBindings(
	xrefs: XrefOccurrenceNode[],
	bindings: Array<OfficialXrefBinding | undefined>,
): void {
	for (const [index, xref] of xrefs.entries()) {
		const binding = bindings[index];
		if (!binding?.href) {
			continue;
		}
		if (!binding.href.startsWith("#")) {
			xref.scope = "external";
		}
		xref.asciidoctor = definedObject({
			href: binding.href,
			resolvedId: binding.resolvedId,
			reftext: binding.reftext,
		}) as AsciidoctorLayer;
	}
}

export function bindXrefs(
	xrefs: XrefOccurrenceNode[],
	targets: TargetNode[],
): void {
	const targetsById = new Map(targets.map((target) => [target.id, target]));
	for (const xref of xrefs) {
		if (xref.scope === "external") {
			continue;
		}
		const officialId = xref.asciidoctor?.resolvedId;
		const target = officialId
			? targetsById.get(officialId)
			: targetsById.get(xref.target);
		if (!target) {
			xref.scope = "unresolved";
			continue;
		}
		xref.scope = "local";
		xref.asciidoctor = definedObject({
			...xref.asciidoctor,
			resolvedId: xref.asciidoctor?.resolvedId ?? target.id,
			resolvedType: target.targetType,
			reftext: xref.asciidoctor?.reftext ?? target.title,
		}) as AsciidoctorLayer;
	}
}
