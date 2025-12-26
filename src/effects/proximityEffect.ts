import * as THREE from "three";

export type ProximityEffectOptions = {
    /** Distance at which the effect starts (outer edge) */
    maxDistance?: number;
    /** Distance at which the effect is at full strength */
    minDistance?: number;
    /** Base color for the material */
    baseColor?: number;
    /** Highlight color when close */
    highlightColor?: number;
};

export type ProximityTarget = {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    baseColor: THREE.Color;
    highlightColor: THREE.Color;
};

const tempPosition = new THREE.Vector3();

export const createProximityEffect = ({
    maxDistance = 30,
    minDistance = 5,
    baseColor = 0x8899cc,
    highlightColor = 0xaaccff,
}: ProximityEffectOptions = {}) => {
    const targets: ProximityTarget[] = [];
    let activeTarget: ProximityTarget | null = null;
    let onEnterCallback: ((mesh: THREE.Mesh) => void) | null = null;
    let onExitCallback: ((mesh: THREE.Mesh) => void) | null = null;

    const addTarget = (mesh: THREE.Mesh) => {
        const material = mesh.material as THREE.MeshBasicMaterial;
        if (!(material instanceof THREE.MeshBasicMaterial)) {
            console.warn("ProximityEffect: mesh material is not MeshBasicMaterial");
            return;
        }

        const base = new THREE.Color(mesh.userData.baseColor ?? baseColor);
        const highlight = new THREE.Color(mesh.userData.hoverColor ?? highlightColor);

        targets.push({
            mesh,
            material,
            baseColor: base,
            highlightColor: highlight,
        });
    };

    const addTargets = (meshes: THREE.Mesh[]) => {
        meshes.forEach(addTarget);
    };

    const onEnter = (callback: (mesh: THREE.Mesh) => void) => {
        onEnterCallback = callback;
    };

    const onExit = (callback: (mesh: THREE.Mesh) => void) => {
        onExitCallback = callback;
    };

    const update = (camera: THREE.Camera) => {
        let closestTarget: ProximityTarget | null = null;
        let closestDistance = Infinity;

        // Find the closest target within range
        for (const target of targets) {
            if (!target.mesh.visible) continue;

            target.mesh.getWorldPosition(tempPosition);
            const distance = camera.position.distanceTo(tempPosition);

            if (distance < maxDistance && distance < closestDistance) {
                closestDistance = distance;
                closestTarget = target;
            }
        }

        // Handle enter/exit callbacks
        if (closestTarget !== activeTarget) {
            if (activeTarget) {
                onExitCallback?.(activeTarget.mesh);
            }
            if (closestTarget) {
                onEnterCallback?.(closestTarget.mesh);
            }
            activeTarget = closestTarget;
        }

        // Update all target colors based on proximity
        for (const target of targets) {
            if (!target.mesh.visible) continue;

            target.mesh.getWorldPosition(tempPosition);
            const distance = camera.position.distanceTo(tempPosition);

            if (distance >= maxDistance) {
                // Too far - use base color
                target.material.color.copy(target.baseColor);
            } else if (distance <= minDistance) {
                // Very close - use full highlight color
                target.material.color.copy(target.highlightColor);
            } else {
                // In between - interpolate
                const t = 1 - (distance - minDistance) / (maxDistance - minDistance);
                target.material.color.copy(target.baseColor).lerp(target.highlightColor, t);
            }
        }
    };

    const setDistances = (min: number, max: number) => {
        minDistance = min;
        maxDistance = max;
    };

    const getActiveTarget = () => activeTarget?.mesh ?? null;

    return {
        addTarget,
        addTargets,
        onEnter,
        onExit,
        update,
        getActiveTarget,
        setDistances,
    };
};
