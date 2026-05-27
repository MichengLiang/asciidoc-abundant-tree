import { namespaces } from "./namespaces";
import { iriTerm, literalTerm, type Rdf12LiteralTerm } from "./terms";

export function stringLiteral(value: string): Rdf12LiteralTerm {
	return literalTerm({
		value,
		datatype: iriTerm(`${namespaces.xsd}string`),
	});
}

export function integerLiteral(value: number): Rdf12LiteralTerm {
	if (!Number.isInteger(value)) {
		throw new Error(`RDF xsd:integer literal requires an integer: ${value}`);
	}

	return literalTerm({
		value: value.toString(),
		datatype: iriTerm(`${namespaces.xsd}integer`),
	});
}

export function booleanLiteral(value: boolean): Rdf12LiteralTerm {
	return literalTerm({
		value: value ? "true" : "false",
		datatype: iriTerm(`${namespaces.xsd}boolean`),
	});
}
