// swagger.js

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'My Home Web API',
      description: 'API quản lý thiết bị và dữ liệu cảm biến nhà thông minh',
      version: '1.0.0',
      contact: {
        name: 'My Home Web Team',
        email: 'support@myhomeweb.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    paths: {
      '/api/dashboard_data': {
        get: {
          summary: 'Lấy dữ liệu dashboard tổng quan',
          description: 'Trả về dữ liệu tổng quan cho dashboard bao gồm trạng thái thiết bị, trạng thái ESP32 và dữ liệu biểu đồ',
          tags: ['Dashboard'],
          responses: {
            '200': {
              description: 'Thành công',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      devices: {
                        type: 'object',
                        description: 'Trạng thái các thiết bị',
                        properties: {
                          den: {
                            type: 'string',
                            example: 'ON'
                          },
                          quat: {
                            type: 'string',
                            example: 'OFF'
                          },
                          dieu_hoa: {
                            type: 'string',
                            example: 'OFF'
                          }
                        }
                      },
                      sensor_data: {
                        type: 'object',
                        description: 'Dữ liệu cảm biến mới nhất',
                        properties: {
                          nhiet_do: {
                            type: 'number',
                            format: 'float',
                            example: 24.4
                          },
                          anh_sang: {
                            type: 'integer',
                            example: 1677
                          },
                          do_am: {
                            type: 'integer',
                            example: 52
                          }
                        }
                      },
                      esp32Online: {
                        type: 'boolean',
                        description: 'Trạng thái kết nối ESP32',
                        example: true
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Lỗi server',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/sensor_data': {
        get: {
          summary: 'Lấy dữ liệu cảm biến phân trang',
          description: 'Trả về dữ liệu cảm biến nhiệt độ, ánh sáng, độ ẩm với phân trang và lọc',
          tags: ['Sensor Data'],
          parameters: [
            {
              name: 'page',
              in: 'query',
              description: 'Trang hiện tại',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                default: 1
              }
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Số lượng bản ghi mỗi trang',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 10
              }
            },
            {
              name: 'search',
              in: 'query',
              description: 'Tìm kiếm theo từ khóa',
              required: false,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'filterType',
              in: 'query',
              description: 'Lọc theo loại dữ liệu',
              required: false,
              schema: {
                type: 'string',
                enum: ['temperature', 'light_level', 'humidity']
              }
            },
            {
              name: 'sortBy',
              in: 'query',
              description: 'Sắp xếp theo trường',
              required: false,
              schema: {
                type: 'string',
                enum: ['timestamp', 'temperature', 'light_level', 'humidity'],
                default: 'timestamp'
              }
            },
            {
              name: 'sortOrder',
              in: 'query',
              description: 'Thứ tự sắp xếp',
              required: false,
              schema: {
                type: 'string',
                enum: ['ASC', 'DESC'],
                default: 'DESC'
              }
            }
          ],
          responses: {
            '200': {
              description: 'Thành công',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: true
                      },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'integer',
                              description: 'ID bản ghi',
                              example: 1337
                            },
                            temperature: {
                              type: 'number',
                              format: 'float',
                              description: 'Nhiệt độ (°C)',
                              example: 24.4
                            },
                            light_level: {
                              type: 'integer',
                              description: 'Ánh sáng (Lux)',
                              example: 1677
                            },
                            humidity: {
                              type: 'integer',
                              description: 'Độ ẩm (%)',
                              example: 52
                            },
                            timestamp: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Thời gian ghi nhận',
                              example: '2025-10-17T08:01:00.000Z'
                            }
                          }
                        }
                      },
                      totalItems: {
                        type: 'integer',
                        example: 1337
                      },
                      totalPages: {
                        type: 'integer',
                        example: 134
                      },
                      currentPage: {
                        type: 'integer',
                        example: 1
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Lỗi server',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/device_history': {
        get: {
          summary: 'Lấy lịch sử thiết bị phân trang',
          description: 'Trả về lịch sử bật/tắt các thiết bị với phân trang và lọc',
          tags: ['Device History'],
          parameters: [
            {
              name: 'page',
              in: 'query',
              description: 'Trang hiện tại',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                default: 1
              }
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Số lượng bản ghi mỗi trang',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 10
              }
            },
            {
              name: 'sortBy',
              in: 'query',
              description: 'Sắp xếp theo trường',
              required: false,
              schema: {
                type: 'string',
                enum: ['timestamp', 'id', 'device', 'status'],
                default: 'timestamp'
              }
            },
            {
              name: 'sortOrder',
              in: 'query',
              description: 'Thứ tự sắp xếp',
              required: false,
              schema: {
                type: 'string',
                enum: ['ASC', 'DESC'],
                default: 'DESC'
              }
            },
            {
              name: 'search',
              in: 'query',
              description: 'Tìm kiếm theo từ khóa',
              required: false,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'deviceFilter',
              in: 'query',
              description: 'Lọc theo thiết bị',
              required: false,
              schema: {
                type: 'string',
                enum: ['light', 'fan', 'ac'] 
              }
            },
            {
              name: 'statusFilter',
              in: 'query',
              description: 'Lọc theo trạng thái',
              required: false,
              schema: {
                type: 'string',
                enum: ['ON', 'OFF', '']
              }
            }
          ],
          responses: {
            '200': {
              description: 'Thành công',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: true
                      },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'integer',
                              description: 'ID lịch sử',
                              example: 7
                            },
                            device: {
                              type: 'string',
                              description: 'Tên thiết bị',
                              example: 'Đèn'
                            },
                            status: {
                              type: 'string',
                              description: 'Trạng thái thiết bị',
                              enum: ['ON', 'OFF'],
                              example: 'ON'
                            },
                            timestamp: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Thời gian thay đổi trạng thái',
                              example: '2025-10-04T21:38:02.000Z'
                            }
                          }
                        }
                      },
                      totalItems: {
                        type: 'integer',
                        example: 7
                      },
                      totalPages: {
                        type: 'integer',
                        example: 1
                      },
                      currentPage: {
                        type: 'integer',
                        example: 1
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Lỗi server',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: false
                      },
                      error: {
                        type: 'string',
                        example: 'Internal server error'
                      },
                      message: {
                        type: 'string',
                        example: 'Error message details'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./apiHandler.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;