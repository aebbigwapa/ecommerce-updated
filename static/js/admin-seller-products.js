// Seller Products & Sales Management

document.addEventListener("DOMContentLoaded", () => {
  initializePage()
})

function initializePage() {
  loadSellers()
  
  // Search functionality
  const searchInput = document.getElementById('sellerSearch')
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300))
  }
}

async function loadSellers() {
  try {
    const data = await API.get('/admin/sellers/products-sales')
    
    if (data.success && data.sellers) {
      renderSellersTable(data.sellers)
    } else {
      showError('Failed to load sellers')
    }
  } catch (error) {
    console.error('Error loading sellers:', error)
    showError('Failed to load sellers')
  }
}

function renderSellersTable(sellers) {
  const tbody = document.getElementById('sellersTableBody')
  if (!tbody) return
  
  if (!sellers || sellers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem;">
          No sellers found
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = sellers.map(seller => `
    <tr>
      <td>${escapeHtml(seller.seller_name)}</td>
      <td>${escapeHtml(seller.seller_email)}</td>
      <td>${seller.total_products}</td>
      <td>${seller.active_products}</td>
      <td>₱${seller.total_sales.toFixed(2)}</td>
      <td>${seller.total_orders}</td>
      <td>₱${seller.completed_sales.toFixed(2)}</td>
      <td>
        <button class="btn-view-products" onclick="viewSellerProducts(${seller.seller_id})">
          <i class="fas fa-eye"></i> View Products
        </button>
      </td>
    </tr>
  `).join('')
}

async function viewSellerProducts(sellerId) {
  try {
    const data = await API.get(`/admin/sellers/${sellerId}/products`)
    
    if (data.success) {
      showSellerProductsModal(data.seller, data.products)
    } else {
      alert('Failed to load seller products')
    }
  } catch (error) {
    console.error('Error loading seller products:', error)
    alert('Failed to load seller products')
  }
}

function showSellerProductsModal(seller, products) {
  const modal = document.getElementById('sellerProductsModal')
  const title = document.getElementById('sellerProductsTitle')
  const body = document.getElementById('sellerProductsBody')
  
  if (!modal || !title || !body) return
  
  title.textContent = `Products by ${seller.name}`
  
  if (!products || products.length === 0) {
    body.innerHTML = '<p>No products found for this seller.</p>'
  } else {
    body.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <p><strong>Seller:</strong> ${escapeHtml(seller.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(seller.email)}</p>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>Price</th>
            <th>Status</th>
            <th>Total Sold</th>
            <th>Total Revenue</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(product => `
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : ''}
                  <span>${escapeHtml(product.name)}</span>
                </div>
              </td>
              <td>₱${product.price.toFixed(2)}</td>
              <td>
                <span class="status-badge ${product.is_active ? 'status-completed' : 'status-pending'}">
                  ${product.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>${product.total_sold}</td>
              <td>₱${product.total_revenue.toFixed(2)}</td>
              <td>${UI.formatDate(product.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }
  
  modal.style.display = 'flex'
  modal.style.alignItems = 'center'
  modal.style.justifyContent = 'center'
}

function closeSellerProductsModal() {
  const modal = document.getElementById('sellerProductsModal')
  if (modal) {
    modal.style.display = 'none'
  }
}

function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase()
  const rows = document.querySelectorAll('#sellersTableBody tr')
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase()
    row.style.display = text.includes(searchTerm) ? '' : 'none'
  })
}

function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showError(message) {
  const tbody = document.getElementById('sellersTableBody')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">
          ${escapeHtml(message)}
        </td>
      </tr>
    `
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('sellerProductsModal')
  if (event.target === modal) {
    closeSellerProductsModal()
  }
}

