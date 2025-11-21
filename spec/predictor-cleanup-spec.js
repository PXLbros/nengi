import { describe, it, expect } from 'vitest'
import Predictor from '../core/client/Predictor.js'
import Protocol from '../core/protocol/Protocol.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'

const makeProtocol = (config) => new Protocol({ x: { type: BinaryType.Float32 } }, config)

// minimal worldState stub
function ws(tick, entities, config) {
  return { clientTick: tick, entities: new Map(entities.map(e => [e[config.ID_PROPERTY_NAME], e])) }
}

describe('Predictor.cleanUp', () => {
  it('removes frames older than tick-50', () => {
    const config = defaults
    const protocol = makeProtocol(config)
    const predictor = new Predictor(config)

    // add prediction frames ticks 0..60
    for (let t = 0; t <= 60; t++) {
      const ent = { [config.ID_PROPERTY_NAME]: 1, x: t, protocol }
      predictor.add(t, ent, ['x'])
    }

    // invoke getErrors at tick 60 (sets latestTick) & cleanup
    predictor.getErrors(ws(60, [{ [config.ID_PROPERTY_NAME]: 1, x: 60, protocol }], config))
    predictor.cleanUp(60)

    // frames with tick < 10 should be gone (60-50=10)
    for (let t = 0; t < 10; t++) {
      expect(predictor.predictionFrames.has(t)).toBe(false)
    }
    // a recent frame should still exist
    expect(predictor.predictionFrames.has(60)).toBe(true)
  })
})
