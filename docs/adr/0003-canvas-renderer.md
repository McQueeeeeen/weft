# 3. Render the board with Canvas 2D

## Context

Boards can hold thousands of shapes and must stay smooth while panning, zooming and
receiving remote updates.

## Options

- **SVG or DOM per shape.** Easy hit testing and accessibility, but layout and style
  recalculation grow with shape count, and every remote update touches the DOM.
- **WebGL.** Fastest, but text rendering and line quality need substantial custom work.
- **Canvas 2D.** One element, cost proportional to what is drawn.

## Decision

Canvas 2D with on-demand frames, viewport culling through the spatial index, cached
`Path2D` for strokes and line "greeking" for text too small to read. Text editing uses a
DOM textarea placed over the shape, and a live status region describes the board for
screen readers.

## Consequences

- Hit testing is implemented in the core, in world coordinates, and unit tested.
- Rendering code is shared with PNG export; SVG export shares path generation.
