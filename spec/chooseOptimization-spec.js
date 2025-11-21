import { describe, it, expect } from 'vitest'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'
import EntityProtocol from '../core/protocol/EntityProtocol.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'
import isBatchAtomiclyValid from '../core/snapshot/entityUpdate/isBatchAtomiclyValid.js'
import Protocol from '../core/protocol/Protocol.js'

// Helper to build a minimal config object expected by protocols
function makeConfig() {
  return { ...defaults, protocols: { entities: [], basics: [], messages: [], components: [], localMessages: [], commands: [] } }
}

describe('chooseOptimization diff logic', () => {
  const config = makeConfig()
  const schema = {
    // include id & type via EntityProtocol injection; keep two test props
    value: { type: BinaryType.UInt16, interp: false, isArray: false },
    other: { type: BinaryType.UInt8, interp: false, isArray: false }
  }
  const protocol = new EntityProtocol(schema, config)

  it('returns empty singleProps when no changes', () => {
    const oldProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 10, other: 5 }
    const newProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 10, other: 5 }
    const result = chooseOptimization(config.ID_PROPERTY_NAME, oldProxy, newProxy, protocol)
    // compare sees id & type also; ensure filtering real prop diffs
    const nonMeta = result.singleProps.filter(p => p && p.prop !== config.ID_PROPERTY_NAME && p.prop !== config.TYPE_PROPERTY_NAME)
    expect(nonMeta.length).toBe(0)
    expect(result.batch.updates.length).toBe(0)
  })

  it('detects single property change', () => {
    const oldProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 10, other: 5 }
    const newProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 11, other: 5 }
    const result = chooseOptimization(config.ID_PROPERTY_NAME, oldProxy, newProxy, protocol)
    const changes = result.singleProps.filter(p => p && p.prop === 'value')
    expect(changes.length).toBe(1)
    const change = changes[0]
    expect(change.value).toBe(11)
    expect(change.prop).toBe('value')
    expect(change.id).toBe(1)
  })

  it('detects multiple property changes', () => {
    const oldProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 10, other: 5 }
    const newProxy = { [config.ID_PROPERTY_NAME]: 1, [config.TYPE_PROPERTY_NAME]: 0, value: 12, other: 9 }
    const result = chooseOptimization(config.ID_PROPERTY_NAME, oldProxy, newProxy, protocol)
    const props = result.singleProps.filter(p => p && (p.prop === 'value' || p.prop === 'other')).map(p => p.prop).sort()
    expect(props).toEqual(['other','value'])
  })
})

describe('isBatchAtomiclyValid independent logic', () => {
  it('invalid if protocol has no optimizations', () => {
    const config = makeConfig()
    const schemaA = { value: { type: BinaryType.UInt16, interp: false, isArray: false } }
    const protocolNoOpt = new EntityProtocol(schemaA, config)
    const diffs = [{ key: 0, was: 1, is: 2 }]
    expect(isBatchAtomiclyValid(diffs, protocolNoOpt)).toBe(false)
  })

  it('valid when within bounds and contains change (delta)', () => {
    const config = makeConfig()
    const schemaB = { value: { type: BinaryType.UInt16, interp: false, isArray: false } }
    const optSchema = { value: { type: BinaryType.Int16, delta: true } }
    const protocolWithOpt = new Protocol({ ...schemaB }, config, optSchema, null, true)
    const diffs = [{ key: 0, was: 100, is: 105 }]
    expect(isBatchAtomiclyValid(diffs, protocolWithOpt)).toBe(true)
  })

  it('invalid when delta exceeds bounds', () => {
    const config = makeConfig()
    const schemaC = { value: { type: BinaryType.UInt16, interp: false, isArray: false } }
    const optSchemaSmall = { value: { type: BinaryType.Int8, delta: true } }
    const protocolWithOptSmall = new Protocol({ ...schemaC }, config, optSchemaSmall, null, true)
    const diffs = [{ key: 0, was: 0, is: 300 }] // delta 300 outside Int8 range
    expect(isBatchAtomiclyValid(diffs, protocolWithOptSmall)).toBe(false)
  })
})
