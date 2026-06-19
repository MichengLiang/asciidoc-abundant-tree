export type ParsedMacroArguments = {
	readonly positional: readonly string[];
	readonly named: Readonly<Record<string, string>>;
};

export function parseMacroArguments(raw: string): ParsedMacroArguments {
	const positional: string[] = [];
	const named: Record<string, string> = {};
	const parts = splitMacroArgumentParts(raw);

	if (parts.length === 1 && parts[0] === "") {
		return { positional, named };
	}

	for (const part of parts) {
		const equalsIndex = part.indexOf("=");
		if (equalsIndex === -1) {
			positional.push(unquoteMacroArgumentValue(part));
			continue;
		}

		const key = part.slice(0, equalsIndex).trim();
		if (key === "") {
			positional.push(unquoteMacroArgumentValue(part));
			continue;
		}

		named[key] = unquoteMacroArgumentValue(part.slice(equalsIndex + 1).trim());
	}

	return { positional, named };
}

function splitMacroArgumentParts(raw: string): string[] {
	const parts: string[] = [];
	let current = "";
	let inQuote = false;
	for (const character of raw) {
		if (character === '"') {
			inQuote = !inQuote;
			current += character;
			continue;
		}
		if (character === "," && !inQuote) {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += character;
	}
	parts.push(current.trim());
	return parts;
}

function unquoteMacroArgumentValue(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	return value;
}
