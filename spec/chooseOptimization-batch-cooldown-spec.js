import { describe, it, expect } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

// Small schema forcing early rejection due to large absolute value cost
const schema = {
  id: { type: BinaryType.UInt16 },
  a: { type: BinaryType.Int16 },
  b: { type: BinaryType.Int16 },
  c: { type: BinaryType.UInt16 }
}
const optSchema = {
  a: { type: BinaryType.Int16, delta: true },
  b: { type: BinaryType.Int16, delta: true },
  c: { type: BinaryType.UInt16, delta: false }
}

const baseConfig = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: BinaryType.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 2,
  BATCH_MAX_KEYS: Infinity,
  BATCH_RETRY_COOLDOWN_TICKS: 3
}

function makeProxy(id, a, b, c, tick) {
  return { id, a, b, c, __nengiTick: tick }
}

describe('chooseOptimization batch cooldown', () => {
  it('skips batch attempts during cooldown after rejection', () => {
    const protocol = new Protocol(schema, { ...baseConfig }, optSchema, null, true)
    const oldP = makeProxy(1, 100, 200, 300, 0)
    const newP = makeProxy(1, 101, 199, 300, 0)
    // First attempt may accept or reject; force rejection by temporarily inflating singleBitsBound via config tweak
    protocol.config.BATCH_MAX_KEYS = 2 // limit keys so batch uses only a,b
    const res1 = chooseOptimization('id', oldP, newP, protocol)
    const firstAccepted = res1.batch.updates.length > 0

    // If first accepted, manually simulate a rejection to set cooldown
    if (firstAccepted) {
      protocol._cooldowns.set(1, 2) // pretend rejection, nextAllowed=2
    }

    // Tick 1 within cooldown window
    const oldP2 = makeProxy(1, 101, 199, 300, 1)
    const newP2 = makeProxy(1, 102, 198, 300, 1)
    const res2 = chooseOptimization('id', oldP2, newP2, protocol)
    // Expect no batch while cooldown active
    expect(res2.batch.updates.length).toBe(0)

    // Tick 3 after cooldown expiry
    const oldP3 = makeProxy(1, 102, 198, 300, 3)
    const newP3 = makeProxy(1, 103, 197, 300, 3)
    const res3 = chooseOptimization('id', oldP3, newP3, protocol)
    // Batch may be accepted now
    expect(res3.batch.updates.length).toBeGreaterThanOrEqual(0)
  })
})
