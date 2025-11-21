import { describe, it } from 'vitest'
import { monitorEventLoopDelay } from 'node:perf_hooks'
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

function runScenario(entityCount, ticks, poolMax) {
  const cfg = makeConfig(poolMax)
  const instance = new nengi.Instance(cfg, { port: 0, mock: true })
  const entities = []
  for (let i = 0; i < entityCount; i++) {
    const e = new PoolEntity(i+1)
    e.protocol = PoolEntity.prototype.protocol
    entities.push(instance.addEntity(e))
  }
  const eld = monitorEventLoopDelay({ resolution: 10 })
  eld.enable()
  const start = process.hrtime.bigint()
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < entityCount; i++) {
      const ent = entities[i]
      ent.x += ((i + t) % 3) - 1
    }
    instance.update()
  }
  const end = process.hrtime.bigint()
  eld.disable()
  const ms = Number(end - start) / 1e6
  const mem = process.memoryUsage()
  return {
    ms,
    mem,
    eld: {
      mean: eld.mean / 1e6, // ms
      max: eld.max / 1e6,   // ms
      stddev: eld.stddev / 1e6 // ms
    }
  }
}

describe('perf: snapshot array pooling', () => {
  it('baseline 1000 entities (pool vs disabled)', () => {
    const pooled = runScenario(1000, 100, 64)
    const disabled = runScenario(1000, 100, 0)
    console.log(`[perf-snapshot-pool][1000] pooled ms:${pooled.ms.toFixed(2)} ms/tick:${(pooled.ms/100).toFixed(2)} rss:${(pooled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(pooled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${pooled.eld.mean.toFixed(4)}ms eld-max:${pooled.eld.max.toFixed(4)}ms`)
    console.log(`[perf-snapshot-pool][1000] disabled ms:${disabled.ms.toFixed(2)} ms/tick:${(disabled.ms/100).toFixed(2)} rss:${(disabled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(disabled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${disabled.eld.mean.toFixed(4)}ms eld-max:${disabled.eld.max.toFixed(4)}ms`)
  })

  it('scaled 5000 entities 60 ticks (pool vs disabled)', () => {
    const ticks = 60
    const pooled = runScenario(5000, ticks, 128) // enlarge pool for more entities
    const disabled = runScenario(5000, ticks, 0)
    console.log(`[perf-snapshot-pool][5000x${ticks}] pooled ms:${pooled.ms.toFixed(2)} ms/tick:${(pooled.ms/ticks).toFixed(2)} rss:${(pooled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(pooled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${pooled.eld.mean.toFixed(4)}ms eld-max:${pooled.eld.max.toFixed(4)}ms`)
    console.log(`[perf-snapshot-pool][5000x${ticks}] disabled ms:${disabled.ms.toFixed(2)} ms/tick:${(disabled.ms/ticks).toFixed(2)} rss:${(disabled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(disabled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${disabled.eld.mean.toFixed(4)}ms eld-max:${disabled.eld.max.toFixed(4)}ms`)
  })

  it('high tick 5000 entities 120 ticks (pool vs disabled)', () => {
    const ticks = 120
    const pooled = runScenario(5000, ticks, 128)
    const disabled = runScenario(5000, ticks, 0)
    console.log(`[perf-snapshot-pool][5000x${ticks}] pooled ms:${pooled.ms.toFixed(2)} ms/tick:${(pooled.ms/ticks).toFixed(2)} rss:${(pooled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(pooled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${pooled.eld.mean.toFixed(4)}ms eld-max:${pooled.eld.max.toFixed(4)}ms`)
    console.log(`[perf-snapshot-pool][5000x${ticks}] disabled ms:${disabled.ms.toFixed(2)} ms/tick:${(disabled.ms/ticks).toFixed(2)} rss:${(disabled.mem.rss/1e6).toFixed(2)}MB heapUsed:${(disabled.mem.heapUsed/1e6).toFixed(2)}MB eld-mean:${disabled.eld.mean.toFixed(4)}ms eld-max:${disabled.eld.max.toFixed(4)}ms`)
  })
})
