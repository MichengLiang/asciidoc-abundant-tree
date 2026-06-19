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
	rawAttributes: string | Record<string, unknown>,
): InterpretedHeadingInlineMetadata {
	const parsed =
		typeof rawAttributes === "string"
			? parseMacroArguments(rawAttributes)
			: macroArgumentsFromAttributeRecord(rawAttributes);
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

function macroArgumentsFromAttributeRecord(
	attributes: Record<string, unknown>,
): ReturnType<typeof parseMacroArguments> {
	const positional = Array.isArray(attributes.$positional)
		? attributes.$positional
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
		: [];
	const named: Record<string, string> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (key === "$positional" || typeof value !== "string") {
			continue;
		}
		named[key] = value.trim();
	}
	return { positional, named };
}
