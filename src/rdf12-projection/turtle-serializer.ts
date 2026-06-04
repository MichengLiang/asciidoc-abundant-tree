import { Writer } from "n3";
import { rdf12GraphToN3Quads } from "./n3-adapter";
import type { Rdf12Projection } from "./projector";

export function serializeRdf12ProjectionToTurtle(
	projection: Rdf12Projection,
): string {
	return writeTurtleSync(
		rdf12GraphToN3Quads(projection.graph),
		projection.prefixes,
	);
}

function writeTurtleSync(
	quads: Parameters<Writer["addQuads"]>[0],
	prefixes: Rdf12Projection["prefixes"],
): string {
	let output = "";
	let writerError: Error | null = null;
	const writer = new Writer({
		format: "text/turtle",
		prefixes,
	});

	writer.addQuads(quads);
	writer.end((error, result) => {
		if (error) {
			writerError = error;
			return;
		}
		output = result;
	});

	if (writerError !== null) {
		throw writerError;
	}

	return formatReadableRawLiterals(output);
}

function formatReadableRawLiterals(turtle: string): string {
	const chunks: string[] = [];
	let lastCopiedIndex = 0;
	let index = 0;

	while (index < turtle.length) {
		if (turtle[index] === "<") {
			index = skipIriReference(turtle, index);
			continue;
		}

		if (turtle[index] === '"') {
			index = skipQuotedString(turtle, index) ?? index + 1;
			continue;
		}

		if (!startsRawPredicate(turtle, index)) {
			index += 1;
			continue;
		}

		const objectStart = skipWhitespace(index + "aat:raw".length, turtle);
		const quotedLiteral = readQuotedStringLiteral(turtle, objectStart);
		if (
			quotedLiteral === null ||
			quotedLiteral.hasSuffix ||
			!quotedLiteral.value.includes("\n")
		) {
			index += "aat:raw".length;
			continue;
		}

		chunks.push(turtle.slice(lastCopiedIndex, objectStart));
		chunks.push(encodeLongStringLiteral(quotedLiteral.value));
		lastCopiedIndex = quotedLiteral.end;
		index = quotedLiteral.end;
	}

	if (lastCopiedIndex === 0) {
		return turtle;
	}

	chunks.push(turtle.slice(lastCopiedIndex));
	return chunks.join("");
}

function startsRawPredicate(turtle: string, index: number): boolean {
	return (
		turtle.startsWith("aat:raw", index) &&
		!isTurtleNameCharacter(turtle[index - 1]) &&
		!isTurtleNameCharacter(turtle[index + "aat:raw".length])
	);
}

function isTurtleNameCharacter(character: string | undefined): boolean {
	return character !== undefined && /[A-Za-z0-9_:-]/u.test(character);
}

function skipWhitespace(index: number, turtle: string): number {
	let current = index;
	while (current < turtle.length && /\s/u.test(turtle[current] ?? "")) {
		current += 1;
	}
	return current;
}

function skipIriReference(turtle: string, start: number): number {
	let index = start + 1;
	while (index < turtle.length && turtle[index] !== ">") {
		index += turtle[index] === "\\" ? 2 : 1;
	}
	return index < turtle.length ? index + 1 : turtle.length;
}

type QuotedLiteral = {
	readonly value: string;
	readonly end: number;
	readonly hasSuffix: boolean;
};

function readQuotedStringLiteral(
	turtle: string,
	start: number,
): QuotedLiteral | null {
	if (turtle[start] !== '"' || turtle.startsWith('"""', start)) {
		return null;
	}

	let value = "";
	let index = start + 1;
	while (index < turtle.length) {
		const character = turtle[index];
		if (character === undefined) {
			return null;
		}
		if (character === '"') {
			const end = index + 1;
			return {
				value,
				end,
				hasSuffix: turtle.startsWith("^^", end) || turtle[end] === "@",
			};
		}
		if (character === "\\") {
			const escapeRead = readEscape(turtle, index);
			if (escapeRead === null) {
				return null;
			}
			value += escapeRead.value;
			index = escapeRead.end;
			continue;
		}
		value += character;
		index += 1;
	}

	return null;
}

function skipQuotedString(turtle: string, start: number): number | null {
	const delimiterLength = turtle.startsWith('"""', start) ? 3 : 1;
	let index = start + delimiterLength;

	while (index < turtle.length) {
		if (turtle[index] === "\\") {
			index += 2;
			continue;
		}
		if (turtle.startsWith('"'.repeat(delimiterLength), index)) {
			return index + delimiterLength;
		}
		index += 1;
	}

	return null;
}

type EscapeRead = {
	readonly value: string;
	readonly end: number;
};

function readEscape(turtle: string, start: number): EscapeRead | null {
	const escaped = turtle[start + 1];
	switch (escaped) {
		case "t":
			return { value: "\t", end: start + 2 };
		case "b":
			return { value: "\b", end: start + 2 };
		case "n":
			return { value: "\n", end: start + 2 };
		case "r":
			return { value: "\r", end: start + 2 };
		case "f":
			return { value: "\f", end: start + 2 };
		case '"':
			return { value: '"', end: start + 2 };
		case "'":
			return { value: "'", end: start + 2 };
		case "\\":
			return { value: "\\", end: start + 2 };
		case "u":
			return readUnicodeEscape(turtle, start, 4);
		case "U":
			return readUnicodeEscape(turtle, start, 8);
		default:
			return null;
	}
}

function readUnicodeEscape(
	turtle: string,
	start: number,
	digitCount: number,
): EscapeRead | null {
	const digits = turtle.slice(start + 2, start + 2 + digitCount);
	if (!new RegExp(`^[0-9A-Fa-f]{${digitCount}}$`, "u").test(digits)) {
		return null;
	}

	const codePoint = Number.parseInt(digits, 16);
	if (codePoint > 0x10ffff) {
		return null;
	}

	return {
		value: String.fromCodePoint(codePoint),
		end: start + 2 + digitCount,
	};
}

function encodeLongStringLiteral(value: string): string {
	const delimiter = selectLongStringDelimiter(value);

	return `${delimiter}${encodeLongStringBody(value, delimiter)}${delimiter}`;
}

function selectLongStringDelimiter(value: string): `"""` | "'''" {
	if (!value.includes('"""')) {
		return '"""';
	}
	if (!value.includes("'''")) {
		return "'''";
	}
	return '"""';
}

function encodeLongStringBody(value: string, delimiter: `"""` | "'''"): string {
	let body = "";
	let index = 0;

	while (index < value.length) {
		if (value.startsWith(delimiter, index)) {
			body += `${delimiter.slice(0, -1)}\\${delimiter.at(-1)}`;
			index += delimiter.length;
			continue;
		}

		const character = value[index] ?? "";
		body += encodeLongStringCharacter(character);
		index += 1;
	}

	return body;
}

function encodeLongStringCharacter(character: string): string {
	switch (character) {
		case "\\":
			return "\\\\";
		case "\n":
			return "\n";
		case "\r":
			return "\\r";
		case "\t":
			return "\\t";
		case "\b":
			return "\\b";
		case "\f":
			return "\\f";
		default:
			return character < " " ? unicodeEscape(character) : character;
	}
}

function unicodeEscape(character: string): string {
	return `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`;
}
