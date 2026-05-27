import assert from "node:assert/strict";
import {
	DataFactory,
	Parser,
	Store,
	Writer,
	type Literal,
	type Quad,
} from "n3";

const { literal, namedNode, quad, triple } = DataFactory;

const prefixes = {
	aat: "https://micheng.dev/ns/asciidoc-abundant-tree#",
	rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
	rel: "https://micheng.dev/ns/asciidoc-relation#",
	xsd: "http://www.w3.org/2001/XMLSchema#",
};

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

const source = namedNode("urn:aat:doc:demo#section-l1-o0");
const target = namedNode("urn:aat:doc:demo#section-l12-o0");
const predicate = namedNode(`${prefixes.rel}depends-on`);
const relation = triple(source, predicate, target);

const xrefA = namedNode("urn:aat:doc:demo#xref-l4-c7-o0");
const xrefB = namedNode("urn:aat:doc:demo#xref-l8-c9-o0");
const rdfReifies = namedNode(`${prefixes.rdf}reifies`);
const targetNode = namedNode(`${prefixes.aat}targetNode`);
const candidateNode = namedNode(`${prefixes.aat}candidateNode`);
const startLine = namedNode(`${prefixes.aat}startLine`);
const rawRel = namedNode(`${prefixes.aat}rawRel`);

const repeatedRelation = quad(source, predicate, target);
const quads = [
	repeatedRelation,
	repeatedRelation,
	quad(xrefA, rdfReifies, relation),
	quad(xrefB, rdfReifies, relation),
	quad(xrefA, targetNode, target),
	quad(xrefB, candidateNode, target),
	quad(xrefA, startLine, literal("4", namedNode(`${prefixes.xsd}integer`))),
	quad(xrefA, rawRel, literal("depends-on")),
];

const store = new Store(quads);

assert.equal(store.countQuads(source, predicate, target, null), 1);
assert.equal(store.countQuads(null, rdfReifies, relation, null), 2);
assert.equal(store.countQuads(xrefB, targetNode, null, null), 0);
assert.equal(store.countQuads(xrefB, candidateNode, target, null), 1);

const lineLiteral = store.getQuads(xrefA, startLine, null, null)[0]
	?.object as Literal | undefined;
assert.equal(lineLiteral?.termType, "Literal");
assert.equal(lineLiteral?.datatype.value, `${prefixes.xsd}integer`);
assert.equal(lineLiteral?.value, "4");

const turtle = await writeTurtle(store.getQuads(null, null, null, null));
console.log("=== EDGE TURTLE ===");
console.log(turtle);

assert.match(turtle, /rel:depends-on/u);
assert.match(turtle, /rdf:reifies\s+<<\(/u);
assert.match(turtle, /aat:candidateNode/u);
assert.match(turtle, /aat:startLine 4/u);

const parsed = new Parser<Quad>({ format: "text/turtle" }).parse(turtle);
const parsedStore = new Store(parsed);

assert.equal(parsedStore.countQuads(source, predicate, target, null), 1);
assert.equal(parsedStore.countQuads(null, rdfReifies, relation, null), 2);
assert.equal(parsedStore.countQuads(xrefB, targetNode, null, null), 0);
assert.equal(parsedStore.countQuads(xrefB, candidateNode, target, null), 1);

console.log("RESULT: N3 Store deduplicates asserted triples, preserves multiple reifiers, candidate nodes, and xsd integer literals.");
