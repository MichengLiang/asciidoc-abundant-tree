import { DataFactory, Writer } from "n3";

const { quad } = DataFactory;

export async function writeBusinessTurtle(triples) {
	const writer = new Writer({
		format: "text/turtle",
		prefixes: {
			kg: "https://micheng.dev/ns/business-kg-demo#",
			res: "https://micheng.dev/ns/business-kg-demo/resource/",
			rel: "https://micheng.dev/ns/asciidoc-relation#",
			rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
			rdfs: "http://www.w3.org/2000/01/rdf-schema#",
		},
	});
	writer.addQuads(
		triples.map(([subject, predicate, object]) =>
			quad(subject, predicate, object),
		),
	);
	return new Promise((resolve, reject) => {
		writer.end((error, result) => {
			if (error) reject(error);
			else resolve(result);
		});
	});
}
