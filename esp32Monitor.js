class ESP32Monitor {
    constructor() {
        this.esp32Online = false;
        this.lastSensorDataTime = null;
        this.lastDeviceControlTime = null;
        this.deviceStates = {
            light: 'OFF',
            ac: 'OFF',
            fan: 'OFF',
            bell:'OFF'
        };
    }

    updateSensorTime() {
        this.lastSensorDataTime = Date.now();
    }

    updateControlTime() {
        this.lastDeviceControlTime = Date.now();
    }

    setOnlineStatus(online) {
        this.esp32Online = online;
    }

    isOnline() {
        return this.esp32Online;
    }

    getDeviceStates() {
        return this.deviceStates;
    }

    updateDeviceState(device, status) {
        this.deviceStates[device] = status;
    }

    resetDeviceStates() {
        this.deviceStates.light = 'OFF';
        this.deviceStates.ac = 'OFF';
        this.deviceStates.fan = 'OFF';
        this.deviceStates.bell='OFF';
    }

    checkConnection() {
        const ESP32_TIMEOUT = 10000;
        const now = Date.now();
        const sensorTimeout = this.lastSensorDataTime && (now - this.lastSensorDataTime > ESP32_TIMEOUT);
        const controlTimeout = this.lastDeviceControlTime && (now - this.lastDeviceControlTime > ESP32_TIMEOUT);
        
        if (this.esp32Online && sensorTimeout && controlTimeout) {
            this.esp32Online = false;
            this.resetDeviceStates();
            return true; // ESP32 disconnected
        }
        return false; // ESP32 still connected
    }
}

module.exports = new ESP32Monitor();