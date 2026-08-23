import type { GraphEdge, GraphNode, GraphState } from "./types.js";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface PhysicsSettings {
  repulsion: number;
  linkDistance: number;
  clusterStrength: number;
  collisionRadius: number;
  iterations: number;
}

export const defaultPhysics: PhysicsSettings = {
  repulsion: 1600,
  linkDistance: 150,
  clusterStrength: 0.006,
  collisionRadius: 38,
  iterations: 110
};

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  state: GraphState
): Map<string, LayoutPoint> {
  const physics = { ...defaultPhysics, ...(state.physics ?? {}) };
  const pos = new Map<string, LayoutPoint>();
  const vel = new Map<string, LayoutPoint>();
  const anchors = anchorMap(nodes, width, height, state.clusterBy ?? "type");
  const clusterRanks = clusterRankMap(nodes, state.clusterBy ?? "type");

  nodes.forEach((node, index) => {
    const saved = state.layout?.[node.id];
    if (saved) {
      pos.set(node.id, { x: saved.x, y: saved.y });
    } else {
      const anchor = anchors.get(clusterKey(node, state.clusterBy ?? "type")) ?? { x: width / 2, y: height / 2 };
      const rank = clusterRanks.get(node.id) ?? index;
      const angle = seededAngle(node.id, index) + rank * 2.399963229728653;
      const radius = 54 + Math.sqrt(rank + 1) * 34;
      pos.set(node.id, { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius });
    }
    vel.set(node.id, { x: 0, y: 0 });
  });

  const linked = edges.filter((edge) => pos.has(edge.from) && pos.has(edge.to));
  const pinned = new Set(state.pinned ?? []);

  for (let step = 0; step < physics.iterations; step += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id);
        const b = pos.get(nodes[j].id);
        const av = vel.get(nodes[i].id);
        const bv = vel.get(nodes[j].id);
        if (!a || !b || !av || !bv) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist2 = Math.max(dx * dx + dy * dy, 36);
        const dist = Math.sqrt(dist2);
        dx /= dist;
        dy /= dist;
        const force = physics.repulsion / dist2;
        if (!pinned.has(nodes[i].id)) {
          av.x += dx * force;
          av.y += dy * force;
        }
        if (!pinned.has(nodes[j].id)) {
          bv.x -= dx * force;
          bv.y -= dy * force;
        }
        if (dist < physics.collisionRadius) {
          const push = (physics.collisionRadius - dist) * 0.055;
          if (!pinned.has(nodes[i].id)) {
            av.x += dx * push;
            av.y += dy * push;
          }
          if (!pinned.has(nodes[j].id)) {
            bv.x -= dx * push;
            bv.y -= dy * push;
          }
        }
      }
    }

    for (const edge of linked) {
      const a = pos.get(edge.from);
      const b = pos.get(edge.to);
      const av = vel.get(edge.from);
      const bv = vel.get(edge.to);
      if (!a || !b || !av || !bv) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const target = edge.type === "contains" ? physics.linkDistance * 0.72 : edge.type === "root" ? physics.linkDistance * 1.35 : physics.linkDistance;
      const pull = (dist - target) * 0.006;
      if (!pinned.has(edge.from)) {
        av.x += (dx / dist) * pull;
        av.y += (dy / dist) * pull;
      }
      if (!pinned.has(edge.to)) {
        bv.x -= (dx / dist) * pull;
        bv.y -= (dy / dist) * pull;
      }
    }

    for (const node of nodes) {
      if (pinned.has(node.id)) continue;
      const p = pos.get(node.id);
      const v = vel.get(node.id);
      const anchor = anchors.get(clusterKey(node, state.clusterBy ?? "type")) ?? { x: width / 2, y: height / 2 };
      if (!p || !v) continue;
      v.x += (anchor.x - p.x) * physics.clusterStrength;
      v.y += (anchor.y - p.y) * physics.clusterStrength;
      p.x = clamp(p.x + v.x, 44, Math.max(88, width - 44));
      p.y = clamp(p.y + v.y, 44, Math.max(88, height - 44));
      v.x *= 0.72;
      v.y *= 0.72;
    }
  }

  return pos;
}

export function graphWorldSize(nodeCount: number, viewportWidth: number, viewportHeight: number): { width: number; height: number } {
  const count = Math.max(1, nodeCount);
  const side = Math.sqrt(count);
  return {
    width: Math.max(viewportWidth, Math.ceil(side * 230), viewportWidth * 2.2),
    height: Math.max(viewportHeight, Math.ceil(side * 185), viewportHeight * 2.2)
  };
}

export function clusterKey(node: GraphNode, clusterBy: string): string {
  if (clusterBy === "space") return node.space ?? node.type;
  if (clusterBy === "trust") return node.trustLevel ?? node.type;
  if (clusterBy === "sensitivity") return node.sensitivity ?? node.type;
  if (node.type === "root") return "root";
  return node.type;
}

function anchorMap(nodes: GraphNode[], width: number, height: number, clusterBy: string): Map<string, LayoutPoint> {
  const keys = Array.from(new Set(nodes.map((node) => clusterKey(node, clusterBy)))).sort();
  const nonRootKeys = keys.filter((key) => key !== "root");
  const map = new Map<string, LayoutPoint>();
  const cx = width / 2;
  const cy = height / 2;
  const radiusX = Math.max(180, width * 0.3);
  const radiusY = Math.max(150, height * 0.24);
  keys.forEach((key) => {
    if (key === "root") {
      map.set(key, { x: cx, y: cy });
      return;
    }
    const index = nonRootKeys.indexOf(key);
    const angle = (index / Math.max(1, nonRootKeys.length)) * Math.PI * 2 - Math.PI / 8;
    map.set(key, { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
  });
  return map;
}

function clusterRankMap(nodes: GraphNode[], clusterBy: string): Map<string, number> {
  const ranks = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const key = clusterKey(node, clusterBy);
    const rank = counts.get(key) ?? 0;
    ranks.set(node.id, rank);
    counts.set(key, rank + 1);
  }
  return ranks;
}

function seededAngle(id: string, fallback: number): number {
  let hash = fallback + 17;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 10000;
  return (hash / 10000) * Math.PI * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
