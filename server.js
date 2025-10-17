const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const swaggerUi = require('swagger-ui-express'); // ← THÊM DÒNG NÀY

const databaseHandler = require('./databaseHandler');
const mqttHandler = require('./mqttHandler');
const socketHandler = require('./socketHandler');
const apiHandler = require('./apiHandler');
const esp32Monitor = require('./esp32Monitor');
const specs = require('./swagger'); // ← CHỈ import specs thôi

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static('public'));

app.use('/api', apiHandler);

// Swagger documentation - ĐÃ SỬA
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customSiteTitle: "IoT Sensor API Documentation"
}));

app.get('/docs', (req, res) => res.redirect('/api-docs'));
app.get('/api', (req, res) => res.redirect('/api-docs'));

// Khởi động server
async function startServer() {
    try {
        // 1. Kết nối database 
        await databaseHandler.connect();
        
        // 2. Set IO cho các handler
        mqttHandler.setIO(io);
        socketHandler.setIO(io);
        
        // 3. Kết nối MQTT và CHỜ kết nối thành công
        mqttHandler.connect();
        
        // 4. Lấy MQTT client SAU KHI đã kết nối 
        setTimeout(() => {
            const mqttClient = mqttHandler.getClient();
            socketHandler.setMQTTClient(mqttClient);
            console.log('✅ MQTT Client set for SocketHandler:', mqttClient ? 'Available' : 'NULL');
        }, 1000);
        
        server.listen(PORT, () => {
            console.log(`📊 Dashboard: http://localhost:${PORT}/main.html`);
            console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
        });

        setInterval(() => {
            if (esp32Monitor.checkConnection()) {
                console.log('🔌 ESP32 disconnected (timeout)');
                io.emit('esp32_disconnected');
            }
        }, 3000);

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();