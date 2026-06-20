import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";
import type { TeachingEdge as TeachingEdgeData } from "./projection";

export function TeachingEdge(props: EdgeProps): React.ReactElement {
	const edge = props.data as unknown as TeachingEdgeData;
	const offset =
		edge.rel === "references" ? -58 : edge.rel === "documents" ? 58 : 0;
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX: props.sourceX,
		sourceY: props.sourceY,
		sourcePosition: props.sourcePosition,
		targetX: props.targetX,
		targetY: props.targetY,
		targetPosition: props.targetPosition,
	});

	return (
		<>
			<BaseEdge
				id={props.id}
				path={edgePath}
				className={`teaching-edge-path rel-${edge.rel}`}
				{...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
			/>
			<EdgeLabelRenderer>
				<aside
					className={`teaching-edge-card rel-${edge.rel}`}
					style={{
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offset}px)`,
					}}
				>
					<header>{edge.title}</header>
					<div className="field-list field-list--edge">
						{edge.fields.map((field) => (
							<div
								className="field-row"
								key={`${props.id}:${field.key}:${field.value}`}
							>
								<span className="field-key">{field.key}</span>
								<span className="field-value">{field.value}</span>
							</div>
						))}
					</div>
				</aside>
			</EdgeLabelRenderer>
		</>
	);
}
