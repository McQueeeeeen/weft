# 2. One Y.Map per shape, fractional indexes for order

## Context

The schema decides which concurrent edits survive a merge.

## Decision

- The root is a `Y.Map` keyed by shape id; each shape is its own `Y.Map` of fields.
  Concurrent edits to different fields of one shape both apply.
- Paint order is a `index` string field (fractional indexing) rather than a `Y.Array` of
  ids. Moving a shape to the front writes one field instead of a delete plus insert, so a
  concurrent move and delete cannot resurrect or duplicate a shape.
- Equal keys created concurrently are ordered by id, identically on every client.
- Text is a plain string field, not `Y.Text`.

## Consequences

- Reads go through a validator; malformed records from a peer are skipped.
- Two people typing in the same note at once is last-writer-wins. Moving text to
  `Y.Text` would fix this at the cost of binding a CRDT text type to the textarea.
