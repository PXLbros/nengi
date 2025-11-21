import { describe, it } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

const ENTITY_COUNT = 500
const TICKS = 50

const baseSchema = {
  id: { type: BinaryType.UInt16 },
  x: { type: BinaryType.Int16 },
  y: { type: BinaryType.Int16 },
  hp: { type: BinaryType.UInt16 }
}
const optSchema = {
  x: { type: BinaryType.Int16, delta: true },
  y: { type: BinaryType.Int16, delta: true },
  hp: { type: BinaryType.UInt16, delta: false }
}

function makeEntities() {
  const arr = []
  for (let i = 0; i < ENTITY_COUNT; i++) {
    arr.push({ id: i + 1, x: 1000 + i, y: 2000 + i, hp: 100 })
  }
  return arr
}

function mutate(entities, tick) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]
    // small movement each tick within int16 bounds
    e.x += ((i + tick) % 3) - 1
    e.y += ((i + tick * 2) % 3) - 1
    if (tick % 10 === 0 && i % 20 === 0) {
      e.hp = (e.hp + 1) % 65535
    }
  }
}

function runScenario(enableBatch) {
  const config = { ID_PROPERTY_NAME: 'id', ID_BINARY_TYPE: BinaryType.UInt16, TYPE_PROPERTY_NAME: 'type', ENABLE_BATCH_OPTIMIZATION: enableBatch }
  const protocol = new Protocol(baseSchema, config, optSchema, null, true)
  let prev = makeEntities().map(e => ({ ...e }))
  let curr = makeEntities()
  let totalBytes = 0
  const start = Date.now()
  for (let t = 0; t < TICKS; t++) {
    mutate(curr, t)
    const partial = []
    const optimized = []
    for (let i = 0; i < ENTITY_COUNT; i++) {
      const oldE = prev[i]
      const newE = curr[i]
      const updates = chooseOptimization('id', oldE, newE, protocol)
      if (updates.batch.updates.length) {
        optimized.push(updates.batch)
      } else {
        updates.singleProps.forEach(sp => { if (sp) partial.push(sp) })
      }
    }
    const snapshot = { clientTick: t, engineMessages: [], pingKey: 0, timestamp: 0, avgLatency: 0, createEntities: [], updateEntities: { partial, optimized }, deleteEntities: [], localEvents: [], messages: [], jsons: [] }
    const buffer = createSnapshotBuffer(snapshot, config)
    totalBytes += buffer.byteLength
    // swap prev
    prev = curr.map(e => ({ ...e }))
  }
  const ms = Date.now() - start
  return { ms, avgBytes: totalBytes / TICKS }
}

describe('perf: batch enabled vs disabled', () => {
  it('prints comparative metrics (non-assertive)', () => {
    const disabled = runScenario(false)
    const enabled = runScenario(true)
    console.log('[perf] disabled batching ms:', disabled.ms, 'avgBytes:', disabled.avgBytes.toFixed(2))
    console.log('[perf] enabled  batching ms:', enabled.ms, 'avgBytes:', enabled.avgBytes.toFixed(2))
  })
})
