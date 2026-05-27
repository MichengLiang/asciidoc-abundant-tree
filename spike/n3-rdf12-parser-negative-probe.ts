import assert from "node:assert/strict";
import { Parser, type Quad } from "n3";

const valid = `
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<urn:aat:doc:demo#xref-l1-c1-o0>
  rdf:reifies <<(<urn:aat:doc:demo#s> aat:references <urn:aat:doc:demo#t>)>>.
`;

const invalidTripleTerm = `
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<urn:aat:doc:demo#xref-l1-c1-o0>
  rdf:reifies "<<(<urn:aat:doc:demo#s> aat:references <urn:aat:doc:demo#t>)>>".
`;

const parsed = new Parser<Quad>({ format: "text/turtle" }).parse(valid);
assert.equal(parsed.length, 1);
assert.equal(parsed[0]?.object.termType, "Quad");

const parsedInvalid = new Parser<Quad>({ format: "text/turtle" }).parse(
	invalidTripleTerm,
);
assert.equal(parsedInvalid.length, 1);
assert.equal(parsedInvalid[0]?.object.termType, "Literal");

console.log(
	"RESULT: The parser distinguishes a real Turtle 1.2 triple term from a string literal that only looks like one.",
);
