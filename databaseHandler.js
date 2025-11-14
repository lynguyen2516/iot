const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'may',
    password: 'new_password',
    database: 'iot_db'
};

class DatabaseHandler {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(dbConfig);
            await this.initializeDeviceStates();
        } catch (err) {
            console.error('❌ Error connecting to MySQL:', err.message);
            throw err;
        }
    }

    async initializeDeviceStates() {
        try {
            const devices = ['light', 'ac', 'fan','bell'];
            for (const device of devices) {
                await this.getDeviceStatus(device);
            }
        } catch (error) {
            console.error('Error initializing device states:', error);
        }
    }

    async getConnection() {
        if (!this.connection) {
            await this.connect();
        }
        return this.connection;
    }

    async executeQuery(query, params = []) {
        try {
            const connection = await this.getConnection();
            const [result] = await connection.execute(query, params);
            return result;
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    }

    async getDeviceStatus(device) {
        const rows = await this.executeQuery(
            'SELECT status FROM device_history WHERE device = ? ORDER BY timestamp DESC LIMIT 1',
            [device]
        );
        return rows[0] ? rows[0].status : 'OFF';
    }

    async saveSensorData(temperature, humidity, light_level) {
        return await this.executeQuery(
            'INSERT INTO sensor_data (temperature, humidity, light_level) VALUES (?, ?, ?)',
            [temperature, humidity, light_level]
        );
    }

    async saveDeviceHistory(device, status) {
        return await this.executeQuery(
            'INSERT INTO device_history (device, status) VALUES (?, ?)',
            [device, status]
        );
    }

    async getDashboardData() {
        const latestRows = await this.executeQuery(
            'SELECT ROUND(temperature, 1) as temperature, humidity, light_level FROM sensor_data ORDER BY timestamp DESC LIMIT 1'
        );
        
        const chartRows = await this.executeQuery(
            'SELECT timestamp, ROUND(temperature, 1) as temperature, humidity, light_level FROM sensor_data ORDER BY timestamp DESC LIMIT 20'
        );

        const devices = {
            light: await this.getDeviceStatus('light'),
            ac: await this.getDeviceStatus('ac'),
            fan: await this.getDeviceStatus('fan'),
            bell:await this.getDeviceStatus('bell')
        };

        return {
            latestSensor: latestRows[0] || {},
            chartData: chartRows.reverse(),
            devices
        };
    }

    processTimeSearch(searchTerm) {
        let conditions = [];
        let params = [];

        const parts = searchTerm.split(' ');
        let timePart = '';
        let datePart = '';

        if (parts.length === 1) {
            if (searchTerm.includes(':')) {
                timePart = searchTerm;
            } else if (searchTerm.includes('/')) {
                datePart = searchTerm;
            } else {
                conditions.push('CAST(timestamp AS CHAR) LIKE ?');
                params.push(`%${searchTerm}%`);
                return { conditions, params };
            }
        } else if (parts.length === 2) {
            timePart = parts[0];
            datePart = parts[1];
        }

        if (timePart && timePart.includes(':')) {
            const timeParts = timePart.split(':');
            
            if (timeParts.length === 1) {
                conditions.push('TIME(timestamp) LIKE ?');
                params.push(`${timeParts[0].padStart(2, '0')}:%:%`);
            } else if (timeParts.length === 2) {
                conditions.push('TIME(timestamp) LIKE ?');
                params.push(`${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}:%`);
            } else if (timeParts.length === 3) {
                conditions.push('TIME(timestamp) = ?');
                params.push(`${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}:${timeParts[2].padStart(2, '0')}`);
            }
        }

        if (datePart && datePart.includes('/')) {
            const dateParts = datePart.split('/');
            
            if (dateParts.length === 1 && dateParts[0].length === 4) {
                conditions.push('YEAR(timestamp) = ?');
                params.push(dateParts[0]);
            }
            else if (dateParts.length === 1 && parseInt(dateParts[0]) >= 1 && parseInt(dateParts[0]) <= 12) {
                conditions.push('MONTH(timestamp) = ?');
                params.push(dateParts[0].padStart(2, '0'));
            }
            else if (dateParts.length === 2) {
                if (dateParts[1].length === 4) {
                    conditions.push('(MONTH(timestamp) = ? AND YEAR(timestamp) = ?)');
                    params.push(dateParts[0].padStart(2, '0'), dateParts[1]);
                } else {
                    const currentYear = new Date().getFullYear();
                    const fullDate = `${currentYear}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
                    conditions.push('DATE(timestamp) = ?');
                    params.push(fullDate);
                }
            }
            else if (dateParts.length === 3) {
                const normalizedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
                conditions.push('DATE(timestamp) = ?');
                params.push(normalizedDate);
            }
        }

        if (conditions.length === 0) {
            conditions.push('CAST(timestamp AS CHAR) LIKE ?');
            params.push(`%${searchTerm}%`);
        }

        return { conditions, params };
    }

async getSensorDataPaged(page = 1, limit = 10, search = '', filterType = '', sortBy = 'timestamp', sortOrder = 'DESC') {
        if (!this.connection) throw new Error("Database not connected.");
       
        try {
            page = parseInt(page, 10) || 1;
            limit = parseInt(limit, 10) || 10;
            const offset = (page - 1) * limit;
    
            let whereConditions = [];
            let queryParams = [];
    
            let defaultSortBy = 'timestamp';
            let defaultSortOrder = 'DESC';
    
            if (filterType && filterType !== 'Tất cả') {
                if (filterType === 'Nhiệt độ') {
                    defaultSortBy = 'temperature';
                } else if (filterType === 'Ánh sáng') {
                    defaultSortBy = 'light_level';
                } else if (filterType === 'Độ ẩm') {
                    defaultSortBy = 'humidity';
                }
            }
    
            // Xác định cột sắp xếp an toàn
            const validSortColumns = ['temperature', 'light_level', 'humidity', 'timestamp'];
            const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : defaultSortBy;
            const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : defaultSortOrder;
    
            // Lọc theo loại cảm biến
            const hasSpecificFilter = filterType && filterType !== 'Tất cả';
            if (hasSpecificFilter) {
                if (filterType === 'Nhiệt độ') {
                    whereConditions.push('temperature IS NOT NULL');
                } else if (filterType === 'Ánh sáng') {
                    whereConditions.push('light_level IS NOT NULL');
                } else if (filterType === 'Độ ẩm') {
                    whereConditions.push('humidity IS NOT NULL');
                }
            }
    
            // Xử lý tìm kiếm
            if (search && search.trim() !== '') {
                const searchTerm = search.trim();
                const isTimeSearch = searchTerm.includes(':') || searchTerm.includes('/');
    
                // Nếu đang lọc theo loại cảm biến cụ thể, KHÔNG cho phép tìm kiếm theo thời gian
                if (hasSpecificFilter && isTimeSearch) {
                    // Bỏ qua tìm kiếm thời gian khi có filter cụ thể
                    // Chỉ cho phép tìm kiếm số
                    const numericSearch = parseFloat(searchTerm);
                    if (!isNaN(numericSearch)) {
                        if (filterType === 'Nhiệt độ') {
                            if (searchTerm.includes('.')) {
                                whereConditions.push('ROUND(temperature, 1) = ROUND(?, 1)');
                            } else {
                                whereConditions.push('temperature = ?');
                            }
                            queryParams.push(numericSearch);
                        } else if (filterType === 'Ánh sáng') {
                            whereConditions.push('light_level = ?');
                            queryParams.push(numericSearch);
                        } else if (filterType === 'Độ ẩm') {
                            whereConditions.push('humidity = ?');
                            queryParams.push(numericSearch);
                        }
                    }
                    // Nếu không phải số, bỏ qua tìm kiếm
                } 
                else if (!hasSpecificFilter && isTimeSearch) {
                    // Chỉ cho phép tìm kiếm thời gian khi không có filter cụ thể
                    const timeSearch = this.processTimeSearch(searchTerm);
                    whereConditions.push(...timeSearch.conditions);
                    queryParams.push(...timeSearch.params);
                }
                else if (isTimeSearch) {
                    // Trường hợp có filter cụ thể + thời gian -> bỏ qua thời gian
                    // Không thêm điều kiện nào
                }
                else {
                    // Tìm kiếm số hoặc text thông thường
                    const numericSearch = parseFloat(searchTerm);
                    
                    if (!isNaN(numericSearch)) {
                        if (hasSpecificFilter) {
                            // Nếu có filter cụ thể, chỉ tìm trên cột đó
                            if (filterType === 'Nhiệt độ') {
                                if (searchTerm.includes('.')) {
                                    whereConditions.push('ROUND(temperature, 1) = ROUND(?, 1)');
                                } else {
                                    whereConditions.push('temperature = ?');
                                }
                                queryParams.push(numericSearch);
                            } else if (filterType === 'Ánh sáng') {
                                whereConditions.push('light_level = ?');
                                queryParams.push(numericSearch);
                            } else if (filterType === 'Độ ẩm') {
                                whereConditions.push('humidity = ?');
                                queryParams.push(numericSearch);
                            }
                        } else {
                            // Nếu không có filter cụ thể, tìm trên tất cả các cột số
                            const numericConditions = [];
                            
                            if (searchTerm.includes('.')) {
                                numericConditions.push('ROUND(temperature, 1) = ROUND(?, 1)');
                            } else {
                                numericConditions.push('temperature = ?');
                            }
                            
                            numericConditions.push('light_level = ?');
                            numericConditions.push('humidity = ?');
                            
                            whereConditions.push(`(${numericConditions.join(' OR ')})`);
                            queryParams.push(numericSearch, numericSearch, numericSearch);
                        }
                    } else {
                        // Tìm kiếm text (chỉ cho phép trên timestamp khi không có filter cụ thể)
                        if (!hasSpecificFilter) {
                            whereConditions.push('CAST(timestamp AS CHAR) LIKE ?');
                            queryParams.push(`%${searchTerm}%`);
                        }
                        // Nếu có filter cụ thể và search là text, bỏ qua
                    }
                }
            }
    
            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
            let countQuery = `SELECT COUNT(*) as total FROM sensor_data ${whereClause}`;
            const [countResult] = await this.connection.execute(countQuery, queryParams);
            const totalItems = countResult[0].total;
            const totalPages = Math.ceil(totalItems / limit);
    
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
           
            const [rows] = await this.connection.execute(dataQuery, queryParams);
    
            return {
                data: rows,
                totalItems,
                totalPages,
                currentPage: page,
                sortBy: safeSortBy,
                sortOrder: safeSortOrder
            };
    
        } catch (err) {
            console.error("❌ Error fetching sensor data:", err);
            throw err;
        }
    }

async getHistoryDevicePaged(page = 1, limit = 10, sortBy = 'timestamp', sortOrder = 'DESC', search = '', deviceFilter = '', statusFilter = '') {
        if (!this.connection) throw new Error("Database not connected.");
        try {
            page = parseInt(page, 10) || 1;
            limit = parseInt(limit, 10) || 10;
            const offset = (page - 1) * limit;
    
            const validSortColumns = ['device', 'status', 'timestamp'];
            const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'timestamp';
            const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
            let whereConditions = [];
            let queryParams = [];
    
            // Lọc theo thiết bị
            const hasDeviceFilter = deviceFilter && deviceFilter !== 'Tất cả';
            if (hasDeviceFilter) {
                whereConditions.push('device = ?');
                queryParams.push(deviceFilter);
            }
    
            // Lọc theo trạng thái (ON/OFF)
            const hasStatusFilter = statusFilter && statusFilter !== '';
            if (hasStatusFilter) {
                whereConditions.push('status = ?');
                queryParams.push(statusFilter);
            }
    
            // Tìm kiếm theo thời gian
            if (search && search.trim() !== '') {
                const searchTerm = search.trim();
                const timeSearch = this.processTimeSearch(searchTerm);
                whereConditions.push(...timeSearch.conditions);
                queryParams.push(...timeSearch.params);
            }
    
            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';
    
            const countQuery = `SELECT COUNT(*) AS total FROM device_history ${whereClause}`;
           
            const [countRows] = whereConditions.length > 0
                ? await this.connection.execute(countQuery, queryParams)
                : await this.connection.execute(countQuery);
               
            const totalItems = countRows[0].total;
            const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    
            const sqlQuery = `
                SELECT id, device, status, timestamp
                FROM device_history
                ${whereClause}
                ORDER BY ${safeSortBy} ${safeSortOrder}
                LIMIT ${limit} OFFSET ${offset}
            `;
    
            const [rows] = whereConditions.length > 0
                ? await this.connection.execute(sqlQuery, queryParams)
                : await this.connection.execute(sqlQuery);
    
            return {
                data: rows,
                totalItems,
                totalPages,
                currentPage: page
            };
        } catch (err) {
            console.error("❌ Error fetching history device:", err);
            throw err;
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
        }
    }
}

module.exports = new DatabaseHandler();