DROP TABLE sensor_data;
DROP TABLE device_history;

CREATE DATABASE iot_db;

USE iot_db;

CREATE TABLE sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    temperature INT,         
    humidity FLOAT,          
    light_level INT,        
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE device_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device VARCHAR(50) NOT NULL,     
    status ENUM('ON','OFF') NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. cấp quyền cho máy sử dụng db
CREATE USER 'may'@'localhost' IDENTIFIED BY 'new_password';
GRANT ALL PRIVILEGES ON iot_db.* TO 'may'@'localhost';
FLUSH PRIVILEGES;
SELECT * FROM sensor_data;

ALTER TABLE sensor_data MODIFY COLUMN temperature FLOAT;