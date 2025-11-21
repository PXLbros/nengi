import { describe, it, expect } from 'vitest'
import BitBuffer from '../core/binary/BitBuffer.js'
import BitStream from '../core/binary/BitStream.js'

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

describe('BitBuffer randomized get/set fuzz', () => {
    for (let bits = 2; bits <= 32; bits++) {
        it(`random roundtrip for ${bits} bits`, () => {
            for (let i = 0; i < 50; i++) {
                const max = bits === 32 ? 0xFFFFFFFF : Math.pow(2, bits) - 1
                const value = randomInt(0, max)
                const offset = randomInt(0, 32 - bits)
                const buffer = new BitBuffer(32)
                buffer.setBits(value, offset, bits)
                const read = buffer.getBits(offset, bits, false)
                expect(read).toBe(value)
            }
        })
    }
    for (let bits = 2; bits <= 32; bits++) {
        it(`random signed roundtrip for ${bits} bits`, () => {
            for (let i = 0; i < 50; i++) {
                const min = -Math.pow(2, bits - 1)
                const max = Math.pow(2, bits - 1) - 1
                const value = randomInt(min, max)
                const offset = randomInt(0, 32 - bits)
                const buffer = new BitBuffer(32)
                buffer.setBits(value, offset, bits)
                const read = buffer.getBits(offset, bits, true)
                expect(read).toBe(value)
            }
        })
    }
})
