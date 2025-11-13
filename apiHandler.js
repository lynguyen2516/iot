const express = require('express');
const databaseHandler = require('./databaseHandler');
const esp32Monitor = require('./esp32Monitor');

const router = express.Router();

// Dashboard route 
router.get('/dashboard_data', async (req, res) => {
    try {
        const dashboardData = await databaseHandler.getDashboardData();
        res.json({
            ...dashboardData,
            esp32Online: esp32Monitor.isOnline(),
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/sensor_data', async (req, res) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 10;
      const search = req.query.search || '';
      const filterType = req.query.filterType || '';
      const sortBy = req.query.sortBy || 'timestamp';
      const sortOrder = req.query.sortOrder || 'DESC';
  
      const pagedData = await databaseHandler.getSensorDataPaged(
        page,
        limit,
        search,
        filterType,
        sortBy,
        sortOrder
      );

      res.json(pagedData);
      
    } catch (err) {
      console.error('Error in /api/sensor_data:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  router.get('/device_history', async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'timestamp',
        sortOrder = 'DESC',
        search = '',
        deviceFilter = '',
        statusFilter = '',
      } = req.query;
  
      const validatedPage = Math.max(1, parseInt(page));
      const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 100);
  
      const result = await databaseHandler.getHistoryDevicePaged(
        validatedPage,
        validatedLimit,
        sortBy,
        sortOrder,
        search,
        deviceFilter,
        statusFilter
      );
  

      res.json({
        success: true,
        data: result.data,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: result.currentPage,
      });
      
    } catch (error) {
      console.error('Error in /api/device_history:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  });
// Thêm các routes sau vào file apiHandler.js
// Route thống kê cảm biến vượt ngưỡng
router.get('/sensor_stats', async (req, res) => {
  try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
          return res.status(400).json({
              success: false,
              error: 'Missing startDate or endDate parameters'
          });
      }

      const result = await databaseHandler.getSensorStatistics(startDate, endDate);
      
      // SỬA: Đảm bảo response có structure đúng
      res.json({
          success: true,
          data: result,
          period: { startDate, endDate }
      });
      
  } catch (error) {
      console.error('Error in /api/sensor_stats:', error);
      res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error.message
      });
  }
});
// ---------- SENSOR STATS ----------
router.get('/sensor_stats', async (req, res) => {
  try {
      const { date, startDate, endDate } = req.query;

      // Ưu tiên: nếu chỉ có `date` → start = end = date
      const start = date || startDate;
      const end   = date || endDate || start;   // fallback

      if (!start || !end) {
          return res.status(400).json({
              success: false,
              error: 'Thiếu tham số ngày (date hoặc startDate/endDate)'
          });
      }

      const result = await databaseHandler.getSensorStatistics(start, end);
      res.json({ success: true, data: result, period: { startDate: start, endDate: end } });
  } catch (e) {
      console.error('Error /api/sensor_stats:', e);
      res.status(500).json({ success: false, error: 'Internal server error', message: e.message });
  }
});

// ---------- DEVICE STATS ----------
router.get('/device_stats', async (req, res) => {
  try {
      const { date, startDate, endDate } = req.query;

      const start = date || startDate;
      const end   = date || endDate || start;

      if (!start || !end) {
          return res.status(400).json({
              success: false,
              error: 'Thiếu tham số ngày (date hoặc startDate/endDate)'
          });
      }

      const result = await databaseHandler.getDeviceStatistics(start, end);
      res.json({ success: true, data: result, period: { startDate: start, endDate: end } });
  } catch (e) {
      console.error('Error /api/device_stats:', e);
      res.status(500).json({ success: false, error: 'Internal server error', message: e.message });
  }
});
  module.exports = router;