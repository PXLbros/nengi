// Experimental debugging helper: scans a snapshot BitBuffer or ArrayBuffer
// and returns an array of candidate chunk marker bytes (UInt8) in order.
// This is a heuristic: payload bytes may coincidentally equal marker values.
// Prefer semantic readers for assertions; use this only for exploratory logging.
import { describe, it, expect } from 'vitest'
import { ChunkReverse } from '../../core/snapshot/Chunk.js'
import BitBuffer from '../../core/binary/BitBuffer.js'
import BitStream from '../../core/binary/BitStream.js'

export function scanChunkMarkers(source) {
  const bitBuffer = source instanceof BitBuffer ? source : new BitBuffer(source)
  const bitStream = new BitStream(bitBuffer)
  const markers = []
  while (bitStream.offset + 8 <= bitBuffer.bitLength) {
    const value = bitStream.readUInt8()
    if (ChunkReverse[value] !== undefined) {
      markers.push({ marker: value, name: ChunkReverse[value], bitOffset: bitStream.offset - 8 })
    }
  }
  return markers
}

export default scanChunkMarkers

// Provide a minimal test so Vitest doesn't flag this helper file
describe('scanChunkMarkers helper', () => {
  it('detects initial zero byte as ClientTick marker in fresh buffer', () => {
    const buf = new BitBuffer(8) // single byte capacity defaults to 0
    const markers = scanChunkMarkers(buf)
    expect(markers.length).toBe(1)
    expect(markers[0].name).toBe('ClientTick')
  })
})
