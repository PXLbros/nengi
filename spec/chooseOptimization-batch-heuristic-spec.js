import { describe, it, expect } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

const schema = {
  id: { type: BinaryType.UInt16 },
  a: { type: BinaryType.UInt16 },
  b: { type: BinaryType.UInt16 }
}
const optSchema = {
  a: { type: BinaryType.Int16, delta: true },
  b: { type: BinaryType.Int16, delta: true }
}

const baseConfig = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: BinaryType.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 2
}

describe('chooseOptimization batching heuristic', () => {
  it('falls back to partial when only one property changes (< min updates)', () => {
    const protocol = new Protocol(schema, { ...baseConfig }, optSchema, null, true)
    const oldProxy = { id: 1, a: 10, b: 20 }
    const newProxy = { id: 1, a: 11, b: 20 }
    const res = chooseOptimization('id', oldProxy, newProxy, protocol)
    expect(res.batch.updates.length).toBe(0)
    expect(res.singleProps.filter(Boolean).length).toBe(1)
    expect(res.singleProps[0].prop).toBe('a')
  })

  it('creates batch when min updates threshold met', () => {
    const protocol = new Protocol(schema, { ...baseConfig }, optSchema, null, true)
    const oldProxy = { id: 2, a: 10, b: 20 }
    const newProxy = { id: 2, a: 11, b: 25 }
    const res = chooseOptimization('id', oldProxy, newProxy, protocol)
    expect(res.batch.updates.length).toBeGreaterThan(0)
    // should contain both a and b diffs encoded as deltas
    const props = res.batch.updates.map(u => u.prop)
    expect(props).toContain('a')
    expect(props).toContain('b')
  })

  it('respects custom BATCH_MIN_UPDATES=3 (no batch for two changes)', () => {
    const protocol = new Protocol(schema, { ...baseConfig, BATCH_MIN_UPDATES: 3 }, optSchema, null, true)
    const oldProxy = { id: 3, a: 10, b: 20 }
    const newProxy = { id: 3, a: 11, b: 25 }
    const res = chooseOptimization('id', oldProxy, newProxy, protocol)
    expect(res.batch.updates.length).toBe(0)
    expect(res.singleProps.filter(Boolean).length).toBe(2)
  })
})
