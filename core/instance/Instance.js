import uWS from 'uwebsockets.js'
import EDictionary from '../../external/EDictionary.js'
import Historian from './Historian.js'
import IdPool from './IdPool.js'
import proxify from '../protocol/proxify.js'
import chooseOptimization from '../snapshot/entityUpdate/chooseOptimization.js'
import ProtocolMap from '../protocol/ProtocolMap.js'
import Client from './Client.js'
import createSnapshotBuffer from '../snapshot/writer/createSnapshotBuffer.js'
import readCommandBuffer from '../snapshot/reader/readCommandBuffer.js'
import createConnectionResponseBuffer from '../snapshot/writer/createConnectionResponseBuffer.js'
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer.js'

import consoleLogLogo from '../common/consoleLogLogo.js'
import metaConfig from '../common/metaConfig.js'
import NoInterpsMessage from '../common/NoInterpsMessage.js'
import Sleep from './Sleep.js'

import BasicSpace from './BasicSpace.js'
import { EventEmitter } from 'eventemitter3'
import Channel from './Channel.js'

import defaults from '../defaults.js'

let protocols = null

class Instance extends EventEmitter {
    constructor(config, webConfig) {
        super()
        /* defaults */
        if (!config) {
            throw new Error('Instance requries a nengiConfig')
        } else {
            for (let prop in defaults) {
                if (typeof (config[prop]) === 'undefined') {
                    config[prop] = defaults[prop]
                }
            }
        }

        if (!webConfig) {
            throw new Error('Instance requries a webConfig')
        }

        if (!protocols) {
            protocols = new ProtocolMap(config, metaConfig)
        }
        this.config = config
        this.transferPassword = webConfig.transferPassword
        this.protocols = protocols
        this.sleepManager = new Sleep()
        this.tick = 0

        this.clientId = 0
        this.entityId = 0
        this.eventId = 0
        this.channelId = 70000

        this.entityIdPool = new IdPool(config.ID_BINARY_TYPE)
        this.pendingClients = new Map()
        this._entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.clients = new EDictionary()
        this.entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.channels = new EDictionary()
        this.channelCount = 0

        this.sources = new Map()

        this.localEvents = []
        this.proxyCache = {}

        this.historian = new Historian(config.UPDATE_RATE, config.HISTORIAN_TICKS, config.ID_PROPERTY_NAME, config.DIMENSIONALITY)
        // if no history
        this.basicSpace = new BasicSpace(config.ID_PROPERTY_NAME, config.DIMENSIONALITY)

        this.commands = []
        // Ring buffer head index for command queue (avoids O(n) Array.shift cost)
        this._commandHead = 0
        // Configurable: enable optimized command queue
        this._useOptimizedCommandQueue = typeof config.ENABLE_OPTIMIZED_COMMAND_QUEUE === 'boolean' ? config.ENABLE_OPTIMIZED_COMMAND_QUEUE : true

        this.transferCallback = null
        this.connectCallback = null
        this.disconnectCallback = null

        this.httpServer = null
        this.wsServer = null

        this.noInterps = []
        this.transfers = {}
        this.createEntities = []
        this.deleteEntities = []

        this.parents = new Map()

        this.debugCount = 0

        if (!config.HIDE_LOGO) {
            consoleLogLogo()
        }

        if (typeof webConfig.port !== 'undefined') {
            // Using uWebSockets.js with standalone port
            const uwsOptions = webConfig.uwsConfig || {}
            const wsOptions = webConfig.wsConfig || {}

            this.wsServer = uWS.App(uwsOptions)

            this.wsServer.ws('/nengi', {
                ...wsOptions,
                open: (ws) => {
                    ws._nengiOpen = true
                    const client = this.connect(ws)
                    ws._nengiClient = client
                },
                message: (ws, message, isBinary) => {
                    const client = ws._nengiClient
                    if (client) {
                        // Zero-copy path: pass ArrayBuffer directly to reader
                        // readCommandBuffer can accept ArrayBuffer; avoid Buffer.from copy
                        this.onMessage(message, client)
                    }
                },
                close: (ws, code, message) => {
                    const client = ws._nengiClient
                    if (client) {
                        ws._nengiOpen = false
                        this.disconnect(client, { code, reason: Buffer.from(message).toString() })
                    }
                },
                drain: (ws) => {
                    // Handle backpressure if needed
                },
            })

            this.wsServer.listen(webConfig.port, (listenSocket) => {
                if (listenSocket) {
                    console.log(`uWebSockets.js server listening on port ${webConfig.port}`)
                } else {
                    throw new Error(`Failed to listen on port ${webConfig.port}`)
                }
            })
        } else if (typeof webConfig.httpServer !== 'undefined') {
            // Note: uWebSockets.js doesn't directly support attaching to existing HTTP servers
            // You would need to use uWS.App().listen() separately or use a different approach
            // For now, throwing an error to document this limitation
            throw new Error('uWebSockets.js does not support attaching to existing HTTP servers. ' +
                'Please use webConfig.port instead, or consider using uWS.SSLApp() for HTTPS.')
        } else if (typeof webConfig.mock !== 'undefined') {
            // using a connectionless mock mode, see spec folder for interface
            this.wsServer = webConfig.mock
        } else {
            throw new Error('Instance must be passed a config that contains a port or an http server.')
        }
    }

