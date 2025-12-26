import * as THREE from "three";
import { WORLD_PALETTE } from "./palette.ts";

export type TerrainOptions = {
    heightmapUrl?: string;
    width?: number;
    depth?: number;
    segments?: number;
    height?: number;
    colorLow?: string;
    colorHigh?: string;
    gradientStart?: number;
    gradientEnd?: number;
    gradientSkew?: number;
    palette?: string[];
};

type HeightmapData = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

/**
 * Load heightmap image
 */
const loadHeightmap = async (url: string): Promise<HeightmapData> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);

            resolve({
                data: imageData.data,
                width: img.width,
                height: img.height,
            });
        };

        img.onerror = () => {
            reject(new Error(`Failed to load heightmap: ${url}`));
        };

        img.src = url;
    });
};

/**
 * Bilinear interpolated heightmap sampling (0-1)
 */
const sampleHeightmapBilinear = (
    heightmap: HeightmapData,
    u: number,
    v: number,
): number => {
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));

    const fx = u * (heightmap.width - 1);
    const fy = v * (heightmap.height - 1);

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, heightmap.width - 1);
    const y1 = Math.min(y0 + 1, heightmap.height - 1);

    const tx = fx - x0;
    const ty = fy - y0;

    const getPixel = (x: number, y: number) => {
        const index = (y * heightmap.width + x) * 4;
        return heightmap.data[index] / 255;
    };

    const v00 = getPixel(x0, y0);
    const v10 = getPixel(x1, y0);
    const v01 = getPixel(x0, y1);
    const v11 = getPixel(x1, y1);

    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
};

const createTerrainGeometryFromHeightmap = (
    heightmap: HeightmapData,
    width: number,
    depth: number,
    segments: number,
    maxHeight: number,
    colorLow: string,
    colorHigh: string,
    gradientStart: number,
    gradientEnd: number,
    gradientSkew: number,
) => {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    const colors: number[] = [];

    // Pass 1: Set Heights and Find Min/Max Y
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);

        const u = (x / width) + 0.5;
        const v = (z / depth) + 0.5;

        const h = sampleHeightmapBilinear(heightmap, u, v);
        const y = h * maxHeight;

        position.setY(i, y);

        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    // Safety check if flat
    let yRange = maxY - minY;
    if (yRange < 0.001) {
        yRange = 1; // Avoid divide by zero
        minY = 0;
    }

    // Pass 2: Calculate Colors based on geometry range
    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);

        // 1. Normalize based on actual mesh bounds (0 to 1)
        let normalizedY = (y - minY) / yRange;

        // 2. Apply Skew (Power curve)
        // If skew > 1, midtones become darker/lower (t stays small longer)
        // If skew < 1, midtones become brighter/higher
        // Ensure strictly positive base for pow
        normalizedY = Math.pow(Math.max(0, normalizedY), gradientSkew);

        // 3. Map to User Gradient Range
        let t = 0;
        const userRange = gradientEnd - gradientStart;
        if (Math.abs(userRange) > 0.0001) {
            t = (normalizedY - gradientStart) / userRange;
        } else {
            t = normalizedY >= gradientStart ? 1 : 0;
        }

        // Clamp
        t = Math.max(0, Math.min(1, t));

        const color = new THREE.Color().lerpColors(
            new THREE.Color(colorLow),
            new THREE.Color(colorHigh),
            t
        );
        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    position.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
};

export const createTerrainMeshFromHeightmap = async ({
    heightmapUrl = "/heightmap.jpg",
    width = 7000,
    depth = 7000,
    segments = 150,
    height = 600,
    colorLow = "#00008b",
    colorHigh = "#ffffff",
    gradientStart = 0.0,
    gradientEnd = 1.0,
    gradientSkew = 1.0,
    palette = WORLD_PALETTE,
}: TerrainOptions = {}) => {
    const heightmap = await loadHeightmap(heightmapUrl);

    // Log range for debugging
    // We don't have min/max pixels here anymore, but logic adapts.

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
    });

    // Create LOD levels
    const highGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, segments, height, colorLow, colorHigh, gradientStart, gradientEnd, gradientSkew
    );
    const midSegments = Math.max(30, Math.round(segments * 0.5));
    const midGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, midSegments, height, colorLow, colorHigh, gradientStart, gradientEnd, gradientSkew
    );
    const lowSegments = Math.max(15, Math.round(segments * 0.25));
    const lowGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, lowSegments, height, colorLow, colorHigh, gradientStart, gradientEnd, gradientSkew
    );

    const mesh = new THREE.LOD();
    mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
    mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 0.4);
    mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 0.8);

    const heightAt = (x: number, z: number) => {
        const u = (x / width) + 0.5;
        const v = (z / depth) + 0.5;
        return sampleHeightmapBilinear(heightmap, u, v) * height;
    };

    return {
        mesh,
        width,
        depth,
        segments,
        height,
        heightAt,
        heightmap,
    };
};

export { createTerrainMesh } from "./terrain-procedural.ts";
