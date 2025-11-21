
// the most basic spatial structure that will work with nengi's instance
import EDictionary from '../../external/EDictionary.js'
import { Quadtree } from './Quadtree.js'

function BasicSpace(ID_PROPERTY_NAME, DIMENSIONALITY) {
    this.DIMENSIONALITY = DIMENSIONALITY
    this.ID_PROPERTY_NAME = ID_PROPERTY_NAME || 'id'
    this.entities = new EDictionary(ID_PROPERTY_NAME)
    this.events = new EDictionary(ID_PROPERTY_NAME)

    // Spatial indexing strategy
    this._indexStrategy = 'brute-force'
    this._quadtree = null
}

BasicSpace.create = function (ID_PROPERTY_NAME, DIMENSIONALITY) {
    return new BasicSpace(ID_PROPERTY_NAME, DIMENSIONALITY)
}

/**
 * Enable quadtree spatial indexing
 * @param {Object} bounds - World bounds {x, y, halfWidth, halfHeight}
 * @param {number} maxDepth - Maximum tree depth
 * @param {number} maxEntitiesPerNode - Threshold for subdivision
 */
BasicSpace.prototype.enableQuadtree = function (bounds, maxDepth, maxEntitiesPerNode) {
    if (this.DIMENSIONALITY !== 2) {
        throw new Error('Quadtree only supports 2D space currently')
    }
    this._indexStrategy = 'quadtree'
    this._quadtree = new Quadtree(bounds, maxDepth, maxEntitiesPerNode)

    // Index existing entities
    const entitiesToIndex = this.entities.toArray()
    for (const entity of entitiesToIndex) {
        this._quadtree.insert(entity)
    }
}

/**
 * Get the current indexing strategy
 * @returns {string} 'brute-force' or 'quadtree'
 */
BasicSpace.prototype.getIndexStrategy = function () {
    return this._indexStrategy
}

/**
 * Get quadtree statistics (if enabled)
 * @returns {Object|null} Stats or null if brute-force
 */
BasicSpace.prototype.getIndexStats = function () {
    if (this._quadtree) {
        return this._quadtree.getStats()
    }
    return null
}

BasicSpace.prototype.insertEntity = function (entity) {
    this.entities.add(entity)

    // Also insert into quadtree if enabled
    if (this._quadtree) {
        this._quadtree.insert(entity)
    }
}

BasicSpace.prototype.insertEvent = function (event) {
    this.events.add(event)
}

/**
 * Remove an entity from the spatial structure
 * @param {Object} entity
 */
BasicSpace.prototype.removeEntity = function (entity) {
    this.entities.remove(entity)

    // Also remove from quadtree if enabled
    if (this._quadtree) {
        this._quadtree.remove(entity)
    }
}

BasicSpace.prototype.flushEvents = function () {
    this.events = new EDictionary(this.ID_PROPERTY_NAME)
}

const queryAreaEMap2D = (aabb, entities, ID_PROPERTY_NAME) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight

    const entitiesInArea = new Map()

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY) {

            entitiesInArea.set(entity[ID_PROPERTY_NAME], entity)
        }
    }
    return entitiesInArea
}

const queryAreaEMap3D = (aabb, entities, ID_PROPERTY_NAME) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const minZ = aabb.z - aabb.halfDepth
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight
    const maxZ = aabb.z + aabb.halfDepth

    const entitiesInArea = new Map()

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY
            && entity.z >= minZ
            && entity.z <= maxZ) {

            entitiesInArea.set(entity[ID_PROPERTY_NAME], entity)
        }
    }
    return entitiesInArea
}

BasicSpace.prototype.queryAreaEMap = function (aabb) {
    const entities = this.entities.toArray()
    if (this.DIMENSIONALITY === 2) {
        return queryAreaEMap2D(aabb, entities, this.ID_PROPERTY_NAME)
    } else if (this.DIMENSIONALITY === 3) {
        return queryAreaEMap3D(aabb, entities, this.ID_PROPERTY_NAME)
    } else {
        throw new Error('nengi supports 2D and 3D only')
    }
}

const queryArea3D = (aabb, entities, events) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const minZ = aabb.z - aabb.halfDepth
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight
    const maxZ = aabb.z + aabb.halfDepth

    const entitiesInArea = []
    const eventsInArea = [] 

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY
            && entity.z >= minZ
            && entity.z <= maxZ) {

            entitiesInArea.push(entity)
        }
    }

    for (var i = 0; i < events.length; i++) {
        const event = events[i]

        if (event.x <= maxX
            && event.x >= minX
            && event.y <= maxY
            && event.y >= minY
            && event.z >= minZ
            && event.z <= maxZ) {

            eventsInArea.push(event)
        }
    }
    return { entities: entitiesInArea, events: eventsInArea }
}

const queryArea2D = (aabb, entities, events) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight

    const entitiesInArea = []
    const eventsInArea = [] 

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY) {

            entitiesInArea.push(entity)
        }
    }

    for (var i = 0; i < events.length; i++) {
        const event = events[i]

        if (event.x <= maxX
            && event.x >= minX
            && event.y <= maxY
            && event.y >= minY) {

            eventsInArea.push(event)
        }
    }
    return { entities: entitiesInArea, events: eventsInArea }
}

BasicSpace.prototype.queryArea = function (aabb) {
    // Use quadtree if enabled
    if (this._quadtree) {
        const entitiesInArea = this._quadtree.query(aabb)
        const eventsInArea = this.events.toArray().filter(event => {
            const minX = aabb.x - aabb.halfWidth
            const minY = aabb.y - aabb.halfHeight
            const maxX = aabb.x + aabb.halfWidth
            const maxY = aabb.y + aabb.halfHeight
            return event.x <= maxX && event.x >= minX && event.y <= maxY && event.y >= minY
        })
        return { entities: entitiesInArea, events: eventsInArea }
    }

    // Fall back to brute-force
    const entities = this.entities.toArray()
    const events = this.events.toArray()

    if (this.DIMENSIONALITY === 2) {
        return queryArea2D(aabb, entities, events)
    } else if (this.DIMENSIONALITY === 3) {
        return queryArea3D(aabb, entities, events)
    } else {
        throw new Error('nengi supports 2D and 3D only')
    }
}

BasicSpace.prototype.release = function () {

}

export default BasicSpace