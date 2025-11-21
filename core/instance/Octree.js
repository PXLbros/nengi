/**
 * High-performance octree spatial index for 3D visibility culling
 * Supports 3D spatial queries with minimal GC pressure via node pooling
 */

class OctreeNode {
    constructor() {
        this.bounds = null  // {x, y, z, halfWidth, halfHeight, halfDepth}
        this.entities = []  // Entities in this node only (not recursive)
        this.children = [null, null, null, null, null, null, null, null]  // 8 octants
        this.depth = 0
        this.isDirty = false
    }

    reset() {
        this.bounds = null
        this.entities.length = 0
        for (let i = 0; i < 8; i++) {
            this.children[i] = null
        }
        this.depth = 0
        this.isDirty = false
    }
}

class OctreeNodePool {
    /**
     * Object pool for octree nodes to minimize GC
     * @param {number} initialSize - Number of pre-allocated nodes
     */
    constructor(initialSize = 256) {
        this.available = []
        this.inUse = new Set()

        // Pre-allocate nodes
        for (let i = 0; i < initialSize; i++) {
            this.available.push(new OctreeNode())
        }
    }

    /**
     * Acquire a node from the pool
     * @returns {OctreeNode}
     */
    acquire() {
        let node
        if (this.available.length > 0) {
            node = this.available.pop()
        } else {
            node = new OctreeNode()
        }
        this.inUse.add(node)
        return node
    }

    /**
     * Release a node back to the pool
     * @param {OctreeNode} node
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
 * Octree spatial index for 3D entity visibility culling
 * O(log n) insert/remove/query operations
 */
class Octree {
    /**
     * Creates a new Octree
     * @param {Object} bounds - Root node bounds {x, y, z, halfWidth, halfHeight, halfDepth}
     * @param {number} maxDepth - Maximum tree depth (default 7)
     * @param {number} maxEntitiesPerNode - Threshold for subdivision (default 8)
     */
    constructor(bounds, maxDepth = 7, maxEntitiesPerNode = 8) {
        this.bounds = bounds
        this.maxDepth = maxDepth
        this.maxEntitiesPerNode = maxEntitiesPerNode
        this.nodePool = new OctreeNodePool(256)

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
     * Insert an entity into the octree
     * @param {Object} entity - Entity with x, y, z properties
     */
    insert(entity) {
        if (!entity || entity.x === undefined || entity.y === undefined || entity.z === undefined) {
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
     * Remove an entity from the octree
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
     * @param {Object} aabb - Query bounds {x, y, z, halfWidth, halfHeight, halfDepth}
     * @returns {Array} Array of entities intersecting the AABB
     */
    query(aabb) {
        const result = []
        this._queryRecursive(this.root, aabb, result)
        this.stats.queryCount++
        return result
    }

    /**
     * Clear the entire octree
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
     * Get statistics about the octree
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
            for (let i = 0; i < 8; i++) {
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
        const octant = this._getOctant(node, entity)
        if (octant !== -1 && node.children[octant]) {
            this._insertNode(node.children[octant], entity)
        }
    }

    /**
     * Subdivide a node into 8 children
     * @private
     */
    _subdivide(node) {
        const { x, y, z, halfWidth, halfHeight, halfDepth } = node.bounds
        const halfHW = halfWidth / 2
        const halfHH = halfHeight / 2
        const halfHD = halfDepth / 2

        // Define 8 octants: NWU, NEU, SWU, SEU, NWD, NED, SWD, SED
        const octants = [
            { x: x - halfHW, y: y - halfHH, z: z - halfHD },  // NWU (0)
            { x: x + halfHW, y: y - halfHH, z: z - halfHD },  // NEU (1)
            { x: x - halfHW, y: y + halfHH, z: z - halfHD },  // SWU (2)
            { x: x + halfHW, y: y + halfHH, z: z - halfHD },  // SEU (3)
            { x: x - halfHW, y: y - halfHH, z: z + halfHD },  // NWD (4)
            { x: x + halfHW, y: y - halfHH, z: z + halfHD },  // NED (5)
            { x: x - halfHW, y: y + halfHH, z: z + halfHD },  // SWD (6)
            { x: x + halfHW, y: y + halfHH, z: z + halfHD }   // SED (7)
        ]

        for (let i = 0; i < 8; i++) {
            const child = this.nodePool.acquire()
            child.bounds = {
                x: octants[i].x,
                y: octants[i].y,
                z: octants[i].z,
                halfWidth: halfHW,
                halfHeight: halfHH,
                halfDepth: halfHD
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
            for (let i = 0; i < 8; i++) {
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

        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                this._releaseRecursive(node.children[i])
                this.nodePool.release(node.children[i])
                node.children[i] = null
            }
        }

        node.entities.length = 0
    }

    /**
     * Get which octant an entity belongs to (-1 if none/boundary)
     * @private
     */
    _getOctant(node, entity) {
        const { x, y, z, halfWidth, halfHeight, halfDepth } = node.bounds
        const ctrX = x
        const ctrY = y
        const ctrZ = z

        const west = entity.x < ctrX
        const north = entity.y < ctrY
        const up = entity.z < ctrZ

        if (west && north && up) return 0    // NWU
        if (!west && north && up) return 1   // NEU
        if (west && !north && up) return 2   // SWU
        if (!west && !north && up) return 3  // SEU
        if (west && north && !up) return 4   // NWD
        if (!west && north && !up) return 5  // NED
        if (west && !north && !up) return 6  // SWD
        if (!west && !north && !up) return 7 // SED

        return -1 // On boundary
    }

    /**
     * Check if a point (entity) is within node bounds
     * @private
     */
    _intersectsPoint(bounds, entity) {
        const { x, y, z, halfWidth, halfHeight, halfDepth } = bounds
        return (
            entity.x >= x - halfWidth &&
            entity.x <= x + halfWidth &&
            entity.y >= y - halfHeight &&
            entity.y <= y + halfHeight &&
            entity.z >= z - halfDepth &&
            entity.z <= z + halfDepth
        )
    }

    /**
     * Check if point is within AABB
     * @private
     */
    _pointInAabb(entity, aabb) {
        const { x, y, z, halfWidth, halfHeight, halfDepth } = aabb
        return (
            entity.x >= x - halfWidth &&
            entity.x <= x + halfWidth &&
            entity.y >= y - halfHeight &&
            entity.y <= y + halfHeight &&
            entity.z >= z - halfDepth &&
            entity.z <= z + halfDepth
        )
    }

    /**
     * Check if two AABBs intersect
     * @private
     */
    _aabbIntersects(bounds, aabb) {
        const { x: x1, y: y1, z: z1, halfWidth: hw1, halfHeight: hh1, halfDepth: hd1 } = bounds
        const { x: x2, y: y2, z: z2, halfWidth: hw2, halfHeight: hh2, halfDepth: hd2 } = aabb

        return (
            x1 - hw1 <= x2 + hw2 &&
            x1 + hw1 >= x2 - hw2 &&
            y1 - hh1 <= y2 + hh2 &&
            y1 + hh1 >= y2 - hh2 &&
            z1 - hd1 <= z2 + hd2 &&
            z1 + hd1 >= z2 - hd2
        )
    }
}

export { Octree, OctreeNode, OctreeNodePool }
