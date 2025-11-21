import createPropSchema from './createPropSchema.js';
import createOptSchema from './createOptSchema.js';
import selectUIntType from './selectUIntType.js';
import Binary from '../binary/Binary.js';

function Protocol(schemaConfig, config, optSchemaConfig, components, throwOnAdvancedTypes) {
	//console.log('creating protocol from', schemaConfig, throwOnAdvancedTypes)
	this.metaType = 'protocol'
	this.type = 'basic'
	this.properties = {}
	this.keys = []
	// Expose batch optimization toggle (default: false)
	this.config = config || {}
	if (typeof this.config.ENABLE_BATCH_OPTIMIZATION !== 'boolean') {
		this.config.ENABLE_BATCH_OPTIMIZATION = false
	}
	// minimum number of changed properties required before attempting a batch
	if (typeof this.config.BATCH_MIN_UPDATES !== 'number') {
		this.config.BATCH_MIN_UPDATES = 2
	}
	// maximum number of changed properties allowed for batch (Infinity by default)
	if (typeof this.config.BATCH_MAX_KEYS !== 'number') {
		this.config.BATCH_MAX_KEYS = Infinity
	}
	// cooldown ticks after a batch rejection before trying again (entity-level); default 0 disables
	if (typeof this.config.BATCH_RETRY_COOLDOWN_TICKS !== 'number') {
		this.config.BATCH_RETRY_COOLDOWN_TICKS = 0
	}
	this.hasOptimizations = false

	var arr = []
	if (schemaConfig[config.TYPE_PROPERTY_NAME]) {
		arr.push(config.TYPE_PROPERTY_NAME)
	}
	if (schemaConfig[config.ID_PROPERTY_NAME]) {
		arr.push(config.ID_PROPERTY_NAME)
	}

	for (var prop in schemaConfig) {
		if (prop !== config.TYPE_PROPERTY_NAME && prop !== config.ID_PROPERTY_NAME){
			arr.push(prop)
		}		
	}
	//arr.sort(propSort)

	this.keyType = selectUIntType(arr.length)
	
	for (var i = 0; i < arr.length; i++) {
		var prop = arr[i]

		var propConfig =  schemaConfig[prop]

		this.properties[prop] = createPropSchema(i, propConfig, throwOnAdvancedTypes)
		// Precompute constant bit width for fixed-size types to reduce repeated lookups
		if (Binary[this.properties[prop].type] && !Binary[this.properties[prop].type].countBits) {
			this.properties[prop].constantBits = Binary[this.properties[prop].type].bits
		}
		this.keys.push(prop)

		if (prop.indexOf('.') !== -1) {
			this.properties[prop].path = prop.split('.')
			if (this.properties[prop].path.length > 3) {
				throw new Error('Protocol nested property limit (3 maximum) exceeded by path ' + schemaConfig + ' ' + optSchemaConfig)
			}
		} else {
			this.properties[prop].path = [prop]
		}
	}

	if (typeof optSchemaConfig !== 'undefined') {
		var batch = {}
		batch.properties = {}
		batch.keys = []

		var arr2 = []
		for (var prop in optSchemaConfig) {
			arr2.push(prop)
		}

		for (var i = 0; i < arr2.length; i++) {
			var prop = arr2[i]

			var optConfig =  optSchemaConfig[prop]

			batch.properties[prop] = createOptSchema(i, optConfig)
			if (Binary[batch.properties[prop].type] && !Binary[batch.properties[prop].type].countBits) {
				batch.properties[prop].constantBits = Binary[batch.properties[prop].type].bits
			}
			batch.keys.push(prop)

			if (prop.indexOf('.') !== -1) {
				batch.properties[prop].path = prop.split('.')
				if (batch.properties[prop].path.length > 3) {
					throw new Error('Protocol nested property limit (3 maximum) exceeded by path ' + schemaConfig + ' ' + optSchemaConfig)
				}
			} else {
				batch.properties[prop].path = [prop]
			}
		}
		this.hasOptimizations = true
		this.batch = batch
	}

	if (components) {
        this.components = {
            mode: components.mode
        }
    } else {
        this.components = false
    }

	//console.log(this)
}

export default Protocol;
