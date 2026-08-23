import { describe, expect, it } from "vitest";
import { computeLayout, graphWorldSize } from "../src/web/src/graphEngine.js";
import type { GraphNode } from "../src/web/src/types.js";

describe("graph layout engine", () => {
  it("lays dense graphs onto a world canvas larger than the visible viewport", () => {
    const viewport = { width: 900, height: 500 };
    const nodes: GraphNode[] = Array.from({ length: 96 }, (_, index) => ({
      id: `failure-${index}`,
      label: `Failure ${index}`,
      type: "failure"
    }));
    const world = graphWorldSize(nodes.length, viewport.width, viewport.height);
    const layout = computeLayout(nodes, [], world.width, world.height, {});
    const points = Array.from(layout.values());

    expect(world.width).toBeGreaterThan(viewport.width);
    expect(world.height).toBeGreaterThan(viewport.height);
    expect(points.some((point) => point.x > viewport.width || point.y > viewport.height)).toBe(true);
    expect(new Set(points.map((point) => Math.round(point.x / 10))).size).toBeGreaterThan(10);
    expect(new Set(points.map((point) => Math.round(point.y / 10))).size).toBeGreaterThan(10);
  });
});
