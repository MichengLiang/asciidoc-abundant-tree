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
import { useEffect, useState } from "react";
import { layoutTeachingGraph } from "./layout";
import { projectTeachingGraph, type TeachingProjection } from "./projection";
import { SAMPLE_SOURCE } from "./sample";
import { TeachingEdge } from "./TeachingEdge";
import { TeachingNode } from "./TeachingNode";

const nodeTypes: NodeTypes = {
	teachingNode: TeachingNode,
};

const edgeTypes: EdgeTypes = {
	teachingEdge: TeachingEdge,
};

const EMPTY_PROJECTION: TeachingProjection = {
	nodes: [],
	edges: [],
	diagnostics: [],
};

export function App(): React.ReactElement {
	const [source, setSource] = useState(SAMPLE_SOURCE);
	const [projection, setProjection] = useState(EMPTY_PROJECTION);
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const { fitView } = useReactFlow();

	// 解析是异步的：连续输入时，先发起的解析可能后返回，只采用当前 source 的那一次。
	useEffect(() => {
		let cancelled = false;
		void projectTeachingGraph(source).then((next) => {
			if (!cancelled) setProjection(next);
		});
		return () => {
			cancelled = true;
		};
	}, [source]);

	useEffect(() => {
		let cancelled = false;
		void layoutTeachingGraph({
			nodes: projection.nodes,
			edges: projection.edges,
		}).then((result) => {
			if (cancelled) return;
			// 布局交回的是新建的节点对象，不带 React Flow 量过的 measured。不带 measured 的节点会被清掉连接点位置、等重新测量；
			// 连续两次布局挤在一次测量的间隙里时，节点会停在没有连接点的状态（尺寸没变，ResizeObserver 不再触发），
			// 连着它的边就不画。沿用同一节点已有的 measured，React Flow 会继续用量好的连接点；尺寸真变了照样重新测量。
			setNodes((current) => {
				const measuredById = new Map(
					current.map((node) => [node.id, node.measured]),
				);
				return result.nodes.map((node) => ({
					...node,
					measured: measuredById.get(node.id),
				}));
			});
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
