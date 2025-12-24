import GUI from "lil-gui";

export type DevPanelOptions = {
    // Empty for now - will add settings as needed
};

export type DevSettings = {
    // Empty for now
};

export const createDevPanel = ({ }: DevPanelOptions = {}) => {
    const gui = new GUI({ title: "Dev Panel", width: 300 });
    gui.close(); // Start collapsed

    const settings: DevSettings = {};

    // Dev panel is empty for now - will add controls as needed

    return {
        gui,
        settings,
    };
};
