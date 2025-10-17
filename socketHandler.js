const databaseHandler = require('./databaseHandler');
const esp32Monitor = require('./esp32Monitor');

class SocketHandler {
    constructor() {
        this.io = null;
        this.mqttClient = null;
    }

    setIO(io) {
        this.io = io;
        this.setupSocketEvents();
    }

    setMQTTClient(mqttClient) {
        this.mqttClient = mqttClient;
    }

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log('👤 User connected:', socket.id);

            // Gửi trạng thái hiện tại khi client kết nối
            socket.emit('current_states', {
                devices: esp32Monitor.getDeviceStates(),
                esp32Online: esp32Monitor.isOnline()
            });

            socket.on('device_control', async (data) => {
                await this.handleDeviceControl(socket, data);
            });

            socket.on('disconnect', () => {
                console.log('👤 User disconnected:', socket.id);
            });
        });
    }

    async handleDeviceControl(socket, data) {
        const { device, status } = data;
        
        console.log(`🎛️ Frontend device control: ${device} -> ${status}`);

        const validDevices = ['light', 'ac', 'fan'];
        const validStatus = ['ON', 'OFF'];
        
        if (!validDevices.includes(device) || !validStatus.includes(status)) {
            socket.emit('device_control_error', { 
                device: device, 
                error: 'Invalid command' 
            });
            return;
        }

        if (!esp32Monitor.isOnline()) {
            socket.emit('device_control_error', { 
                device: device, 
                error: 'ESP32 offline' 
            });
            return;
        }

        const mqttTopic = this.getMQTTControlTopic(device);
        const mqttStatus = (status === 'ON') ? '1' : '0';

        try {
            console.log(`📤 Sending MQTT command: ${mqttTopic} -> ${mqttStatus}`);
            this.mqttClient.publish(mqttTopic, mqttStatus);
            console.log(`✅ Command sent to ${device}: ${status}`);
            
        } catch (err) {
            console.error('❌ Error handling device control:', err);
            socket.emit('device_control_error', { 
                device: device, 
                error: 'Failed to send command' 
            });
        }
    }

    getMQTTControlTopic(device) {
        switch (device) {
            case 'light': return 'esp32/led1/control';
            case 'ac': return 'esp32/led2/control';
            case 'fan': return 'esp32/led3/control';
            default: return '';
        }
    }
}

module.exports = new SocketHandler();