document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Tham chiếu DOM Elements ---
    const tempValueEl = document.getElementById('temperatureValue');
    const humiValueEl = document.getElementById('humidityValue');
    const lightValueEl = document.getElementById('lightValue');

    const lightSwitch = document.getElementById('lightSwitch');
    const acSwitch = document.getElementById('acSwitch');
    const fanSwitch = document.getElementById('fanSwitch');

    const loadingOverlay = document.getElementById('loadingOverlay');

    let mainCombinedChart;
    let pendingConfirmations = new Set();
    let esp32Online = false;
    let lastKnownStates = {
        light: 'OFF',
        ac: 'OFF', 
        fan: 'OFF'
    };

    // --- Cập nhật UI ---
    function updateMetricCards(data) {
        const { temperature, humidity, light_level } = data;
        
        if (tempValueEl && temperature !== undefined) {
            tempValueEl.innerHTML = `${temperature !== null ? parseFloat(temperature).toFixed(1) : '--'} °C`;
        }
        if (humiValueEl && humidity !== undefined) {
            humiValueEl.innerHTML = `${humidity !== null ? parseFloat(humidity).toFixed(0) : '--'} %`;
        }
        if (lightValueEl && light_level !== undefined) {
            lightValueEl.innerHTML = `${light_level} <span class="unit">Lux</span>`;
        }
    }

    function updateDeviceUI(device, status) {
        const targetSwitch = document.getElementById(`${device}Switch`);
        const controlPanel = document.getElementById(`${device}Control`);

        if (targetSwitch) {
            targetSwitch.checked = (status === 'ON');
            targetSwitch.disabled = !esp32Online; // Chỉ disable khi ESP32 offline
            pendingConfirmations.delete(device);
        }
        if (controlPanel) {
            controlPanel.classList.toggle('is-on', status === 'ON');
        }
        
        // Lưu trạng thái cuối cùng
        lastKnownStates[device] = status;
    }

    // --- Loading Overlay ---
    function showLoading() {
        if (loadingOverlay) loadingOverlay.classList.add('visible');
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.classList.remove('visible');
    }

    // --- Cập nhật trạng thái ESP32 ---
    function updateESP32Status(online) {
        esp32Online = online;
        
        // Cập nhật khả năng điều khiển của các nút
        [lightSwitch, acSwitch, fanSwitch].forEach(switchEl => {
            if (switchEl) {
                switchEl.disabled = !online;
            }
        });
    }

    // --- Fetch dữ liệu ban đầu ---
    async function fetchInitialData() {
        showLoading();
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Network response was not ok.');

            const data = await response.json(); 

            if (data.latestSensor && Object.keys(data.latestSensor).length > 0) {
                updateMetricCards(data.latestSensor);
            }

            if (data.devices) {
                // Cập nhật UI và lưu trạng thái ban đầu
                updateDeviceUI('light', data.devices.light);
                updateDeviceUI('ac', data.devices.ac);
                updateDeviceUI('fan', data.devices.fan);
                
                // Lưu trạng thái ban đầu
                lastKnownStates.light = data.devices.light;
                lastKnownStates.ac = data.devices.ac;
                lastKnownStates.fan = data.devices.fan;
            }

            // Cập nhật trạng thái ESP32
            if (data.esp32Online !== undefined) {
                updateESP32Status(data.esp32Online);
            }

            if (data.chartData && data.chartData.length > 0) {
                initializeCharts(data.chartData); 
            }
        } catch (error) {
            console.error('Failed to fetch initial data from API:', error);
        } finally {
            hideLoading();
        }
    }

    fetchInitialData();

    // --- Khởi tạo biểu đồ ---
    function initializeCharts(initialData) {
        if (initialData.length === 0) return;
    
        const MAX_DATA_POINTS = 20;
        const dataForChart = initialData.slice(-MAX_DATA_POINTS); 
    
        const labels = dataForChart.map(d =>
            new Date(d.timestamp).toLocaleTimeString('vi-VN', {
                hour: '2-digit', minute: '2-digit'
            })
        );
        // Trích xuất các giá trị
        const tempValues = dataForChart.map(d => d.temperature);
        const humiValues = dataForChart.map(d => d.humidity);
        const lightValues = dataForChart.map(d => d.light_level);
    
        const ctx = document.getElementById('mainCombinedChart').getContext('2d');
    
        mainCombinedChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Nhiệt độ (°C)',
                        data: tempValues,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        yAxisID: 'yCommon', 
                        tension: 0.2,
                        pointRadius: 3
                    },
                    {
                        label: 'Độ ẩm (%)',
                        data: humiValues,
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        yAxisID: 'yCommon', 
                        tension: 0.2,
                        pointRadius: 3
                    },
                    {
                        label: 'Ánh sáng (Lux)',
                        data: lightValues,
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.5)',
                        yAxisID: 'yCommon',
                        tension: 0.2,
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Thời gian'
                        }
                    },
                    yCommon: { 
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Giá trị cảm biến' 
                        },
                        grid: {
                            drawOnChartArea: true
                        },
                    },
                }
            }
        });
    }

    // --- Cập nhật biểu đồ theo thời gian thực ---
    function updateCharts(newData) {
        if (!mainCombinedChart) return;

        const MAX_DATA_POINTS = 20;
        const now = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit'
        });

        // Thêm điểm dữ liệu mới
        mainCombinedChart.data.labels.push(now);
        mainCombinedChart.data.datasets[0].data.push(newData.temperature);
        mainCombinedChart.data.datasets[1].data.push(newData.humidity);
        mainCombinedChart.data.datasets[2].data.push(newData.light_level);

        // Xóa điểm dữ liệu cũ nhất nếu vượt quá giới hạn
        if (mainCombinedChart.data.labels.length > MAX_DATA_POINTS) {
            mainCombinedChart.data.labels.shift();
            mainCombinedChart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        mainCombinedChart.update('none');
    }
    

    // --- Lắng nghe sự kiện Socket.IO ---
    socket.on('sensor_update', (data) => {
        // Cập nhật Card và Biểu đồ khi có dữ liệu cảm biến mới
        updateMetricCards(data);
        updateCharts(data);
    });

    socket.on('device_status_confirmed', (data) => {
        // QUAN TRỌNG: Chờ đèn sáng hoàn toàn rồi mới cập nhật UI
        console.log(`✅ Device status confirmed: ${data.device} is ${data.status}`);
        
        // Thêm delay để đèn sáng hoàn toàn trước khi cập nhật UI
        setTimeout(() => {
            // Cập nhật UI với trạng thái mới (đèn đã sáng/tắt hoàn toàn)
            updateDeviceUI(data.device, data.status);
            
            // Ẩn loading
            hideLoading();
            
            console.log(`💡 ${data.device} completed: UI updated`);
        }, 500); // Delay 0.5 giây - đủ để đèn sáng hoàn toàn
    });

    socket.on('device_control_error', (data) => {
        // Xử lý lỗi từ backend
        console.error(`Device control error: ${data.device} - ${data.error}`);
        
        // Khôi phục trạng thái nút về trạng thái cuối cùng
        const targetSwitch = document.getElementById(`${data.device}Switch`);
        if (targetSwitch) {
            targetSwitch.checked = (lastKnownStates[data.device] === 'ON');
            targetSwitch.disabled = false;
        }
        
        hideLoading();
    });

    socket.on('esp32_disconnected', () => {
        console.log('ESP32 disconnected');
        updateESP32Status(false);
    });

    socket.on('esp32_connected', () => {
        console.log('ESP32 reconnected');
        updateESP32Status(true);
        
        // Refresh data để lấy trạng thái mới nhất
        fetchInitialData();
    });

    // Nhận trạng thái hiện tại khi kết nối
    socket.on('current_states', (data) => {
        console.log('Received current states from server:', data);
        
        if (data.devices) {
            updateDeviceUI('light', data.devices.light);
            updateDeviceUI('ac', data.devices.ac);
            updateDeviceUI('fan', data.devices.fan);
            
            // Lưu trạng thái
            lastKnownStates.light = data.devices.light;
            lastKnownStates.ac = data.devices.ac;
            lastKnownStates.fan = data.devices.fan;
        }
        
        if (data.esp32Online !== undefined) {
            updateESP32Status(data.esp32Online);
        }
    });

    // --- Gửi lệnh điều khiển ---
    [lightSwitch, acSwitch, fanSwitch].forEach(toggle => {
        if (toggle) {
            toggle.addEventListener('change', (event) => {
                const desiredState = event.target.checked;
                const deviceName = toggle.id.replace('Switch', '');
                
                console.log(` Switch clicked: ${deviceName}, desired state: ${desiredState}`);

                // KIỂM TRA ESP32 CÓ ONLINE KHÔNG
                if (!esp32Online) {
                    console.log('ESP32 offline, cannot control device');
                    // KHÔI PHỤC trạng thái nút về trạng thái cuối cùng
                    event.target.checked = (lastKnownStates[deviceName] === 'ON');
                    return;
                }

                // KIỂM TRA NẾU ĐANG CHỜ XÁC NHẬN
                if (pendingConfirmations.has(deviceName)) {
                    console.log(`Waiting for confirmation from ${deviceName}, ignoring duplicate command`);
                    // KHÔI PHỤC trạng thái nút về trạng thái cuối cùng
                    event.target.checked = (lastKnownStates[deviceName] === 'ON');
                    return;
                }

                const newStatus = desiredState ? 'ON' : 'OFF';

                console.log(`Desired state: ${deviceName} -> ${newStatus}`);

                // THÊM VÀO DANH SÁCH CHỜ XÁC NHẬN
                pendingConfirmations.add(deviceName);
                
                // Hiển thị loading
                showLoading();
                
                // Vô hiệu hóa nút trong khi chờ
                toggle.disabled = true;

                // Gửi lệnh đến server
                socket.emit('device_control', {
                    device: deviceName,
                    status: newStatus
                });

                console.log(`Sent control command: ${deviceName} -> ${newStatus}`);

                // THÊM TIMEOUT ĐỂ TRÁNH TREO 
                setTimeout(() => {
                    if (pendingConfirmations.has(deviceName)) {
                        console.warn(`Timeout waiting for confirmation from ${deviceName}`);
                        pendingConfirmations.delete(deviceName);
                        
                        // KHÔI PHỤC trạng thái nút về trạng thái cuối cùng
                        toggle.checked = (lastKnownStates[deviceName] === 'ON');
                        toggle.disabled = false;
                        hideLoading();
                        
                        console.log(`${deviceName} switch restored to last known state: ${lastKnownStates[deviceName]}`);
                    }
                }, 6000); // Timeout 6 giây
            });
        }
    });

    // --- Khởi tạo ứng dụng ---
    function initApp() {
        console.log(' Initializing IoT Dashboard...');
        
        // Thêm CSS animation cho loading nếu cần
        if (!document.querySelector('#notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                @keyframes spin {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // --- Bắt đầu ứng dụng ---
    initApp();
});