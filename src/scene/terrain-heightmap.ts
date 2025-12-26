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
    palette?: string[];
};

type HeightmapData = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

/**
 * Load heightmap image and extract grayscale values
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
 * Bilinear interpolated heightmap sampling for smoother terrain
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

    // Bilinear interpolation
    const v0 = v00 * (1 - tx) + v10 * tx;
    const v1 = v01 * (1 - tx) + v11 * tx;

    return v0 * (1 - ty) + v1 * ty;
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
) => {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);

        // Convert world coords to UV (0-1)
        const u = (x / width) + 0.5;
        const v = (z / depth) + 0.5;

        // Sample heightmap with bilinear interpolation
        const h = sampleHeightmapBilinear(heightmap, u, v);

        // Apply height
        position.setY(i, h * maxHeight);

        // Calculate color based on height
        // Map h to gradient range
        let t = 0;
        const range = gradientEnd - gradientStart;
        if (range > 0.0001) {
            t = (h - gradientStart) / range;
        } else {
            t = h >= gradientStart ? 1 : 0;
        }
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
    palette = WORLD_PALETTE,
}: TerrainOptions = {}) => {
    // Load heightmap
    const heightmap = await loadHeightmap(heightmapUrl);
    console.log(`Loaded heightmap: ${heightmap.width}x${heightmap.height}`);

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
    });

    // Create LOD levels
    const highGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, segments, height, colorLow, colorHigh, gradientStart, gradientEnd
    );
    const midSegments = Math.max(30, Math.round(segments * 0.5));
    const lowSegments = Math.max(15, Math.round(segments * 0.25));
    const midGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, midSegments, height, colorLow, colorHigh, gradientStart, gradientEnd
    );
    const lowGeometry = createTerrainGeometryFromHeightmap(
        heightmap, width, depth, lowSegments, height, colorLow, colorHigh, gradientStart, gradientEnd
    );

    const mesh = new THREE.LOD();
    mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
    mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 0.4);
    mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 0.8);

    // Create heightAt function for props placement
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

// Keep old function for fallback
export { createTerrainMesh } from "./terrain-procedural.ts";
