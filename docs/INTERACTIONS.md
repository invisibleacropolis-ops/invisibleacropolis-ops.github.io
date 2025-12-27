# Interactions & Controls

## FPS Controls
**Module**: `src/controls/fps.ts`

-   **Movement**: WASD keys move the camera relative to its view direction.
-   **Look**: Mouse movement rotates the camera (Pointer Lock required).
-   **Pointer Lock**: Clicking on the canvas requests pointer lock.

## Interactive Links
**Module**: `src/scene/links.ts`

-   **Proximity**: As the camera approaches a Link label, the `ProximityEffect` interpolates its color from a base color to a highlight color.
-   **Raycasting**:
    -   If the pointer is locked (FPS mode), a ray is cast from the center of the screen.
    -   If unlocked, the mouse cursor position is used.
-   **Click**: Clicking a Link navigates the browser to the URL defined in `pages.json`.

## Visual Feedback
-   **RayBurst**: A particle effect attached to the camera that trails behind movement.
-   **Cursor**: The system cursor changes to a pointer when hovering over a valid target (Link).
