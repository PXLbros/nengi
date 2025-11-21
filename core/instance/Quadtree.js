/**
 * High-performance quadtree spatial index for visibility culling
 * Supports 2D spatial queries with minimal GC pressure via node pooling
 */

class QuadtreeNode {
    constructor() {
        this.bounds = null  // {x, y, halfWidth, halfHeight}
        this.entities = []  // Entities in this node only (not recursive)
        this.children = [null, null, null, null]  // NW, NE, SW, SE quadrants
        this.depth = 0
        this.isDirty = false
    }

    reset() {
        this.bounds = null
        this.entities.length = 0
        for (let i = 0; i < 4; i++) {
            this.children[i] = null
        }
        this.depth = 0
        this.isDirty = false
    }
}

class QuadtreeNodePool {
    /**
     * Object pool for quadtree nodes to minimize GC
     * @param {number} initialSize - Number of pre-allocated nodes
     */
    constructor(initialSize = 256) {
        this.available = []
        this.inUse = new Set()

        // Pre-allocate nodes
        for (let i = 0; i < initialSize; i++) {
            this.available.push(new QuadtreeNode())
        }
    }

    /**
     * Acquire a node from the pool
     * @returns {QuadtreeNode}
     */
    acquire() {
        let node
        if (this.available.length > 0) {
            node = this.available.pop()
        } else {
            node = new QuadtreeNode()
        }
        this.inUse.add(node)
        return node
    }

    /**
     * Release a node back to the pool
     * @param {QuadtreeNode} node
     */
    release(node) {
        if (this.inUse.has(node)) {
            this.inUse.delete(node)
            node.reset()
            this.available.push(node)
        }
    }

    /**
     * Drain all nodes from pool (for cleanup)
     */
    clear() {
        this.available.length = 0
        this.inUse.clear()
    }

    /**
     * Get number of nodes currently in use
     * @returns {number}
     */
    getInUseCount() {
        return this.inUse.size
    }
}

/**
 * Quadtree spatial index for 2D entity visibility culling
 * O(log n) insert/remove/query operations
 */
class Quadtree {
    /**
     * Creates a new Quadtree
     * @param {Object} bounds - Root node bounds {x, y, halfWidth, halfHeight}
     * @param {number} maxDepth - Maximum tree depth (default 7)
     * @param {number} maxEntitiesPerNode - Threshold for subdivision (default 8)
     */
    constructor(bounds, maxDepth = 7, maxEntitiesPerNode = 8) {
        this.bounds = bounds
        this.maxDepth = maxDepth
        this.maxEntitiesPerNode = maxEntitiesPerNode
        this.nodePool = new QuadtreeNodePool(256)

        this.root = this.nodePool.acquire()
        this.root.bounds = { ...bounds }
        this.root.depth = 0

        // Cache: entity -> node mapping for fast removal
        this._entityNodeMap = new Map()

        // Statistics
        this.stats = {
            insertCount: 0,
            queryCount: 0,
            removeCount: 0,
            maxDepthReached: 0
        }
    }

    /**
     * Insert an entity into the quadtree
     * @param {Object} entity - Entity with x, y properties
     */
    insert(entity) {
        if (!entity || entity.x === undefined || entity.y === undefined) {
            return
        }

        // Remove if already exists
        if (this._entityNodeMap.has(entity)) {
            this.remove(entity)
        }

        this._insertNode(this.root, entity)
        this._entityNodeMap.set(entity, null)  // Mark as inserted
        this.stats.insertCount++
    }

    /**
     * Remove an entity from the quadtree
     * @param {Object} entity
     */
    remove(entity) {
        if (!this._entityNodeMap.has(entity)) {
            return
        }

        this._removeRecursive(this.root, entity)
        this._entityNodeMap.delete(entity)
        this.stats.removeCount++
    }

    /**
     * Query entities within an AABB (axis-aligned bounding box)
     * @param {Object} aabb - Query bounds {x, y, halfWidth, halfHeight}
     * @returns {Array} Array of entities intersecting the AABB
     */
    query(aabb) {
        const result = []
        this._queryRecursive(this.root, aabb, result)
        this.stats.queryCount++
        return result
    }

    /**
     * Clear the entire quadtree
     */
    clear() {
        this._releaseRecursive(this.root)
        this.root = this.nodePool.acquire()
        this.root.bounds = { ...this.bounds }
        this.root.depth = 0
        this._entityNodeMap.clear()
        this.stats.insertCount = 0
        this.stats.removeCount = 0
    }

    /**
     * Get statistics about the quadtree
     * @returns {Object} Stats object
     */
    getStats() {
        return {
            ...this.stats,
            nodesInUse: this.nodePool.getInUseCount(),
            entitiesTracked: this._entityNodeMap.size
        }
    }

    // ========== Private Methods ==========

    /**
     * Recursively insert an entity into the tree
     * @private
     */
    _insertNode(node, entity) {
        // Check if entity is within node bounds
        if (!this._intersectsPoint(node.bounds, entity)) {
            return
        }

        // If this node has children, insert into appropriate child
        if (node.children[0] !== null) {
            this._insertIntoChild(node, entity)
            return
        }

        // Add entity to this node
        node.entities.push(entity)

        // Check if we should subdivide
        if (node.entities.length > this.maxEntitiesPerNode && node.depth < this.maxDepth) {
            this._subdivide(node)
            this.stats.maxDepthReached = Math.max(this.stats.maxDepthReached, node.depth + 1)
        }
    }

