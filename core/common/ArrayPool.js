/**
 * ArrayPool - Reusable object pool for arrays
 *
 * Reduces GC pressure by recycling arrays instead of allocating new ones.
 * Useful for temporary buffers in high-frequency operations like snapshot construction.
 *
 * @class ArrayPool
 */
class ArrayPool {
    /**
     * Create a new ArrayPool
     * @param {number} maxPoolSize - Maximum number of arrays to keep in the pool (default: 64)
     */
    constructor(maxPoolSize = 64) {
        this.pool = []
        this.maxPoolSize = maxPoolSize
    }

    /**
     * Acquire an array from the pool
     * @returns {Array} An array ready to use (either from pool or newly allocated)
     */
    acquire() {
        return this.pool.length > 0 ? this.pool.pop() : []
    }

    /**
     * Release an array back to the pool
     * Clears the array contents before storing it
     * @param {Array} array - The array to return to the pool
     */
    release(array) {
        if (!array) return

        // Clear the array
        array.length = 0

        // Only keep the array if pool isn't full
        if (this.pool.length < this.maxPoolSize) {
            this.pool.push(array)
        }
    }

    /**
     * Release multiple arrays at once
     * @param {Array} arrays - Array of arrays to release
     */
    releaseMultiple(arrays) {
        if (!arrays || !Array.isArray(arrays)) return

        for (const array of arrays) {
            this.release(array)
        }
    }

    /**
     * Get the current size of the pool
     * @returns {number} Number of arrays currently in the pool
     */
    getPoolSize() {
        return this.pool.length
    }

    /**
     * Clear the pool completely
     */
    clear() {
        this.pool.length = 0
    }
}

export { ArrayPool }