    noInterp(id) {
        this.noInterps.push(id)
    }

    sleep(entity) {
        this.sleepManager.sleep(entity.id)
    }

    isAwake(entity) {
        return this.sleepManager.isAwake(entity.id)
    }

    isAsleep(entity) {
        return !this.sleepManager.isAwake(entity.id)
    }

    wake(entity) {
        this.sleepManager.wake(entity.id)
    }

    wakeOnce(entity) {
        this.sleepManager.wakeOnce(entity.id)
    }

    onMessage(message, client) {
        try {
            var commandMessage = readCommandBuffer(message, this.protocols, this.config)
        } catch (err) {
            if (err) {
                console.log('onMessage error, disconnecting client', err)
                this.disconnect(client)
                this.pendingClients.delete(client.connection)
            }
            return
        }
        if (commandMessage.handshake !== -1) {
            if (typeof this.connectCallback === 'function') {
                var clientData = {
                    fromClient: commandMessage.handshake,
                    fromTransfer: null
                }

                this.connectCallback(client, clientData, (response) => {
                    if (typeof response === 'object') {
                        if (response.accepted) {
                            this.acceptConnection(client, response.text)
                        } else {
                            this.denyConnection(client, response.text)
                        }
                    }
                })
            }
        }

        if (!client.accepted) {
            return
        }

        if (commandMessage.pong !== -1) {
            client.latencyRecord.receivePong(commandMessage.pong)
            return // exit early,  message with PONG has nothing else of interest
        }

        client.lastReceivedDataTimestamp = Date.now()

        this.commands.push({
            tick: commandMessage.tick,
            pong: commandMessage.pong,
            client: client,
            commands: commandMessage.commands
        })
    }

    getNextCommand() {
        if (this._useOptimizedCommandQueue) {
            if (this._commandHead >= this.commands.length) {
                return null
            }
            var cmd = this.commands[this._commandHead]
            this._commandHead++
            // Compact array occasionally to prevent unbounded growth
            if (this._commandHead > 32 && this._commandHead > (this.commands.length >> 1)) {
                this.commands = this.commands.slice(this._commandHead)
                this._commandHead = 0
            }
            if (cmd && cmd.client.lastProcessedClientTick < cmd.tick) {
                cmd.client.lastProcessedClientTick = cmd.tick
            }
            return cmd
        } else {
            var cmd = this.commands.shift()
            if (cmd && cmd.client.lastProcessedClientTick < cmd.tick) {
                cmd.client.lastProcessedClientTick = cmd.tick
            }
            return cmd
        }
    }

    onConnect(callback) {
        this.connectCallback = callback
    }

    acceptConnection(client, text) {
        if (client.connection._nengiOpen === true) {
            this.pendingClients.delete(client.connection)
            this.addClient(client)
            client.accepted = true

            var bitBuffer = createConnectionResponseBuffer(true, text)
            var buffer = bitBuffer.toBuffer()

            if (client.connection._nengiOpen === true) {
                client.connection.send(buffer, true)
            }
        } else {
            // This client appears to have disconnected INBETWEEN the websocket connection forming
            // and the game logic choosing to accept the connection, so the game logic at this very moment
            // is probably running asynchronous code in an instance.on('connect', () => {}) block
            // We need to tell the game to disconnect this client.
            this.pendingClients.delete(client.connection)

            client.instance = null

            client.connection.close()
            if (typeof this.disconnectCallback === 'function') {
                this.disconnectCallback(client, null)
            }
        }
    }

