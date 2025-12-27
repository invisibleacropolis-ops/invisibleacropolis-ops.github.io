# Invisible Acropolis - Overview

Invisible Acropolis is a 3D procedural web experience built with **Three.js** and **TypeScript**. It features a vast, navigable terrain populated with generated vegetation ("props") and interactive 3D links, rendered with stylized wireframe aesthetics and bloom effects.

## Key Features

-   **Procedural World**: Terrain generated from heightmaps with customizable vertex-color gradients.
-   **Dynamic Props**: Procedural distribution of trees and rocks controlled by density and clustering algorithms.
-   **Stylized Rendering**: Wireframe shaders, selective bloom (glow), and atmospheric fog.
-   **Interactive Links**: 3D text labels that serve as navigation portals, reacting to camera proximity.
-   **Dev Tools**: A built-in runtime configuration panel (`lil-gui`) to tweak terrain, props, and effects in real-time.

## Technology Stack

-   **Runtime**: Three.js (WebGL)
-   **Language**: TypeScript
-   **Build Tool**: Vite
-   **UI**: lil-gui (for Dev Panel)

## Quick Start

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Run development server**:
    ```bash
    npm run dev
    ```
3.  **Build for production**:
    ```bash
    npm run build
    ```
