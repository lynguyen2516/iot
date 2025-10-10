const express = require('express');
const http = require('http'); 
const { Server } = require("socket.io");
const mysql = require('mysql2/promise');
const mqtt = require('mqtt');
const { swaggerUi, specs } = require('./swagger');


// --- Cấu hình Server & MQTT ---
const PORT = 3000;
const MQTT_BROKER = 'mqtt://localhost';
const MQTT_OPTIONS = {
    username: 'esp32',
    password: '1234567'
};
const TOPIC_SENSOR = 'datasensor/all';
const TOPIC_CONTROL_BASE = 'esp32/led';

const dbConfig = {
    host: 'localhost',
    user: 'may',
    password: 'new_password',
    database: 'iot_db'
};

// --- Khởi tạo Server và Database ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
let dbConnection;

// --- Biến quản lý trạng thái ---
let deviceStates = {
    light: 'OFF',
    ac: 'OFF', 
    fan: 'OFF'
};
let esp32Online = false;
let lastSensorDataTime = null;
const ESP32_TIMEOUT = 2000; 

async function connectToDb() {
    try {
        dbConnection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database!');
        
        // Khởi tạo trạng thái thiết bị từ database
        await initializeDeviceStates();
    } catch (err) {
        console.error('Error connecting to MySQL:', err.message);
    }
}

// Khởi tạo trạng thái thiết bị từ database 
async function initializeDeviceStates() {
    try {
        const devices = ['light', 'ac', 'fan'];
        for (const device of devices) {
            const status = await getDeviceStatus(device);
            deviceStates[device] = status;
        }
    } catch (error) {
        console.error('Error initializing device states:', error);
    }
}

// --- Hàm kiểm tra kết nối ESP32 ---
function checkESP32Connection() {
    if (lastSensorDataTime && (Date.now() - lastSensorDataTime > ESP32_TIMEOUT)) {
        if (esp32Online) {
            esp32Online = false;
            io.emit('esp32_disconnected');
        }
    }
}

// Kiểm tra kết nối ESP32 
setInterval(checkESP32Connection, 2000);

app.use(express.static('public'));

// Hàm hỗ trợ Truy vấn DB 
async function getDeviceStatus(device) {
    if (!dbConnection) throw new Error("Database not connected.");
    const [rows] = await dbConnection.execute(
        'SELECT status FROM device_history WHERE device = ? ORDER BY timestamp DESC LIMIT 1',
        [device]
    );
    return rows[0] ? rows[0].status : 'OFF';
}

// --- Hàm đồng bộ trạng thái với ESP32 ---
function syncDeviceStatesWithESP32() {
    if (!esp32Online) return;
    
    Object.keys(deviceStates).forEach(device => {
        const mqttTopic = getMQTTControlTopic(device);
        const mqttStatus = deviceStates[device] === 'ON' ? '1' : '0';
        
        mqttClient.publish(mqttTopic, mqttStatus);
    });
}

// --- Hàm lấy MQTT topic theo thiết bị ---
function getMQTTControlTopic(device) {
    switch (device) {
        case 'light': return 'esp32/led1/control';
        case 'ac': return 'esp32/led2/control';
        case 'fan': return 'esp32/led3/control';
        default: return '';
    }
}

// --- Hàm lấy MQTT status topic theo thiết bị ---
function getMQTTStatusTopic(device) {
    switch (device) {
        case 'light': return 'esp32/led1/status';
        case 'ac': return 'esp32/led2/status';
        case 'fan': return 'esp32/led3/status';
        default: return '';
    }
}

