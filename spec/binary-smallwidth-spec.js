import { describe, it, expect } from 'vitest'
import BitBuffer from '../core/binary/BitBuffer.js'
import BitStream from '../core/binary/BitStream.js'

// Generates min/max for signed ranges: e.g. bits=4 => -8..7
function signedRange(bits) {
    const min = - (1 << (bits - 1))
    const max = (1 << (bits - 1)) - 1
    return { min, max }
}

// Unsigned range: bits=4 => 0..15
function unsignedRange(bits) {
    const min = 0
    const max = (1 << bits) - 1
    return { min, max }
}

// Test helper for a single signed bit width using BitStream methods
function testSigned(bits) {
    const { min, max } = signedRange(bits)
    const write = `writeInt${bits}`
    const read = `readInt${bits}`

    describe(`${write}/${read} (signed ${bits} bits)`, () => {
        it('roundtrips min & max', () => {
            const buffer = new BitBuffer(bits * 2)
            const stream = new BitStream(buffer)
            stream[write](min)
            stream[write](max)
            stream.offset = 0
            const rMin = stream[read]()
            const rMax = stream[read]()
            expect(rMin).toBe(min)
            expect(rMax).toBe(max)
        })
    })
}

// Test helper for a single unsigned bit width using BitStream methods
function testUnsigned(bits) {
    const { min, max } = unsignedRange(bits)
    const write = `writeUInt${bits}`
    const read = `readUInt${bits}`

    describe(`${write}/${read} (unsigned ${bits} bits)`, () => {
        it('roundtrips min & max', () => {
            const buffer = new BitBuffer(bits * 2)
            const stream = new BitStream(buffer)
            stream[write](min)
            stream[write](max)
            stream.offset = 0
            const rMin = stream[read]()
            const rMax = stream[read]()
            expect(rMin).toBe(min)
            expect(rMax).toBe(max)
        })
    })
}

// Bit widths to cover (excluding 8, 16, 32 already handled elsewhere)
const widths = [2,3,4,5,6,7,9,10,11,12]

describe('Small-width integer roundtrips', () => {
    for (const bits of widths) {
        testUnsigned(bits)
        testSigned(bits)
    }
})
