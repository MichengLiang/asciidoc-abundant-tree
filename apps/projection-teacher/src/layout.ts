import { type Edge, MarkerType, type Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { TeachingEdge, TeachingNode } from "./projection";

export const NODE_WIDTH = 230;
export const NODE_BASE_HEIGHT = 112;
export const FIELD_ROW_HEIGHT = 22;
const PORT_SIZE = 14;

const elk = new ELK();

export type EdgeRoutePoint = {
	readonly x: number;
	readonly y: number;
};

export type RoutedTeachingEdge = TeachingEdge & {
	readonly route?: readonly EdgeRoutePoint[];
};

export function nodeHeight(node: TeachingNode): number {
	return Math.max(
		NODE_BASE_HEIGHT,
		NODE_BASE_HEIGHT + node.fields.length * FIELD_ROW_HEIGHT,
	);
}

type EdgeHandleSet = {
    readonly sourceHandle:
        | "left-middle-source"
        | "right-middle-source";
    readonly targetHandle:
        | "left-top-target"
        | "left-middle-target"
        | "left-bottom-target"
        | "right-middle-target"
        | "right-top-target";
};

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
			"elk.edgeRouting": "ORTHOGONAL",
			"elk.portConstraints": "FIXED_SIDE",
            "elk.spacing.nodeNode": "46",
            "elk.layered.spacing.nodeNodeBetweenLayers": "84",
            "elk.layered.spacing.edgeNodeBetweenLayers": "28",
            "elk.layered.spacing.edgeEdgeBetweenLayers": "20",
			"elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
			"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
		},
		children: input.nodes.map((node) => ({
			id: node.id,
			width: NODE_WIDTH,
			height: nodeHeight(node),
			layoutOptions: {
				"elk.portConstraints": "FIXED_SIDE",
			},
			ports: elkPortsForNode(node),
		})),
		edges: input.edges.map((edge) => {
			const handles = edgeHandlesFromNodeOrder(edge, input.nodes);
			return {
				id: edge.id,
				sources: [elkPortId(edge.source, handles.sourceHandle)],
				targets: [elkPortId(edge.target, handles.targetHandle)],
			};
		}),
	};

	const laidOut = await elk.layout(graph);
	const positionById = new Map(
		(laidOut.children ?? []).map((node) => [
			node.id,
			{ x: node.x ?? 0, y: node.y ?? 0 },
		]),
	);
	const routeByEdgeId = new Map(
		(laidOut.edges ?? []).map((edge) => [
			edge.id,
			routeFromElkEdge(edge as ElkRoutedEdge),
		]),
	);
	const centerXById = new Map(
		input.nodes.map((node) => {
			const position = positionById.get(node.id) ?? { x: 0, y: 0 };
			return [node.id, position.x + NODE_WIDTH / 2] as const;
		}),
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
		edges: input.edges.map((edge) => {
			const route = routeByEdgeId.get(edge.id);
			return {
				id: edge.id,
				type: "teachingEdge",
				source: edge.source,
				target: edge.target,
				...edgeHandles(edge, centerXById),
				data: {
					...edge,
					...(route ? { route } : {}),
				} satisfies RoutedTeachingEdge,
				animated: false,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					width: 16,
					height: 16,
					color: edgeColor(edge.rel),
				},
			};
		}),
	};
}

type ElkRoutedEdge = {
	readonly sections?: readonly {
		readonly startPoint?: EdgeRoutePoint;
		readonly bendPoints?: readonly EdgeRoutePoint[];
		readonly endPoint?: EdgeRoutePoint;
	}[];
};

function elkPortsForNode(node: TeachingNode): {
	id: string;
	width: number;
	height: number;
	layoutOptions: { "elk.port.side": "WEST" | "EAST" };
}[] {
    return [
        elkPort(node.id, "left-top-target", "WEST"),
        elkPort(node.id, "left-middle-target", "WEST"),
        elkPort(node.id, "left-middle-source", "WEST"),
        elkPort(node.id, "left-bottom-target", "WEST"),
        elkPort(node.id, "right-top-target", "EAST"),
        elkPort(node.id, "right-middle-target", "EAST"),
        elkPort(node.id, "right-middle-source", "EAST"),
    ];
}

function elkPort(
	nodeId: string,
	handleId: EdgeHandleSet["sourceHandle"] | EdgeHandleSet["targetHandle"],
	side: "WEST" | "EAST",
) {
	return {
		id: elkPortId(nodeId, handleId),
		width: PORT_SIZE,
		height: PORT_SIZE,
		layoutOptions: { "elk.port.side": side },
	};
}

function elkPortId(
	nodeId: string,
	handleId: EdgeHandleSet["sourceHandle"] | EdgeHandleSet["targetHandle"],
): string {
	return `${nodeId}.${handleId}`;
}

function routeFromElkEdge(
	edge: ElkRoutedEdge,
): readonly EdgeRoutePoint[] | undefined {
	const section = edge.sections?.[0];
	if (!section?.startPoint || !section.endPoint) {
		return undefined;
	}
	return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

function edgeHandles(
	edge: TeachingEdge,
	centerXById: ReadonlyMap<string, number>,
): EdgeHandleSet {
    const sourceX = centerXById.get(edge.source) ?? 0;
    const targetX = centerXById.get(edge.target) ?? sourceX;
    if (edge.rel === "references") {
        return {
            sourceHandle:
                sourceX <= targetX ? "right-middle-source" : "left-middle-source",
            targetHandle: sourceX <= targetX ? "left-top-target" : "right-top-target",
        };
    }
    if (edge.rel === "documents") {
        return {
            sourceHandle:
                sourceX <= targetX ? "right-middle-source" : "left-middle-source",
            targetHandle:
                sourceX <= targetX ? "left-middle-target" : "right-middle-target",
        };
    }
    if (sourceX <= targetX) {
        return {
            sourceHandle: "right-middle-source",
            targetHandle: "left-middle-target",
        };
    }
    return {
        sourceHandle: "left-middle-source",
        targetHandle: "right-top-target",
    };
}

function edgeHandlesFromNodeOrder(
	edge: TeachingEdge,
	nodes: readonly TeachingNode[],
): EdgeHandleSet {
	const orderById = new Map(
		nodes.map((node, index) => [node.id, index] as const),
	);
    const sourceOrder = orderById.get(edge.source) ?? 0;
    const targetOrder = orderById.get(edge.target) ?? sourceOrder;
    if (edge.rel === "references") {
        return {
            sourceHandle:
                sourceOrder <= targetOrder
                    ? "right-middle-source"
                    : "left-middle-source",
            targetHandle:
                sourceOrder <= targetOrder ? "left-top-target" : "right-top-target",
        };
    }
    if (edge.rel === "documents") {
        return {
            sourceHandle:
                sourceOrder <= targetOrder
                    ? "right-middle-source"
                    : "left-middle-source",
            targetHandle:
                sourceOrder <= targetOrder
                    ? "left-middle-target"
                    : "right-middle-target",
        };
    }
    if (sourceOrder <= targetOrder) {
        return {
            sourceHandle: "right-middle-source",
            targetHandle: "left-middle-target",
        };
    }
    return {
        sourceHandle: "left-middle-source",
        targetHandle: "right-top-target",
    };
}

function edgeColor(rel: string): string {
	switch (rel) {
		case "requires":
			return "#d8902e";
		case "documents":
			return "#cf7199";
		case "references":
			return "#66a96a";
		default:
			return "#958779";
	}
}
