import type {
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	TargetNode,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";

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

// 官方层只记官方事实：官方按自己的规则找到目标时，给出它在 target 目录里的类型。引用是否成立不在这里判断，
// 由 RDF 投影按作者写下的地址在 label space 里绑定（09 号书第 8 章 Binding Merge）。
export function completeXrefTargetTypes(
	xrefs: XrefOccurrenceNode[],
	targets: TargetNode[],
): void {
	const targetsById = new Map(targets.map((target) => [target.id, target]));
	for (const xref of xrefs) {
		const resolvedId = xref.asciidoctor?.resolvedId;
		const target =
			resolvedId === undefined ? undefined : targetsById.get(resolvedId);
		if (!target) {
			continue;
		}
		xref.asciidoctor = definedObject({
			...xref.asciidoctor,
			resolvedType: target.targetType,
		}) as AsciidoctorLayer;
	}
}
