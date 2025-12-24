import GUI from "lil-gui";
import type { PropsConfig } from "../scene/props.ts";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type DevPanelOptions = {
    propsConfig?: PropsConfig;
    onPropsChange?: (config: PropsConfig) => void;
    bloomPass?: UnrealBloomPass;
};

export type DevSettings = {
    props: PropsConfig;
    bloom?: {
        strength: number;
        radius: number;
        threshold: number;
    };
};

export const createDevPanel = ({
    propsConfig,
    onPropsChange,
    bloomPass,
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

    return {
        gui,
        settings,
    };
};
