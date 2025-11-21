import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class TestCommand {
  constructor(x) { this.x = x }
}
TestCommand.protocol = { x: BinaryType.UInt8 }

const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [],
    messages: [], basics: [], components: [], localMessages: [],
    commands: [ ['TestCommand', TestCommand] ]
  }
})

describe('Integration: Multi-command consecutive ticks', () => {
  it('bot sends multiple commands over consecutive ticks', async () => {
    const config = makeConfig()
    const port = 8099
    const instance = new nengi.Instance(config, { port })
    instance.onConnect((client, handshake, accept) => { accept({ accepted: true, text: 'ok' }) })
    let received = []
    instance.on('command', (cmd, client) => { received.push(cmd.x) })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(true)
    // send multiple commands
    // Add entity to ensure client is ticked in and snapshot exchange occurs
    // (not strictly needed for command, but matches integration-command-spec.js)
    // const entity = new TestEntity(0, 0)
    // entity.protocol = TestEntity.prototype.protocol
    // instance.addEntity(entity)
    // for (let t = 0; t < 3; t++) { instance.update(); await new Promise(r => setTimeout(r, 10)) }

    // Wait for websocket to be open before sending commands
    await new Promise(r => setTimeout(r, 100))
    for (let i = 1; i <= 5; i++) {
      bot.addCommand(new TestCommand(i))
      bot.update()
      await new Promise(r => setTimeout(r, 10))
    }
    // Run server ticks to process commands
    let found = []
    for (let t = 0; t < 20; t++) {
      instance.update()
      bot.update()
      await new Promise(r => setTimeout(r, 10))
      const next = instance.getNextCommand()
      if (next && next.commands) {
        found.push(...next.commands.map(c => c.x))
      }
      if (found.length >= 5) break
    }
    expect(found).toEqual([1,2,3,4,5])
  }, 10000)
})
