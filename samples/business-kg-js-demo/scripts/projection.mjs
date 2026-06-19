import { execFileSync } from "node:child_process";
import { DataFactory, Parser } from "n3";

const { namedNode } = DataFactory;

export const NS = {
	aat: "https://micheng.dev/ns/asciidoc-abundant-tree#",
	rel: "https://micheng.dev/ns/asciidoc-relation#",
	rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
};

export function projectFixture(repoRoot, fixturePath) {
	return execFileSync(
		"pnpm",
		["--silent", "dev", fixturePath, "--format", "rdf12"],
		{ cwd: repoRoot, encoding: "utf8" },
	);
}

export function parseTurtle(turtle) {
	const quads = new Parser({ format: "Turtle" }).parse(turtle);
	return new RdfDataset(quads);
}

export class RdfDataset {
	constructor(quads) {
		this.quads = quads;
	}

	match(subject, predicate, object) {
		return this.quads.filter(
			(quad) =>
				(subject === undefined || quad.subject.equals(subject)) &&
				(predicate === undefined || quad.predicate.equals(predicate)) &&
				(object === undefined || quad.object.equals(object)),
		);
	}

	objects(subject, predicate) {
		return this.match(subject, predicate, undefined).map((quad) => quad.object);
	}

	subjects(predicate, object) {
		return this.match(undefined, predicate, object).map((quad) => quad.subject);
	}

	literal(subject, predicate) {
		return this.objects(subject, predicate)[0]?.value;
	}

	literals(subject, predicate) {
		return this.objects(subject, predicate).map((term) => term.value);
	}
}

export function aat(localName) {
	return namedNode(`${NS.aat}${localName}`);
}

export function rel(localName) {
	return namedNode(`${NS.rel}${localName}`);
}

export function rdf(localName) {
	return namedNode(`${NS.rdf}${localName}`);
}
