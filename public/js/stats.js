let currentSelectedDate = '';

function initializeDate() {
    const today = new Date();
    document.getElementById('selectedDate').value = formatDate(today);
    currentSelectedDate = formatDate(today);
    console.log('Date initialized:', currentSelectedDate);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function resetDate() {
    initializeDate();
    loadStatistics();
}
async function loadStatistics() {
    const selectedDate = document.getElementById('selectedDate').value;   // YYYY-MM-DD

    if (!selectedDate) {
        alert('Vui lòng chọn ngày');
        return;
    }

    currentSelectedDate = selectedDate;
    console.log('Loading statistics for:', currentSelectedDate);

    // Gửi startDate = endDate = ngày đã chọn
    await loadSensorStatistics(selectedDate, selectedDate);
    await loadDeviceStatistics(selectedDate, selectedDate);
}

/* ------------------------------------------------------------------ */
async function loadSensorStatistics(start, end) {
    const container = document.getElementById('sensorStats');
    container.innerHTML = '<div class="loading">Đang tải thống kê cảm biến...</div>';

    try {
        const url = `/api/sensor_stats?startDate=${start}&endDate=${end}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        renderSensorStats(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="error">Lỗi: ${e.message}</div>`;
    }
}

/* ------------------------------------------------------------------ */
async function loadDeviceStatistics(start, end) {
    const container = document.getElementById('deviceStats');
    container.innerHTML = '<div class="loading">Đang tải thống kê thiết bị...</div>';

    try {
        const url = `/api/device_stats?startDate=${start}&endDate=${end}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        renderDeviceStats(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="error">Lỗi: ${e.message}</div>`;
    }
}
function renderSensorStats(data) {
    const statsContainer = document.getElementById('sensorStats');
    
    console.log('🎯 renderSensorStats called with data:', data);
    console.log('📊 Data type:', typeof data);
    console.log('🔢 Is array:', Array.isArray(data));
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('❌ No sensor data available');
        statsContainer.innerHTML = '<div class="no-data">Không có dữ liệu cảm biến vượt ngưỡng trong ngày này</div>';
        return;
    }
    
    const thresholds = {
        'temperature': '> 35°C',
        'humidity': '> 80%', 
        'light_level': '> 800 lux'
    };
    
    const totalExceedances = data.reduce((sum, item) => sum + (item.exceed_count || 0), 0);
    
    console.log('Total exceedances:', totalExceedances);
    
    const tableHTML = `
        <div class="stats-header">
            <h3>📊 Thống Kê Vượt Ngưỡng - Ngày ${formatDisplayDate(currentSelectedDate)}</h3>
            <div class="threshold-info">
                <strong>Tổng số lần vượt ngưỡng: <span class="total-count">${totalExceedances}</span></strong>
            </div>
        </div>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Cảm Biến</th>
                    <th>Ngưỡng</th>
                    <th>Số Lần Vượt Ngưỡng</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(item => {
                    const count = item.exceed_count || 0;
                    return `
                    <tr>
                        <td>${getSensorName(item.sensor_type)}</td>
                        <td class="threshold">${thresholds[item.sensor_type] || 'N/A'}</td>
                        <td><span class="count-badge ${count > 0 ? 'has-data' : 'no-data'}">${count}</span></td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        <div class="stats-summary">
            Cảm biến vượt ngưỡng: <strong>${data.filter(item => (item.exceed_count || 0) > 0).length}/${data.length}</strong>
        </div>
    `;
    
    statsContainer.innerHTML = tableHTML;
}

function renderDeviceStats(data) {
    const statsContainer = document.getElementById('deviceStats');
    
    console.log('🎯 renderDeviceStats called with data:', data);
    console.log('📊 Data type:', typeof data);
    console.log('🔢 Is array:', Array.isArray(data));
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('❌ No device data available');
        statsContainer.innerHTML = '<div class="no-data">Không có dữ liệu thiết bị trong ngày này</div>';
        return;
    }
    
    const totalTurnOns = data.reduce((sum, item) => sum + (item.turn_on_count || 0), 0);
    
    console.log('Total turn ons:', totalTurnOns);
    
    const tableHTML = `
        <div class="stats-header">
            <h3>⚡ Thống Kê Bật Thiết Bị - Ngày ${formatDisplayDate(currentSelectedDate)}</h3>
            <div class="threshold-info">
                <strong>Tổng số lần bật thiết bị: <span class="total-count">${totalTurnOns}</span></strong>
            </div>
        </div>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Thiết Bị</th>
                    <th>Số Lần Bật</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(item => {
                    const count = item.turn_on_count || 0;
                    return `
                    <tr>
                        <td>${getDeviceName(item.device)}</td>
                        <td><span class="count-badge ${count > 0 ? 'has-data' : 'no-data'}">${count}</span></td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        <div class="stats-summary">
            Thiết bị được bật: <strong>${data.filter(item => (item.turn_on_count || 0) > 0).length}/${data.length}</strong>
        </div>
    `;
    
    statsContainer.innerHTML = tableHTML;
}

function formatDisplayDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

function getSensorName(sensorType) {
    const sensorNames = {
        'temperature': '🌡️ Nhiệt Độ',
        'humidity': '💧 Độ Ẩm',
        'light_level': '💡 Ánh Sáng'
    };
    return sensorNames[sensorType] || sensorType;
}

function getDeviceName(device) {
    const deviceNames = {
        'light': '💡 Đèn',
        'fan': '🌀 Quạt',
        'ac': '❄️ Điều Hòa'
    };
    return deviceNames[device] || device;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Stats page loaded - DOM ready');
    initializeDate();
    loadStatistics();
    document.getElementById('selectedDate').addEventListener('change', loadStatistics);
});