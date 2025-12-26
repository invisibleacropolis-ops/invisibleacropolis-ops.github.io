import GUI from "lil-gui";
import type { PropsConfig } from "../scene/props.ts";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type TerrainConfig = {
    size: number;
    segments: number;
    height: number;
    colorLow: string;
    colorHigh: string;
    gradientStart: number;
    gradientEnd: number;
    gradientSkew: number;
};

export type LinksConfig = {
    size: number;
};

export type DevSettings = {
    props: PropsConfig;
    bloom?: {
        strength: number;
        radius: number;
        threshold: number;
    };
    terrain?: TerrainConfig;
    links?: LinksConfig;
};

export type DevPanelOptions = {
    propsConfig?: PropsConfig;
    onPropsChange?: (config: PropsConfig) => void;
    bloomPass?: UnrealBloomPass;
    terrainConfig?: TerrainConfig;
    onTerrainChange?: (config: TerrainConfig) => void;
    linksConfig?: LinksConfig;
    onLinksChange?: (config: LinksConfig) => void;
    onSaveDefaults?: (settings: DevSettings) => void;
};

export const createDevPanel = ({
    propsConfig,
    onPropsChange,
    bloomPass,
    terrainConfig,
    onTerrainChange,
    linksConfig,
    onLinksChange,
    onSaveDefaults,
}: DevPanelOptions = {}) => {
    const gui = new GUI({ title: "Dev Panel", width: 300 });
    gui.close(); // Start collapsed

    const settings: DevSettings = {
        props: propsConfig ? { ...propsConfig } : {
            totalDensity: 1,
            treeDensity: 1,
            rockDensity: 1,
            clusteringFactor: 1,
        },
        terrain: terrainConfig ? { ...terrainConfig } : {
            size: 7000,
            segments: 120,
            height: 500,
            colorLow: "#00008b",
            colorHigh: "#ffffff",
            gradientStart: 0.0,
            gradientEnd: 1.0,
            gradientSkew: 1.0,
        },
        links: linksConfig ? { ...linksConfig } : {
            size: 150.0,
        },
    };

    if (bloomPass) {
        settings.bloom = {
            strength: bloomPass.strength,
            radius: bloomPass.radius,
            threshold: bloomPass.threshold,
        };
    }

    // Props folder
    if (propsConfig && onPropsChange) {
        const propsFolder = gui.addFolder("Props");
        propsFolder.close();

        propsFolder
            .add(settings.props, "totalDensity", 0, 20, 0.1)
            .name("Total Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "treeDensity", 0, 20, 0.1)
            .name("Tree Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "rockDensity", 0, 20, 0.1)
            .name("Rock Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "clusteringFactor", 0.2, 2, 0.1)
            .name("Clustering")
            .onChange(() => onPropsChange(settings.props));
    }

    // Links folder
    if (settings.links && onLinksChange) {
        const linksFolder = gui.addFolder("Links");
        linksFolder.close();

        linksFolder
            .add(settings.links, "size", 10, 1000, 10)
            .name("Text Size")
            .onChange(() => onLinksChange(settings.links!));
    }

    // Bloom folder
    if (bloomPass && settings.bloom) {
        const bloomFolder = gui.addFolder("Bloom (Wireframes)");
        bloomFolder.close();

        bloomFolder
            .add(settings.bloom, "strength", 0, 3, 0.01)
            .name("Strength")
            .onChange((value: number) => {
                bloomPass.strength = value;
            });

        bloomFolder
            .add(settings.bloom, "radius", 0, 2, 0.01)
            .name("Radius")
            .onChange((value: number) => {
                bloomPass.radius = value;
            });

        bloomFolder
            .add(settings.bloom, "threshold", 0, 1, 0.01)
            .name("Threshold")
            .onChange((value: number) => {
                bloomPass.threshold = value;
            });
    }

    // Terrain folder
    if (terrainConfig && onTerrainChange) {
        const terrainFolder = gui.addFolder("Terrain");
        terrainFolder.close();

        terrainFolder
            .add(settings.terrain!, "size", 7000, 21000, 100)
            .name("Total Size")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .add(settings.terrain!, "segments", 120, 240, 1)
            .name("Polygon Count")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .add(settings.terrain!, "height", 100, 1500, 10)
            .name("Height Strength")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .addColor(settings.terrain!, "colorLow")
            .name("Lower Color")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .addColor(settings.terrain!, "colorHigh")
            .name("Upper Color")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .add(settings.terrain!, "gradientStart", 0, 1, 0.01)
            .name("Gradient Start")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        terrainFolder
            .add(settings.terrain!, "gradientEnd", 0, 1, 0.01)
            .name("Gradient End")
            .onFinishChange(() => onTerrainChange(settings.terrain!));

        const skewProxy = {
            get value() {
                const s = settings.terrain!.gradientSkew;
                return s >= 1 ? (s - 1) : -((1 / s) - 1);
            },
            set value(v: number) {
                if (v >= 0) {
                    settings.terrain!.gradientSkew = 1 + v;
                } else {
                    settings.terrain!.gradientSkew = 1 / (1 - v);
                }
                onTerrainChange(settings.terrain!);
            }
        };

        terrainFolder
            .add(skewProxy, "value", -9, 9, 0.1)
            .name("Gradient Skew (Bi-directional)")
            .onChange(() => { /* onChange handled in setter */ });

    }

    // Global Actions
    if (onSaveDefaults) {
        const actions = {
            setDefaults: () => {
                onSaveDefaults(settings);
            }
        };
        gui.add(actions, "setDefaults").name("Set Default");
    }

    return {
        gui,
        settings,
    };
};
