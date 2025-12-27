# Developer Guide: Runtime Panel

The application includes a `lil-gui` panel for real-time tweaking of procedural parameters. Press `H` (default lil-gui behavior) or look for the "Dev Panel" in the top-right to expand it.

## Sections

### Props
Control the density and distribution of vegetation.
-   **Total Density**: Global multiplier for all props.
-   **Tree/Rock Density**: Specific multipliers for object types.
-   **Clustering**: Controls how "patchy" the distribution is. Higher values = tighter groups, more empty space between groups.

### Terrain
*Note: Changing these values triggers a full terrain regeneration.*
-   **Total Size**: World width/depth.
-   **Polygon Count**: Resolution of the mesh segments.
-   **Height Strength**: Vertical scaling of the heightmap data.
-   **Colors**: Define the gradient start (Low) and end (High) colors.
-   **Gradient Skew**: Shifts the midpoint of the color gradient up or down the mountains.

### Bloom (Wireframes)
adjust the post-processing glow.
-   **Strength**: Intensity of the glow.
-   **Radius**: Spread of the glow.
-   **Threshold**: Brightness cutoff for pixels to glow.

### Links
-   **Text Size**: Scale of the 3D labels.
-   **Placement Radius**: Distance from center for ring/square layouts.
-   **Shape**: Geometric arrangement of the links.

## Persistence
Settings are automatically saved to `localStorage` key `invisible_acropolis_dev_settings`.
-   **Set Default**: Saves the current configuration as the new default for your browser session.
