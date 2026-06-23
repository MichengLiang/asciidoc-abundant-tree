import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { RoutedTeachingEdge } from "./layout";

type Point = {
	readonly x: number;
	readonly y: number;
};

export function TeachingEdge(props: EdgeProps): React.ReactElement {
	const edge = props.data as unknown as RoutedTeachingEdge;
	const route = blueprintRoute({
		source: { x: props.sourceX, y: props.sourceY },
		target: { x: props.targetX, y: props.targetY },
		rel: edge.rel,
		isBackReference: edge.rel === "references" && props.sourceX > props.targetX,
	});

	return (
		<>
			<BaseEdge
				id={props.id}
				path={route.path}
				className={`teaching-edge-path rel-${edge.rel}`}
				{...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
			/>
			{edge.rel === "references" ? null : (
				<EdgeLabelRenderer>
					<div
						className={`teaching-edge-label rel-${edge.rel}`}
						data-edge-id={props.id}
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${route.label.x}px, ${route.label.y}px)`,
						}}
					>
						<span>{edge.title}</span>
						{edge.fields.map((field) => (
							<small key={`${edge.id}:${field.key}:${field.value}`}>
								{field.key}: {field.value}
							</small>
						))}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}

function blueprintRoute({
	source,
	target,
	isBackReference,
}: {
	readonly source: Point;
	readonly target: Point;
	readonly rel: string;
	readonly isBackReference: boolean;
}): { readonly path: string; readonly label: Point } {
	if (isBackReference) {
		return backReferenceRoute(source, target);
	}

	const distance = Math.abs(target.x - source.x);
	const handle = Math.max(48, Math.min(132, distance * 0.36));
	const firstControl = { x: source.x + handle, y: source.y };
	const secondControl = { x: target.x - handle, y: target.y };
	return {
		path: cubicPath(source, firstControl, secondControl, target),
		label: cubicPoint(source, firstControl, secondControl, target, 0.5),
	};
}

function backReferenceRoute(
	source: Point,
	target: Point,
): {
	readonly path: string;
	readonly label: Point;
} {
	const distance = Math.abs(source.x - target.x);
	const lift = Math.max(28, Math.min(42, distance * 0.08));
	const laneY = Math.min(source.y, target.y) - lift;
	const handle = Math.max(54, distance * 0.22);
	const firstControl = { x: source.x + handle * 0.35, y: laneY };
	const secondControl = { x: target.x + handle, y: laneY };
	return {
		path: cubicPath(source, firstControl, secondControl, target),
		label: cubicPoint(source, firstControl, secondControl, target, 0.58),
	};
}

function cubicPath(
	start: Point,
	firstControl: Point,
	secondControl: Point,
	end: Point,
): string {
	return `M ${start.x} ${start.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${end.x} ${end.y}`;
}

function cubicPoint(
	start: Point,
	firstControl: Point,
	secondControl: Point,
	end: Point,
	t: number,
): Point {
	const oneMinusT = 1 - t;
	return {
		x:
			oneMinusT ** 3 * start.x +
			3 * oneMinusT ** 2 * t * firstControl.x +
			3 * oneMinusT * t ** 2 * secondControl.x +
			t ** 3 * end.x,
		y:
			oneMinusT ** 3 * start.y +
			3 * oneMinusT ** 2 * t * firstControl.y +
			3 * oneMinusT * t ** 2 * secondControl.y +
			t ** 3 * end.y,
	};
}
