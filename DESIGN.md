# Weft design direction

> Direction written by the coding agent at the owner's request ("decide yourself, don't
> ask about details"). Agent-written direction drifts toward default taste, so every
> choice below carries its reason; change any of them freely.

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1

Reading this as: a collaborative canvas tool for small teams, in a quiet workbench
language where the board is the product and the chrome steps back.

## Identity

The name comes from weaving: the weft is the thread passed across the warp. Every
person in a room is a thread with its own color. That is the one motif, and it shows up
wherever people appear: cursors, name tags, remote selection outlines, avatars.

## Palette

Chrome is two neutrals plus one accent. Content colors are a separate, per-theme set,
because what people draw must stay legible for collaborators using the other theme.

| Token        | Light     | Dark      | Use                                                    |
| ------------ | --------- | --------- | ------------------------------------------------------ |
| paper        | `#F6F4EF` | `#17181A` | Board background. Warm off-white reads as paper.       |
| surface      | `#FFFFFF` | `#222326` | Floating panels and dialogs.                           |
| ink          | `#1D1B18` | `#ECE9E2` | Text and icons. 15.6:1 / 14.7:1 on paper.              |
| muted        | `#6B655B` | `#A39E94` | Secondary text. 5.3:1 / 6.7:1 on paper.                |
| line         | `#DDD8CE` | `#34353A` | Panel borders (decorative, not control boundaries).    |
| control-line | `#8C8577` | `#6E6A63` | Input borders. Meets 3:1 non-text contrast.            |
| accent       | `#C2410C` | `#FF8A4C` | Selection, handles, the active tool, the Share button. |

The accent is vermilion, the color of a marking thread. It is reserved for "this is
yours and active": your selection, your current tool, the one primary action. Nothing
else uses it.

Content colors (ink, red, orange, yellow, green, blue, violet) are defined in
`apps/web/src/canvas/palette.ts`. Strokes pass 4.5:1 on paper in both themes so text
shapes in any color stay readable. Sticky notes always use dark text on light paper.

## Typography

IBM Plex Sans, self-hosted. It was drawn for technical tools, stays crisp at the small
sizes the chrome uses, and its slightly mechanical forms suit a workbench. It is not one
of the default picks (Inter, Geist), which keeps the product from looking generic.
Board text uses the same family, so exported images match the screen.

## Shape and depth

- Radius: 8px panels, 6px buttons, 2px sticky notes (paper has nearly square corners).
- Shadow only on things that float above the board: toolbar, panels, dialogs, sticky
  notes. The board itself is flat.
- Board background: a sparse dot grid that fades when zoomed out. Its job is motion
  feedback: on an empty board you cannot tell you are panning without it.

## Motion

Hover and press states only, plus one functional animation: remote cursors glide
between network updates (sent every 40ms) instead of jumping. Nothing loops.
`prefers-reduced-motion` turns the glide off.

## Layout

Board fills the window. Chrome floats at the edges, ordered by how often it is used:
tools at the bottom center (thumb reach on phones), style options on the left only when
something is selected or a drawing tool is active, people and Share at the top right,
zoom and history at the bottom corners.
