import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'

class TestEntity {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}
// raw schema; ProtocolMap will convert to a Protocol instance and attach to prototype
TestEntity.protocol = {
  x: BinaryType.Float32,
  y: BinaryType.Float32
}

// Build config merging defaults with required protocol listings
const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [ ['TestEntity', TestEntity] ],
    messages: [],
    basics: [],
    components: [],
    localMessages: [],
    commands: []
  }
})

describe('Integration: Instance <-> Bot basic entity lifecycle', () => {
  it('bot receives create, update, and delete for an entity', async () => {
    const config = makeConfig()
    const port = 8095
    const instance = new nengi.Instance(config, { port })

    // Register connect handler to accept all handshakes
    instance.onConnect((client, handshake, accept) => {
      accept({ accepted: true, text: 'ok' })
    })

    // Create bot & protocol map
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)

    let connected = false
    bot.onConnect(() => { connected = true })

    bot.connect(`ws://localhost:${port}/nengi`, {})

    // Wait up to 2s for connection
    for (let i = 0; i < 40 && !connected; i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(connected).toBe(true)

    // Add entity on server
    const entity = new TestEntity(0, 0)
    // Protocol already attached to prototype by ProtocolMap; ensure instance has reference
    entity.protocol = TestEntity.prototype.protocol
    instance.addEntity(entity)

    // Run a few ticks to deliver creation
    for (let t = 0; t < 3; t++) {
      instance.update()
      await new Promise(r => setTimeout(r, 10))
    }

    // Bot should have received create
    expect(bot.cr.length > 0 || bot.snapshots.some(ws => ws.createEntities.length > 0)).toBe(true)

    // Mutate entity & run ticks to deliver updates
    entity.x = 5
    entity.y = 7
    for (let t = 0; t < 3; t++) {
      instance.update()
      await new Promise(r => setTimeout(r, 10))
    }

    // Confirm update arrived (partial updates targeting x/y)
    const anyUpdate = bot.up.some(u => (u.prop === 'x' && u.value === 5) || (u.prop === 'y' && u.value === 7)) ||
      bot.snapshots.some(ws => ws.updateEntities.some(up => (up.prop === 'x' && up.value === 5) || (up.prop === 'y' && up.value === 7)))
    expect(anyUpdate).toBe(true)

    // Capture id before removal (removeEntity resets nid to -1)
    const removedId = entity.nid
    instance.removeEntity(entity)
    for (let t = 0; t < 3; t++) {
      instance.update()
      await new Promise(r => setTimeout(r, 10))
    }

    // Confirm deletion noticed
    const sawDelete = bot.de.includes(removedId) || bot.snapshots.some(ws => ws.deleteEntities.includes(removedId))
    expect(sawDelete).toBe(true)
  }, 10000)
})
