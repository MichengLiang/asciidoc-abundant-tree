import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import rdf from "@zazuko/env-node";
import { Parser } from "n3";
import SHACLValidator from "rdf-validate-shacl";

const AAT = "https://micheng.dev/ns/asciidoc-abundant-tree#";
const EX = "https://micheng.dev/ns/structure-model#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, "basic-projection.adoc");
const modelPath = resolve(__dirname, "structure-model.ttl");
const shapesPath = resolve(__dirname, "structure-shapes.ttl");

async function main() {
	const repoRoot = findRepoRoot(__dirname);
	const projectionTurtle = projectSample(repoRoot, samplePath);
	const projection = datasetFromTurtle(projectionTurtle);
	const model = datasetFromTurtle(readFileSync(modelPath, "utf8"));
	const shapes = datasetFromTurtle(readFileSync(shapesPath, "utf8"));

	const data = rdf.dataset([...projection, ...model]);
	const appliedMappings = applyRoleClasses(data, model);

	const validator = new SHACLValidator(shapes, { factory: rdf });
	const report = await validator.validate(data);

	console.log("RDF12 SHACL validation report");
	console.log(`Projection quads: ${projection.size}`);
	console.log(`Model quads: ${model.size}`);
	console.log(`Shape quads: ${shapes.size}`);
	console.log(`Role class assertions: ${appliedMappings}`);
	console.log();
	console.log(`Conforms: ${report.conforms}`);
	console.log(`Violations: ${report.results.length}`);

	if (report.results.length > 0) {
		console.log();
		console.log("Violation details:");
		for (const result of report.results) {
			printViolation(data, result);
		}
		process.exitCode = 1;
	}
}

function findRepoRoot(start) {
	let current = resolve(start);
	while (current !== dirname(current)) {
		if (
			fileExists(resolve(current, "package.json")) &&
			fileExists(resolve(current, "src/cli.ts"))
		) {
			return current;
		}
		current = dirname(current);
	}
	throw new Error(`Could not find repository root from ${start}`);
}

function fileExists(path) {
	try {
		readFileSync(path);
		return true;
	} catch {
		return false;
	}
}

function projectSample(repoRoot, sourcePath) {
	return execFileSync(
		"pnpm",
		["--silent", "dev", relative(repoRoot, sourcePath), "--format", "rdf12"],
		{ cwd: repoRoot, encoding: "utf8" },
	);
}

function datasetFromTurtle(text) {
	const quads = new Parser({ format: "Turtle" }).parse(text);
	return rdf.dataset(
		quads.map((quad) =>
			rdf.quad(
				convertTerm(quad.subject),
				convertTerm(quad.predicate),
				convertTerm(quad.object),
				convertTerm(quad.graph),
			),
		),
	);
}

function convertTerm(term) {
	switch (term.termType) {
		case "NamedNode":
			return rdf.namedNode(term.value);
		case "BlankNode":
			return rdf.blankNode(term.value);
		case "Literal":
			return rdf.literal(
				term.value,
				term.language || rdf.namedNode(term.datatype.value),
			);
		case "DefaultGraph":
			return rdf.defaultGraph();
		case "Quad":
			return rdf.quad(
				convertTerm(term.subject),
				convertTerm(term.predicate),
				convertTerm(term.object),
				convertTerm(term.graph),
			);
		default:
			throw new Error(`Unsupported RDF term type: ${term.termType}`);
	}
}

function applyRoleClasses(data, model) {
	const mappings = new Map();
	for (const quad of model.match(null, rdf.namedNode(`${EX}roleName`), null)) {
		mappings.set(quad.object.value, quad.subject);
	}

	let count = 0;
	for (const quad of [...data.match(null, rdf.namedNode(`${AAT}role`), null)]) {
		const roleClass = mappings.get(quad.object.value);
		if (!roleClass) continue;
		data.add(rdf.quad(quad.subject, rdf.namedNode(`${RDF}type`), roleClass));
		count += 1;
	}
	return count;
}

function printViolation(data, result) {
	const focus = result.focusNode;
	const headline = firstValue(data, focus, `${AAT}headline`) ?? "(untitled)";
	const relativePath = firstValue(data, focus, `${AAT}relativePath`) ?? "?";
	const line = firstValue(data, focus, `${AAT}headingLine`) ?? "?";
	const path = result.path?.value ?? "(unknown path)";
	const message = result.message?.value ?? "(no message)";
	console.log(`  ${relativePath}:${line} ${headline}`);
	console.log(`    path: ${compactIri(path)}`);
	console.log(`    message: ${message}`);
}

function firstValue(data, subject, predicateIri) {
	return data.match(subject, rdf.namedNode(predicateIri)).toArray()[0]?.object
		.value;
}

function compactIri(iri) {
	return iri
		.replace(AAT, "aat:")
		.replace(EX, "ex:")
		.replace(RDFS, "rdfs:")
		.replace(RDF, "rdf:");
}

await main();