// Hàm Lấy Dữ liệu Cảm biến có Phân trang 
async function getSensorDataPaged(page = 1, limit = 10, search = '', filterType = '', sortBy = 'timestamp', sortOrder = 'DESC') {
    if (!dbConnection) throw new Error("Database not connected.");
    
    try {
        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 10;
        const offset = (page - 1) * limit;

        const validSortColumns = ['id', 'temperature', 'light_level', 'humidity', 'timestamp'];
        const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'timestamp';
        const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

        let whereConditions = [];
        let queryParams = [];

        // --- Lọc theo loại Cảm Biến ---
        if (filterType && filterType !== 'Tất cả') {
            if (filterType === 'Nhiệt độ') {
                whereConditions.push('temperature IS NOT NULL');
            } else if (filterType === 'Ánh sáng') {
                whereConditions.push('light_level IS NOT NULL');
            } else if (filterType === 'Độ ẩm') {
                whereConditions.push('humidity IS NOT NULL');
            }
        }

        // TÌM KIẾM 
        if (search && search.trim() !== '') {
            const searchTerm = search.trim();
            let isTimeFormat = false;
            const timeSearchConditions = [];

            console.log('Searching with term:', searchTerm);

            // Định dạng thời gian: HH:MM
            if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(searchTerm)) {
                timeSearchConditions.push('TIME(timestamp) LIKE ?');
                queryParams.push(`%${searchTerm}%`);
                isTimeFormat = true;
                console.log('Found TIME format (HH:MM):', searchTerm);
            }
            // Định dạng: HH:MM:SS
            else if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(searchTerm)) {
                timeSearchConditions.push('TIME(timestamp) LIKE ?');
                queryParams.push(`%${searchTerm}%`);
                isTimeFormat = true;
                console.log('Found TIME format (HH:MM:SS):', searchTerm);
            }
            // Định dạng: YYYY-MM-DD
            else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(searchTerm)) {
                const parts = searchTerm.split('-');
                const [year, month, day] = parts;
                const mysqlDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                timeSearchConditions.push('DATE(timestamp) = ?');
                queryParams.push(mysqlDate);
                isTimeFormat = true;
                console.log('Found DATE format (YYYY-MM-DD):', searchTerm, '->', mysqlDate);
            }
            // Định dạng: D/M/YYYY hoặc DD/MM/YYYY 
            else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(searchTerm)) {
                const parts = searchTerm.split('/');
                const [day, month, year] = parts;
                const mysqlDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                timeSearchConditions.push('DATE(timestamp) = ?');
                queryParams.push(mysqlDate);
                isTimeFormat = true;
                console.log('Found DATE format (D/M/YYYY):', searchTerm, '->', mysqlDate);
            }
            // Định dạng: D/M hoặc DD/MM (chỉ ngày/tháng)
            else if (/^\d{1,2}\/\d{1,2}$/.test(searchTerm)) {
                const parts = searchTerm.split('/');
                const [day, month] = parts;
                const mysqlDay = day.padStart(2, '0');
                const mysqlMonth = month.padStart(2, '0');
                timeSearchConditions.push('(DAY(timestamp) = ? AND MONTH(timestamp) = ?)');
                queryParams.push(mysqlDay, mysqlMonth);
                isTimeFormat = true;
                console.log('Found DAY/MONTH format:', searchTerm, '->', `Day: ${mysqlDay}, Month: ${mysqlMonth}`);
            }
            // Định dạng kết hợp: HH:MM:SS D/M/YYYY
            else if (searchTerm.includes(' ') && searchTerm.includes(':') && searchTerm.includes('/')) {
                const spaceIndex = searchTerm.indexOf(' ');
                const timePart = searchTerm.substring(0, spaceIndex);
                const datePart = searchTerm.substring(spaceIndex + 1);
                
                if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(timePart) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) {
                    const dateParts = datePart.split('/');
                    const [day, month, year] = dateParts;
                    const mysqlDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    timeSearchConditions.push('(TIME(timestamp) LIKE ? AND DATE(timestamp) = ?)');
                    queryParams.push(`%${timePart}%`, mysqlDate);
                    isTimeFormat = true;
                    console.log('Found TIME+DATE format:', timePart, datePart, '->', mysqlDate);
                }
            }

            //  tìm trong timestamp nếu KHÔNG là số thập phân
            if (!isTimeFormat && isNaN(parseFloat(searchTerm))) {
                timeSearchConditions.push('CAST(timestamp AS CHAR) LIKE ?');
                queryParams.push(`%${searchTerm}%`);
                console.log('Using general timestamp search:', searchTerm);
            }

            // Thêm điều kiện thời gian nếu có ít nhất 1 điều kiện
            if (timeSearchConditions.length > 0) {
                whereConditions.push(`(${timeSearchConditions.join(' OR ')})`);
            }

            // Tìm kiếm theo số - chỉ áp dụng khi KHÔNG phải định dạng thời gian
            if (!isTimeFormat) {
                const numericSearch = parseFloat(searchTerm);
                if (!isNaN(numericSearch)) {
                    if (filterType === 'Nhiệt độ') {
                        if (searchTerm.includes('.')) {
                            whereConditions.push('ROUND(temperature, 1) = ROUND(?, 1)');
                        } else {
                            whereConditions.push('temperature = ?');
                        }
                        queryParams.push(numericSearch);
                        console.log('Search by TEMPERATURE:', numericSearch);
                    } else if (filterType === 'Ánh sáng') {
                        whereConditions.push('light_level = ?');
                        queryParams.push(numericSearch);
                        console.log('Search by LIGHT LEVEL:', numericSearch);
                    } else if (filterType === 'Độ ẩm') {
                        whereConditions.push('humidity = ?');
                        queryParams.push(numericSearch);
                        console.log('Search by HUMIDITY:', numericSearch);
                    } else if (filterType === 'Tất cả' || filterType === '') {
                        if (searchTerm.includes('.')) {
                            whereConditions.push('ROUND(temperature, 1) = ROUND(?, 1)');
                            queryParams.push(numericSearch);
                            console.log('Search by numeric (with decimal):', numericSearch);
                        } else {
                            whereConditions.push('(temperature = ? OR humidity = ? OR light_level = ? OR id = ?)');
                            queryParams.push(numericSearch, numericSearch, numericSearch, numericSearch);
                            console.log('Search by numeric (integer):', numericSearch);
                        }
                    }
                }
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        console.log('Final WHERE clause:', whereClause);
        console.log('Query parameters:', queryParams);

        // Đếm tổng số bản ghi
        let countQuery = `SELECT COUNT(*) as total FROM sensor_data ${whereClause}`;
        const [countResult] = await dbConnection.execute(countQuery, queryParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        console.log('Total items:', totalItems, 'Total pages:', totalPages);

        // Lấy dữ liệu phân trang
        let dataQuery = `
            SELECT 
                id, 
                ROUND(temperature, 1) as temperature, 
                humidity, 
                light_level, 
                timestamp 
            FROM sensor_data 
            ${whereClause}
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT ${limit} OFFSET ${offset}
        `;
        
        const [rows] = await dbConnection.execute(dataQuery, queryParams);

        console.log('Data fetched, rows:', rows.length);

        return {
            data: rows,
            totalItems,
            totalPages,
            currentPage: page
        };

    } catch (err) {
        console.error("Error fetching sensor data:", err);
        throw err;
    }
}

