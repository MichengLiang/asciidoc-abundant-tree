export type SourceCoordinate = {
	readonly path?: string;
	readonly start_line?: number;
	readonly end_line?: number;
};

export type ExportedNode = {
	readonly id: string;
	readonly title?: string;
	readonly role: string;
	readonly status?: string;
	readonly order?: number;
	readonly sequence?: number;
	readonly function?: string;
	readonly event?: string;
	readonly target?: string;
	readonly production?: string;
	readonly assigned_to?: string;
	readonly scene?: string;
	readonly source?: SourceCoordinate;
	readonly fields?: Record<string, string | number | boolean>;
	readonly payload?: unknown;
	readonly source_refs?: Record<string, string[]>;
	readonly realizes?: string[];
	readonly characters?: string[];
	readonly environment?: string;
	readonly locations?: string[];
	readonly props?: string[];
	readonly assets?: string[];
	readonly constraints?: string[];
	readonly critiques?: string[];
	readonly evidence?: string[];
	readonly relations?: Record<string, string[]>;
	readonly elements?: Array<{ readonly type: string; readonly text: string }>;
};

export type AnimationYamlDocument = {
	readonly schema_version: "1.0";
	readonly adaptation_profile: ExportedNode | null;
	readonly source: {
		readonly chapters: ExportedNode[];
		readonly snippets: ExportedNode[];
		readonly events: ExportedNode[];
	};
	readonly story_bible: {
		readonly characters: ExportedNode[];
		readonly locations: ExportedNode[];
		readonly environments: ExportedNode[];
		readonly props: ExportedNode[];
		readonly world_rules: ExportedNode[];
		readonly visual_rules: ExportedNode[];
	};
	readonly rules: {
		readonly quality_rules: ExportedNode[];
		readonly adaptation_choices: ExportedNode[];
	};
	readonly structure: {
		readonly beats: ExportedNode[];
		readonly scene_cards: ExportedNode[];
	};
	readonly script: {
		readonly scenes: ExportedNode[];
	};
	readonly storyboard: {
		readonly shots: ExportedNode[];
	};
	readonly review: {
		readonly notes: ExportedNode[];
	};
	readonly exports: {
		readonly mappings: ExportedNode[];
	};
	readonly metadata: {
		readonly source_book: string;
		readonly document_root: string;
		readonly warnings: readonly unknown[];
		readonly unconsumed_role_counts: Record<string, number>;
	};
};

export function makeAnimationYamlDocument(input: {
	readonly sourceBook: string;
	readonly documentRoot: string;
	readonly nodes: readonly ExportedNode[];
	readonly warnings: readonly unknown[];
}): AnimationYamlDocument {
	const byRole = (role: string): ExportedNode[] =>
		input.nodes.filter((node) => node.role === role).sort(compareExportedNodes);
	const consumedRoles = new Set([
		"adaptation-profile",
		"source-chapter",
		"source-snippet",
		"source-event",
		"character",
		"location",
		"environment-asset",
		"prop",
		"world-rule",
		"visual-rule",
		"quality-rule",
		"beat",
		"scene-card",
		"animation-scene",
		"shot",
		"review-note",
	]);

	return {
		schema_version: "1.0",
		adaptation_profile: byRole("adaptation-profile")[0] ?? null,
		source: {
			chapters: byRole("source-chapter"),
			snippets: byRole("source-snippet"),
			events: byRole("source-event"),
		},
		story_bible: {
			characters: byRole("character"),
			locations: byRole("location"),
			environments: byRole("environment-asset"),
			props: byRole("prop"),
			world_rules: byRole("world-rule"),
			visual_rules: byRole("visual-rule"),
		},
		rules: {
			quality_rules: byRole("quality-rule"),
			adaptation_choices: byRole("adaptation-choice"),
		},
		structure: {
			beats: byRole("beat"),
			scene_cards: byRole("scene-card"),
		},
		script: {
			scenes: byRole("animation-scene"),
		},
		storyboard: {
			shots: byRole("shot"),
		},
		review: {
			notes: byRole("review-note"),
		},
		exports: {
			mappings: byRole("export-mapping"),
		},
		metadata: {
			source_book: input.sourceBook,
			document_root: input.documentRoot,
			warnings: input.warnings,
			unconsumed_role_counts: unconsumedRoleCounts(input.nodes, consumedRoles),
		},
	};
}

function compareExportedNodes(left: ExportedNode, right: ExportedNode): number {
	const leftOrder = left.sequence ?? left.order;
	const rightOrder = right.sequence ?? right.order;
	if (leftOrder !== undefined || rightOrder !== undefined) {
		return (
			(leftOrder ?? Number.MAX_SAFE_INTEGER) -
			(rightOrder ?? Number.MAX_SAFE_INTEGER)
		);
	}
	const leftPath = left.source?.path ?? "";
	const rightPath = right.source?.path ?? "";
	if (leftPath !== rightPath) {
		return leftPath.localeCompare(rightPath);
	}
	return (
		(left.source?.start_line ?? Number.MAX_SAFE_INTEGER) -
		(right.source?.start_line ?? Number.MAX_SAFE_INTEGER)
	);
}

function unconsumedRoleCounts(
	nodes: readonly ExportedNode[],
	consumedRoles: ReadonlySet<string>,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const node of nodes) {
		if (consumedRoles.has(node.role)) {
			continue;
		}
		counts[node.role] = (counts[node.role] ?? 0) + 1;
	}
	return counts;
}
