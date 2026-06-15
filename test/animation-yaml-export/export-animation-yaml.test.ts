import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	exportAnimationYaml,
	runAnimationYamlCli,
} from "../../src/animation-yaml-export/cli";
import { parseAbundantTree, rdf12 } from "../../src/index";
import type {
	Rdf12Graph,
	Rdf12IriTerm,
} from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
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
	const payload = onlyObjectIri(projection.graph, profile, aat("payload"));

	expect(
		projection.graph.match({ subject: payload, predicate: aat("payloadId") }),
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
