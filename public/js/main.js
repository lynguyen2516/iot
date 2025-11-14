document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    const tempValueEl = document.getElementById('temperatureValue');
    const humiValueEl = document.getElementById('humidityValue');
    const lightValueEl = document.getElementById('lightValue');

    const lightSwitch = document.getElementById('lightSwitch');
    const acSwitch = document.getElementById('acSwitch');
    const fanSwitch = document.getElementById('fanSwitch');
    const bellSwitch= document.getElementById('bellSwitch');

    let mainCombinedChart;
    let pendingConfirmations = new Set();
    let esp32Online = false;
    let lastKnownStates = {
        light: 'OFF',
        ac: 'OFF', 
        fan: 'OFF',
        bell:'OFF'
    };

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

    function updateDeviceUI(device, status, showLoading = false) {
        const targetSwitch = document.getElementById(`${device}Switch`);
        const controlPanel = document.getElementById(`${device}Control`);

        if (targetSwitch) {
            targetSwitch.checked = (status === 'ON');
            targetSwitch.disabled = !esp32Online || pendingConfirmations.has(device);
        }
        
        if (controlPanel) {
            controlPanel.classList.toggle('is-on', status === 'ON');
            
            if (showLoading || pendingConfirmations.has(device)) {
                controlPanel.classList.add('loading');
            } else {
                controlPanel.classList.remove('loading');
            }
        }
        
        lastKnownStates[device] = status;
    }

    function resetAllDevicesToOff() {
        updateDeviceUI('light', 'OFF');
        updateDeviceUI('ac', 'OFF');
        updateDeviceUI('fan', 'OFF');
        updateDeviceUI('bell','OFF');
        
        lastKnownStates.light = 'OFF';
        lastKnownStates.ac = 'OFF';
        lastKnownStates.fan = 'OFF';
        lastKnownStates.bell='OFF';
    }

    function updateESP32Status(online) {
        esp32Online = online;
        
        [lightSwitch, acSwitch, fanSwitch,bellSwitch].forEach(switchEl => {
            if (switchEl) {
                const deviceName = switchEl.id.replace('Switch', '');
                switchEl.disabled = !online || pendingConfirmations.has(deviceName);
            }
        });

        if (online) {
            document.body.classList.remove('esp32-offline');
        } else {
            document.body.classList.add('esp32-offline');
            resetAllDevicesToOff();
        }
    }

    async function fetchInitialData() {
        try {
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json(); 

            if (data.latestSensor && Object.keys(data.latestSensor).length > 0) {
                updateMetricCards(data.latestSensor);
            }

            if (data.devices) {
                updateDeviceUI('light', data.devices.light);
                updateDeviceUI('ac', data.devices.ac);
                updateDeviceUI('fan', data.devices.fan);
                updateDeviceUI('bell',data.devices.bell);
                
                lastKnownStates.light = data.devices.light;
                lastKnownStates.ac = data.devices.ac;
                lastKnownStates.fan = data.devices.fan;
                lastKnownStates.bell=data.devices.bell;
            }

            if (data.esp32Online !== undefined) {
                updateESP32Status(data.esp32Online);
            }

            if (data.chartData && data.chartData.length > 0) {
                initializeCharts(data.chartData); 
            }
        } catch (error) {
            console.error('Failed to fetch initial data from API:', error);
        }
    }

    fetchInitialData();

    function initializeCharts(initialData) {
        if (initialData.length === 0) return;
    
        const MAX_DATA_POINTS = 20;
        const dataForChart = initialData.slice(-MAX_DATA_POINTS); 
    
        const labels = dataForChart.map(d =>
            new Date(d.timestamp).toLocaleTimeString('vi-VN', {
                hour: '2-digit', minute: '2-digit'
            })
        );
        
        const tempValues = dataForChart.map(d => d.temperature || 0);
        const humiValues = dataForChart.map(d => d.humidity || 0);
        const lightValues = dataForChart.map(d => d.light_level || 0);
    
        const ctx = document.getElementById('mainCombinedChart');
        if (!ctx) return;

        if (mainCombinedChart) {
            mainCombinedChart.destroy();
        }
    
        mainCombinedChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Nhiệt độ (°C)',
                        data: tempValues,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        pointRadius: 3,
                        borderWidth: 2
                    },
                    {
                        label: 'Độ ẩm (%)',
                        data: humiValues,
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        pointRadius: 3,
                        borderWidth: 2
                    },
                    {
                        label: 'Ánh sáng (Lux)',
                        data: lightValues,
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4,
                        pointRadius: 3,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        title: { display: true, text: 'Thời gian' },
                        grid: { display: false }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Nhiệt độ (°C) & Độ ẩm (%)' },
                        min: 0,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Ánh sáng (Lux)' },
                        min: 0,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    function updateCharts(newData) {
        if (!mainCombinedChart) return;

        const MAX_DATA_POINTS = 20;
        const now = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit'
        });

        mainCombinedChart.data.labels.push(now);
        mainCombinedChart.data.datasets[0].data.push(newData.temperature || 0);
        mainCombinedChart.data.datasets[1].data.push(newData.humidity || 0);
        mainCombinedChart.data.datasets[2].data.push(newData.light_level || 0);

        if (mainCombinedChart.data.labels.length > MAX_DATA_POINTS) {
            mainCombinedChart.data.labels.shift();
            mainCombinedChart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        mainCombinedChart.update('none');
    }

    socket.on('sensor_update', (data) => {
        updateMetricCards(data);
        updateCharts(data);
    });

    socket.on('device_status_confirmed', (data) => {
        pendingConfirmations.delete(data.device);
        updateDeviceUI(data.device, data.status, false);
    });

    socket.on('device_control_error', (data) => {
        pendingConfirmations.delete(data.device);
        updateDeviceUI(data.device, lastKnownStates[data.device], false);
    });

    socket.on('esp32_disconnected', () => {
        updateESP32Status(false);
        pendingConfirmations.clear();
        resetAllDevicesToOff();
    });

    socket.on('esp32_connected', () => {
        updateESP32Status(true);
        pendingConfirmations.clear();
        fetchInitialData();
    });

    socket.on('current_states', (data) => {
        if (data.devices) {
            Object.keys(data.devices).forEach(device => {
                if (!pendingConfirmations.has(device)) {
                    updateDeviceUI(device, data.devices[device], false);
                    lastKnownStates[device] = data.devices[device];
                }
            });
        }
        
        if (data.esp32Online !== undefined) {
            updateESP32Status(data.esp32Online);
        }
    });

    function setupDeviceControl(switchElement) {
        if (!switchElement) return;

        switchElement.addEventListener('change', (event) => {
            const deviceName = switchElement.id.replace('Switch', '');
            const desiredStatus = event.target.checked ? 'ON' : 'OFF';

            event.target.checked = !event.target.checked;

            if (!esp32Online) return;
            if (pendingConfirmations.has(deviceName)) return;

            pendingConfirmations.add(deviceName);
            updateDeviceUI(deviceName, lastKnownStates[deviceName], true);

            socket.emit('device_control', {
                device: deviceName,
                status: desiredStatus
            });

            setTimeout(() => {
                if (pendingConfirmations.has(deviceName)) {
                    pendingConfirmations.delete(deviceName);
                    updateDeviceUI(deviceName, lastKnownStates[deviceName], false);
                }
            }, 5000);
        });
    }

    [lightSwitch, acSwitch, fanSwitch,bellSwitch].forEach(setupDeviceControl);
});