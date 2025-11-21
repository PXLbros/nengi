import BinaryType from '../binary/BinaryType.js'

/**
 * BinaryTypeValidator - Utility for validating and providing helpful error messages for binary types
 * @class BinaryTypeValidator
 */
class BinaryTypeValidator {
    /**
     * Get all valid binary type names
     * @returns {Array<string>} Array of valid type names
     */
    static getValidTypeNames() {
        const typeNames = []
        for (const [key, value] of Object.entries(BinaryType)) {
            if (typeof value === 'number') {
                typeNames.push(key)
            }
        }
        return typeNames.sort()
    }

    /**
     * Get a formatted string of all valid types for error messages
     * @returns {string} Formatted list of valid types
     */
    static getValidTypesMessage() {
        const types = this.getValidTypeNames()
        return types.join(', ')
    }

    /**
     * Check if a given type is a valid binary type
     * @param {*} type - The type value to check
     * @returns {boolean} True if type is valid
     */
    static isValidBinaryType(type) {
        return typeof type === 'number' && BinaryType[Object.keys(BinaryType).find(k => BinaryType[k] === type)] !== undefined
    }

    /**
     * Get a helpful error message for an invalid type
     * @param {*} invalidType - The invalid type value
     * @param {string} context - Optional context (e.g., property name, index)
     * @returns {string} Detailed error message
     */
    static getInvalidTypeMessage(invalidType, context = '') {
        const contextStr = context ? ` (${context})` : ''
        const validTypes = this.getValidTypesMessage()

        let message = `Invalid binary type${contextStr}: ${typeof invalidType === 'undefined' ? 'undefined' : JSON.stringify(invalidType)}\n`
        message += `Valid types: ${validTypes}\n`
        message += `Did you forget to use nengi.TypeName? Example: { x: nengi.Float32 }`

        return message
    }

    /**
     * Get a helpful error message for a missing type
     * @param {string} context - Context about where the type was expected
     * @returns {string} Detailed error message
     */
    static getMissingTypeMessage(context = '') {
        const contextStr = context ? ` in ${context}` : ''
        const validTypes = this.getValidTypesMessage()

        let message = `Missing binary type${contextStr}\n`
        message += `Valid types: ${validTypes}\n`
        message += `Example: { x: nengi.Float32 }`

        return message
    }

    /**
     * Validate a property schema and throw helpful error if invalid
     * @param {*} propSchema - The property schema to validate
     * @param {string|number} index - The property key/index
     * @throws {Error} If type is invalid or missing
     */
    static validatePropSchema(propSchema, index) {
        if (typeof propSchema.type === 'undefined' || propSchema.type === null) {
            throw new Error(`Protocol property at index '${index}' is missing a type.\n${this.getMissingTypeMessage(`property '${index}'`)}`)
        }

        if (!this.isValidBinaryType(propSchema.type)) {
            throw new Error(`Protocol property at index '${index}' has invalid type.\n${this.getInvalidTypeMessage(propSchema.type, `property '${index}'`)}`)
        }
    }

    /**
     * Validate all properties in a protocol schema
     * @param {Object} properties - Object mapping property names to schemas
     * @throws {Error} If any property has an invalid type
     */
    static validateProtocolProperties(properties) {
        if (!properties || typeof properties !== 'object') {
            return
        }

        for (const [propName, propSchema] of Object.entries(properties)) {
            if (propSchema && typeof propSchema === 'object') {
                try {
                    this.validatePropSchema(propSchema, propName)
                } catch (err) {
                    // Re-throw with more context
                    throw new Error(err.message)
                }
            }
        }
    }
}

export default BinaryTypeValidator
