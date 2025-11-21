import { describe, it, expect } from 'vitest'
import Predictor from '../core/client/Predictor.js'
import BinaryType from '../core/binary/BinaryType.js'
import defaults from '../core/defaults.js'
import Protocol from '../core/protocol/Protocol.js'

// Helper to build a minimal worldState structure consumed by Predictor.getErrors
function makeWorldState(tick, entities, config) {
    return {
        clientTick: tick,
        entities: new Map(entities.map(e => [e[config.ID_PROPERTY_NAME], e])),
        // the Predictor only reads clientTick & entities for getErrors
    }
}

// Build a real Protocol instance so proxify & prediction logic can access keys/properties
const makeProtocol = (config) => {
    const schema = {
        x: { type: BinaryType.Float32 },
        name: { type: BinaryType.UTF8String }
    }
    return new Protocol(schema, config)
}

describe('Predictor', () => {
    it('produces no errors when prediction matches authoritative numeric value', () => {
        const config = defaults
        const predictor = new Predictor(config)
        const protocol = makeProtocol(config)
        const entity = { [config.ID_PROPERTY_NAME]: 1, x: 10, name: 'foo', protocol }

        predictor.add(5, entity, ['x'])
        const authoritative = { [config.ID_PROPERTY_NAME]: 1, x: 10, name: 'foo', protocol }
        const worldState = makeWorldState(5, [authoritative], config)

        const errors = predictor.getErrors(worldState)
        expect(errors.entities.size).toBe(0)
    })

    it('produces an error when numeric drift exceeds epsilon', () => {
        const config = { ...defaults, PREDICTION_EPSILON: 0.0001 }
        const predictor = new Predictor(config)
        const protocol = makeProtocol(config)
        const entity = { [config.ID_PROPERTY_NAME]: 2, x: 10, name: 'bar', protocol }

        predictor.add(6, entity, ['x'])
        const authoritative = { [config.ID_PROPERTY_NAME]: 2, x: 10.01, name: 'bar', protocol }
        const worldState = makeWorldState(6, [authoritative], config)

        const frame = predictor.getErrors(worldState)
        expect(frame.entities.size).toBe(1)
        const errEntity = frame.entities.get(2)
        expect(errEntity.errors.length).toBe(1)
        const propErr = errEntity.errors[0]
        expect(propErr.prop).toBe('x')
        expect(propErr.deltaValue).toBeCloseTo(0.01, 5)
    })

    it('does not produce an error when numeric drift is within epsilon', () => {
        const config = { ...defaults, PREDICTION_EPSILON: 0.001 }
        const predictor = new Predictor(config)
        const protocol = makeProtocol(config)
        const entity = { [config.ID_PROPERTY_NAME]: 3, x: 10, name: 'baz', protocol }

        predictor.add(7, entity, ['x'])
        const authoritative = { [config.ID_PROPERTY_NAME]: 3, x: 10.0005, name: 'baz', protocol }
        const worldState = makeWorldState(7, [authoritative], config)

        const frame = predictor.getErrors(worldState)
        expect(frame.entities.size).toBe(0)
    })

    it('reconciles string prediction differences (deltaValue null for strings)', () => {
        const config = defaults
        const predictor = new Predictor(config)
        const protocol = makeProtocol(config)
        const entity = { [config.ID_PROPERTY_NAME]: 4, x: 0, name: 'foo', protocol }

        predictor.add(8, entity, ['name'])
        const authoritative = { [config.ID_PROPERTY_NAME]: 4, x: 0, name: 'bar', protocol }
        const worldState = makeWorldState(8, [authoritative], config)

        const frame = predictor.getErrors(worldState)
        expect(frame.entities.size).toBe(1)
        const errEntity = frame.entities.get(4)
        expect(errEntity.errors.length).toBe(1)
        const propErr = errEntity.errors[0]
        expect(propErr.prop).toBe('name')
        expect(propErr.deltaValue).toBe(null)
        expect(propErr.actualValue).toBe('bar')
        expect(propErr.predictedValue).toBe('foo')
    })
})
