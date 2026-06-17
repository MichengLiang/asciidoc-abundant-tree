import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Store } from "oxigraph";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, "basic-projection.adoc");
const modelPath = resolve(__dirname, "structure-model.ttl");

function main() {
	const repoRoot = findRepoRoot(__dirname);
	const store = new Store();
	store.load(projectSample(repoRoot, samplePath), { format: "text/turtle" });
	store.load(readFileSync(modelPath, "utf8"), { format: "text/turtle" });

	const inferred = store.query(`
		PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
		CONSTRUCT { ?source ?superRelation ?target }
		WHERE {
			?relation rdfs:subPropertyOf ?superRelation .
			?source ?relation ?target .
		}
	`);

	for (const quad of inferred) {
		store.add(quad);
	}

	console.log("RDF12 Oxigraph model query report");
	console.log(`Inferred relation quads: ${inferred.length}`);
	console.log();
	printInferredRelations(store);
	console.log();
	printXrefEvidence(store);
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

function printInferredRelations(store) {
	console.log("Model relations:");
	for (const row of store.query(`
		PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
		PREFIX ex: <https://micheng.dev/ns/structure-model#>
		SELECT ?kind ?sourceHeadline ?targetHeadline WHERE {
			VALUES (?relation ?kind) {
				(ex:dependency "dependency")
				(ex:evidenceLink "evidence-link")
			}
			?source ?relation ?target .
			?source aat:headline ?sourceHeadline .
			?target aat:headline ?targetHeadline .
		}
		ORDER BY ?kind ?sourceHeadline ?targetHeadline
	`)) {
		console.log(
			`  ${row.get("sourceHeadline").value} --${row.get("kind").value}--> ${
				row.get("targetHeadline").value
			}`,
		);
	}
}

function printXrefEvidence(store) {
	console.log("Xref evidence:");
	for (const row of store.query(`
		PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
		PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
		PREFIX rel: <https://micheng.dev/ns/asciidoc-relation#>
		SELECT ?sourceHeadline ?relationLabel ?targetHeadline ?raw ?line ?officialType WHERE {
			?edge a aat:XrefEdge ;
				rdf:reifies ?statement ;
				aat:sourceHeading ?source ;
				aat:targetHeading ?target ;
				aat:raw ?raw ;
				aat:startLine ?line ;
				aat:officialResolvedType ?officialType .
			?source aat:headline ?sourceHeadline .
			?target aat:headline ?targetHeadline .
			OPTIONAL { ?edge aat:rel ?explicitRel }
			BIND(COALESCE(?explicitRel, "references") AS ?relationLabel)
		}
		ORDER BY ?sourceHeadline ?raw
	`)) {
		console.log(
			`  line ${row.get("line").value}: ${row.get("sourceHeadline").value} --${
				row.get("relationLabel").value
			}--> ${row.get("targetHeadline").value} (${
				row.get("officialType").value
			})`,
		);
		console.log(`    raw: ${row.get("raw").value}`);
	}
}

main();
