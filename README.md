# nengi.js - multiplayer network engine <img src="https://timetocode.com/images/nengi-logo-32x32.png" />
Hello friend. Nengi.js is a networking library/engine for node.js and HTML5.

Nengi straddles two types of performance: volume and responsiveness.

 With respect to volume, it is possible to make a nengi game that can support 100+ concurrent players or 50,000+ entities on a 20 tick server.
 
 Regarding responsiveness, the advanced api consists of tools that can eliminate input delay, setup lag compensated collisions, and smooth away lag. This boils down to a game with controls so responsive that it feels like single player.

Have your players saying:
>"HOW IS THIS A BROWSER GAME?!"

Join us on [nengi's Discord server](https://discord.gg/7kAa7NJ) or help support development on [timetocode's Patreon](https://www.patreon.com/timetocode)

## Currently compatible with node 14; will not work with node 15+
This is a stable branch of nengi, the very same that has a several millions of gameplays on it. It however relies on a websocket library that has no support past node 14 (cWS.js).

## Node 16 support (NEW, also may not work with node 17)
There is an experimental branch called 'sixteen' which uses uWS.js for its websocket layer. The previously used library (cWS.js) was itself a fork of an earlier version of uWS.js. The nengi api remains unchanged EXCEPT: bots don't work (yet) and the SSL syntax has changed (see uWS.js docs for new ssl syntax). There's no particular reason to think that this branch of nengi is less stable, but it is being kept separate until more users have tested it and bot support has been added (which will have to come through an addtional websocket library, likely the one simply named "ws"). If you are using this branch please share your experiences on the nengi discord server. It has been noted by the creator of uWS.js that they will only support major node versions (14, 16, 18, etc) so the same can be said for this branch of nengi.
## Features
* Authoritative Server Model (anti-cheat)
* Binary compression
* Optimized game state snapshots
* Networking culling
* An easy to use api consisting of
    * Entities - persistent objects that stay synced in real time
    * Messages - events and other instantaneous occurrences
    * Commands - input from game clients
    * Channels - compose the above into more advanced features
* Interpolation
* Compatible with PIXI.js, Babylon.js, Three.js, and much more
* Clientside prediction api
    * --> move instantly on the client
    * --> nengi will provide reconciliation data if needed
* Lag compensated shots / collisions
    * --> a player fires a shot
    * --> nengi can rewind the game state to the point in time that the shot occured given the player's latency

## Templates

Please note that these templates have not been updated recently, and while they should all work you may want to bump the nengi version to latest after checking them out.

There is a tutorial series for those learning nengi available at [https://timetocode.com/nengi/intro-1](https://timetocode.com/nengi/intro-1). The code contained in these tutorials is pretty nice -- if you're making a 2D game in nengi without csp then forking this code makes for a great template.

Other templates:

* [nice-proto](https://github.com/timetocode/nice-proto) - A prototype of a simpler API, this is nengi-2d-csp under the hood. The most mature version of this api is in the tutorial mentioned above.
* [nengi-barebone](https://github.com/timetocode/nengi-barebone) - A barebone nengi template
* [nengi-2d-basic](https://github.com/timetocode/nengi-2d-basic) - A simple 2d shooter
* [nengi-2d-csp](https://github.com/timetocode/nengi-2d-csp) - A simple 2d shooter with prediction/compensation
* [nengi-babylon-3d-shooter](https://github.com/timetocode/nengi-babylon-3d-shooter) - A template for 3D predicted games with Babylon.js
* [3d-top-down](https://github.com/timetocode/3d-top-down) - A top down game, in a 3d engine (Babylon.js)

## Batch Optimization (Experimental Toggle)
Entity update snapshots can optionally group multiple property changes for the same entity into a single "optimized batch" chunk, reducing per-update overhead. This is gated behind a protocol config flag so existing games remain unchanged by default.


Enable per protocol via the constructor: `new Protocol(schema, config, optSchema, ...)` where `config` includes:
```js
const config = {
    ID_PROPERTY_NAME: 'id',
    ID_BINARY_TYPE: nengi.UInt16,
    TYPE_PROPERTY_NAME: 'type',
    ENABLE_BATCH_OPTIMIZATION: true, // default is false
    BATCH_MIN_UPDATES: 2 // minimum changed properties required before batching
}
```
When enabled, nengi will attempt to batch property diffs when it is safe to do so (atomic validity rules). Properties defined in `optSchema` with `delta: true` are encoded as deltas in the batch, while absolute properties (`delta: false`) include their full value. If batching cannot be done safely, the update falls back to individual per-property updates.

**Adaptive Escalation:**
When batching is enabled, the engine will automatically tune `BATCH_MIN_UPDATES` based on the batch acceptance rate. If batches are frequently rejected (acceptance rate < 20%), `BATCH_MIN_UPDATES` will increase (up to 8) to reduce batch attempts. If batches are frequently accepted (acceptance rate > 80%), `BATCH_MIN_UPDATES` will decrease (down to 2) to allow more batching. This dynamic adjustment helps optimize batch performance for your workload.

Trade-offs & Heuristic:
- Can reduce repeated markers & ids.
- May increase size if batching triggers for single-property changes; mitigated by `BATCH_MIN_UPDATES` (default 2, adaptively tuned).
- Best for entities with several frequently changing delta-encoded numeric fields and few absolute fields.
- Tune `BATCH_MIN_UPDATES` manually or let adaptive escalation optimize for your workload.

Disable anytime by setting the flag to `false`; games not enabling the flag retain legacy behavior. Adjust or remove batching dynamically by changing config on protocol creation.

### Batch Configuration Options

Below are all batch-related config options and guidance on when to adjust them. These are set per protocol via the `config` object you pass into `new Protocol(...)`.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `ENABLE_BATCH_OPTIMIZATION` | boolean | `false` | Master toggle; when `true` nengi evaluates batching heuristics. When `false` legacy per-property updates only. |
| `BATCH_MIN_UPDATES` | number | `2` (adaptive) | Minimum number of changed properties before a batch will be considered. Dynamically tuned based on acceptance rate (2..8). |
| `BATCH_MAX_KEYS` | number | `Infinity` | Upper bound on how many protocol keys can be placed in a single batch attempt. Use to cap batch construction cost. |
| `BATCH_RETRY_COOLDOWN_TICKS` | number | `0` | Ticks to wait after a rejected batch before trying again for the same entity (reduces repeated failed attempts). |

#### How Batching Works (Recap)
1. Collect diffs for the entity. If count < `BATCH_MIN_UPDATES` -> use single property updates.
2. If count within range and batching enabled, build candidate batch incrementally.
3. Early-exit if estimated batch bit size exceeds cost of individual updates.
4. If rejected: apply cooldown (`BATCH_RETRY_COOLDOWN_TICKS`) and increment attempts; adaptive logic may raise `BATCH_MIN_UPDATES`.
5. Acceptance stats drive adaptive tuning of `BATCH_MIN_UPDATES` (after >20 attempts):
    - Acceptance rate < 20%: increase min up to 8.
    - Acceptance rate > 80%: decrease min down to 2.

#### Quick Tuning Recipes

1. Few Properties, One Changes Often (e.g. only `x` moves every tick):
    - Symptom: Batches add overhead for single-field updates.
    - Action: Keep `ENABLE_BATCH_OPTIMIZATION: true` but set `BATCH_MIN_UPDATES: 3` (or let adaptive raise it). Ensures single-field diffs stay lean.

2. Many Small Delta Fields (e.g. `x,y,vx,vy,hp,mana` all twitchy):
    - Goal: Compress repeated id/key markers; batch likely smaller.
    - Action: `ENABLE_BATCH_OPTIMIZATION: true`, leave `BATCH_MIN_UPDATES: 2`, keep `BATCH_MAX_KEYS: Infinity` unless protocol very large.

3. Large Protocol, Occasional Wide Changes (20+ properties but usually only 4-6 change):
    - Symptom: Batch attempts scan many keys → CPU cost; early-exits frequent.
    - Action: Set `BATCH_MAX_KEYS: 8` to cap per-attempt work. Adaptive min will adjust; optionally start with `BATCH_MIN_UPDATES: 3`.

4. Frequent Rejections (low acceptance rate printed in perf logs):
    - Symptom: Acceptance < 20%, lots of wasted attempts.
    - Action: Increase `BATCH_MIN_UPDATES` manually (e.g. +1) or rely on adaptive; consider small `BATCH_RETRY_COOLDOWN_TICKS` (2–5) if churn is high.

5. One Heavy Absolute Property (large numeric or string) + light deltas:
    - Symptom: Batch wins only when several deltas change; single delta + heavy absolute inflates batch.
    - Action: Raise `BATCH_MIN_UPDATES` (3–4). If still many failed attempts, add cooldown (3 ticks) to avoid repeated rebuild.

6. Bursty State Changes (waves where many props change together):
    - Goal: Capture bursts efficiently; ignore sparse ticks.
    - Action: Keep min low (2) so adaptive can decrease after burst success; optionally set cooldown to 0 to capitalize immediately on bursts.

#### Example Config Scenarios

```js
// Lean single-movement protocol
const configSingleMove = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: nengi.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 3 // avoid batching lone x changes
}

// High-churn small deltas
const configHighChurn = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: nengi.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 2,
  BATCH_MAX_KEYS: Infinity
}

// Large protocol, limit construction cost
const configLargeProto = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: nengi.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 3,
  BATCH_MAX_KEYS: 8,
  BATCH_RETRY_COOLDOWN_TICKS: 3
}

// Heavy absolute field causing rejections
const configHeavyAbsolute = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: nengi.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 4,
  BATCH_RETRY_COOLDOWN_TICKS: 5
}
```

#### Monitoring
When batching is enabled you can inspect `protocol.stats`:
```js
// After several ticks
console.log(protocol.stats) // { batchAttempts: 123, batchAccepted: 87 }
const acceptance = protocol.stats.batchAccepted / protocol.stats.batchAttempts
```
Use the acceptance rate to decide if manual tuning is necessary or if adaptive logic suffices.

### Command Processing Order (Advanced)
By default server-side command application in examples/tests occurs outside `Instance.update()`. The optional config flag `PROCESS_COMMANDS_BEFORE_SNAPSHOT` integrates command processing directly into the tick cycle.

```js
const config = {
    // ... other nengi config
    PROCESS_COMMANDS_BEFORE_SNAPSHOT: true // default false
}
```

When enabled and you pass a processing callback into `instance.update(processFn)`:
1. Commands are applied before diffing & snapshot serialization – entity state changes appear in the same tick's snapshot.
2. Lower end-to-end latency for command → state visibility.

When disabled (default) and using `instance.update(processFn)`:
1. Snapshot is built first, then commands are applied.
2. Resulting state changes appear in the next tick's snapshot.

If you do not supply a callback (`instance.update()`), behavior is unchanged; you can continue processing commands externally.

Usage Example:
```js
function processServerCommands(instance) {
    let next
    while ((next = instance.getNextCommand())) {
        next.commands.forEach(cmd => {
            const player = /* lookup entity owned by next.client */
            if (player) {
                player.x += cmd.dx
                player.y += cmd.dy
            }
        })
    }
}

// Before-snapshot processing (low latency)
instance.update(() => processServerCommands(instance))

// After-snapshot processing (legacy timing)
config.PROCESS_COMMANDS_BEFORE_SNAPSHOT = false
instance.update(() => processServerCommands(instance))
```

Trade-offs:
- Before snapshot: lower latency, but command side-effects influence interpolation immediately.
- After snapshot: deterministic snapshot of pre-command state; useful if commands depend on authoritative validation finishing later.




## Usage
The [API documentation](https://timetocode.com/nengi) is the place to go for implementation details. But as an appetizer here is a tour of the the functionality associated with one of nengi's core features, the nengi.Entity

### the nengi.Entity stack
```js
// this is your own game object, it can have any properties or methods
class PlayerCharacter {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.likesKittens = true
    }
    someLogic() {
        //etc
    }
}

// and this tells nengi what exactly to network about it
PlayerCharacter.protocol = {
    x: { type: nengi.Float32, interp: true },
    y: { type: nengi.Float32, interp: true }
}
```

The entity can then go on to be used in a nengi.Instance (the node.js game server)

```js
const entity = new PlayerCharacter(50, 50)
instance.addEntity(entity)
```

Any changes that occur to the entity's networked properties (in this case x & y) will automatically be detected and synchronized. The nengi.Client (the HTML5 game client) will receive the following data which encompasses any state change on any entity:

```js
const network = client.readNetwork()
network.entities.forEach(snapshot => {
    snapshot.createEntities.forEach(entity => {
        // entity { nid: 65534, ntype: 0, x: 50, y: 50, protocol: { name: 'PlayerCharacter', ... }} 
    })

    snapshot.updateEntities.forEach(update => {
        // update { nid: 65534, prop: 'x', value: 63, path: ['x'] }
    })

    snapshot.deleteEntities.forEach(nid => {
        // nid 65534
    })
})
```
This is everything the game client needs to keep any number of entities in sync: create, update, and delete. The data that traveled over the network was already optimized and highly compressed. The game state that comes out of client.readNetwork() is already smoothly interpolated and compatible with different frame rates (30, 60, 144, 250 etc).

This automatic synchornization of state on entities is the soul of nengi. It strikes a balance between configurability, performance, and ease of development. It also stays out of your game code. For things that are not easily represented as an entity, we have the nengi.Message, which can be used to manually network just about anything else.

The above is sufficient to network a vast variety of games where the game client sends commands to the game server and then waits on a reply from the server before the seeing the results of its commands. I refer to these as "non-predicted" games and every aspiring multiplayer programmer should make at least one before moving deeper with nengi.

That's the end of the basic path for a nengi entity, but the documentation covers the more advanced life of an entity. Summarized briefly, entities are culled, can be used for predictive movement on the game client, and have their state rewinded for advanced lag compensation.









