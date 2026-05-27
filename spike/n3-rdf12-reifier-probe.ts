import assert from "node:assert/strict";
import {
	type BaseQuad,
	DataFactory,
	Parser,
	type Quad,
	Store,
	type Term,
	Writer,
} from "n3";

const { literal, namedNode, quad, triple } = DataFactory;

const prefixes = {
	aat: "https://micheng.dev/ns/asciidoc-abundant-tree#",
	rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
	xsd: "http://www.w3.org/2001/XMLSchema#",
};

function termLabel(term: Term | BaseQuad): string {
	if (term.termType === "Quad") {
		const embedded = term as Quad;
		return `<<(${termLabel(embedded.subject)} ${termLabel(embedded.predicate)} ${termLabel(embedded.object)})>>`;
	}
	if (term.termType === "Literal") {
		return `"${term.value}"`;
	}
	return `${term.termType}:${term.value}`;
}

function writeTurtle(quads: Quad[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const writer = new Writer({ format: "text/turtle", prefixes });
		writer.addQuads(quads);
		writer.end((error, result) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(result);
		});
	});
}

const sectionIntro = namedNode("urn:aat:doc:demo#section-l8-o0");
const sectionCore = namedNode("urn:aat:doc:demo#section-l25-o0");
const references = namedNode(`${prefixes.aat}references`);
const xref = namedNode("urn:aat:doc:demo#xref-l10-c60-o0");
const rdfReifies = namedNode(`${prefixes.rdf}reifies`);
const targetSelector = namedNode(`${prefixes.aat}targetSelector`);
const startLine = namedNode(`${prefixes.aat}startLine`);

const relation = triple(sectionIntro, references, sectionCore);
const reifier = quad(xref, rdfReifies, relation);
const assertedRelation = quad(sectionIntro, references, sectionCore);
const selector = quad(xref, targetSelector, literal("3. 核心引擎设计"));
const start = quad(
	xref,
	startLine,
	literal("10", namedNode(`${prefixes.xsd}integer`)),
);

assert.equal(reifier.object.termType, "Quad");
assert.equal(
	termLabel(reifier.object),
	"<<(NamedNode:urn:aat:doc:demo#section-l8-o0 NamedNode:https://micheng.dev/ns/asciidoc-abundant-tree#references NamedNode:urn:aat:doc:demo#section-l25-o0)>>",
);

const quads = [assertedRelation, reifier, selector, start];
const turtle = await writeTurtle(quads);

console.log("=== WRITTEN TURTLE ===");
console.log(turtle);

assert.match(turtle, /rdf:reifies\s+<<\(/u);
assert.match(turtle, /aat:references/u);
assert.match(turtle, /"3\. 核心引擎设计"/u);

const parsed = new Parser<Quad>({ format: "text/turtle" }).parse(turtle);
const store = new Store(parsed);

console.log("=== PARSED QUADS ===");
for (const parsedQuad of parsed) {
	console.log(
		[
			termLabel(parsedQuad.subject),
			termLabel(parsedQuad.predicate),
			termLabel(parsedQuad.object),
		].join(" "),
	);
}

assert.equal(parsed.length, quads.length);
assert.equal(store.countQuads(sectionIntro, references, sectionCore, null), 1);

const parsedReifier = store.getQuads(xref, rdfReifies, null, null);
assert.equal(parsedReifier.length, 1);
assert.equal(parsedReifier[0]?.object.termType, "Quad");

const parsedTripleTerm = parsedReifier[0]?.object as Quad | undefined;
assert.equal(parsedTripleTerm?.subject.equals(sectionIntro), true);
assert.equal(parsedTripleTerm?.predicate.equals(references), true);
assert.equal(parsedTripleTerm?.object.equals(sectionCore), true);

const rewritten = await writeTurtle(parsed as Quad[]);
console.log("=== REWRITTEN TURTLE ===");
console.log(rewritten);

const reparsed = new Parser({ format: "text/turtle" }).parse(rewritten);
assert.equal(new Store(reparsed).countQuads(xref, rdfReifies, null, null), 1);

console.log(
	"RESULT: N3 can write, parse, store, and roundtrip RDF 1.2 reifier triple terms for this use case.",
);
