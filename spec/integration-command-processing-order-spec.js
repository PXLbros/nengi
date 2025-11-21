import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
// use server-side proxyCache diffs to assert timing instead of decoding snapshot network format
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

class Player { constructor(x,y){ this.x=x; this.y=y } }
Player.protocol = { x: BinaryType.Float32, y: BinaryType.Float32 }
class MoveCommand { constructor(dx,dy){ this.dx=dx; this.dy=dy } }
MoveCommand.protocol = { dx: BinaryType.Int16, dy: BinaryType.Int16 }

const makeConfig = (before) => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  PROCESS_COMMANDS_BEFORE_SNAPSHOT: before,
  protocols: {
    entities: [ ['Player', Player] ],
    messages: [], basics: [], components: [], localMessages: [],
    commands: [ ['MoveCommand', MoveCommand] ]
  }
})

const pause = ms => new Promise(r => setTimeout(r, ms))

function processServerCommands(instance, playerByClient) {
  let next
  while ((next = instance.getNextCommand())) {
    for (const cmd of next.commands) {
      const p = playerByClient.get(next.client)
      if (p) { p.x += cmd.dx; p.y += cmd.dy }
    }
  }
}

describe('Integration: command processing order flag', () => {
  it('updates entity in same tick when PROCESS_COMMANDS_BEFORE_SNAPSHOT=true', async () => {
    const config = makeConfig(true)
    const port = 8120
    const instance = new nengi.Instance(config, { port })
    const idProp = config.ID_PROPERTY_NAME
    const players = new Map()
    instance.onConnect((client, hs, accept) => {
      accept({ accepted:true, text:'ok' })
      setTimeout(() => {
        if (client.accepted) {
          const p = new Player(0,0); p.protocol = Player.prototype.protocol
          instance.addEntity(p); players.set(client, p)
        }
      }, 0)
    })
    // Use the same ProtocolMap instance as the server to avoid protocol identity mismatch
    const bot = new nengi.Bot(config, instance.protocols)
    let connected = false; bot.onConnect(()=> connected=true)
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i=0;i<60 && !connected;i++) await pause(25)
    expect(connected).toBe(true)
    // establish entity (wait until players map has one entry)
    for (let t=0;t<20 && players.size===0;t++){ instance.update(()=>processServerCommands(instance, players)); bot.update(); await pause(10) }
    expect(players.size).toBe(1)
    // ensure entity is awake for diff computation
    const player = players.get([...players.keys()][0])
    instance.wake(player)
    console.log('player id:', player[idProp])
    console.log('proxyCache ticks:', Object.keys(instance.proxyCache))
    console.log('proxyCache[instance.tick-1] entities:', instance.proxyCache[instance.tick-1]?.entities)
    // baseline ticks (establish previous proxy state for diffing)
    instance.update(()=>processServerCommands(instance, players)); await pause(20)
    instance.update(()=>processServerCommands(instance, players)); await pause(20)
    // inject command directly into server queue
    const serverClient = [...players.keys()][0]
    instance.commands.push({ tick: instance.tick, pong: -1, client: serverClient, commands: [ { dx:5, dy:7 } ] })
    // tick with before-snapshot processing should apply and diff appears this tick
    instance.update(()=>processServerCommands(instance, players)); await pause(30)
    expect(player.x).toBe(5)
    const proxyEntry = instance.proxyCache[instance.tick-1].entities[player[idProp]]
    const sawUpdate = proxyEntry.diff.singleProps.some(u => u && u.prop==='x' && u.value===5)
    expect(sawUpdate).toBe(true)
  }, 10000)

  it('defers entity diff until next tick when PROCESS_COMMANDS_BEFORE_SNAPSHOT=false', async () => {
    const config = makeConfig(false)
    const port = 8121
    const instance = new nengi.Instance(config, { port })
    const idProp = config.ID_PROPERTY_NAME
    const players = new Map()
    instance.onConnect((client, hs, accept) => {
      accept({ accepted:true, text:'ok' })
      setTimeout(() => {
        if (client.accepted) {
          const p = new Player(0,0); p.protocol = Player.prototype.protocol
          instance.addEntity(p); players.set(client, p)
        }
      }, 0)
    })
    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const bot = new nengi.Bot(config, protocolMap)
    let connected = false; bot.onConnect(()=> connected=true)
    bot.connect(`ws://localhost:${port}/nengi`, {})
    for (let i=0;i<60 && !connected;i++) await pause(25)
    expect(connected).toBe(true)
    for (let t=0;t<20 && players.size===0;t++){ instance.update(()=>processServerCommands(instance, players)); bot.update(); await pause(10) }
    expect(players.size).toBe(1)
    const serverClient = [...players.keys()][0]
    // baseline ticks
    instance.update(()=>processServerCommands(instance, players)); await pause(20)
    instance.update(()=>processServerCommands(instance, players)); await pause(20)
    instance.commands.push({ tick: instance.tick, pong: -1, client: serverClient, commands: [ { dx:5, dy:7 } ] })
    // first tick: command processed after snapshot -> no diff yet
    instance.update(()=>processServerCommands(instance, players)); await pause(30)
    // ensure entity is awake for diff computation
    const player = players.get([...players.keys()][0])
    instance.wake(player)
    console.log('player id:', player[idProp])
    console.log('proxyCache ticks:', Object.keys(instance.proxyCache))
    console.log('proxyCache[instance.tick-1] entities:', instance.proxyCache[instance.tick-1]?.entities)
    // player state applied after snapshot (since flag is false) but we processed after snapshot, so state changed now
    expect(player.x).toBe(5)
    const proxyEntry1 = instance.proxyCache[instance.tick-1].entities[player[idProp]]
    const sawImmediate = proxyEntry1.diff.singleProps.some(u => u && u.prop==='x' && u.value===5)
    expect(sawImmediate).toBe(false)
    // second tick: diff should appear now
    instance.update(()=>processServerCommands(instance, players)); await pause(30)
    const proxyEntry2 = instance.proxyCache[instance.tick-1].entities[player[idProp]]
    const sawLater = proxyEntry2.diff.singleProps.some(u => u && u.prop==='x' && u.value===5)
    expect(sawLater).toBe(true)
  }, 12000)
})
