import Protocol from './Protocol.js';
//var config = require('../../config')

/**
 * Entity protocol definition - for syncing game objects across network
 * Automatically adds type and ID properties
 * @param {Object} schemaConfig - Property definitions (prop: {type: nengi.Float32, interp: true, ...})
 * @param {Object} config - Engine config (passed from nengi.Instance)
 * @param {Object} [components] - Component configuration
 * @returns {Protocol} Entity protocol instance
 */
function EntityProtocol(schemaConfig, config, components) {
    schemaConfig[config.TYPE_PROPERTY_NAME] = {
        type: config.TYPE_BINARY_TYPE, 
        interp: false,
        isArray: false
    }

    schemaConfig[config.ID_PROPERTY_NAME] = {
        type: config.ID_BINARY_TYPE,
        interp: false,
        isArray: false
    }

    /*
    if (typeof schemaConfig.x === 'undefined') {
        throw new Error('EntitySchema must define x.')
    }

    if (typeof schemaConfig.y === 'undefined') {
        throw new Error('EntitySchema must define y.')
    }
    */

    var protocol = new Protocol(schemaConfig, config, null, components, true)
    protocol.type = 'Entity'

    return protocol
}


export default EntityProtocol;