    denyConnection(client, text) {
        this.pendingClients.delete(client.connection)

        var bitBuffer = createConnectionResponseBuffer(false, text)
        var buffer = bitBuffer.toBuffer()

        if (client.connection._nengiOpen === true) {
            client.connection.send(buffer, true)
            client.connection.close()
        }
    }

    connect(connection) {
        var client = new Client(this.config)
        client.connection = connection
        this.pendingClients.set(connection, client)
        return client
    }

    onDisconnect(callback) {
        this.disconnectCallback = callback
    }

    disconnect(client, event) {
        if (this.clients.get(client.id)) {
            this.clients.remove(client)
            client.instance = null

            if (typeof this.disconnectCallback === 'function') {
                this.disconnectCallback(client, event)
            }
            // Guard against double close: uWS close handler sets _nengiOpen = false before calling disconnect
            if (client.connection && client.connection._nengiOpen === true) {
                client.connection.close()
            }
        } else {
            // This client appears to have disconnected INBETWEEN the websocket connection forming
            // and the game logic choosing to accept the connection, so the game logic at this very moment
            // is probably running asynchronous code in an instance.on('connect', () => {}) block
            // We need to tell the game to disconnect this client.
            if (this.pendingClients.has(client.connection)) {
                this.pendingClients.delete(client.connection)
                client.instance = null
                client.connection.close()
                if (typeof this.disconnectCallback === 'function') {
                    this.disconnectCallback(client, null)
                }
            }
        }
        return client
    }

    createChannel() {
        const channel = new Channel(this, this.channelId++)
        this.channels.add(channel)
        return channel
    }

    destroyChannel(channel) {
        channel.destroy()
    }

    addClient(client) {
        client.id = this.clientId++
        client.instance = this
        this.clients.add(client)
        return client
    }

    getClient(id) {
        return this.clients.get(id)
    }

    registerEntity(entity, sourceId) {
        let nid = entity[this.config.ID_PROPERTY_NAME]
        if (!this.sources.has(nid)) {
            nid = this.entityIdPool.nextId()
            entity[this.config.ID_PROPERTY_NAME] = nid
            entity[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(entity.protocol)
            this.sources.set(nid, new Set())
            this._entities.add(entity)
        }
        const entitySources = this.sources.get(nid)
        entitySources.add(sourceId)
        return nid
    }

    unregisterEntity(entity, sourceId) {
        const nid = entity[this.config.ID_PROPERTY_NAME]
        const entitySources = this.sources.get(nid)
        entitySources.delete(sourceId)

        if (entitySources.size === 0) {
            this.sources.delete(nid)
            this._entities.remove(entity)
            this.entityIdPool.queueReturnId(nid)
            entity[this.config.ID_PROPERTY_NAME] = -1
        }
    }

    addEntity(entity) {
        if (!entity.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        this.registerEntity(entity, -1)
        this.entities.add(entity)

        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.insertEntity(entity)
        }
        return entity
    }

    removeEntity(entity) {
        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.entities.remove(entity)
        }
        const id = entity[this.config.ID_PROPERTY_NAME]
        this.deleteEntities.push(id)
        this.entities.remove(entity)
        this.unregisterEntity(entity, -1)
        return entity
    }

    removeEntityAndComponents(entity) {
        const id = entity[this.config.ID_PROPERTY_NAME]
        const children = this.parents.get(id)
        if (children && children.size > 0) {
            children.forEach(nid => {
                const component = { [this.config.ID_PROPERTY_NAME]: nid }
                this.removeComponent(component, entity)
            })
        }
        this.removeEntity(entity)
        return entity
    }

    addComponent(component, parent) {
        const parentId = parent[this.config.ID_PROPERTY_NAME]
        const componentId = this.registerEntity(component, parentId)
        if (!this.parents.get(parentId)) {
            this.parents.set(parentId, new Set())
        }
        this.parents.get(parentId).add(componentId)
    }

