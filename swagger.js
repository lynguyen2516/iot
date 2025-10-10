// swagger.js
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Hệ Thống IoT Cảm Biến',
      version: '1.0.0',
      description: 'Tài liệu API cho Hệ Thống Quản Lý Cảm Biến IoT',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Máy chủ phát triển',
      },
    ],
  },
  apis: ['./server.js'],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };