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
const sortFilterSelect = document.getElementById('sortFilter');
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
    let sortOrderValue = 'DESC'; // Mặc định
    
    if (sortFilterSelect.value === 'Thời gian mới nhất') {
        sortOrderValue = 'DESC';
    } else if (sortFilterSelect.value === 'Thời gian cũ nhất') {
        sortOrderValue = 'ASC';
    }

    console.log('🔄 Sort conversion:', sortFilterSelect.value, '→', sortOrderValue);

    // Chuyển đổi giá trị filter từ tiếng Việt sang tiếng Anh để gửi API
    let deviceFilterValue = '';
    if (deviceFilterSelect.value === 'Quạt') {
        deviceFilterValue = 'fan';
    } else if (deviceFilterSelect.value === 'Điều hòa') {
        deviceFilterValue = 'ac';
    } else if (deviceFilterSelect.value === 'Đèn') {
        deviceFilterValue = 'light';
    } else {
        deviceFilterValue = ''; // Tất cả
    }

    const params = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: 'timestamp',           
        sortOrder: sortOrderValue,     
        search: searchBox.value.trim(),
        deviceFilter: deviceFilterValue
    };

    console.log('🔍 Frontend Query Params:', params);
    return new URLSearchParams(params).toString();
}

// Hàm áp dụng bộ lọc
async function applyFilter(resetPage = false) {
    if (resetPage) currentPage = 1;
    rowsPerPage = parseInt(rowsPerPageSelect.value);

    try {
        const queryString = buildQueryParams();
        const url = `/api/device_history?${queryString}`;
        
        console.log('Fetching URL:', url);
        
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const result = await res.json();
        
        console.log('API Response - Total items:', result.totalItems, 'Total pages:', result.totalPages);
        
        totalPages = result.totalPages || 1;
        renderTable(result.data);
        renderPagination();
    } catch (err) {
        console.error('Fetch Error:', err);
        tableBody.innerHTML = '<tr><td colspan="4" style="color: red;">Không tải được dữ liệu: ' + err.message + '</td></tr>';
    }
}

// Hàm hiển thị bảng
function renderTable(data) {
    console.log('🎨 Rendering table with', data.length, 'items');
    
    tableBody.innerHTML = '';
    
    if (!data || !data.length) {
        tableBody.innerHTML = '<tr><td colspan="4">Không có dữ liệu.</td></tr>';
        return;
    }

    data.forEach((item) => {
        const date = new Date(item.timestamp).toLocaleString('en-EN');
        const deviceName = convertDeviceName(item.device);
        const statusText = item.status === 'ON' ? 'ON' : 
                          item.status === 'OFF' ? 'OFF' : 
                          item.status || 'N/A';
        
        const row = `
            <tr>
                <td>${item.id || '-'}</td>
                <td>${deviceName}</td>
                <td>${statusText}</td>
                <td>${date}</td>
            </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Hàm hiển thị phân trang
function renderPagination() {
    pageNumbersDiv.innerHTML = '';

    console.log('🔢 Pagination - Current:', currentPage, 'Total:', totalPages);

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    if (totalPages <= 1) {
        return;
    }

    const pagesToShow = new Set();

    pagesToShow.add(1);
    if (totalPages >= 2) pagesToShow.add(2);

    pagesToShow.add(currentPage);

    if (totalPages >= 2) pagesToShow.add(totalPages - 1);
    pagesToShow.add(totalPages);

    if (currentPage > 1) pagesToShow.add(currentPage - 1);
    if (currentPage < totalPages) pagesToShow.add(currentPage + 1);

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);

    // Hiển thị các trang
    let prevPage = 0;
    sortedPages.forEach(page => {
        if (page - prevPage > 1) {
            const ellipsis = document.createElement('span');
            ellipsis.innerText = '...';
            ellipsis.style.padding = '0 8px';
            ellipsis.style.color = '#666';
            pageNumbersDiv.appendChild(ellipsis);
        }

        // Thêm nút trang
        const btn = document.createElement('button');
        btn.innerText = page;
        if (page === currentPage) {
            btn.classList.add('active');
            btn.style.fontWeight = 'bold';
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
    applyFilter(true); // Reset về trang 1
});

// Tự động áp dụng khi chọn thiết bị
deviceFilterSelect.addEventListener('change', () => {
    console.log('🔧 Device filter changed to:', deviceFilterSelect.value);
    applyFilter(true); // Reset về trang 1
});

// Tự động áp dụng khi chọn sắp xếp
sortFilterSelect.addEventListener('change', () => {
    console.log('📊 Sort filter changed to:', sortFilterSelect.value);
    applyFilter(true); // Reset về trang 1
});

// Chỉ tìm kiếm khi ấn nút Áp dụng hoặc Enter
applyBtn.addEventListener('click', () => {
    console.log('🔍 Apply button clicked - Searching:', searchBox.value);
    applyFilter(true); // Reset về trang 1
});

searchBox.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        console.log('🔍 Search enter pressed - Searching:', searchBox.value);
        applyFilter(true); // Reset về trang 1
    }
});

// KHÔNG tự động tìm kiếm khi nhập - chỉ hiển thị gợi ý hoặc để trống
searchBox.addEventListener('input', () => {
    // Không làm gì cả - chỉ để người dùng nhập
    console.log('⌨️ User typing:', searchBox.value);
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
    console.log('History page loaded, initializing...');
    applyFilter(true);
});