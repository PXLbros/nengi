import { describe, it } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import createSnapshotBuffer from '../core/snapshot/writer/createSnapshotBuffer.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

const ENTITY_COUNTS = [100, 500]
const TICKS = 50

const baseSchema = {
  id: { type: BinaryType.UInt16 },
  x: { type: BinaryType.Int16 },
  y: { type: BinaryType.Int16 },
  hp: { type: BinaryType.UInt16 },
  mana: { type: BinaryType.UInt16 }
}
const optSchema = {
  x: { type: BinaryType.Int16, delta: true },
  y: { type: BinaryType.Int16, delta: true },
  hp: { type: BinaryType.UInt16, delta: false },
  mana: { type: BinaryType.UInt16, delta: true }
}

function makeEntities(entityCount) {
  const arr = []
  for (let i = 0; i < entityCount; i++) {
    arr.push({ id: i + 1, x: 1000 + i, y: 2000 + i, hp: 100, mana: 50 })
  }
  return arr
}

function mutateBurst(entities, tick) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]
    // burst: every 10 ticks, all props change
    if (tick % 10 === 0) {
      e.x += 5
      e.y -= 5
      e.hp = (e.hp + 10) % 65535
      e.mana = (e.mana + 7) % 65535
    } else {
      e.x += ((i + tick) % 3) - 1
      e.y += ((i + tick * 2) % 3) - 1
    }
  }
}

function runMatrixScenario(config, entityCount, mutateFn) {
  const protocol = new Protocol(baseSchema, config, optSchema, null, true)
  let prev = makeEntities(entityCount).map(e => ({ ...e }))
  let curr = makeEntities(entityCount)
  let totalBytes = 0
  const start = Date.now()
  for (let t = 0; t < TICKS; t++) {
    mutateFn(curr, t)
    const partial = []
    const optimized = []
    for (let i = 0; i < entityCount; i++) {
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
    prev = curr.map(e => ({ ...e }))
  }
  const ms = Date.now() - start
  let acceptanceRate = null
  if (protocol.config.ENABLE_BATCH_OPTIMIZATION && protocol.stats) {
    acceptanceRate = protocol.stats.batchAccepted / protocol.stats.batchAttempts
  }
  return { ms, avgBytes: totalBytes / TICKS, acceptanceRate }
}

describe('perf: batch config matrix', () => {
  it('prints metrics for various batch configs', () => {
    const configs = [
      { name: 'min2', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 2 } },
      { name: 'min3', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 3 } },
      { name: 'min4', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 4 } },
      { name: 'max8', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 2, BATCH_MAX_KEYS: 8 } },
      { name: 'cooldown3', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 2, BATCH_RETRY_COOLDOWN_TICKS: 3 } },
      { name: 'cooldown5', cfg: { ENABLE_BATCH_OPTIMIZATION: true, BATCH_MIN_UPDATES: 2, BATCH_RETRY_COOLDOWN_TICKS: 5 } },
      { name: 'adaptive', cfg: { ENABLE_BATCH_OPTIMIZATION: true } }
    ]
    for (const count of ENTITY_COUNTS) {
      for (const { name, cfg } of configs) {
        const config = { ID_PROPERTY_NAME: 'id', ID_BINARY_TYPE: BinaryType.UInt16, TYPE_PROPERTY_NAME: 'type', ...cfg }
        const burst = runMatrixScenario(config, count, mutateBurst)
        const msPerTick = (burst.ms / TICKS).toFixed(2)
        const bytesPerEntity = (burst.avgBytes / count).toFixed(2)
        const acceptanceRate = burst.acceptanceRate ? burst.acceptanceRate.toFixed(2) : 'n/a'
        console.log(`[perf-matrix] ${name} entities:${count} ms:${burst.ms} ms/tick:${msPerTick} avgBytes:${burst.avgBytes.toFixed(2)} bytes/entity:${bytesPerEntity} batchAccept:${acceptanceRate}`)
      }
    }
  })
})
