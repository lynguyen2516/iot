let currentPage = 1;
let rowsPerPage = 10;
let totalPages = 1;

// DOM elements
const tableBody = document.getElementById('dataTableBody');
const rowsPerPageSelect = document.getElementById('rowsPerPageSelect');
const prevBtn = document.getElementById('prevBtn'); 
const nextBtn = document.getElementById('nextBtn'); 
const pageNumbersDiv = document.getElementById('pageNumbers');
const filterSelect = document.getElementById('filterSelect'); 
const sortOrderSelect = document.getElementById('sortOrderSelect');
const searchBox = document.getElementById('searchBox');
const applyBtn = document.getElementById('applyBtn');
const firstPageBtn = document.getElementById('firstPageBtn'); 
const lastPageBtn = document.getElementById('lastPageBtn'); 


function buildQueryParams() {
    let autoSortBy = 'timestamp'; 
    
    if (filterSelect.value === 'Nhiệt độ') {
        autoSortBy = 'temperature';
    } else if (filterSelect.value === 'Ánh sáng') {
        autoSortBy = 'light_level';
    } else if (filterSelect.value === 'Độ ẩm') {
        autoSortBy = 'humidity';
    }

    let selectedSortOrder = 'desc'; 
    
    if (sortOrderSelect.value === 'Tăng dần') {
        selectedSortOrder = 'asc';
    } else if (sortOrderSelect.value === 'Giảm dần') {
        selectedSortOrder = 'desc';
    }
    
    let filterType = '';
    if (filterSelect.value !== 'Tất cả') {
        filterType = filterSelect.value;
    }

    const params = {
        page: currentPage,
        limit: rowsPerPage,
        sortBy: autoSortBy,           
        sortOrder: selectedSortOrder, 
        search: searchBox.value.trim(),
        filterType: filterType 
    };
    
    return new URLSearchParams(params).toString();
}

async function applyFilter(resetPage = false) {
    // Reset về trang 1 khi thay đổi bộ lọc
    if (resetPage) currentPage = 1;
    rowsPerPage = parseInt(rowsPerPageSelect.value);

    try {
        const res = await fetch(`/api/sensor_data?${buildQueryParams()}`);
        if (!res.ok) throw new Error(res.statusText);

        const { data, totalPages: tp } = await res.json();
        totalPages = tp || 1;
        renderTable(data);
        renderPagination();
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = '<tr><td colspan="5">Không tải được dữ liệu.</td></tr>';
    }
}

function renderTable(data) {
    tableBody.innerHTML = '';
    if (!data || !data.length) {
        tableBody.innerHTML = '<tr><td colspan="5">Không có dữ liệu.</td></tr>';
        return;
    }

    // Định dạng dữ liệu cho từng hàng
    data.forEach(item => {
        const date = new Date(item.timestamp).toLocaleString('vi-VN');
        
        // Xử lý giá trị null/undefined và định dạng số
        const temperature = item.temperature !== null && item.temperature !== undefined 
            ? parseFloat(item.temperature).toFixed(1) 
            : '-';
            
        const humidity = item.humidity !== null && item.humidity !== undefined 
            ? parseFloat(item.humidity).toFixed(0) 
            : '-';
            
        const row = `
          <tr>
            <td>${item.id || '-'}</td>
            <td>${temperature}</td>
            <td>${item.light_level ?? '-'}</td>
            <td>${humidity}</td>
            <td>${date}</td>
          </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

function renderPagination() {
    pageNumbersDiv.innerHTML = '';

    // Vô hiệu hóa nút khi ở trang đầu/cuối
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    if (firstPageBtn) firstPageBtn.disabled = currentPage <= 1;
    if (lastPageBtn) lastPageBtn.disabled = currentPage >= totalPages;

    const pagesToShow = new Set();

    pagesToShow.add(1);
    if (totalPages >= 2) pagesToShow.add(2);

    pagesToShow.add(currentPage);

    if (totalPages >= 2) pagesToShow.add(totalPages - 1);
    pagesToShow.add(totalPages);

    if (currentPage > 1) pagesToShow.add(currentPage - 1);
    if (currentPage < totalPages) pagesToShow.add(currentPage + 1);

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


// Event listeners
rowsPerPageSelect.addEventListener('change', () => applyFilter(true)); // Reset trang khi đổi số dòng

// Tự động áp dụng khi chọn lọc
filterSelect.addEventListener('change', () => {
    console.log('🔧 Filter changed to:', filterSelect.value);
    applyFilter(true);
});

// Tự động áp dụng khi chọn sắp xếp
sortOrderSelect.addEventListener('change', () => {
    console.log('📊 Sort order changed to:', sortOrderSelect.value);
    applyFilter(true);
});

// Chỉ tìm kiếm khi ấn nút Áp dụng hoặc Enter
applyBtn.addEventListener('click', () => {
    console.log('🔍 Apply button clicked - Searching:', searchBox.value);
    applyFilter(true);
});

searchBox.addEventListener('keypress', e => { 
    if (e.key === 'Enter') {
        console.log('🔍 Search enter pressed - Searching:', searchBox.value);
        applyFilter(true);
    }
});

searchBox.addEventListener('input', () => {
    console.log('⌨️ User typing:', searchBox.value);
});

prevBtn.addEventListener('click', () => { 
    if (currentPage > 1) { 
        currentPage--; 
        applyFilter(false); 
    }
});

nextBtn.addEventListener('click', () => { 
    if (currentPage < totalPages) { 
        currentPage++; 
        applyFilter(false); 
    }
});


if (firstPageBtn) firstPageBtn.addEventListener('click', () => { 
    currentPage = 1; 
    applyFilter(false); 
});
if (lastPageBtn) lastPageBtn.addEventListener('click', () => { 
    currentPage = totalPages; 
    applyFilter(false); 
});

// Khởi chạy khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
    console.log('Data page loaded, initializing...');
    applyFilter(true);
}); 