# 1. Use a CRDT (Yjs) for collaborative state

## Context

Several people edit one board at the same time, sometimes offline. Every replica must
end in the same state without a central lock, and offline edits must merge on reconnect.

## Options

- **Last-writer-wins on whole objects over WebSocket.** Simple, but concurrent edits to
  different properties of one shape overwrite each other, and offline work needs custom
  reconciliation.
- **Operational transformation.** Proven for text, but needs a central server to order
  operations and transform functions per operation pair; offline support is hard.
- **CRDT (Yjs).** Replicas merge in any order. Mature, compact binary encoding, existing
  WebSocket and IndexedDB providers, undo manager that understands origins.

## Decision

Yjs. The server keeps a replica only to serve late joiners and persistence; it never
arbitrates conflicts.

## Consequences

- Offline editing and reconnect need no extra code.
- Per-user undo comes from tracking transaction origins.
- The document grows with history; snapshots compact it on save.
