const mqtt = require('mqtt');
const databaseHandler = require('./databaseHandler');
const esp32Monitor = require('./esp32Monitor');

const MQTT_BROKER = 'mqtt://localhost';
const MQTT_OPTIONS = {
    username: 'esp32',
    password: '1234567'
};

const TOPIC_SENSOR = 'datasensor/all';
const TOPIC_STATUS_LED1 = 'esp32/led1/status';
const TOPIC_STATUS_LED2 = 'esp32/led2/status';
const TOPIC_STATUS_LED3 = 'esp32/led3/status';
const TOPIC_STATUS_LED4 ='esp32/led4/status';

class MQTTHandler {
    constructor() {
        this.client = null;
        this.io = null;
        this.previousDeviceStates = { 
            light: 'OFF',
            ac: 'OFF', 
            fan: 'OFF',
            bell: 'OFF'
        };
    }

    setIO(io) {
        this.io = io;
    }

    connect() {
        this.client = mqtt.connect(MQTT_BROKER, MQTT_OPTIONS);
        
        this.client.on('connect', () => {
            console.log('✅ Connected to MQTT Broker!');
            this.subscribeToTopics();
        });

        this.client.on('message', (topic, message) => {
            this.handleMessage(topic, message);
        });

        this.client.on('error', (error) => {
            console.error('❌ MQTT Error:', error);
        });
    }

    subscribeToTopics() {
        const topics = [TOPIC_SENSOR, TOPIC_STATUS_LED1, TOPIC_STATUS_LED2, TOPIC_STATUS_LED3,TOPIC_STATUS_LED4];
        this.client.subscribe(topics, (err) => {
            if (!err) console.log('✅ Subscribed to all topics!');
        });
    }

    async handleMessage(topic, message) {
        try {
            if (topic === TOPIC_SENSOR) {
                await this.handleSensorData(message);
            } else if (topic.includes('/status')) {
                await this.handleDeviceStatus(topic, message);
            }
        } catch (error) {
            console.error('❌ Error processing MQTT message:', error);
        }
    }

    async handleSensorData(message) {
        esp32Monitor.updateSensorTime();
        
        if (!esp32Monitor.isOnline()) {
            esp32Monitor.setOnlineStatus(true);
            console.log('✅ ESP32 reconnected (sensor data received)');
            this.emitESP32Connected();
        }

        const data = JSON.parse(message.toString());
        await this.processSensorData(data);
    }

    async processSensorData(data) {
        let { temperature, humidity, light } = data;

        temperature = temperature !== undefined && temperature !== null ? parseFloat(temperature).toFixed(1) : 0;
        humidity = humidity !== undefined && humidity !== null ? parseFloat(humidity).toFixed(1) : 0;
        light = light !== undefined && light !== null ? parseInt(light) : 0;
        if (isNaN(light) || light < 0) light = 0;

        try {
            const insertResult = await databaseHandler.saveSensorData(
                parseFloat(temperature),
                parseFloat(humidity),
                light
            );

            const sensorData = {
                id: insertResult.insertId,
                temperature: parseFloat(temperature),
                humidity: parseFloat(humidity),
                light_level: light,
                timestamp: new Date().toISOString()
            };

            this.io.emit('sensor_update', sensorData);
            console.log('✅ Sensor data saved and emitted');

        } catch (error) {
            console.error('❌ Error handling sensor data:', error);
        }
    }

    async handleDeviceStatus(topic, message) {
        esp32Monitor.updateControlTime();
        
        if (!esp32Monitor.isOnline()) {
            esp32Monitor.setOnlineStatus(true);
            console.log('✅ ESP32 reconnected (device status received)');
            this.emitESP32Connected();
        }

        await this.processDeviceStatus(topic, message);
    }

    async processDeviceStatus(topic, message) {
        try {
            const device = topic.split('/')[1];
            const status = message.toString() === '1' ? 'ON' : 'OFF';
            
            let deviceName;
            switch (device) {
                case 'led1': deviceName = 'light'; break;
                case 'led2': deviceName = 'ac'; break;
                case 'led3': deviceName = 'fan'; break;
                case 'led4': deviceName = 'bell'; break;
                default: return;
            }
            
            console.log(`🎛️ Device status received - ${deviceName}: ${status}`);

            // Kiểm tra nếu thiết bị chuyển từ OFF sang ON (chỉ đếm khi BẬT lên)
            const wasPreviouslyOff = this.previousDeviceStates[deviceName] === 'OFF';
            const isNowOn = status === 'ON';
            
            if (wasPreviouslyOff && isNowOn) {
                console.log(`🔢 ${deviceName} was turned ON - counting activation`);
                // Lượt bật đã được tự động ghi vào database thông qua saveDeviceHistory
            }

            // Cập nhật trạng thái trước đó
            this.previousDeviceStates[deviceName] = status;

            esp32Monitor.updateDeviceState(deviceName, status);
            
            await databaseHandler.saveDeviceHistory(deviceName, status);
            
            this.io.emit('device_status_confirmed', { 
                device: deviceName, 
                status: status,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ ${deviceName} status confirmed: ${status}`);

        } catch (error) {
            console.error('❌ Error handling device control:', error);
        }
    }
    

    emitESP32Connected() {
        this.io.emit('esp32_connected');
        this.io.emit('current_states', {
            devices: esp32Monitor.getDeviceStates(),
            esp32Online: true
        });
    }

    getClient() {
        return this.client;
    }

    publish(topic, message) {
        if (this.client) {
            this.client.publish(topic, message);
        }
    }
}

module.exports = new MQTTHandler();