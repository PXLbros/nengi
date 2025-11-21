import isBatchAtomiclyValid from './isBatchAtomiclyValid.js';
import compare from '../../protocol/compare.js';
import getValue from '../../protocol/getValue.js';
import countBatchesBits from '../writer/countBatchesBits.js';
import countSinglePropsBits from '../writer/countSinglePropsBits.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countPropBits from '../../protocol/countBits/countPropBits.js';

function locateDiff(prop, diffs) {
    for (var i = 0; i < diffs.length; i++) {
        if (diffs[i].prop === prop) {
            return diffs[i]
        }
    }
    return null
}

// 3 cases: batch update, single prop update, or no update needed
export default function chooseOptimization(idPropertyName, oldProxy, newProxy, protocol) {

    // Batch optimization was previously disabled due to edge cases in diff/serialization
    // Now exposed as a config option: protocol.config?.ENABLE_BATCH_OPTIMIZATION (default: false for safety)
    // Re-enable for performance testing; ensure stability with additional tests

    var id = oldProxy[idPropertyName]
    var idType = protocol.properties[idPropertyName].type
    var diffs = compare(oldProxy, newProxy, protocol)

    var formattedUpdates = {
        batch: {
            id: id,
            idType: idType,
            updates: []
        },
        singleProps: new Array(diffs.length)
    }

    if (diffs.length === 0) {
        return formattedUpdates
    }

    // Use config option to control batch optimization
    var enableBatch = protocol.config?.ENABLE_BATCH_OPTIMIZATION === true
    var minUpdates = protocol.config?.BATCH_MIN_UPDATES || 2
    var maxKeys = protocol.config?.BATCH_MAX_KEYS === Infinity ? Infinity : protocol.config.BATCH_MAX_KEYS
    var isBatchValid = enableBatch && diffs.length >= minUpdates && diffs.length <= maxKeys && isBatchAtomiclyValid(diffs, protocol)

    // Build candidate batch only if basic validity passes; then perform incremental bit-size comparison heuristic
    if (isBatchValid) {
        // Pre-compute lower bound for singles (includes header when >0 diffs)
        var singleBitsBound = 0
        if (diffs.length > 0) {
            singleBitsBound += Binary[BinaryType.UInt8].bits // chunk marker
            singleBitsBound += Binary[BinaryType.UInt16].bits // count
        }
        for (var i = 0; i < diffs.length; i++) {
            var d2 = diffs[i]
            var propMeta2 = protocol.properties[d2.prop]
            singleBitsBound += Binary[idType].bits
            singleBitsBound += Binary[protocol.keyType].bits
            singleBitsBound += countPropBits(propMeta2.type, undefined, d2.is)
        }

        var candidateUpdates = []
        var batchBitsRunning = 0
        // include header and id bits (countBatchesBits would also include these, but we do manual incremental early exit)
        if (diffs.length > 0) {
            batchBitsRunning += Binary[BinaryType.UInt8].bits // chunk marker
            batchBitsRunning += Binary[BinaryType.UInt16].bits // count
            batchBitsRunning += Binary[idType].bits // id once for batch
        }

        for (var k = 0; k < protocol.batch.keys.length; k++) {
            var key = protocol.batch.keys[k]
            var diffObj = locateDiff(key, diffs)
            var optCfg = protocol.batch.properties[key]
            var propMeta = protocol.properties[key]
            var val = 0
            if (diffObj) {
                val = optCfg.delta ? (diffObj.is - diffObj.was) : diffObj.is
            } else if (!optCfg.delta) {
                val = newProxy[key]
            } else {
                continue // unchanged delta, skip entirely
            }
            // add bits cost of this update
            batchBitsRunning += Binary[optCfg.type].bits
            // Early exit: if batch already worse than singles, abort
            if (batchBitsRunning > singleBitsBound) {
                isBatchValid = false
                candidateUpdates = []
                break
            }
            candidateUpdates.push({
                isDelta: optCfg.delta,
                value: val,
                valueType: optCfg.type,
                prop: key,
                path: propMeta.path
            })
        }

        if (isBatchValid && candidateUpdates.length > 0) {
            formattedUpdates.batch.updates = candidateUpdates
        }
    }

    for (var i = 0; i < diffs.length; i++) {
        var diff = diffs[i]
        var opt = null

        if (protocol.hasOptimizations) {
            opt = protocol.batch.properties[diff.prop]
        }

        if (isBatchValid && opt) {
            // batched property, already handled above
        } else {
            var propData = protocol.properties[diff.prop]

            formattedUpdates.singleProps[i] = {
                id: id,
                idType: idType,
                key: propData.key,
                keyType: protocol.keyType,
                value: diff.is,
                valueType: propData.type,
                prop: diff.prop,
                path: diff.path
            }
        }
    }

    // Instrumentation counters (lazy init)
    if (enableBatch) {
        protocol.stats = protocol.stats || { batchAttempts: 0, batchAccepted: 0 }
        protocol.stats.batchAttempts++
        if (formattedUpdates.batch.updates.length > 0) {
            protocol.stats.batchAccepted++
        }
    }

    return formattedUpdates
};