// Hàm lấy lịch sử thiết bị có phân trang, tìm kiếm, lọc và sắp xếp
async function getHistoryDevicePaged(page = 1, limit = 10, sortBy = 'timestamp', sortOrder = 'DESC', search = '', deviceFilter = '') {
    if (!dbConnection) throw new Error("Database not connected.");
    try {
        page = parseInt(page, 10) || 1;
        limit = parseInt(limit, 10) || 10;
        const offset = (page - 1) * limit;

        const validSortColumns = ['id', 'device', 'status', 'timestamp'];
        const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'timestamp';
        const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

        let whereConditions = [];
        let queryParams = [];

        // Tìm kiếm
        if (search && search.trim() !== '') {
            const searchTerm = search.trim();
            
            // Tìm kiếm theo trạng thái
            if (searchTerm.toLowerCase() === 'on' || searchTerm.toLowerCase() === 'off') {
                const statusValue = searchTerm.toUpperCase();
                whereConditions.push('status = ?');
                queryParams.push(statusValue);
            } 
            // Tìm kiếm theo ID
            else if (!isNaN(searchTerm) && Number.isInteger(parseInt(searchTerm))) {
                const idValue = parseInt(searchTerm);
                whereConditions.push('id = ?');
                queryParams.push(idValue);
            }
            // Tìm kiếm theo thời gian
            else {
                let timeConditionAdded = false;

                // Định dạng: HH:MM (14:30)
                if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(searchTerm)) {
                    whereConditions.push('TIME(timestamp) LIKE ?');
                    queryParams.push(`%${searchTerm}%`);
                    timeConditionAdded = true;
                }
                // Định dạng: HH:MM:SS (14:30:25)
                else if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(searchTerm)) {
                    whereConditions.push('TIME(timestamp) LIKE ?');
                    queryParams.push(`%${searchTerm}%`);
                    timeConditionAdded = true;
                }
                // Định dạng: D/M hoặc DD/MM (6/10 hoặc 06/10)
                else if (/^\d{1,2}\/\d{1,2}$/.test(searchTerm)) {
                    const parts = searchTerm.split('/');
                    const [day, month] = parts;
                    const mysqlDay = day.padStart(2, '0');
                    const mysqlMonth = month.padStart(2, '0');
                    
                    whereConditions.push('(DAY(timestamp) = ? AND MONTH(timestamp) = ?)');
                    queryParams.push(mysqlDay, mysqlMonth);
                    timeConditionAdded = true;
                }
                // Định dạng: YYYY-MM-DD (2024-01-15)
                else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(searchTerm)) {
                    const parts = searchTerm.split('-');
                    const [year, month, day] = parts;
                    const mysqlDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    whereConditions.push('DATE(timestamp) = ?');
                    queryParams.push(mysqlDate);
                    timeConditionAdded = true;
                }
                // Định dạng: D/M/YYYY hoặc DD/MM/YYYY (6/10/2024 hoặc 06/10/2024)
                else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(searchTerm)) {
                    const parts = searchTerm.split('/');
                    const [day, month, year] = parts;
                    const mysqlDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    whereConditions.push('DATE(timestamp) = ?');
                    queryParams.push(mysqlDate);
                    timeConditionAdded = true;
                }
                // Định dạng: M/YYYY hoặc MM/YYYY (10/2024)
                else if (/^\d{1,2}\/\d{4}$/.test(searchTerm)) {
                    const parts = searchTerm.split('/');
                    const [month, year] = parts;
                    const mysqlMonth = month.padStart(2, '0');
                    whereConditions.push('(YEAR(timestamp) = ? AND MONTH(timestamp) = ?)');
                    queryParams.push(year, mysqlMonth);
                    timeConditionAdded = true;
                }
                // Định dạng: YYYY-MM (2024-10)
                else if (/^\d{4}-\d{1,2}$/.test(searchTerm)) {
                    const parts = searchTerm.split('-');
                    const [year, month] = parts;
                    const mysqlMonth = month.padStart(2, '0');
                    whereConditions.push('(YEAR(timestamp) = ? AND MONTH(timestamp) = ?)');
                    queryParams.push(year, mysqlMonth);
                    timeConditionAdded = true;
                }
                // Định dạng chỉ năm: YYYY (2024)
                else if (/^\d{4}$/.test(searchTerm)) {
                    whereConditions.push('YEAR(timestamp) = ?');
                    queryParams.push(searchTerm);
                    timeConditionAdded = true;
                }
                
                // Nếu không khớp với bất kỳ định dạng thời gian nào, tìm kiếm chung
                if (!timeConditionAdded) {
                    whereConditions.push('(CAST(timestamp AS CHAR) LIKE ? OR CAST(id AS CHAR) LIKE ? OR device LIKE ? OR status LIKE ?)');
                    queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
                }
            }
        }

        // Lọc theo thiết bị cụ thể
        if (deviceFilter && deviceFilter !== 'Tất cả') {
            whereConditions.push('device = ?');
            queryParams.push(deviceFilter);
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}` 
            : '';

        // Đếm tổng số bản ghi
        const countQuery = `SELECT COUNT(*) AS total FROM device_history ${whereClause}`;
        
        const [countRows] = whereConditions.length > 0
            ? await dbConnection.execute(countQuery, queryParams)
            : await dbConnection.execute(countQuery);
            
        const totalItems = countRows[0].total;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        // Query lấy dữ liệu với phân trang
        const sqlQuery = `
            SELECT id, device, status, timestamp
            FROM device_history
            ${whereClause}
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [rows] = whereConditions.length > 0
            ? await dbConnection.execute(sqlQuery, queryParams)
            : await dbConnection.execute(sqlQuery);

        return {
            data: rows,
            totalItems,
            totalPages,
            currentPage: page
        };
    } catch (err) {
        console.error("Error fetching history device:", err);
        throw err;
    }
}

