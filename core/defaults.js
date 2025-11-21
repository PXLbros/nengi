import BinaryType from './binary/BinaryType.js'

const defaults = {
    USE_HISTORIAN: true,
    HISTORIAN_TICKS: 40,
    ID_PROPERTY_NAME: 'nid',
    ID_BINARY_TYPE: BinaryType.UInt16,
    TYPE_PROPERTY_NAME: 'ntype',
    TYPE_BINARY_TYPE: BinaryType.UInt8,
    DIMENSIONALITY: 2,
    PING_PONG_TICK_INTERVAL: 1,
    PREDICTION_EPSILON: 0.0001,
    // Spatial indexing options
    ENABLE_SPATIAL_INDEX: false,
    SPATIAL_INDEX_WORLD_WIDTH: 10000,
    SPATIAL_INDEX_WORLD_HEIGHT: 10000,
    SPATIAL_INDEX_MAX_DEPTH: 7,
    SPATIAL_INDEX_MAX_ENTITIES_PER_NODE: 8
}

export default defaults