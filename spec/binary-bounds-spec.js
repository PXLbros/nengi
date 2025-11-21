import { describe, it, expect } from 'vitest'
import BitBuffer from '../core/binary/BitBuffer.js'
import BitStream from '../core/binary/BitStream.js'

import UInt8 from '../core/binary/types/UInt8.js'
import Int8 from '../core/binary/types/Int8.js'
import UInt16 from '../core/binary/types/UInt16.js'
import Int16 from '../core/binary/types/Int16.js'
import UInt32 from '../core/binary/types/UInt32.js'
import Int32 from '../core/binary/types/Int32.js'

// helper to test a single integer type definition
function testIntegerType(def) {
    const { min, max, bits, write, read } = def
    describe(`${read}/${write} bounds`, () => {
        it('boundsCheck accepts min & max and rejects out-of-range', () => {
            expect(def.boundsCheck(min)).toBe(true)
            expect(def.boundsCheck(max)).toBe(true)
            expect(def.boundsCheck(min - 1)).toBe(false)
            expect(def.boundsCheck(max + 1)).toBe(false)
        })

        it('roundtrips min & max values', () => {
            // allocate enough bits for two values
            const bitBuffer = new BitBuffer(bits * 2)
            const stream = new BitStream(bitBuffer)
            stream[write](min)
            stream[write](max)
            // reset and read
            stream.offset = 0
            const readMin = stream[read]()
            const readMax = stream[read]()
            expect(readMin).toBe(min)
            expect(readMax).toBe(max)
        })

        it('increments offset correctly', () => {
            const bitBuffer = new BitBuffer(bits)
            const stream = new BitStream(bitBuffer)
            expect(stream.offset).toBe(0)
            stream[write](min)
            expect(stream.offset).toBe(bits)
        })
    })
}

describe('Integer Type Boundaries', () => {
    testIntegerType(UInt8)
    testIntegerType(Int8)
    testIntegerType(UInt16)
    testIntegerType(Int16)
    testIntegerType(UInt32)
    testIntegerType(Int32)
})
