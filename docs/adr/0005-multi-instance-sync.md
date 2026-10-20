# 5. Relay rooms between server instances over pub/sub

## Context

Each server process keeps a Yjs replica and the presence of every loaded room in memory.
Behind a load balancer, two people on the same board can land on different instances and
would not see each other.

## Options

- **Sticky routing by room.** No server changes, but needs a load balancer that hashes on
  the URL path, and a failed instance still drops its rooms.
- **Pub/sub between instances.** Every instance keeps its own replica and relays what its
  clients send. Works with any load balancer.

## Decision

Pub/sub, behind a two-method `Bus` interface: an in-memory bus for tests, Redis in
production (`REDIS_URL`). The Redis client is a minimal RESP client over `node:net`
(publish, subscribe, reconnect) rather than a new dependency.

- Each loaded room subscribes to `weft:room:<id>`. Messages are y-websocket frames
  prefixed with the room replica's client id, so an instance skips its own messages.
- Doc and presence updates from local sockets are published; updates from the bus are
  applied with a `bus` origin, sent to local sockets and never published again.
- A room that loads publishes a sync step 1 and an awareness query. Peers answer with the
  diff against its state vector and with their presence, so state that is not yet saved
  reaches the new instance.
- A client that leaves is removed from presence on its instance and the removal is
  published. If an instance dies, its clients expire elsewhere through the awareness
  timeout.
- Snapshots stay in shared storage. Before writing, an instance merges the stored snapshot
  into its replica, so instances never overwrite each other's work. A version is written
  only if the newest stored one is older than the interval, which keeps history to one
  entry per interval across instances.

## Consequences

- Instances scale out without sticky sessions; the protocol between them is the one the
  clients already speak.
- Redis pub/sub does not buffer. Messages lost while an instance is disconnected are
  recovered when either side next saves, since saving merges the stored snapshot and
  publishes anything new.
- Two instances saving in the same moment can both record a version. That is a harmless
  duplicate.
