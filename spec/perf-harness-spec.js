import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class DummyEntity {
  constructor(x) { this.x = x }
}
DummyEntity.protocol = { x: BinaryType.Float32 }

const makeConfig = (entityCount) => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [ ['DummyEntity', DummyEntity] ],
    messages: [], basics: [], components: [], localMessages: [], commands: []
  }
})

const pause = ms => new Promise(r => setTimeout(r, ms))

describe('Perf/Stress: Instance tick throughput & memory', () => {
  it('handles 1000 entities for 100 ticks', async () => {
    const entityCount = 1000
    const config = makeConfig(entityCount)
    const port = 8110
    const instance = new nengi.Instance(config, { port })
    // Add entities
    for (let i = 0; i < entityCount; i++) {
      const ent = new DummyEntity(i)
      ent.protocol = DummyEntity.prototype.protocol
      instance.addEntity(ent)
    }
    // Measure tick/update time
    const start = process.hrtime.bigint()
    for (let t = 0; t < 100; t++) {
      instance.update()
      await pause(1)
    }
    const end = process.hrtime.bigint()
    const ms = Number(end - start) / 1e6
    console.log(`Ticked 1000 entities for 100 ticks in ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(5000) // Should complete in under 5s
    // Optionally, check memory usage
    const mem = process.memoryUsage()
    console.log('Memory usage:', mem)
    expect(mem.heapUsed).toBeLessThan(200 * 1024 * 1024) // <200MB
  })
})
