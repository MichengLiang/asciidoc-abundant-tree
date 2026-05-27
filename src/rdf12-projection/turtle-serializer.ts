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

	return output;
}
