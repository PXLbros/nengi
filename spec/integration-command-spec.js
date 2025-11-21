import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'
// Protocol & EntityProtocol not needed directly here; ProtocolMap will create entity protocol

class MoveCommand {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}
MoveCommand.protocol = {
  x: BinaryType.Float32,
  y: BinaryType.Float32
}

// Simple entity used to ensure the bot/client is fully ticked in
class TestEntity {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}
TestEntity.protocol = {
  x: BinaryType.Float32,
  y: BinaryType.Float32
}

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
    commands: [ ['MoveCommand', MoveCommand] ]
  }
})

describe('Integration: Bot command roundtrip', () => {
  it('bot sends command, server receives and processes', async () => {
    const config = makeConfig()
    const port = 8096
    const instance = new nengi.Instance(config, { port })

    let received = null
    instance.onConnect((client, handshake, accept) => {
      accept({ accepted: true, text: 'ok' })
    })
    instance.on('command', (cmd, client) => {
      received = { cmd, client }
    })

    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, {})

    for (let i = 0; i < 40 && !connected; i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    expect(connected).toBe(true)

    // Add entity to ensure client is ticked in and snapshot exchange occurs
    const entity = new TestEntity(0, 0)
    entity.protocol = TestEntity.prototype.protocol
    instance.addEntity(entity)
    for (let t = 0; t < 3; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }

    // Wait for websocket to be open before sending command
    await new Promise(r => setTimeout(r, 100))
    const cmd = new MoveCommand(42, 99)
    bot.addCommand(cmd)
    // Call bot.update a few times to flush command reliably
    for (let t = 0; t < 3; t++) { bot.update(); await new Promise(r => setTimeout(r, 10)) }

    // Run server ticks to process command
    let found = false
    for (let t = 0; t < 15; t++) {
      instance.update()
      bot.update() // keep pumping bot in case of retries/ack system
      await new Promise(r => setTimeout(r, 10))
      // Log instance.commands for debugging (avoid circular refs)
      // eslint-disable-next-line no-console
      console.log('Tick', t, 'instance.commands:', instance.commands.map(cmd => ({ tick: cmd.tick, commands: cmd.commands.map(c => ({ x: c.x, y: c.y })) })))
      const next = instance.getNextCommand()
      // eslint-disable-next-line no-console
      if (next) {
        console.log('getNextCommand:', { tick: next.tick, commands: next.commands.map(c => ({ x: c.x, y: c.y })) })
      }
      if (next && next.commands.some(c => c.x === 42 && c.y === 99)) {
        found = true
        break
      }
    }
    // Log bot outbound state for debugging
    // eslint-disable-next-line no-console
    console.log('Bot outbound:', JSON.stringify(bot.outbound))
    expect(found).toBe(true)
  }, 10000)
})
