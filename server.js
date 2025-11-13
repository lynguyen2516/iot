const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const databaseHandler = require('./databaseHandler');
const mqttHandler = require('./mqttHandler');
const socketHandler = require('./socketHandler');
const apiHandler = require('./apiHandler');
const esp32Monitor = require('./esp32Monitor');
const specs = require('./swagger');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiHandler);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customSiteTitle: "IoT Sensor API Documentation"
}));

// Redirect routes
app.get('/docs', (req, res) => res.redirect('/api-docs'));
app.get('/api', (req, res) => res.redirect('/api-docs'));


// Route mặc định
app.get('/', (req, res) => {
    res.redirect('/main.html');
});

// Khởi động server
async function startServer() {
    try {
        console.log('🚀 Starting IoT Server...');
        
        // 1. Kết nối database 
        console.log('📊 Connecting to database...');
        await databaseHandler.connect();
        console.log('✅ Database connected successfully');
        
        // 2. Set IO cho các handler
        mqttHandler.setIO(io);
        socketHandler.setIO(io);
        console.log('✅ Socket.IO handlers initialized');
        
        // 3. Kết nối MQTT
        console.log('📡 Connecting to MQTT broker...');
        mqttHandler.connect();
        
        // 4. Lấy MQTT client sau khi đã kết nối 
        setTimeout(() => {
            const mqttClient = mqttHandler.getClient();
            socketHandler.setMQTTClient(mqttClient);
            console.log('✅ MQTT Client set for SocketHandler:', mqttClient ? 'Available' : 'NULL');
        }, 2000);
        
        // Khởi động server
        server.listen(PORT, () => {
            console.log('\n✨ ===== IOT SERVER STARTED SUCCESSFULLY ===== ✨');
            console.log(`📊 Dashboard: http://localhost:${PORT}/main.html`);
            console.log(`📈 Thống kê: http://localhost:${PORT}/thongke.html`);
            console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
            console.log(`🔌 Server running on port: ${PORT}`);
            console.log('=============================================\n');
        });

        // Kiểm tra kết nối ESP32 định kỳ
        setInterval(() => {
            if (esp32Monitor.checkConnection()) {
                console.log('🔌 ESP32 disconnected (timeout)');
                io.emit('esp32_disconnected');
            }
        }, 5000); // Tăng thời gian timeout lên 5 giây

        // Xử lý shutdown gracefully
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down server gracefully...');
            await databaseHandler.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();