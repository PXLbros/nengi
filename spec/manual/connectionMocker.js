import { EventEmitter } from 'eventemitter3'

const connectionMocker = () => {
    const createSockets = () => {
        const serverSocket = new EventEmitter()
        const clientSocket = new EventEmitter()

        // For uWebSockets.js compatibility
        serverSocket._nengiOpen = true

        serverSocket.send = (buffer, isBinary) => {
            clientSocket.emit('message', buffer)
        }

        clientSocket.send = (buffer) => {
            serverSocket.emit('message', buffer)
        }

        clientSocket.close = () => {
            serverSocket._nengiOpen = false
            serverSocket.emit('close', { code: 1000, reason: '' })
        }

        return { serverSocket, clientSocket }
    }

    // outer object takes the place of a websocket server
    // pass this to an instance
    const mock = new EventEmitter()

    // opens a mock connection between a client and instance
    mock.mockConnect = (client, handshake) => {
        // interior objects are a pair of websockets
        const { serverSocket, clientSocket } = createSockets()
        client.mockConnect(clientSocket, handshake)
        mock.emit('connection', serverSocket)
        clientSocket.emit('open')
    }

    return mock
}

export default connectionMocker