// --- API ENDPOINTS ---
// Swagger documentation route 
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customSiteTitle: "IoT Sensor API Documentation"
}));

app.get('/docs', (req, res) => {
    res.redirect('/api-docs');
});

app.get('/api', (req, res) => {
    res.redirect('/api-docs');
});
// API 1: Dashboard 
/**
 * @swagger
 * /api/dashboard_data:
 *   get:
 *     summary: Lấy dữ liệu tổng quan cho Dashboard
 *     description: Lấy dữ liệu cảm biến mới nhất, trạng thái thiết bị và dữ liệu biểu đồ
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 latestSensor:
 *                   type: object
 *                   description: Dữ liệu cảm biến mới nhất
 *                   properties:
 *                     temperature:
 *                       type: number
 *                       example: 28.7
 *                     humidity:
 *                       type: number
 *                       example: 77
 *                     light_level:
 *                       type: integer
 *                       example: 145
 *                 chartData:
 *                   type: array
 *                   description: 20 điểm dữ liệu gần nhất
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         example: "2025-10-09T00:27:00.000Z"
 *                       temperature:
 *                         type: number
 *                         example: 28.7
 *                       humidity:
 *                         type: number
 *                         example: 77
 *                       light_level:
 *                         type: integer
 *                         example: 145
 *                 devices:
 *                   type: object
 *                   description: Trạng thái thiết bị
 *                   properties:
 *                     light:
 *                       type: string
 *                       example: "OFF"
 *                     ac:
 *                       type: string
 *                       example: "OFF"
 *                     fan:
 *                       type: string
 *                       example: "OFF"
 *                 esp32Online:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Lỗi server
 *       503:
 *         description: Database không kết nối
 */
