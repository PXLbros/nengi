import { describe, it, expect } from 'vitest'
import chooseOptimization from '../core/snapshot/entityUpdate/chooseOptimization.js'
import Protocol from '../core/protocol/Protocol.js'
import defaults from '../core/defaults.js'
import BinaryType from '../core/binary/BinaryType.js'

function makeConfig() {
  return { ...defaults, protocols: { entities: [], basics: [], messages: [], components: [], localMessages: [], commands: [] } }
}

describe('chooseOptimization batching logic', () => {
  const config = { ...makeConfig(), ENABLE_BATCH_OPTIMIZATION: true }
  // Base schema
  const schema = {
    a: { type: BinaryType.UInt16, interp: false, isArray: false },
    b: { type: BinaryType.UInt16, interp: false, isArray: false },
    c: { type: BinaryType.UInt16, interp: false, isArray: false }
  }
  // Optimization schema: delta updates for a,b and absolute for c
  const optSchema = {
    a: { type: BinaryType.Int16, delta: true },
    b: { type: BinaryType.Int16, delta: true },
    c: { type: BinaryType.UInt16, delta: false }
  }
  const protocol = new Protocol({ ...schema }, config, optSchema, null, true)
  // Protocol constructor assigns keys & properties with paths; add id property metadata manually for diff usage
  protocol.properties[config.ID_PROPERTY_NAME] = { type: config.ID_BINARY_TYPE, path: [config.ID_PROPERTY_NAME], key: protocol.keys.length }
  protocol.keys.push(config.ID_PROPERTY_NAME)

  it('produces batch when multiple props change within bounds', () => {
    const oldProxy = { a: 100, b: 200, c: 300 }
    const newProxy = { a: 105, b: 198, c: 450 }
    // Attach id for diff (simulate entity)
    oldProxy[config.ID_PROPERTY_NAME] = 1
    newProxy[config.ID_PROPERTY_NAME] = 1
    // id already appended once above

    const result = chooseOptimization(config.ID_PROPERTY_NAME, oldProxy, newProxy, protocol)
    // Expect batch validation active
    expect(result.batch.updates.length).toBe(3)
    // Delta a = +5, delta b = -2, absolute c = 450
    const aUpdate = result.batch.updates.find(u => u.prop === 'a')
    const bUpdate = result.batch.updates.find(u => u.prop === 'b')
    const cUpdate = result.batch.updates.find(u => u.prop === 'c')
    expect(aUpdate.value).toBe(5)
    expect(bUpdate.value).toBe(-2)
    expect(cUpdate.value).toBe(450)
    // singleProps should still contain entries for props that changed if batching not replacing them fully
    // In current implementation, singleProps array sized to diffs; when batch valid, they remain undefined
    const realSingles = result.singleProps.filter(sp => sp)
    expect(realSingles.length).toBe(0)
  })

  it('falls back to single props when delta out of bounds', () => {
    const oldProxy = { a: 0, b: 0, c: 0 }
    const newProxy = { a: 50000, b: 0, c: 0 } // delta 50000 exceeds Int16
    oldProxy[config.ID_PROPERTY_NAME] = 2
    newProxy[config.ID_PROPERTY_NAME] = 2
    const result = chooseOptimization(config.ID_PROPERTY_NAME, oldProxy, newProxy, protocol)
    // Batch invalid -> no batch updates
    expect(result.batch.updates.length).toBe(0)
    const singles = result.singleProps.filter(sp => sp)
    expect(singles.length).toBe(1)
    expect(singles[0].prop).toBe('a')
    expect(singles[0].value).toBe(50000)
  })
})
