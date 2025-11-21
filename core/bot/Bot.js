import ProtocolMap from '../protocol/ProtocolMap.js'
import metaConfig from '../common/metaConfig.js'
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer.js'
import readSnapshotBuffer from '../snapshot/reader/readSnapshotBuffer.js'
import EntityCache from '../instance/EntityCache.js'
import WorldState from '../client/WorldState.js'
import Interpolator from '../client/Interpolator.js'
import createPongBuffer from '../snapshot/writer/createPongBuffer.js'
import Chronus from '../client/Chronus.js'
import Outbound from '../client/Outbound.js'
import { EventEmitter } from 'eventemitter3'
import WebSocket from 'ws'

class Bot extends EventEmitter {
        disconnect() {
            if (this.websocket) {
                this.websocket.close()
            }
        }
    constructor(config, protocols) {
        super()
        this.config = config
        this.protocols = protocols

        this.connectionOpen = null
        this.connectionClose = null
        this.websocket = null

        this.outbound = new Outbound(this.protocols, this.websocket, this.config)
        this.chronus = new Chronus()

        this.entityCache = new EntityCache(this.config)
        this.interp = new Interpolator(this.config)

        this.snapshots = []
        this.latestWorldState = null
        this.serverTick = 0
        this.tickLength = 1000 / config.UPDATE_RATE

        this.cr = []
        this.up = []
        this.de = []

        this.totalBytesReceived = 0


        this.averagePing = 100
        this.pings = []
    }

    handleMessage(message) {
        this.totalBytesReceived += message.byteLength
        let snapshot = readSnapshotBuffer(
            message,
            this.protocols,
            this.config,
            this.connectionOpen,
            this.transferCallback,
            (id) => {
                return this.entityCache.getEntity(id).protocol
            }
        )
        // some messages aren't snapshots (connection & transfer)
        if (!snapshot) {
            return
        }

        /* ping */
        if (snapshot.pingKey !== -1) {
            var pongBuffer = createPongBuffer(snapshot.pingKey)
            this.websocket.send(Buffer.from(pongBuffer.byteArray))
        }
        if (snapshot.avgLatency !== -1) {
            this.averagePing = snapshot.avgLatency
        }
        /* end ping */

        snapshot.createEntities.forEach(entity => {
            this.entityCache.saveEntity(entity, entity.protocol)
            this.cr.push(entity)
        })
        snapshot.updateEntities.partial.forEach(update => {
            this.entityCache.updateEntityPartial(update.id, update.path, update.value)
            this.up.push(update)
        })

        snapshot.deleteEntities.forEach(id => {
            this.entityCache.deleteEntity(id)
            this.de.push(id)
        })
        let worldState = new WorldState(this.serverTick, this.tickLength, snapshot, this.latestWorldState, this.config)
        this.chronus.register(worldState.timestamp)
        this.latestWorldState = worldState
        this.snapshots.push(worldState)
        this.serverTick++
    }

    connect(address, handshake) {
        this.websocket = new WebSocket(address, { perMessageDeflate: false })
        this.outbound.websocket = this.websocket

        if (typeof handshake === 'undefined' || !handshake) {
            handshake = {}
        }

        this.websocket.on('open', () => {
            const handshakeBuffer = createHandshakeBuffer(handshake)
            const bufferToSend = Buffer.from(handshakeBuffer.byteArray)
            console.log('Bot: WebSocket opened, sending handshake buffer (size: %d bytes)', bufferToSend.length)
            this.websocket.send(bufferToSend)
        })

        this.websocket.on('error', (err) => {
            console.error('WebSocket error', err)
        })

        this.websocket.on('close', () => {
            if (this.connectionClose) {
                this.connectionClose()
            }
        })

        this.websocket.on('message', (message) => {
            // ws sends Buffer directly, convert to ArrayBuffer-like structure
            if (Buffer.isBuffer(message)) {
                // Create a copy as ArrayBuffer for compatibility
                const arrayBuffer = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength)
                this.handleMessage(arrayBuffer)
            } else {
                this.handleMessage(message)
            }
        })
    }

    mockConnect(mockSocket, handshake) {
        this.websocket = mockSocket
        this.outbound.websocket = this.websocket

        if (typeof handshake === 'undefined' || !handshake) {
            handshake = {}
        }

        this.websocket.on('open', () => {
            const handshakeBuffer = createHandshakeBuffer(handshake)
            const bufferToSend = Buffer.from(handshakeBuffer.byteArray)
            console.log('Bot: MockConnect WebSocket opened, sending handshake buffer (size: %d bytes)', bufferToSend.length)
            this.websocket.send(bufferToSend)
        })

        this.websocket.on('error', (err) => {
            console.error('WebSocket error', err)
        })

        this.websocket.on('close', () => {
            if (this.connectionClose) {
                this.connectionClose()
            }
        })

        this.websocket.on('message', (message) => {
            this.handleMessage(message)
        })
    }

    readNetwork() {
        let obj = {
            latest: [],
            messages: [],
            localMessages: [],
            jsons: [],
            entities: [{
                createEntities: this.cr,
                updateEntities: this.up,
                deleteEntities: this.de
            }]
        }

        this.cr = []
        this.up = []
        this.de = []


        if (this.snapshots[this.snapshots.length - 20]) {
            //if (this.snapshots[this.snapshots.length - 20].processed) {
                this.snapshots.splice(this.snapshots.length - 20, 1)
            //}
        }
        /*

        if (this.snapshots[this.snapshots.length - 20]) {
            //if (this.snapshots[this.snapshots.length-20].processed) {
            this.snapshots.splice(this.snapshots.length - 20, 1)
            // }
        }
        */

        //console.log('sn', this.snapshots.length)
        //return this.interp.interp(this.snapshots, Date.now() - 100 - this.chronus.averageTimeDifference)

        return obj

    }

    getUnconfirmedCommands() {
        return this.outbound.getUnconfirmedCommands()
    }

    onConnect(cb) {
        this.connectionOpen = cb
    }

    onClose(cb) {
        this.connectionClose = cb
    }

    update() {
        this.outbound.update()
        this.outbound.unconfirmedCommands.clear()
    }

    addCommand(command) {
        this.outbound.addCommand(command)
    }
}

export default Bot;
