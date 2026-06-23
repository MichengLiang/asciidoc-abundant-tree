import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { TeachingNode as TeachingNodeData } from "./projection";

const ROLE_LABELS: Record<string, string> = {
	evidence: "证据",
	process: "过程",
	rule: "规则",
};

export function TeachingNode({ data }: NodeProps): React.ReactElement {
	const node = data as unknown as TeachingNodeData;
	return (
		<article className={`teaching-node role-${node.role ?? "default"}`}>
			<Handle
				className="teaching-handle teaching-handle--left lane-top handle-reference-in"
				id="left-top-target"
				type="target"
				position={Position.Left}
			/>
			<Handle
				className="teaching-handle teaching-handle--left lane-middle handle-flow-out"
				id="left-middle-source"
				type="source"
				position={Position.Left}
			/>
			<Handle
				className="teaching-handle teaching-handle--left lane-middle handle-flow-in"
				id="left-middle-target"
				type="target"
				position={Position.Left}
			/>
			<Handle
				className="teaching-handle teaching-handle--right lane-top handle-reference-in"
				id="right-top-target"
				type="target"
				position={Position.Right}
			/>
			<Handle
				className="teaching-handle teaching-handle--right lane-middle handle-flow-in"
				id="right-middle-target"
				type="target"
				position={Position.Right}
			/>
			<Handle
				className="teaching-handle teaching-handle--right lane-middle handle-flow-out"
				id="right-middle-source"
				type="source"
				position={Position.Right}
			/>
			<Handle
				className="teaching-handle teaching-handle--left lane-bottom handle-flow-in"
				id="left-bottom-target"
				type="target"
				position={Position.Left}
			/>
			<header className="teaching-node__header">
				<strong>{node.title}</strong>
				{node.role ? (
					<span className="teaching-node__role">
						{ROLE_LABELS[node.role] ?? node.role}
					</span>
				) : null}
			</header>
			<div className="field-list">
				{node.fields.length > 0 ? (
					node.fields.map((field) => (
						<div className="field-row" key={`${field.key}:${field.value}`}>
							<span className="field-key">{field.key}</span>
							<span className="field-value">{field.value}</span>
						</div>
					))
				) : (
					<div className="empty-fields">尚未写入属性</div>
				)}
			</div>
		</article>
	);
}
