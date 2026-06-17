import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	exportAnimationYaml,
	runAnimationYamlCli,
} from "../../src/animation-yaml-export/cli";
import { readBusinessNodes } from "../../src/animation-yaml-export/graph-reader";
import { parsePayloadRaw } from "../../src/animation-yaml-export/payload-parser";
import { makeAnimationYamlDocument } from "../../src/animation-yaml-export/yaml-shape";
import { parseAbundantTree, rdf12 } from "../../src/index";
import {
	createRdf12Graph,
	type Rdf12Graph,
	type Rdf12IriTerm,
	rdf12Triple,
} from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { iriTerm } from "../../src/rdf12-projection/terms";

const fixtureRoot = join(process.cwd(), "test/fixtures/animation-yaml");
const fixtureBook = join(fixtureRoot, "book.adoc");

describe("animation YAML export", () => {
	it("exports animation profile, source, bible, structure, script, storyboard, and review data", () => {
		const result = exportAnimationYaml({
			sourcePath: fixtureBook,
			documentRoot: fixtureRoot,
		});
		const yaml = parse(result.yaml);

		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				code: "payload_parse_failed",
				node: expect.stringMatching(/#payload-l\d+-o\d+$/u),
				message: expect.stringContaining("Failed to parse json payload"),
			}),
		);
		expect(yaml.schema_version).toBe("1.0");
		expect(yaml.adaptation_profile).toMatchObject({
			id: "profile-animation-main",
			title: "动画改编剖面",
			target: "animation-script",
			production: "animated-short",
			status: "active",
			payload: {
				adaptationTarget: "animation_script",
				productionForm: "animated_short",
			},
		});
		expectProfilePayloadHasNoSourcePayloadId();
		expect(yaml.source.chapters).toContainEqual(
			expect.objectContaining({
				id: "src-ch1",
				title: "第一章：测试章节",
				order: 1,
				source: expect.objectContaining({
					path: "source.adoc",
					start_line: 16,
				}),
			}),
		);
		expect(yaml.source.snippets).toContainEqual(
			expect.objectContaining({
				id: "src-ch1-rabbit",
				title: "白兔看表",
				event: "inciting-incident",
			}),
		);
		expect(yaml.source.events).toContainEqual(
			expect.objectContaining({
				id: "event-rabbit-appears",
				source_refs: {
					adapted_from: ["src-ch1-rabbit"],
				},
			}),
		);
		expect(yaml.story_bible.characters).toContainEqual(
			expect.objectContaining({
				id: "char-alice",
				title: "爱丽丝",
				status: "active",
				source_refs: {
					derived_from: ["src-ch1-rabbit"],
				},
				payload: {
					visualDesign: {
						motionStyle: "quick curiosity-driven steps",
					},
					voiceProfile: {
						tone: "polite and curious",
					},
				},
			}),
		);
		expect(yaml.story_bible.characters).toContainEqual(
			expect.objectContaining({
				id: "char-bad-payload",
				payload: expect.objectContaining({
					raw: '{"broken": true',
					parse_error: expect.any(String),
				}),
			}),
		);
		expect(yaml.story_bible.environments).toContainEqual(
			expect.objectContaining({
				id: "env-riverbank",
				fields: expect.objectContaining({ layer: "background" }),
				source_refs: {
					evidenced_by: ["src-ch1-rabbit"],
				},
			}),
		);
		expect(yaml.story_bible.locations).toContainEqual(
			expect.objectContaining({
				id: "loc-riverbank",
				fields: expect.objectContaining({ region: "wonderland-threshold" }),
			}),
		);
		expect(yaml.story_bible.props).toContainEqual(
			expect.objectContaining({ id: "prop-pocket-watch" }),
		);
		expect(yaml.story_bible.world_rules).toContainEqual(
			expect.objectContaining({ id: "rule-scale-elasticity" }),
		);
		expect(yaml.rules.quality_rules).toContainEqual(
			expect.objectContaining({ id: "qr-visible-audible" }),
		);
		expect(yaml.story_bible.visual_rules).toContainEqual(
			expect.objectContaining({
				id: "vr-quick-readable-silhouette",
				fields: expect.objectContaining({ palette: "bright-contrast" }),
			}),
		);
		expect(yaml.structure.beats).toContainEqual(
			expect.objectContaining({
				id: "beat-rabbit-appears",
				function: "opening-image",
				source_refs: {
					adapted_from: ["event-rabbit-appears"],
				},
			}),
		);
		expect(yaml.structure.scene_cards).toContainEqual(
			expect.objectContaining({
				id: "card-riverbank-rabbit",
				realizes: ["beat-rabbit-appears"],
				characters: ["char-alice"],
				environment: "env-riverbank",
				locations: ["loc-riverbank"],
				props: ["prop-pocket-watch"],
				constraints: ["qr-visible-audible", "vr-quick-readable-silhouette"],
				payload: expect.objectContaining({
					sceneFunction: "move Alice from boredom to pursuit",
				}),
			}),
		);
		expect(yaml.rules.adaptation_choices).toContainEqual(
			expect.objectContaining({
				id: "choice-externalize-curiosity",
				fields: expect.objectContaining({
					strategy: "externalize-inner-state",
				}),
				realizes: ["card-riverbank-rabbit"],
				payload: expect.objectContaining({
					rationale: "keep the opening readable without narration",
				}),
				relations: expect.objectContaining({
					externalizes: ["char-alice"],
					compresses: ["event-rabbit-appears"],
					reorders: ["src-ch1-rabbit"],
				}),
			}),
		);
		expect(yaml.script.scenes).toContainEqual(
			expect.objectContaining({
				id: "scene-riverbank-rabbit",
				sequence: 1,
				realizes: ["card-riverbank-rabbit"],
				source_refs: {
					adapted_from: ["src-ch1-rabbit"],
				},
				characters: ["char-alice"],
				environment: "env-riverbank",
				props: ["prop-pocket-watch"],
				constraints: ["qr-visible-audible"],
				relations: expect.objectContaining({
					depends_on: ["choice-externalize-curiosity"],
				}),
				elements: [
					expect.objectContaining({
						type: "raw_script",
						text: expect.stringContaining("EXT. RIVERBANK - AFTERNOON"),
					}),
				],
			}),
		);
		expect(yaml.storyboard.shots).toContainEqual(
			expect.objectContaining({
				id: "shot-rabbit-watch",
				scene: "scene-riverbank-rabbit",
				order: 1,
				realizes: ["scene-riverbank-rabbit"],
				assets: ["prop-pocket-watch"],
				relations: expect.objectContaining({
					pays_off: ["choice-externalize-curiosity"],
				}),
				payload: expect.objectContaining({
					framing: "close-up on pocket watch reflected in Alice's eye",
				}),
			}),
		);
		expect(yaml.review.notes).toContainEqual(
			expect.objectContaining({
				id: "review-note-rabbit",
				status: "open",
				assigned_to: "executor",
				critiques: ["scene-riverbank-rabbit"],
				evidence: ["qr-visible-audible"],
				relations: expect.objectContaining({
					approves: ["shot-rabbit-watch"],
				}),
			}),
		);
		expect(yaml.exports.mappings).toContainEqual(
			expect.objectContaining({
				id: "mapping-animation-yaml",
				target: "animation-yaml",
				relations: expect.objectContaining({
					exports_to: ["profile-animation-main", "scene-riverbank-rabbit"],
				}),
			}),
		);
		expect(yaml.metadata).toMatchObject({
			source_book: fixtureBook,
			document_root: fixtureRoot,
			warnings: [
				expect.objectContaining({
					code: "payload_parse_failed",
					node: expect.stringMatching(/#payload-l\d+-o\d+$/u),
				}),
			],
		});
	});

	it("prints YAML to stdout from the CLI runner", () => {
		const result = runAnimationYamlCli([
			fixtureBook,
			"--document-root",
			fixtureRoot,
		]);
		const yaml = parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(yaml.script.scenes[0].id).toBe("scene-riverbank-rabbit");
		expect(yaml.storyboard.shots[0].id).toBe("shot-rabbit-watch");
	});

	it("defaults CLI documentRoot to the input file directory", () => {
		const result = runAnimationYamlCli([fixtureBook]);
		const yaml = parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(yaml.metadata.document_root).toBe(fixtureRoot);
		expect(yaml.script.scenes[0].id).toBe("scene-riverbank-rabbit");
	});

	it("reports CLI help and argument errors without attempting export", () => {
		expect(runAnimationYamlCli(["--help"])).toEqual({
			code: 0,
			stdout: expect.stringContaining("animation-yaml-export <book.adoc>"),
			stderr: "",
		});
		expect(runAnimationYamlCli([])).toEqual({
			code: 1,
			stdout: "",
			stderr: expect.stringContaining("Missing input file."),
		});
		expect(runAnimationYamlCli(["book.adoc", "--document-root"])).toEqual({
			code: 1,
			stdout: "",
			stderr: "--document-root requires a value",
		});
		expect(runAnimationYamlCli(["book.adoc", "--unknown"])).toEqual({
			code: 1,
			stdout: "",
			stderr: "Unknown argument: --unknown",
		});
		expect(runAnimationYamlCli(["book.adoc", "extra.adoc"])).toEqual({
			code: 1,
			stdout: "",
			stderr: "Unexpected extra argument: extra.adoc",
		});
	});

	it("normalizes business graph nodes, relations, source refs, payload warnings, and script elements", () => {
		const graph = createRdf12Graph();
		const scene = heading("scene-generated");
		const location = heading("loc-primary");
		const secondaryLocation = heading("loc-secondary");
		const source = heading("source-event");
		const character = heading("char-alice");
		const payload = iriTerm("urn:test#payload");
		const warnings: Array<{ code: string; node?: string; message: string }> =
			[];

		add(graph, scene, "role", "animation-scene");
		add(graph, scene, "generatedAddressLabel", "scene-generated");
		add(graph, scene, "headline", "Scene From Graph");
		add(graph, scene, "sequence", integerLiteral(2));
		add(graph, scene, "field-status", "draft");
		add(graph, scene, "field-assigned-to", "director");
		add(graph, scene, "field-ready", "false");
		add(graph, scene, "relativePath", "book.adoc");
		add(graph, scene, "startLine", integerLiteral(7));
		add(graph, scene, "endLine", integerLiteral(9));
		graph.add(rdf12Triple(scene, aat("scene-payload"), payload));
		add(graph, payload, "format", "toml");
		add(graph, payload, "raw", "unsupported = true");
		addRelation(graph, scene, "adapted-from", source);
		addRelation(graph, scene, "located-at", location);
		addRelation(graph, scene, "located-at", secondaryLocation);
		addRelation(graph, scene, "features-character", character);
		add(graph, location, "role", "location");
		add(graph, location, "addressLabel", "loc-primary");
		add(graph, secondaryLocation, "addressLabel", "loc-secondary");
		add(graph, source, "addressLabel", "source-event");
		add(graph, character, "addressLabel", "char-alice");

		const nodes = readBusinessNodes({
			graph,
			scriptTextById: new Map([["scene-generated", "INT. ROOM - NIGHT"]]),
			warnings,
		});

		const sceneNode = nodes.find((node) => node.id === "scene-generated");
		expect(sceneNode).toEqual(
			expect.objectContaining({
				id: "scene-generated",
				role: "animation-scene",
				title: "Scene From Graph",
				status: "draft",
				sequence: 2,
				assigned_to: "director",
				fields: expect.objectContaining({
					ready: false,
					status: "draft",
				}),
				source: {
					path: "book.adoc",
					start_line: 7,
					end_line: 9,
				},
				payload: { raw: "unsupported = true" },
				source_refs: {
					adapted_from: ["source-event"],
				},
				environment: "loc-primary",
				locations: ["loc-secondary"],
				characters: ["char-alice"],
				relations: expect.objectContaining({
					adapted_from: ["source-event"],
					located_at: ["loc-primary", "loc-secondary"],
				}),
				elements: [{ type: "raw_script", text: "INT. ROOM - NIGHT" }],
			}),
		);
		expect(nodes).toContainEqual(
			expect.objectContaining({
				id: "loc-primary",
				role: "location",
			}),
		);
		expect(nodes.find((node) => node.id === "loc-primary")).not.toHaveProperty(
			"locations",
		);
		expect(warnings).toEqual([
			expect.objectContaining({
				code: "payload_format_unsupported",
				node: "urn:test#payload",
			}),
		]);
	});

	it("sorts exported YAML buckets by order, source location, and tracks unconsumed roles", () => {
		const document = makeAnimationYamlDocument({
			sourceBook: "book.adoc",
			documentRoot: fixtureRoot,
			warnings: [{ code: "fixture" }],
			nodes: [
				{
					id: "late",
					role: "beat",
					source: { path: "b.adoc", start_line: 2 },
				},
				{
					id: "ordered",
					role: "beat",
					order: 1,
					source: { path: "z.adoc", start_line: 99 },
				},
				{
					id: "early",
					role: "beat",
					source: { path: "a.adoc", start_line: 20 },
				},
				{
					id: "tie-a",
					role: "beat",
					source: { path: "a.adoc", start_line: 5 },
				},
				{
					id: "profile",
					role: "adaptation-profile",
				},
				{
					id: "custom-1",
					role: "custom-role",
				},
				{
					id: "custom-2",
					role: "custom-role",
				},
			],
		});

		expect(document.adaptation_profile?.id).toBe("profile");
		expect(document.structure.beats.map((node) => node.id)).toEqual([
			"ordered",
			"tie-a",
			"early",
			"late",
		]);
		expect(document.metadata.warnings).toEqual([{ code: "fixture" }]);
		expect(document.metadata.unconsumed_role_counts).toEqual({
			"custom-role": 2,
		});
	});

	it("parses supported payload formats and records parse failures", () => {
		const warnings: Array<{ code: string; node?: string; message: string }> =
			[];

		expect(
			parsePayloadRaw({
				nodeId: "json",
				format: "JSON",
				raw: '{"ok":true}',
				warnings,
			}),
		).toEqual({ ok: true });
		expect(
			parsePayloadRaw({
				nodeId: "yaml",
				format: "yml",
				raw: "items:\n  - one\n",
				warnings,
			}),
		).toEqual({ items: ["one"] });
		expect(
			parsePayloadRaw({
				nodeId: "missing",
				format: "json",
				warnings,
			}),
		).toBeUndefined();
		expect(
			parsePayloadRaw({
				nodeId: "bad-json",
				format: "json",
				raw: '{"broken":',
				warnings,
			}),
		).toEqual({
			raw: '{"broken":',
			parse_error: expect.any(String),
		});
		expect(
			parsePayloadRaw({
				nodeId: "unknown-format",
				raw: "bad: [",
				warnings,
			}),
		).toEqual({ raw: "bad: [" });
		expect(
			parsePayloadRaw({
				nodeId: "unsupported",
				format: "toml",
				raw: "name = 'demo'",
				warnings,
			}),
		).toEqual({ raw: "name = 'demo'" });
		expect(warnings).toEqual([
			expect.objectContaining({
				code: "payload_parse_failed",
				node: "bad-json",
			}),
			{
				code: "payload_format_unsupported",
				node: "unknown-format",
				message: "Unsupported payload format: unknown",
			},
			expect.objectContaining({
				code: "payload_format_unsupported",
				node: "unsupported",
				message: "Unsupported payload format: toml",
			}),
		]);
	});
});

