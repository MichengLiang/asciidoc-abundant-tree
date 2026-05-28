export type ParsedMacroArguments = {
	readonly positional: readonly string[];
	readonly named: Readonly<Record<string, string>>;
};

export function parseMacroArguments(raw: string): ParsedMacroArguments {
	const positional: string[] = [];
	const named: Record<string, string> = {};
	const parts = raw.split(",").map((part) => part.trim());

	if (parts.length === 1 && parts[0] === "") {
		return { positional, named };
	}

	for (const part of parts) {
		const equalsIndex = part.indexOf("=");
		if (equalsIndex === -1) {
			positional.push(part);
			continue;
		}

		const key = part.slice(0, equalsIndex).trim();
		if (key === "") {
			positional.push(part);
			continue;
		}

		named[key] = part.slice(equalsIndex + 1).trim();
	}

	return { positional, named };
}