    removeComponent(component, parent) {
        const parentId = parent[this.config.ID_PROPERTY_NAME]
        const componentId = component[this.config.ID_PROPERTY_NAME]
        this.parents.get(parentId).delete(componentId)
        this.unregisterEntity(component)
    }

    getEntity(id) {
        return this._entities.get(id)
    }

    addLocalMessage(lEvent) {
        if (!lEvent.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }

        lEvent[this.config.ID_PROPERTY_NAME] = this.eventId++
        lEvent[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(lEvent.protocol)

        if (this.config.USE_HISTORIAN) {
            this.localEvents.push(lEvent)
        } else {
            this.basicSpace.insertEvent(lEvent)
        }

        return lEvent
    }

    message(message, clientOrClients) {
        if (!message.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        message[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(message.protocol)

        if (Array.isArray(clientOrClients)) {
            clientOrClients.forEach(client => {
                client.queueMessage(message)
            })
        } else {
            clientOrClients.queueMessage(message)
        }
        return message
    }

    messageAll(message) {
        this.message(message, this.clients.toArray())
    }

    sendJSON(json, clientOrClients) {
        var payload = (typeof json === 'string') ? json : JSON.stringify(json)

        if (Array.isArray(clientOrClients)) {
            clientOrClients.forEach(client => {
                client.queueJSON(payload)
            })
        } else {
            clientOrClients.queueJSON(payload)
        }
        return payload
    }

    proxifyOrGetCachedProxy(tick, entity) {
        if (this.proxyCache[tick].entities[entity.id]) {
            return this.proxyCache[tick].entities[entity.id]
        } else {
            if (!entity.protocol) {
                console.log('PROBLEM Entity/Component:', entity)
                throw new Error('nengi encountered an entity without a protocol. Did you forget to attach a protocol to an entity or list it in the config? Did you add an entity to the instance that was never supposed to be networked?')
            }
            var proxy = proxify(entity, entity.protocol)
            this.proxyCache[tick].entities[entity.id] = proxy

            if (this.proxyCache[tick - 1]) {
                var proxyOld = this.proxyCache[tick - 1].entities[entity.id]
                if (proxyOld) {
                    proxy.diff = chooseOptimization(
                        this.config.ID_PROPERTY_NAME,
                        proxyOld,
                        proxy,
                        entity.protocol
                    )
                }
            }

            return proxy
        }
    }

    proxifyOrGetCachedProxyPerClient(client, entity, tick, isDiff) {
        let proxy
        if (this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]]) {
            proxy = this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]]
        } else {
            proxy = proxify(entity, entity.protocol)
            this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]] = proxy
        }

        if (proxy && proxy.diffTick === tick) {
            return proxy
        }

        if (isDiff) {
            let proxyOld
            if (this.proxyCache[client.entityCache.lastTick]) {
                proxyOld = this.proxyCache[client.entityCache.lastTick].entities[entity[this.config.ID_PROPERTY_NAME]]
            }

            if (proxyOld) {
                this.debugCount++
                proxy.diff = chooseOptimization(
                    this.config.ID_PROPERTY_NAME,
                    proxyOld,
                    proxy,
                    entity.protocol
                )
                proxy.diffTick = tick
            } else {
                proxy.diff = {
                    singleProps: []
                }
                proxy.diffTick = tick
            }
        }

        return proxy
    }

    update() {
        if (this.config.USE_HISTORIAN) {
            this.historian.record(this.tick, this.entities.toArray(), this.localEvents)
        }

        this.localEvents = []

        var spatialStructure = (this.config.USE_HISTORIAN) ? this.historian.getCurrentState() : this.basicSpace

        var now = Date.now()
        var clients = this.clients.toArray()

        for (var i = 0; i < clients.length; i++) {
            var client = clients[i]

            var snapshot = this.createSnapshot(this.tick, client, spatialStructure, now)
            var bitBuffer = createSnapshotBuffer(snapshot, this.config)
            // expose last snapshot buffer for testing/instrumentation (non-public API)
            this.lastSnapshotBuffer = bitBuffer
            var buffer = bitBuffer.toBuffer()

            if (client.connection._nengiOpen === true) {
                client.connection.send(buffer, true)
                client.saveSnapshot(snapshot, this.protocols, this.tick)
            }
        }

        delete this.proxyCache[this.tick - 20]

        this.noInterps = []
        this.deleteEntities = []
        this.createEntities = []
        this.entityIdPool.update()
        this.tick++

        this.debugCount = 0

        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.flushEvents()
        }
    }

    createSnapshot(tick, client, spatialStructure, now) {
        if (typeof this.proxyCache[tick] === 'undefined') {
            this.proxyCache[tick] = {
                entities: {},
            }
        }

        var now = Date.now()

        // when timestamp is -1, no timesync is sent to the client
        var timestamp = (tick % this.config.UPDATE_RATE === 0) ? now : -1

        if (client.lastReceivedTick === -1) {
            timestamp = now
        }
        client.lastReceivedTick = tick

        var avgLatency = Math.round(client.latencyRecord.averageLatency)
        if (avgLatency > 999) {
            avgLatency = 999
        } else if (avgLatency < 0) {
            avgLatency = 0
        }

        var pingKey = (tick % this.config.PING_PONG_TICK_INTERVAL === 0) ? client.latencyRecord.generatePingKey() : -1

        // Reuse snapshot arrays from a simple pool to reduce allocations
        this._arrayPool = this._arrayPool || []
        const acquireArray = () => (this._arrayPool.pop() || [])
        const releaseArray = (arr) => { arr.length = 0; if (this._arrayPool.length < 64) this._arrayPool.push(arr) }

        var snapshot = {
            tick: tick,
            clientTick: client.lastProcessedClientTick,

            pingKey: pingKey,
            avgLatency: avgLatency,
            timestamp: timestamp,
            transferKey: client.transferKey,

            engineMessages: acquireArray(),
            localEvents: acquireArray(),
            messages: acquireArray(),
            jsons: acquireArray(),
            createEntities: acquireArray(),
            deleteEntities: acquireArray(),
            updateEntities: {
                full: acquireArray(),
                partial: acquireArray(),
                optimized: acquireArray()
            }
        }

        if (client.transferKey !== -1) {
            client.transferKey = -1
        }

        for (var i = 0; i < client.messageQueue.length; i++) {
            snapshot.messages.push(client.messageQueue[i])
        }
        client.messageQueue.length = 0

        for (var i = 0; i < client.jsonQueue.length; i++) {
            snapshot.jsons.push(client.jsonQueue[i])
        }
        client.jsonQueue.length = 0

        var vision = client.checkVisibility(spatialStructure, tick)

        // entity create
        for (var i = 0; i < vision.newlyVisible.length; i++) {
            let id = vision.newlyVisible[i]
            let entity = this.getEntity(id)
            let proxy = this.proxifyOrGetCachedProxyPerClient(client, entity, tick, false)
            proxy.protocol = entity.protocol
            snapshot.createEntities.push(proxy)
        }

        var tempNoInterps = []
        for (var i = 0; i < vision.stillVisible.length; i++) {
            let id = vision.stillVisible[i]
            let entity = this.getEntity(id)
            if (this.sleepManager.isAwake(entity[this.config.ID_PROPERTY_NAME])) {
                let proxy = this.proxifyOrGetCachedProxyPerClient(client, entity, tick, true)

                let formattedUpdates = proxy.diff

                for (var j = 0; j < formattedUpdates.singleProps.length; j++) {
                    var singleProp = formattedUpdates.singleProps[j]
                    snapshot.updateEntities.partial.push(singleProp)
                }
            } else {
                this.proxifyOrGetCachedProxyPerClient(client, entity, tick, false)
            }

            if (this.noInterps.indexOf(id) !== -1) {
                tempNoInterps.push(id)
            }
        }

        if (tempNoInterps.length > 0) {
            var msg = new NoInterpsMessage(tempNoInterps)
            msg.protocol = this.protocols.getMetaProtocol(msg.type)
            snapshot.engineMessages.push(msg)
        }

        // entity delete
        for (var i = 0; i < vision.noLongerVisible.length; i++) {
            snapshot.deleteEntities.push(vision.noLongerVisible[i])
            let entity = this.getEntity(vision.noLongerVisible[i])
        }

        snapshot.localEvents = vision.events
        // NOTE: Caller is responsible for releasing arrays after serialization if pooling is extended.
        return snapshot
    }
}

export default Instance
