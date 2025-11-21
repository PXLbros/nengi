function randomInt(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}


function LatencyRecord() {
    this.pingsSent = {}
    this.latencies = new Array(5)
    this.latencyCount = 0
    this.latencyHead = 0
    this.averageLatency = 100 // default
}

LatencyRecord.prototype.generatePingKey = function() {
    var pingKey = randomInt(0, 255)

    if (!this.pingsSent[pingKey]) {
        this.pingsSent[pingKey] = Date.now()
        return pingKey
    } else {
        return -1
    }
}

LatencyRecord.prototype.receivePong = function(pingKey) {
    if (this.pingsSent[pingKey]) {
        var latency = Date.now() - this.pingsSent[pingKey]
        this.latencies[this.latencyHead] = latency
        this.latencyHead = (this.latencyHead + 1) % 5
        if (this.latencyCount < 5) {
            this.latencyCount++
        }

        //console.log('rec pong', latency)

        delete this.pingsSent[pingKey]


    }
    this.calculateAverageLatency()
}

LatencyRecord.prototype.calculateAverageLatency = function() {
    var total = 0
    for (var i = 0; i < this.latencyCount; i++) {
        total += this.latencies[i]
    }
    if (total > 0 && this.latencyCount > 0) {
        this.averageLatency = total / this.latencyCount
        //console.log('avg ping', this.averageLatency)
    }
}


export default LatencyRecord