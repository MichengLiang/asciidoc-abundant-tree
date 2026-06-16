import type { BookEntryDiagnostic } from "./diagnostics";

export type IncludeAttributes = {
	readonly raw: string;
	readonly entries: readonly IncludeAttributeEntry[];
	readonly classification: "empty" | "mapped" | "unmapped";
	readonly surfaces: readonly IncludeAttributeSurface[];
	readonly diagnostics: readonly BookEntryDiagnostic[];
};

export type IncludeAttributeEntry = {
	readonly name: string;
	readonly value: string | true;
};

export type IncludeAttributeSurface =
	| { readonly kind: "tag"; readonly name: string }
	| { readonly kind: "tags"; readonly expression: string }
	| { readonly kind: "lines"; readonly expression: string }
	| { readonly kind: "indent"; readonly columns: number }
	| { readonly kind: "leveloffset"; readonly value: string }
	| { readonly kind: "optional" };

const mappedAttributeNames = new Set([
	"tag",
	"tags",
	"lines",
	"indent",
	"leveloffset",
	"opts",
]);

export function parseIncludeAttributes(attrlist: string): IncludeAttributes {
	const entries = splitAttrlist(attrlist).map(parseAttributeEntry);
	const diagnostics: BookEntryDiagnostic[] = [];
	const surfaces: IncludeAttributeSurface[] = [];

	for (const entry of entries) {
		if (!mappedAttributeNames.has(entry.name)) {
			diagnostics.push(unmappedAttrDiagnostic(entry.name));
			continue;
		}
		switch (entry.name) {
			case "tag":
				if (typeof entry.value === "string") {
					surfaces.push({ kind: "tag", name: entry.value });
				}
				break;
			case "tags":
				if (typeof entry.value === "string") {
					surfaces.push({ kind: "tags", expression: entry.value });
				}
				break;
			case "lines":
				if (typeof entry.value === "string") {
					surfaces.push({ kind: "lines", expression: entry.value });
				}
				break;
			case "indent":
				if (typeof entry.value === "string" && /^-?\d+$/u.test(entry.value)) {
					surfaces.push({ kind: "indent", columns: Number(entry.value) });
				}
				break;
			case "leveloffset":
				if (typeof entry.value === "string") {
					surfaces.push({ kind: "leveloffset", value: entry.value });
				}
				break;
			case "opts":
				if (
					typeof entry.value === "string" &&
					entry.value.split(/[;,]/u).includes("optional")
				) {
					surfaces.push({ kind: "optional" });
				}
				break;
		}
	}

	return {
		raw: attrlist,
		entries,
		classification:
			entries.length === 0
				? "empty"
				: diagnostics.length > 0
					? "unmapped"
					: "mapped",
		surfaces,
		diagnostics,
	};
}

export function firstSelectionSurface(
	attributes: IncludeAttributes,
):
	| Extract<IncludeAttributeSurface, { kind: "tag" | "tags" | "lines" }>
	| undefined {
	return attributes.surfaces.find(
		(
			surface,
		): surface is Extract<
			IncludeAttributeSurface,
			{ kind: "tag" | "tags" | "lines" }
		> =>
			surface.kind === "tag" ||
			surface.kind === "tags" ||
			surface.kind === "lines",
	);
}

export function hasOptionalSurface(attributes: IncludeAttributes): boolean {
	return attributes.surfaces.some((surface) => surface.kind === "optional");
}

export function indentSurface(
	attributes: IncludeAttributes,
): Extract<IncludeAttributeSurface, { kind: "indent" }> | undefined {
	return attributes.surfaces.find(
		(
			surface,
		): surface is Extract<IncludeAttributeSurface, { kind: "indent" }> =>
			surface.kind === "indent",
	);
}

export function hasLeveloffsetSurface(attributes: IncludeAttributes): boolean {
	return attributes.surfaces.some((surface) => surface.kind === "leveloffset");
}

function splitAttrlist(attrlist: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (const char of attrlist.trim()) {
		if ((char === `"` || char === "'") && quote === undefined) {
			quote = char;
			current += char;
			continue;
		}
		if (quote === char) {
			quote = undefined;
			current += char;
			continue;
		}
		if (char === "," && quote === undefined) {
			if (current.trim() !== "") {
				parts.push(current.trim());
			}
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim() !== "") {
		parts.push(current.trim());
	}
	return parts;
}

function parseAttributeEntry(raw: string): IncludeAttributeEntry {
	const equalsIndex = raw.indexOf("=");
	if (equalsIndex === -1) {
		return { name: raw.trim(), value: true };
	}
	return {
		name: raw.slice(0, equalsIndex).trim(),
		value: unquote(raw.slice(equalsIndex + 1).trim()),
	};
}

function unquote(value: string): string {
	if (
		(value.startsWith(`"`) && value.endsWith(`"`)) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function unmappedAttrDiagnostic(name: string): BookEntryDiagnostic {
	return {
		level: "error",
		code: "include.attrlist-unmapped",
		message: `Include attribute '${name}' has no source mapping rule.`,
	};
}
