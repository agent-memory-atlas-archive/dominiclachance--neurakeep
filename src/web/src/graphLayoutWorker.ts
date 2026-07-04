import { computeLayout } from "./graphEngine.js";
import type { GraphEdge, GraphNode, GraphState } from "./types.js";

self.onmessage = (event: MessageEvent<{
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  state: GraphState;
}>) => {
  const { nodes, edges, width, height, state } = event.data;
  const positions = Array.from(computeLayout(nodes, edges, width, height, state).entries());
  self.postMessage({ positions });
};