function expectProfilePayloadHasNoSourcePayloadId(): void {
	const projection = rdf12(
		parseAbundantTree({
			sourcePath: fixtureBook,
			mode: "book-entry",
			documentRoot: fixtureRoot,
		}),
		{ documentRoot: fixtureRoot },
	);
	const profile = onlyHeadingWithAddressLabel(
		projection.graph,
		"profile-animation-main",
	);
	const payload = onlyObjectIri(
		projection.graph,
		profile,
		aat("animation-payload"),
	);

	expect(
		projection.graph.match({ subject: payload, predicate: aat("payloadId") }),
	).toHaveLength(0);
	expect(
		projection.graph.match({ subject: profile, predicate: aat("payload") }),
	).toHaveLength(0);
	expect(
		projection.graph.match({ subject: payload, predicate: aat("raw") }),
	).toHaveLength(1);
}

function onlyHeadingWithAddressLabel(
	graph: Rdf12Graph,
	addressLabel: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: aat("addressLabel"),
			object: stringLiteral(addressLabel),
		})
		.map((triple) => triple.subject)
		.filter((subject): subject is Rdf12IriTerm => subject.termType === "iri");

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}

function onlyObjectIri(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): Rdf12IriTerm {
	const objects = graph
		.match({ subject, predicate })
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(objects).toHaveLength(1);
	return objects[0] ?? iriTerm("urn:missing-object");
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function rel(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rel}${localName}`);
}

function heading(localId: string): Rdf12IriTerm {
	return iriTerm(`urn:test#${localId}`);
}

function add(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string | ReturnType<typeof integerLiteral>,
): void {
	const object = typeof value === "string" ? stringLiteral(value) : value;
	graph.add(rdf12Triple(subject, aat(predicateLocalName), object));
}

function addRelation(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	relLocalName: string,
	object: Rdf12IriTerm,
): void {
	graph.add(rdf12Triple(subject, rel(relLocalName), object));
}