    /**
     * Recursively remove an entity from the tree
     * @private
     */
    _removeRecursive(node, entity) {
        const idx = node.entities.indexOf(entity)
        if (idx !== -1) {
            // Swap with last and pop (O(1))
            const last = node.entities[node.entities.length - 1]
            node.entities[idx] = last
            node.entities.pop()
            return true
        }

        // Check children
        if (node.children[0] !== null) {
            for (let i = 0; i < 4; i++) {
                if (node.children[i] && this._removeRecursive(node.children[i], entity)) {
                    return true
                }
            }
        }

        return false
    }

    /**
     * Insert entity into appropriate child node
     * @private
     */
    _insertIntoChild(node, entity) {
        const quadrant = this._getQuadrant(node, entity)
        if (quadrant !== -1 && node.children[quadrant]) {
            this._insertNode(node.children[quadrant], entity)
        }
    }

    /**
     * Subdivide a node into 4 children
     * @private
     */
    _subdivide(node) {
        const { x, y, halfWidth, halfHeight } = node.bounds
        const halfHW = halfWidth / 2
        const halfHH = halfHeight / 2

        // NW, NE, SW, SE
        const quadrants = [
            { x: x - halfHW, y: y - halfHH },
            { x: x + halfHW, y: y - halfHH },
            { x: x - halfHW, y: y + halfHH },
            { x: x + halfHW, y: y + halfHH }
        ]

        for (let i = 0; i < 4; i++) {
            const child = this.nodePool.acquire()
            child.bounds = {
                x: quadrants[i].x,
                y: quadrants[i].y,
                halfWidth: halfHW,
                halfHeight: halfHH
            }
            child.depth = node.depth + 1
            node.children[i] = child
        }

        // Distribute entities to children
        const entitiesToKeep = []
        for (const entity of node.entities) {
            if (!this._insertIntoChild(node, entity)) {
                // Entity didn't fit in any child (on boundary), keep in parent
                entitiesToKeep.push(entity)
            }
        }
        node.entities = entitiesToKeep
    }

    /**
     * Recursively query for entities in AABB
     * @private
     */
    _queryRecursive(node, aabb, result) {
        // Early exit if AABB doesn't intersect node bounds
        if (!this._aabbIntersects(node.bounds, aabb)) {
            return
        }

        // Add all entities in this node
        for (const entity of node.entities) {
            if (this._pointInAabb(entity, aabb)) {
                result.push(entity)
            }
        }

        // Recursively query children
        if (node.children[0] !== null) {
            for (let i = 0; i < 4; i++) {
                if (node.children[i]) {
                    this._queryRecursive(node.children[i], aabb, result)
                }
            }
        }
    }

    /**
     * Release all nodes in the tree back to the pool
     * @private
     */
    _releaseRecursive(node) {
        if (!node) return

        for (let i = 0; i < 4; i++) {
            if (node.children[i]) {
                this._releaseRecursive(node.children[i])
                this.nodePool.release(node.children[i])
                node.children[i] = null
            }
        }

        node.entities.length = 0
    }

    /**
     * Get which quadrant an entity belongs to (-1 if none/boundary)
     * @private
     */
    _getQuadrant(node, entity) {
        const { x, y, halfWidth, halfHeight } = node.bounds
        const ctrX = x
        const ctrY = y

        const west = entity.x < ctrX
        const north = entity.y < ctrY

        if (west && north) return 0  // NW
        if (!west && north) return 1 // NE
        if (west && !north) return 2 // SW
        if (!west && !north) return 3 // SE

        return -1 // On boundary
    }

    /**
     * Check if a point (entity) is within node bounds
     * @private
     */
    _intersectsPoint(bounds, entity) {
        const { x, y, halfWidth, halfHeight } = bounds
        return (
            entity.x >= x - halfWidth &&
            entity.x <= x + halfWidth &&
            entity.y >= y - halfHeight &&
            entity.y <= y + halfHeight
        )
    }

    /**
     * Check if point is within AABB
     * @private
     */
    _pointInAabb(entity, aabb) {
        const { x, y, halfWidth, halfHeight } = aabb
        return (
            entity.x >= x - halfWidth &&
            entity.x <= x + halfWidth &&
            entity.y >= y - halfHeight &&
            entity.y <= y + halfHeight
        )
    }

    /**
     * Check if two AABBs intersect
     * @private
     */
    _aabbIntersects(bounds, aabb) {
        const { x: x1, y: y1, halfWidth: hw1, halfHeight: hh1 } = bounds
        const { x: x2, y: y2, halfWidth: hw2, halfHeight: hh2 } = aabb

        return (
            x1 - hw1 <= x2 + hw2 &&
            x1 + hw1 >= x2 - hw2 &&
            y1 - hh1 <= y2 + hh2 &&
            y1 + hh1 >= y2 - hh2
        )
    }
}

export { Quadtree, QuadtreeNode, QuadtreeNodePool }
