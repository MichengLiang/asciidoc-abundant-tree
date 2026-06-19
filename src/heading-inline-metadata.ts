import { parseMacroArguments } from "./macro-argument-parser";

export type InterpretedHeadingInlineMetadata =
	| {
			ok: true;
			field: string;
			value: string;
			label?: string;
			displayText: string;
	  }
	| {
			ok: false;
			reason: "missing-value";
			field: string;
	  };

export function interpretHeadingInlineMetadataAttributes(
	field: string,
	rawAttributes: string,
): InterpretedHeadingInlineMetadata {
	const parsed = parseMacroArguments(rawAttributes);
	const value =
		Object.hasOwn(parsed.named, "value") && parsed.named.value !== undefined
			? parsed.named.value
			: parsed.positional[0];
	if (value === undefined) {
		return {
			ok: false,
			reason: "missing-value",
			field,
		};
	}
	const label = parsed.named.label;
	return {
		ok: true,
		field,
		value,
		...(label !== undefined ? { label } : {}),
		displayText: label ?? value,
	};
}
