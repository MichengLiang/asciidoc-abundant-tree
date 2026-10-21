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
	// 宏属性里的位置参数以 "1"、"2"… 为键（Asciidoctor 的 attributes[1]）；其余键是命名参数。
	const positional: string[] = [];
	const named: Record<string, string> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (typeof value !== "string") {
			continue;
		}
		if (/^[1-9]\d*$/u.test(key)) {
			positional[Number(key) - 1] = value.trim();
		} else {
			named[key] = value.trim();
		}
	}
	return {
		positional: positional.filter((value) => value !== undefined),
		named,
	};
}
