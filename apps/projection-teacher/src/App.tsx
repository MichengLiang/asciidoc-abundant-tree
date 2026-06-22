import {
	Background,
	Controls,
	type Edge,
	type EdgeTypes,
	type Node,
	type NodeTypes,
	ReactFlow,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { layoutTeachingGraph } from "./layout";
import { projectTeachingGraph } from "./projection";
import { SAMPLE_SOURCE } from "./sample";
import { TeachingEdge } from "./TeachingEdge";
import { TeachingNode } from "./TeachingNode";

const nodeTypes: NodeTypes = {
	teachingNode: TeachingNode,
};

const edgeTypes: EdgeTypes = {
	teachingEdge: TeachingEdge,
};

export function App(): React.ReactElement {
	const [source, setSource] = useState(SAMPLE_SOURCE);
	const projection = useMemo(() => projectTeachingGraph(source), [source]);
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const { fitView } = useReactFlow();

	useEffect(() => {
		let cancelled = false;
		void layoutTeachingGraph({
			nodes: projection.nodes,
			edges: projection.edges,
		}).then((result) => {
			if (cancelled) return;
			setNodes(result.nodes);
			setEdges(result.edges);
			requestAnimationFrame(() => {
				if (!cancelled) {
					void fitView({ padding: 0.16, duration: 180, minZoom: 0.82 });
				}
			});
		});
		return () => {
			cancelled = true;
		};
	}, [fitView, projection, setEdges, setNodes]);

	return (
		<main className="app-shell">
			<section className="editor-pane">
				<header>
					<h1>AsciiDoc 教学输入</h1>
                    <p>写标题、属性和 xref，右侧即时生成节点与连线。</p>
				</header>
				<textarea
					aria-label="AsciiDoc source"
					value={source}
					onChange={(event) => setSource(event.target.value)}
					spellCheck={false}
				/>
			</section>
			<section className="graph-pane">
				<header className="graph-pane__header">
					<div>
						<h2>即时投影图</h2>
						<p>
							{projection.nodes.length} 个标题节点 · {projection.edges.length}{" "}
							条 xref 边
						</p>
					</div>
					{projection.diagnostics.length > 0 ? (
						<ul>
							{projection.diagnostics.map((diagnostic) => (
								<li key={diagnostic}>{diagnostic}</li>
							))}
						</ul>
					) : null}
				</header>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					fitView
					fitViewOptions={{ padding: 0.16, minZoom: 0.82 }}
					minZoom={0.38}
					maxZoom={1.4}
					nodesDraggable
					nodesConnectable={false}
					elementsSelectable
				>
					<Background color="#e7ddd0" gap={28} />
					<Controls showInteractive={false} />
				</ReactFlow>
			</section>
		</main>
	);
}
