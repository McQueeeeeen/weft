# 4. Keep the editor free of DOM and framework code

## Context

Interaction logic (tools, gestures, selection, clipboard, camera) is where most bugs in
canvas editors live, and it is painful to test through a browser.

## Decision

`packages/core` contains the editor as a state machine fed with normalized input
(pointer, wheel, key). It has no imports from React or the DOM. The web app translates
browser events and renders the exposed state; React components subscribe to narrow
slices of it.

## Consequences

- Every gesture is covered by fast unit tests in Node.
- The same core could drive another renderer or a headless bot.
- The web layer stays thin: event wiring, drawing and layout.
