import { describe, it } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class PoolEntity { constructor(id) { this.x = id; this.y = id } }
// Define protocol (nengi assigns id & type internally using config.ID_PROPERTY_NAME)
PoolEntity.protocol = { x: BinaryType.Int16, y: BinaryType.Int16 }

function makeConfig(poolMax) {
  return {
    ...defaults,
    HIDE_LOGO: true,
    UPDATE_RATE: 20,
    SNAPSHOT_ARRAY_POOL_MAX: poolMax,
    protocols: {
      entities: [ ['PoolEntity', PoolEntity] ],
      messages: [], basics: [], components: [], localMessages: [], commands: []
    }
  }
}

describe('perf: snapshot array pooling', () => {
  it('compares pooled vs disabled for snapshot construction', () => {
    const ENTITY_COUNT = 1000
    const TICKS = 100
    function run(poolMax) {
      const cfg = makeConfig(poolMax)
      const instance = new nengi.Instance(cfg, { port: 0, mock: true })
      const entities = []
      for (let i = 0; i < ENTITY_COUNT; i++) {
        const e = new PoolEntity(i+1)
        // Assign the protocol object produced by ProtocolMap (on prototype)
        e.protocol = PoolEntity.prototype.protocol
        entities.push(instance.addEntity(e))
      }
      const start = process.hrtime.bigint()
      for (let t = 0; t < TICKS; t++) {
        // mutate entities lightly
        for (let i = 0; i < ENTITY_COUNT; i++) {
          const ent = entities[i]
          ent.x += ((i + t) % 3) - 1
        }
        instance.update()
      }
      const end = process.hrtime.bigint()
      const ms = Number(end - start) / 1e6
      const mem = process.memoryUsage()
      return { ms, mem }
    }

    const pooled = run(64)
    const disabled = run(0)
    console.log(`[perf-snapshot-pool] pooled ms:${pooled.ms.toFixed(2)} rss:${(pooled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(pooled.mem.heapUsed/1e6).toFixed(2)}MB arrayBuffers:${(pooled.mem.arrayBuffers/1e6).toFixed(2)}MB`)
    console.log(`[perf-snapshot-pool] disabled ms:${disabled.ms.toFixed(2)} rss:${(disabled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(disabled.mem.heapUsed/1e6).toFixed(2)}MB arrayBuffers:${(disabled.mem.arrayBuffers/1e6).toFixed(2)}MB`)
    // Non-assertive; provide rough comparison (expect pooled <= disabled time)
  })
})
