import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { TeachingEdge, TeachingNode } from "./projection";

export const NODE_WIDTH = 230;
export const NODE_BASE_HEIGHT = 112;
export const FIELD_ROW_HEIGHT = 24;
export const EDGE_CARD_WIDTH = 168;
export const EDGE_CARD_HEIGHT = 112;

const elk = new ELK();

export function nodeHeight(node: TeachingNode): number {
	return Math.max(
		NODE_BASE_HEIGHT,
		NODE_BASE_HEIGHT + node.fields.length * FIELD_ROW_HEIGHT,
	);
}

export async function layoutTeachingGraph(input: {
	readonly nodes: readonly TeachingNode[];
	readonly edges: readonly TeachingEdge[];
}): Promise<{
	readonly nodes: Node[];
	readonly edges: Edge[];
}> {
	const graph = {
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.spacing.nodeNode": "130",
			"elk.layered.spacing.nodeNodeBetweenLayers": "170",
			"elk.edgeRouting": "ORTHOGONAL",
			"elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
		},
		children: input.nodes.map((node) => ({
			id: node.id,
			width: NODE_WIDTH,
			height: nodeHeight(node),
		})),
		edges: input.edges.map((edge) => ({
			id: edge.id,
			sources: [edge.source],
			targets: [edge.target],
			labels: [
				{
					id: `${edge.id}-label`,
					width: EDGE_CARD_WIDTH,
					height: EDGE_CARD_HEIGHT,
				},
			],
		})),
	};

	const laidOut = await elk.layout(graph);
	const positionById = new Map(
		(laidOut.children ?? []).map((node) => [
			node.id,
			{ x: node.x ?? 0, y: node.y ?? 0 },
		]),
	);

	return {
		nodes: input.nodes.map((node) => ({
			id: node.id,
			type: "teachingNode",
			position: positionById.get(node.id) ?? { x: 0, y: 0 },
			data: node,
			width: NODE_WIDTH,
			height: nodeHeight(node),
		})),
		edges: input.edges.map((edge) => ({
			id: edge.id,
			type: "teachingEdge",
			source: edge.source,
			target: edge.target,
			data: edge,
			animated: false,
		})),
	};
}
