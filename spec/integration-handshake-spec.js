import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

describe('Integration: Handshake/connection buffer', () => {
  it('accepts bot connection with handshake', async () => {
    const config = { ...defaults, HIDE_LOGO: true, UPDATE_RATE: 20, protocols: { entities: [], messages: [], basics: [], components: [], localMessages: [], commands: [] } }
    const port = 8102
    const instance = new nengi.Instance(config, { port })
    let accepted = false
    instance.onConnect((client, handshake, accept) => {
      expect(handshake).toBeDefined()
      accept({ accepted: true, text: 'welcome' })
      accepted = true
    })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, { foo: 'bar' })
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(true)
    expect(accepted).toBe(true)
  }, 10000)

  it('denies bot connection with handshake', async () => {
    const config = { ...defaults, HIDE_LOGO: true, UPDATE_RATE: 20, protocols: { entities: [], messages: [], basics: [], components: [], localMessages: [], commands: [] } }
    const port = 8103
    const instance = new nengi.Instance(config, { port })
    let denied = false
    instance.onConnect((client, handshake, accept) => {
      expect(handshake).toBeDefined()
      accept({ accepted: false, text: 'nope' })
      denied = true
    })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false
    bot.onConnect(() => { connected = true })
    bot.connect(`ws://localhost:${port}/nengi`, { foo: 'bar' })
    for (let i = 0; i < 80 && !connected; i++) { await new Promise(r => setTimeout(r, 25)) }
    expect(connected).toBe(false)
    expect(denied).toBe(true)
  }, 10000)
})
