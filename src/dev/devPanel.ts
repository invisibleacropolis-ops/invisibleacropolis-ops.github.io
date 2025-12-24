import GUI from "lil-gui";
import type { PropsConfig } from "../scene/props.ts";

export type DevPanelOptions = {
    propsConfig?: PropsConfig;
    onPropsChange?: (config: PropsConfig) => void;
};

export type DevSettings = {
    props: PropsConfig;
};

export const createDevPanel = ({
    propsConfig,
    onPropsChange,
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

    // Props folder
    if (propsConfig && onPropsChange) {
        const propsFolder = gui.addFolder("Props");
        propsFolder.close();

        propsFolder
            .add(settings.props, "totalDensity", 0, 2, 0.1)
            .name("Total Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "treeDensity", 0, 2, 0.1)
            .name("Tree Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "rockDensity", 0, 2, 0.1)
            .name("Rock Density")
            .onChange(() => onPropsChange(settings.props));

        propsFolder
            .add(settings.props, "clusteringFactor", 0.2, 2, 0.1)
            .name("Clustering")
            .onChange(() => onPropsChange(settings.props));
    }

    return {
        gui,
        settings,
    };
};
