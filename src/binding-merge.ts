import type {
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	TargetNode,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";

type HtmlBinding = {
	href?: string | undefined;
	text: string;
};

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

export function applyOfficialBindings(
	xrefs: XrefOccurrenceNode[],
	bindings: HtmlBinding[],
): void {
	const linkBindings = bindings.filter((binding) => binding.href);
	xrefs.forEach((xref, index) => {
		const binding = linkBindings[index];
		if (!binding?.href) {
			return;
		}
		const resolvedId = binding.href.startsWith("#")
			? binding.href.slice(1)
			: binding.href.split("#").at(1);
		if (!binding.href.startsWith("#")) {
			xref.scope = "external";
		}
		xref.asciidoctor = definedObject({
			href: binding.href,
			resolvedId,
			reftext: binding.text,
		}) as AsciidoctorLayer;
	});
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