app.get('/api/dashboard_data', async (req, res) => {
    try {
        if (!dbConnection) return res.status(503).json({ message: "Database not connected." });
        
        const [latestRows] = await dbConnection.execute(
            'SELECT ROUND(temperature, 1) as temperature, humidity, light_level FROM sensor_data ORDER BY timestamp DESC LIMIT 1'
        );
        const latestSensor = latestRows[0] || {};

        const [chartRows] = await dbConnection.execute(
            'SELECT timestamp, ROUND(temperature, 1) as temperature,humidity, light_level FROM sensor_data ORDER BY timestamp DESC LIMIT 20'
        );
        const chartData = chartRows.reverse();

        const devices = {
            light: await getDeviceStatus('light'),
            ac: await getDeviceStatus('ac'),
            fan: await getDeviceStatus('fan')
        };

        res.json({
            latestSensor,
            chartData,
            devices,
            esp32Online: esp32Online && (Date.now() - lastSensorDataTime < ESP32_TIMEOUT)
        });

    } catch (err) {
        res.status(500).json({ message: "Internal server error" });
    }
});

// API 2: Bảng dữ liệu cảm biến trang data 
/**
 * @swagger
 * /api/sensor_data:
 *   get:
 *     summary: Lấy dữ liệu cảm biến có phân trang 
 *     description: API để hiện thị lịch sử dữ liệu cảm biến
 *     tags: [Sensor Data]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang (bắt đầu từ 1)
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Số bản ghi mỗi trang (tối đa 100)
 *         example: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo giá trị cảm biến hoặc thời gian
 *         example: "28.7"
 *       - in: query
 *         name: filterType
 *         schema:
 *           type: string
 *           enum: ['Tất cả', 'Nhiệt độ', 'Ánh sáng', 'Độ ẩm']
 *           default: 'Tất cả'
 *         description: Lọc theo loại cảm biến
 *         example: "Tất cả"
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: ['temperature', 'humidity', 'light_level', 'timestamp']
 *           default: 'timestamp'
 *         description: Trường sắp xếp
 *         example: "timestamp"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: ['ASC', 'DESC']
 *           default: 'DESC'
 *         description: Thứ tự sắp xếp
 *         example: "DESC"
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: Danh sách dữ liệu cảm biến cho bảng
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 476
 *                       temperature:
 *                         type: number
 *                         format: float
 *                         example: 28.7
 *                       humidity:
 *                         type: number
 *                         format: integer
 *                         example: 77
 *                       light_level:
 *                         type: integer
 *                         example: 145
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-10-09T00:27:00.000Z"
 *                 totalItems:
 *                   type: integer
 *                   description: Tổng số bản ghi
 *                   example: 476
 *                 totalPages:
 *                   type: integer
 *                   description: Tổng số trang
 *                   example: 48
 *                 currentPage:
 *                   type: integer
 *                   description: Trang hiện tại
 *                   example: 1
 *         examples:
 *           withData:
 *             summary: Dữ liệu thực tế từ hệ thống
 *             value:
 *               data:
 *                 - id: 476
 *                   temperature: 28.7
 *                   humidity: 77
 *                   light_level: 145
 *                   timestamp: "2025-10-09T00:27:00.000Z"
 *                 - id: 475
 *                   temperature: 28.7
 *                   humidity: 77
 *                   light_level: 142
 *                   timestamp: "2025-10-09T00:26:58.000Z"
 *               totalItems: 476
 *               totalPages: 48
 *               currentPage: 1
 *       400:
 *         description: Tham số không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tham số page phải là số nguyên dương"
 *       500:
 *         description: Lỗi server nội bộ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
app.get('/api/sensor_data', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 10;
        const search = req.query.search || '';
        const filterType = req.query.filterType || '';
        const sortBy = req.query.sortBy || 'timestamp';
        const sortOrder = req.query.sortOrder || 'DESC';

        const pagedData = await getSensorDataPaged(page, limit, search, filterType, sortBy, sortOrder);


        res.json({
            ...pagedData,
           
        });

    } catch (err) {
        console.error("Error in /api/sensor_data:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// API 3 lịch sử thiết bị 

/**
 * @swagger
 * /api/device_history:
 *   get:
 *     summary: Lấy lịch sử thiết bị có phân trang 
 *     description: API dùng cho trang lịch sử thiết bị
 *     tags: [Device History]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang (bắt đầu từ 1)
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Số bản ghi mỗi trang (tối đa 100)
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: ['id', 'device', 'status', 'timestamp']
 *           default: 'timestamp'
 *         description: Trường sắp xếp
 *         example: "timestamp"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: ['ASC', 'DESC']
 *           default: 'DESC'
 *         description: Thứ tự sắp xếp
 *         example: "DESC"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo trạng thái (ON/OFF), ID thiết bị, hoặc thời gian
 *         example: "OFF"
 *       - in: query
 *         name: deviceFilter
 *         schema:
 *           type: string
 *           enum: ['Tất cả', 'light', 'ac', 'fan']
 *           default: 'Tất cả'
 *         description: Lọc theo loại thiết bị
 *         example: "fan"
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   description: Danh sách lịch sử thay đổi trạng thái thiết bị
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: ID bản ghi
 *                         example: 359
 *                       device:
 *                         type: string
 *                         enum: ['light', 'ac', 'fan']
 *                         description: Loại thiết bị
 *                         example: "fan"
 *                       status:
 *                         type: string
 *                         enum: ['ON', 'OFF']
 *                         description: Trạng thái thiết bị
 *                         example: "OFF"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: Thời gian thay đổi trạng thái
 *                         example: "2025-10-09T00:27:01.000Z"
 *                 totalItems:
 *                   type: integer
 *                   description: Tổng số bản ghi
 *                   example: 359
 *                 totalPages:
 *                   type: integer
 *                   description: Tổng số trang
 *                   example: 36
 *                 currentPage:
 *                   type: integer
 *                   description: Trang hiện tại
 *                   example: 1
 *         examples:
 *           withData:
 *             summary: Dữ liệu thực tế từ hệ thống
 *             value:
 *               data:
 *                 - id: 359
 *                   device: "fan"
 *                   status: "OFF"
 *                   timestamp: "2025-10-09T00:27:01.000Z"
 *                 - id: 357
 *                   device: "ac"
 *                   status: "OFF"
 *                   timestamp: "2025-10-09T00:26:59.000Z"
 *                 - id: 356
 *                   device: "light"
 *                   status: "OFF"
 *                   timestamp: "2025-10-09T00:26:59.000Z"
 *               totalItems: 359
 *               totalPages: 36
 *               currentPage: 1
 *       400:
 *         description: Tham số không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tham số page phải là số nguyên dương"
 *       500:
 *         description: Lỗi server nội bộ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
app.get('/api/device_history', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            sortBy = 'timestamp', 
            sortOrder = 'DESC',
            search = '',
            deviceFilter = ''
        } = req.query;

        const result = await getHistoryDevicePaged(
            parseInt(page), 
            parseInt(limit), 
            sortBy, 
            sortOrder, 
            search, 
            deviceFilter
        );
        
        res.json({
            data: result.data,
            totalItems: result.totalItems,
            totalPages: result.totalPages,
            currentPage: result.currentPage
        });
    } catch (error) {
        console.error('Error in /api/device_history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- MQTT Client Setup & Socket.IO ---
const mqttClient = mqtt.connect(MQTT_BROKER, MQTT_OPTIONS);

mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT Broker!');
    mqttClient.subscribe([TOPIC_SENSOR, 'esp32/led1/status', 'esp32/led2/status', 'esp32/led3/status'], (err) => {
        if (!err) {
            console.log('✅ Subscribed to all topics!');
        }
    });
});

mqttClient.on('error', (error) => {
    console.error('❌ MQTT Connection Error:', error);
});

mqttClient.on('message', async (topic, message) => {
    try {
        if (topic === TOPIC_SENSOR) {
            lastSensorDataTime = Date.now();
            
            if (!esp32Online) {
                esp32Online = true;
                console.log('✅ ESP32 reconnected');
                io.emit('esp32_connected');
                
                // TỰ ĐỘNG đồng bộ trạng thái khi ESP32 kết nối lại
                setTimeout(() => {
                    syncDeviceStatesWithESP32();
                }, 500);
            }

            const data = JSON.parse(message.toString());
            let { temperature, humidity, light, led1, led2, led3 } = data;

            temperature = temperature ? parseFloat(temperature).toFixed(1) : null;
            humidity = humidity ? parseFloat(humidity).toFixed(1) : null;

            if (!dbConnection) return;

            const [insertResult] = await dbConnection.execute(
                'INSERT INTO sensor_data (temperature, humidity, light_level) VALUES (?, ?, ?)',
                [temperature, humidity, light]
            );

            const sensorData = {
                id: insertResult.insertId,
                temperature: temperature ? parseFloat(temperature) : null,
                humidity: humidity ? parseFloat(humidity) : null,
                light_level: light,
                timestamp: new Date().toISOString()
            };

            io.emit('sensor_update', sensorData);

        } else if (topic.includes('/status')) {
            // Xử lý phản hồi trạng thái từ ESP32
            const device = topic.split('/')[1]; // led1, led2, led3
            const status = message.toString() === '1' ? 'ON' : 'OFF';
            
            // Chuyển đổi từ led1 -> light, led2 -> ac, led3 -> fan
            let deviceName;
            switch (device) {
                case 'led1': deviceName = 'light'; break;
                case 'led2': deviceName = 'ac'; break;
                case 'led3': deviceName = 'fan'; break;
                default: return;
            }
            
            // Cập nhật trạng thái trong backend
            deviceStates[deviceName] = status;
            
            // Cập nhật database
            await dbConnection.execute(
                'INSERT INTO device_history (device, status) VALUES (?, ?)',
                [deviceName, status]
            );
            
            // Gửi phản hồi về frontend
            io.emit('device_status_confirmed', { 
                device: deviceName, 
                status: status,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ ${deviceName} status confirmed: ${status}`);
        }
    } catch (error) {
        console.error('Error processing MQTT message:', error);
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Gửi trạng thái hiện tại khi client kết nối
    socket.emit('current_states', {
        devices: deviceStates,
        esp32Online: esp32Online && (Date.now() - lastSensorDataTime < ESP32_TIMEOUT)
    });

    socket.on('device_control', async (data) => {
        const { device, status } = data;
        
        // VALIDATION ở backend
        const validDevices = ['light', 'ac', 'fan'];
        const validStatus = ['ON', 'OFF'];
        
        if (!validDevices.includes(device) || !validStatus.includes(status)) {
            console.log('❌ Invalid device control command:', data);
            socket.emit('device_control_error', { 
                device: device, 
                error: 'Invalid command' 
            });
            return;
        }

        if (!esp32Online) {
            console.log('❌ ESP32 offline, cannot control device');
            socket.emit('device_control_error', { 
                device: device, 
                error: 'ESP32 offline' 
            });
            return;
        }

        const mqttTopic = getMQTTControlTopic(device);
        const mqttStatus = (status === 'ON') ? '1' : '0';

        try {
            // Cập nhật trạng thái trong backend trước khi gửi
            deviceStates[device] = status;
            
            // Gửi lệnh MQTT
            mqttClient.publish(mqttTopic, mqttStatus);
            
            console.log(`Command sent to ${device}: ${status}`);
            
        } catch (err) {
            console.error('Error handling device control:', err);
            socket.emit('device_control_error', { 
                device: device, 
                error: 'Failed to send command' 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- Xử lý lỗi toàn cục ---
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Start Server ---
connectToDb().then(() => {
    server.listen(PORT, () => {
        console.log(`Access dashboard at http://localhost:${PORT}/main.html`);
        console.log(`API docs at http://localhost:${PORT}/api-docs`);
    });
});