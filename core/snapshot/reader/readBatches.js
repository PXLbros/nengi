import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import readBatch from '../../protocol/read/readBatch.js';

// Accepts either a protocolResolver function (id->protocol) or an entityCache with getEntity(id).
function readBatches(bitStream, resolver, config) {
    var length = bitStream[Binary[BinaryType.UInt16].read]()
    var batches = new Array(length)

    // unify access
    function getEntity(id) {
        if (typeof resolver === 'function') {
            return { protocol: resolver(id) }
        } else if (resolver && typeof resolver.getEntity === 'function') {
            return resolver.getEntity(id)
        } else {
            throw new Error('readBatches requires a protocolResolver function or entityCache with getEntity')
        }
    }

    const entityCacheAdapter = { getEntity }

    for (var i = 0; i < length; i++) {
        var batch = readBatch(bitStream, entityCacheAdapter, config)
        batches[i] = batch
    }
    return batches
}

export default readBatches;
