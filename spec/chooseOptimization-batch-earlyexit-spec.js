import { describe, it, expect } from 'vitest'
import Protocol from '../core/protocol/Protocol.js'
import BinaryType from '../core/binary/BinaryType.js'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'

// Schema with many absolute properties to inflate batch size
const schema = {
  id: { type: BinaryType.UInt16 },
  a: { type: BinaryType.Int16 }, // delta
  b: { type: BinaryType.Int16 }, // delta
  c: { type: BinaryType.UInt16 },
  d: { type: BinaryType.UInt16 },
  e: { type: BinaryType.UInt16 },
  f: { type: BinaryType.UInt16 },
  g: { type: BinaryType.UInt16 },
  h: { type: BinaryType.UInt16 },
  i: { type: BinaryType.UInt16 },
  j: { type: BinaryType.UInt16 },
  k: { type: BinaryType.UInt16 },
  l: { type: BinaryType.UInt16 }
}

const optSchema = {
  a: { type: BinaryType.Int16, delta: true },
  b: { type: BinaryType.Int16, delta: true },
  c: { type: BinaryType.UInt16, delta: false },
  d: { type: BinaryType.UInt16, delta: false },
  e: { type: BinaryType.UInt16, delta: false },
  f: { type: BinaryType.UInt16, delta: false },
  g: { type: BinaryType.UInt16, delta: false },
  h: { type: BinaryType.UInt16, delta: false },
  i: { type: BinaryType.UInt16, delta: false },
  j: { type: BinaryType.UInt16, delta: false },
  k: { type: BinaryType.UInt16, delta: false },
  l: { type: BinaryType.UInt16, delta: false }
}

const config = {
  ID_PROPERTY_NAME: 'id',
  ID_BINARY_TYPE: BinaryType.UInt16,
  TYPE_PROPERTY_NAME: 'type',
  ENABLE_BATCH_OPTIMIZATION: true,
  BATCH_MIN_UPDATES: 2,
  BATCH_MAX_KEYS: Infinity
}

describe('chooseOptimization early-exit heuristic', () => {
  it('falls back to single props when many unchanged absolutes inflate batch size', () => {
    const protocol = new Protocol(schema, { ...config }, optSchema, null, true)
    const oldProxy = { id: 1, a: 100, b: 200, c: 1, d:2, e:3, f:4, g:5, h:6, i:7, j:8, k:9, l:10 }
    const newProxy = { id: 1, a: 101, b: 199, c: 1, d:2, e:3, f:4, g:5, h:6, i:7, j:8, k:9, l:10 }
    const res = chooseOptimization('id', oldProxy, newProxy, protocol)
    expect(res.batch.updates.length).toBe(0)
    const singles = res.singleProps.filter(Boolean)
    expect(singles.length).toBe(2)
    const props = singles.map(s => s.prop).sort()
    expect(props).toEqual(['a','b'])
  })
})
