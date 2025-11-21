import isBatchAtomiclyValid from './isBatchAtomiclyValid.js';
import compare from '../../protocol/compare.js';
import getValue from '../../protocol/getValue.js';
import countBatchesBits from '../writer/countBatchesBits.js';
import countSinglePropsBits from '../writer/countSinglePropsBits.js';

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

    // Build candidate batch only if basic validity passes; then perform bit-size comparison heuristic
    if (isBatchValid) {
        var candidateBatch = {
            id: id,
            idType: idType,
            updates: []
        }
        protocol.batch.keys.forEach(key => {
            var diff = locateDiff(key, diffs)
            var opt = protocol.batch.properties[key]
            var propData = protocol.properties[key]
            var value = 0
            if (diff) {
                value = opt.delta ? (diff.is - diff.was) : diff.is
            } else if (!opt.delta) {
                // include unchanged absolute properties in batch for current semantics
                value = newProxy[key]
            }
            candidateBatch.updates.push({
                isDelta: opt.delta,
                value: value,
                valueType: opt.type,
                prop: key,
                path: propData.path
            })
        })

        // Estimate bits for candidate batch vs individual single prop updates
        var singlePropPlaceholders = new Array(diffs.length)
        for (var i = 0; i < diffs.length; i++) {
            var d = diffs[i]
            var propData = protocol.properties[d.prop]
            singlePropPlaceholders[i] = {
                id: id,
                idType: idType,
                key: propData.key,
                keyType: protocol.keyType,
                value: d.is,
                valueType: propData.type,
                prop: d.prop,
                path: propData.path
            }
        }

        var batchBits = countBatchesBits([candidateBatch])
        var singleBits = countSinglePropsBits(singlePropPlaceholders)

        if (batchBits <= singleBits) {
            formattedUpdates.batch.updates = candidateBatch.updates
        } else {
            // Batch rejected on size grounds; leave formattedUpdates.batch empty and fall back to singleProps below
            isBatchValid = false
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

    return formattedUpdates
};
