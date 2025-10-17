let currentPage = 1;
let rowsPerPage = 10;
let totalPages = 1;

// DOM elements
const tableBody = document.getElementById('historyTableBody');
const rowsPerPageSelect = document.getElementById('rows-per-page');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageNumbersDiv = document.getElementById('pageNumbers');
const searchBox = document.getElementById('searchInput');
const deviceFilterSelect = document.getElementById('deviceFilter');
const statusFilterSelect = document.getElementById('statusFilter');
const applyBtn = document.getElementById('applyBtn');

// Hàm chuyển đổi tên thiết bị từ tiếng Anh sang tiếng Việt
function convertDeviceName(device) {
    const deviceMap = {
        'light': 'Đèn',
        'fan': 'Quạt',
        'ac': 'Điều hòa',
    };
    return deviceMap[device] || device;
}

// Hàm xây dựng query params
function buildQueryParams() {
    // Chuyển đổi giá trị filter thiết bị từ tiếng Việt sang tiếng Anh
    let deviceFilterValue = '';
    if (deviceFilterSelect.value === 'Quạt') {
        deviceFilterValue = 'fan';
    } else if (deviceFilterSelect.value === 'Điều hòa') {
        deviceFilterValue = 'ac';
    } else if (deviceFilterSelect.value === 'Đèn') {
        deviceFilterValue = 'light';
    } else {
        deviceFilterValue = ''; // Tất cả thiết bị
    }

    // Giá trị filter trạng thái
    const statusFilterValue = statusFilterSelect.value;

    const params = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: 'timestamp',           
        sortOrder: 'DESC',     
        search: searchBox.value.trim(),
        deviceFilter: deviceFilterValue,
        statusFilter: statusFilterValue
    };

    console.log('🔍 Query Params:', params);
    return new URLSearchParams(params).toString();
}

// Hàm áp dụng bộ lọc
async function applyFilter(resetPage = true) {
    if (resetPage) currentPage = 1;
    rowsPerPage = parseInt(rowsPerPageSelect.value);

    try {
        const queryString = buildQueryParams();
        const url = `/api/device_history?${queryString}`;
        
        console.log('📡 Fetching URL:', url);
        
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const result = await res.json();
        
        console.log('✅ API Response:', result);
        
        if (result && result.data) {
            totalPages = result.totalPages || 1;
            renderTable(result.data);
            renderPagination();
        } else {
            throw new Error('Invalid response format');
        }
        
    } catch (err) {
        console.error('❌ Fetch Error:', err);
        tableBody.innerHTML = '<tr><td colspan="4" style="color: red; text-align: center; padding: 20px;">Không tải được dữ liệu: ' + err.message + '</td></tr>';
    }
}

// Hàm hiển thị bảng
function renderTable(data) {
    console.log('🎨 Rendering table with', data.length, 'items');
    
    tableBody.innerHTML = '';
    
    if (!data || !data.length) {
        tableBody.innerHTML = `
            <tr>
                    Không có dữ liệu
                
            </tr>`;
        return;
    }

    data.forEach((item) => {
        const date = new Date(item.timestamp).toLocaleString('vi-VN');
        const deviceName = convertDeviceName(item.device);
        const statusText = item.status === 'ON' ? 'ON' : 'OFF';
        const statusClass = item.status === 'ON' ? 'status-on' : 'status-off';
        
        const row = `
            <tr>
                <td>${item.id || '-'}</td>
                <td>${deviceName}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td>${date}</td>
            </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Hàm hiển thị phân trang
function renderPagination() {
    pageNumbersDiv.innerHTML = '';

    console.log('🔢 Pagination - Current:', currentPage, 'Total:', totalPages);

    // Cập nhật trạng thái nút Previous và Next
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    // Thêm class cho styling
    prevBtn.className = 'pagination-btn';
    nextBtn.className = 'pagination-btn';

    if (totalPages <= 1) {
        pageNumbersDiv.innerHTML = '<span style="padding: 0 12px; color: #666;">Trang 1</span>';
        return;
    }

    const pagesToShow = new Set([1, totalPages, currentPage]);
    
    // Thêm các trang xung quanh trang hiện tại
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
        pagesToShow.add(i);
    }

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);

    let prevPage = 0;
    sortedPages.forEach(page => {
        if (page - prevPage > 1) {
            const ellipsis = document.createElement('span');
            ellipsis.innerText = '...';
            ellipsis.style.padding = '0 8px';
            ellipsis.style.color = '#666';
            pageNumbersDiv.appendChild(ellipsis);
        }

        // Tạo nút cho mỗi trang
        const btn = document.createElement('button');
        btn.innerText = page;
        btn.className = 'pagination-btn';
        
        // Thêm class active cho trang hiện tại
        if (page === currentPage) {
            btn.classList.add('active');
            btn.style.backgroundColor = '#007bff';
            btn.style.color = 'white';

        }
        
        btn.addEventListener('click', () => {
            currentPage = page;
            applyFilter(false);
        });
        
        pageNumbersDiv.appendChild(btn);
        prevPage = page;
    });
}

// Event Listeners
rowsPerPageSelect.addEventListener('change', () => {
    console.log('🔄 Rows per page changed to:', rowsPerPageSelect.value);
    applyFilter(true);
});

deviceFilterSelect.addEventListener('change', () => {
    console.log('🔧 Device filter changed to:', deviceFilterSelect.value);
    applyFilter(true);
});

statusFilterSelect.addEventListener('change', () => {
    console.log('🔌 Status filter changed to:', statusFilterSelect.value);
    applyFilter(true);
});

applyBtn.addEventListener('click', () => {
    console.log('🔍 Search button clicked:', searchBox.value);
    applyFilter(true);
});

searchBox.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        console.log('🔍 Search enter pressed:', searchBox.value);
        applyFilter(true);
    }
});

prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        console.log('⬅️ Previous page:', currentPage);
        applyFilter(false);
    }
});

nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        console.log('➡️ Next page:', currentPage);
        applyFilter(false);
    }
});

// Khởi chạy khi trang load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 History page loaded, initializing...');
    applyFilter(true);
});