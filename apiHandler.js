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

  module.exports = router;