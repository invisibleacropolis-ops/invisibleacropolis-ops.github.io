# World Generation

The world is strictly deterministic based on a `WORLD_SEED`.

## Terrain
**Module**: `src/scene/terrain-heightmap.ts`

The terrain is built from a heightmap image (default: `/heightmap.jpg`).
-   **Geometry**: A high-resolution `PlaneGeometry` displaced on the Y-axis.
-   **Coloring**: Vertex colors are calculated based on height using a gradient (Low Color -> High Color) and a Skew factor.
-   **heightAt(x, z)**: The module exports a utility function to sample the exact height of the terrain at any world coordinate, using bilinear interpolation of the heightmap data.

## Props (Vegetation)
**Module**: `src/scene/props.ts`

Vegetation (Trees, Rocks) is placed procedurally.
-   **Density**: Controlled by `totalDensity`, `treeDensity`, and `rockDensity` multipliers.
-   **Clustering**: The `clusteringFactor` determines if objects are evenly spread (low factor) or grouped into tight forests/patches (high factor).
-   **Placement logic**:
    -   **Forests**: Large clusters of trees.
    -   **Groups**: Smaller patches.
    -   **Solitary**: Individual trees.
    -   **Rocks**: Placed on steeper slopes or near clusters.
-   **Constraints**: Props check the `heightAt` and slope of the terrain to avoid spawning underwater or on vertical cliffs.

## Links
**Module**: `src/scene/links.ts`

Navigation details are loaded from `public/pages.json`.
-   **Layouts**: Links can be arranged in a `Ring`, `Square`, or `Random` distribution.
-   The center of the layout is (0,0,0).
-   Link text meshes act as world-space anchors for navigation.
