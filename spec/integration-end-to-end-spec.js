import { describe, it, expect } from 'vitest'
import nengi from '../index.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

// Player entity with position
class Player {
  constructor(x, y) { this.x = x; this.y = y }
}
Player.protocol = { x: BinaryType.Float32, y: BinaryType.Float32 }

// Move command applies delta to a player's position
class MoveCommand { constructor(dx, dy) { this.dx = dx; this.dy = dy } }
MoveCommand.protocol = { dx: BinaryType.Int16, dy: BinaryType.Int16 }

const makeConfig = () => ({
  ...defaults,
  HIDE_LOGO: true,
  UPDATE_RATE: 20,
  protocols: {
    entities: [ ['Player', Player] ],
    messages: [], basics: [], components: [], localMessages: [],
    commands: [ ['MoveCommand', MoveCommand] ]
  }
})

// Helper sleep
const pause = (ms) => new Promise(r => setTimeout(r, ms))

describe('Integration: End-to-end multi-client command & lifecycle', () => {
  it('players created, command updates broadcast, disconnect cleans up', async () => {
    const config = makeConfig()
    const port = 8104
    const instance = new nengi.Instance(config, { port })

    // Track player entities per client id
    const playerByClient = new Map()
    const idProp = config.ID_PROPERTY_NAME

    instance.onConnect((client, handshake, accept) => {
      accept({ accepted: true, text: 'ok' })
      const player = new Player(0, 0)
      player.protocol = Player.prototype.protocol
      instance.addEntity(player)
      playerByClient.set(client.id, player)
    })
    // Remove player entity explicitly on disconnect (mirrors typical game cleanup responsibility)
    instance.onDisconnect((client) => {
      const player = playerByClient.get(client.id)
      if (player) {
        instance.removeEntity(player)
        playerByClient.delete(client.id)
      }
    })

    // Command processing loop: apply deltas to owned player
    const processedCommands = []
    const processServerCommands = () => {
      let next
      while ((next = instance.getNextCommand())) {
        if (next.commands) {
          next.commands.forEach(cmd => {
            // Find player for client
            const player = playerByClient.get(next.client.id)
            if (player) {
              player.x += cmd.dx
              player.y += cmd.dy
              processedCommands.push({ clientId: next.client.id, dx: cmd.dx, dy: cmd.dy })
            }
          })
        }
      }
    }

    const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
    const botA = new nengi.Bot(config, protocolMap)
    const botB = new nengi.Bot(config, protocolMap)
    let connectedA = false, connectedB = false
    botA.onConnect(() => { connectedA = true })
    botB.onConnect(() => { connectedB = true })
    botA.connect(`ws://localhost:${port}/nengi`, {})
    botB.connect(`ws://localhost:${port}/nengi`, {})
    for (let i = 0; i < 80 && (!connectedA || !connectedB); i++) { await pause(25) }
    expect(connectedA).toBe(true)
    expect(connectedB).toBe(true)

    // Run ticks until both players created & visible to both bots
    let playerIds = []
    for (let t = 0; t < 20; t++) {
      instance.update()
      processServerCommands()
      await pause(10)
      // Collect created entity ids from server once available
      if (playerIds.length < playerByClient.size) {
        playerIds = Array.from(playerByClient.values()).map(p => p[idProp])
      }
      const botsHaveCreates = botA.snapshots.some(s => s.createEntities.length >= playerByClient.size) &&
                              botB.snapshots.some(s => s.createEntities.length >= playerByClient.size)
      if (botsHaveCreates && playerIds.length === playerByClient.size) break
    }
    expect(playerIds.length).toBe(2)

    // Send move command from botA
    botA.addCommand(new MoveCommand(3, 4))
    botA.update()

    // Advance ticks to ensure command receipt & application and snapshot broadcast
    let sawProcessed = false
    for (let t = 0; t < 30; t++) {
      instance.update()
      processServerCommands()
      botA.update(); botB.update()
      await pause(10)
      if (processedCommands.some(c => c.clientId === 0 && c.dx === 3 && c.dy === 4)) { // clientId 0 is first connected
        sawProcessed = true
        // After applying, run a couple more ticks for diff propagation
        if (t < 25) continue
      }
    }
    expect(sawProcessed).toBe(true)

    // Verify both bots observed updated position for playerA
    const playerAId = playerByClient.get(0)[idProp]
    const updatedSeenA = botA.up.some(u => u.id === playerAId && ((u.path === 'x' && u.value === 3) || (u.path === 'y' && u.value === 4))) ||
      botA.snapshots.some(s => s.updateEntities.some(u => u && u[idProp] === playerAId && ((u.prop === 'x' && u.value === 3) || (u.prop === 'y' && u.value === 4))))
    const updatedSeenB = botB.up.some(u => u.id === playerAId && ((u.path === 'x' && u.value === 3) || (u.path === 'y' && u.value === 4))) ||
      botB.snapshots.some(s => s.updateEntities.some(u => u && u[idProp] === playerAId && ((u.prop === 'x' && u.value === 3) || (u.prop === 'y' && u.value === 4))))
    expect(updatedSeenA).toBe(true)
    expect(updatedSeenB).toBe(true)

    // Disconnect botA abruptly
    botA.disconnect()
    for (let t = 0; t < 15; t++) {
      instance.update()
      processServerCommands()
      await pause(10)
    }

    // Instance should have only one client remaining
    expect(instance.clients.size).toBe(1)

    // PlayerA entity should be deleted and observed by botB
    const sawDeleteA = botB.de.includes(playerAId) || botB.snapshots.some(s => s.deleteEntities.includes(playerAId))
    expect(sawDeleteA).toBe(true)
  }, 15000)
})
