import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countJSONBits from '../../protocol/countBits/countJSONBits.js';

function countAllJSONBits(total, json) {
    return total + countJSONBits(json)
}

function countJSONsBits(jsons) {
    var bits = 0
    if (jsons.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        bits = jsons.reduce(countAllJSONBits, bits)
    }
    return bits
}

export default countJSONsBits;