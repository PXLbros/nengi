import { describe, it, expect } from 'vitest'
import BitBuffer from '../core/binary/BitBuffer.js'
import BitStream from '../core/binary/BitStream.js'
import Boolean from '../core/binary/types/Boolean.js'
import Int8 from '../core/binary/types/Int8.js'
import Int16 from '../core/binary/types/Int16.js'
import Int32 from '../core/binary/types/Int32.js'
import UInt8 from '../core/binary/types/UInt8.js'
import UInt16 from '../core/binary/types/UInt16.js'
import UInt32 from '../core/binary/types/UInt32.js'
import Float32 from '../core/binary/types/Float32.js'
import Float64 from '../core/binary/types/Float64.js'

describe('BitBuffer and BitStream', () => {
    it('can write and read UInt8', () => {
        const bitBuffer = new BitBuffer(8)
        const bitStream = new BitStream(bitBuffer)
        const value = 255
        bitStream[UInt8.write](value)
        bitStream.offset = 0
        const readValue = bitStream[UInt8.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read UInt16', () => {
        const bitBuffer = new BitBuffer(16)
        const bitStream = new BitStream(bitBuffer)
        const value = 65535
        bitStream[UInt16.write](value)
        bitStream.offset = 0
        const readValue = bitStream[UInt16.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read UInt32', () => {
        const bitBuffer = new BitBuffer(32)
        const bitStream = new BitStream(bitBuffer)
        const value = 4294967295
        bitStream[UInt32.write](value)
        bitStream.offset = 0
        const readValue = bitStream[UInt32.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read Int8', () => {
        const bitBuffer = new BitBuffer(8)
        const bitStream = new BitStream(bitBuffer)
        const value = -128
        bitStream[Int8.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Int8.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read Int16', () => {
        const bitBuffer = new BitBuffer(16)
        const bitStream = new BitStream(bitBuffer)
        const value = -32768
        bitStream[Int16.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Int16.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read Int32', () => {
        const bitBuffer = new BitBuffer(32)
        const bitStream = new BitStream(bitBuffer)
        const value = -2147483648
        bitStream[Int32.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Int32.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read Float32', () => {
        const bitBuffer = new BitBuffer(32)
        const bitStream = new BitStream(bitBuffer)
        const value = Math.PI
        bitStream[Float32.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Float32.read]()
        expect(readValue).toBeCloseTo(value)
    })

    it('can write and read Float64', () => {
        const bitBuffer = new BitBuffer(64)
        const bitStream = new BitStream(bitBuffer)
        const value = Math.PI * 2
        bitStream[Float64.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Float64.read]()
        expect(readValue).toBeCloseTo(value)
    })

    it('can write and read Boolean true', () => {
        const bitBuffer = new BitBuffer(1)
        const bitStream = new BitStream(bitBuffer)
        const value = true
        bitStream[Boolean.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Boolean.read]()
        expect(readValue).toBe(value)
    })

    it('can write and read Boolean false', () => {
        const bitBuffer = new BitBuffer(1)
        const bitStream = new BitStream(bitBuffer)
        const value = false
        bitStream[Boolean.write](value)
        bitStream.offset = 0
        const readValue = bitStream[Boolean.read]()
        expect(readValue).toBe(value)
    })
})
