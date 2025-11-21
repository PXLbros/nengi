import { describe, it } from 'vitest'
import Instance from '../core/instance/Instance.js'
import defaults from '../core/defaults.js'

function makeConfig(opt) {
    return {
        ...defaults,
        HIDE_LOGO: true,
        UPDATE_RATE: 20,
        ENABLE_OPTIMIZED_COMMAND_QUEUE: opt,
        protocols: {
            entities: [],
            messages: [],
            basics: [],
            components: [],
            localMessages: [],
            commands: []
        }
    }
}

describe('perf: command queue', () => {
    it('compares shift vs optimized for large command counts', () => {
        const N = 100000
        const configOpt = makeConfig(true)
        const configShift = makeConfig(false)
        const instanceOpt = new Instance(configOpt, { port: 0, mock: true })
        const instanceShift = new Instance(configShift, { port: 0, mock: true })
        // Fill with dummy commands
        for (let i = 0; i < N; i++) {
            instanceOpt.commands.push({ tick: i, client: { lastProcessedClientTick: -1 }, commands: [] })
            instanceShift.commands.push({ tick: i, client: { lastProcessedClientTick: -1 }, commands: [] })
        }
        // Optimized
        const t0 = Date.now()
        for (let i = 0; i < N; i++) {
            instanceOpt.getNextCommand()
        }
        const t1 = Date.now()
        // Shift
        const t2 = Date.now()
        for (let i = 0; i < N; i++) {
            instanceShift.getNextCommand()
        }
        const t3 = Date.now()
        console.log(`[perf-command-queue] optimized: ${t1-t0}ms, shift: ${t3-t2}ms, speedup: ${((t3-t2)/(t1-t0)).toFixed(2)}x`)
    }, 15000)
})
