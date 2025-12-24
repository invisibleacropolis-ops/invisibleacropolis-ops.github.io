import GUI from "lil-gui";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type DevPanelOptions = {
    bloomPass: UnrealBloomPass;
};

export type DevSettings = {
    postprocess: {
        bloom: {
            strength: number;
            radius: number;
            threshold: number;
        };
    };
};

export const createDevPanel = ({ bloomPass }: DevPanelOptions) => {
    const gui = new GUI({ title: "Dev Panel", width: 300 });
    gui.close(); // Start collapsed

    // Settings object that syncs with the GUI
    const settings: DevSettings = {
        postprocess: {
            bloom: {
                strength: bloomPass.strength,
                radius: bloomPass.radius,
                threshold: bloomPass.threshold,
            },
        },
    };

    // Postprocess folder
    const postprocessFolder = gui.addFolder("Postprocess");
    postprocessFolder.close();

    // Bloom subfolder
    const bloomFolder = postprocessFolder.addFolder("Bloom");
    bloomFolder.close();

    bloomFolder
        .add(settings.postprocess.bloom, "strength", 0, 3, 0.01)
        .name("Strength")
        .onChange((value: number) => {
            bloomPass.strength = value;
        });

    bloomFolder
        .add(settings.postprocess.bloom, "radius", 0, 2, 0.01)
        .name("Radius")
        .onChange((value: number) => {
            bloomPass.radius = value;
        });

    bloomFolder
        .add(settings.postprocess.bloom, "threshold", 0, 1, 0.01)
        .name("Threshold")
        .onChange((value: number) => {
            bloomPass.threshold = value;
        });

    return {
        gui,
        settings,
    };
};
