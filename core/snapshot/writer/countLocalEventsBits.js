import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countMessageBits from '../../protocol/countBits/countMessageBits.js';

function countLocalEventsBitsItem(bits, localEvent) {
    return bits + countMessageBits(localEvent, localEvent.protocol)
}

function countLocalEventsBits(localEvents) {
    var bits = 0
    if (localEvents.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt8].bits
        bits = localEvents.reduce(countLocalEventsBitsItem, bits)
    }
    return bits
}

export default countLocalEventsBits;