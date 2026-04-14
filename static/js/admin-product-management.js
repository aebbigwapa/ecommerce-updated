// Product Management

let currentPage = 1
let currentStatus = 'all'
let currentSearch = ''

document.addEventListener("DOMContentLoaded", () => {
  initializePage()
})

function initializePage() {
  loadProducts()
  
  // Search functionality
  const searchInput = document.getElementById('productSearch')
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300))
  }
  
  // Status filter
  const statusFilter = document.getElementById('statusFilter')
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      currentStatus = e.target.value
      currentPage = 1
      loadProducts()
    })
  }
}

async function loadProducts() {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20,
      status: currentStatus,
      search: currentSearch
    })
    
    const data = await API.get(`/admin/products/all?${params}`)
    
    if (data.success && data.products) {
      renderProductsTable(data.products, data.total, data.page, data.limit)
    } else {
      showError('Failed to load products')
    }
  } catch (error) {
    console.error('Error loading products:', error)
    showError('Failed to load products')
  }
}

function renderProductsTable(products, total, page, limit) {
  const tbody = document.getElementById('productsTableBody')
  if (!tbody) return
  
  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem;">
          No products found
        </td>
      </tr>
    `
    updatePagination(0, 1, 1)
    return
  }
  
  tbody.innerHTML = products.map(product => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : ''}
          <div>
            <div style="font-weight: 600;">${escapeHtml(product.name)}</div>
            <div style="font-size: 0.75rem; color: #666;">${escapeHtml(product.description || '').substring(0, 50)}${product.description && product.description.length > 50 ? '...' : ''}</div>
          </div>
        </div>
      </td>
      <td>
        <div>${escapeHtml(product.seller_name)}</div>
        <div style="font-size: 0.75rem; color: #666;">${escapeHtml(product.seller_email)}</div>
      </td>
      <td>₱${product.price.toFixed(2)}</td>
      <td>
        <span class="status-badge ${getStatusClass(product.is_active, product.approval_status)}">
          ${getStatusText(product.is_active, product.approval_status)}
        </span>
      </td>
      <td>${product.total_sold}</td>
      <td>₱${product.total_revenue.toFixed(2)}</td>
      <td>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn-action btn-edit" onclick="editProduct(${product.id})" title="Edit">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn-action btn-toggle" onclick="toggleProductVisibility(${product.id}, ${!product.is_active})" title="${product.is_active ? 'Hide' : 'Show'}">
            <i class="fas fa-${product.is_active ? 'eye-slash' : 'eye'}"></i> ${product.is_active ? 'Hide' : 'Show'}
          </button>
          <button class="btn-action btn-delete" onclick="deleteProduct(${product.id})" title="Delete">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('')
  
  updatePagination(total, page, limit)
}

function updatePagination(total, page, limit) {
  const info = document.getElementById('paginationInfo')
  const prevBtn = document.getElementById('prevPage')
  const nextBtn = document.getElementById('nextPage')
  
  if (info) {
    const start = (page - 1) * limit + 1
    const end = Math.min(page * limit, total)
    info.textContent = `Showing ${start}-${end} of ${total} products`
  }
  
  if (prevBtn) {
    prevBtn.disabled = page <= 1
  }
  
  if (nextBtn) {
    nextBtn.disabled = page * limit >= total
  }
}

function changePage(direction) {
  currentPage += direction
  if (currentPage < 1) currentPage = 1
  loadProducts()
}

function getStatusClass(isActive, approvalStatus) {
  if (!isActive) return 'status-pending'
  if (approvalStatus === 'approved') return 'status-completed'
  if (approvalStatus === 'rejected') return 'status-rejected'
  return 'status-pending'
}

function getStatusText(isActive, approvalStatus) {
  if (!isActive) return 'Inactive'
  if (approvalStatus === 'approved') return 'Active'
  if (approvalStatus === 'rejected') return 'Rejected'
  return 'Pending'
}

async function editProduct(productId) {
  try {
    const data = await API.get(`/admin/products/${productId}`)
    
    if (data.success && data.product) {
      const product = data.product
      document.getElementById('editProductId').value = product.id
      document.getElementById('editProductName').value = product.name
      document.getElementById('editProductDescription').value = product.description || ''
      document.getElementById('editProductPrice').value = product.price
      document.getElementById('editProductCategory').value = product.category || ''
      
      const modal = document.getElementById('editProductModal')
      if (modal) {
        modal.style.display = 'flex'
        modal.style.alignItems = 'center'
        modal.style.justifyContent = 'center'
      }
    } else {
      alert('Failed to load product details')
    }
  } catch (error) {
    console.error('Error loading product:', error)
    alert('Failed to load product details')
  }
}

async function saveProductChanges() {
  const productId = document.getElementById('editProductId').value
  const name = document.getElementById('editProductName').value
  const description = document.getElementById('editProductDescription').value
  const price = document.getElementById('editProductPrice').value
  const category = document.getElementById('editProductCategory').value
  
  if (!name || !price) {
    alert('Name and price are required')
    return
  }
  
  try {
    const data = await API.put(`/admin/products/${productId}/update`, {
      name,
      description,
      price: parseFloat(price),
      category
    })
    
    if (data.success) {
      alert('Product updated successfully')
      closeEditModal()
      loadProducts()
    } else {
      alert(data.error || 'Failed to update product')
    }
  } catch (error) {
    console.error('Error updating product:', error)
    alert('Failed to update product')
  }
}

async function toggleProductVisibility(productId, isActive) {
  if (!confirm(`Are you sure you want to ${isActive ? 'show' : 'hide'} this product?`)) {
    return
  }
  
  try {
    const data = await API.put(`/admin/products/${productId}/update`, {
      is_active: isActive
    })
    
    if (data.success) {
      alert(data.message || 'Product visibility updated')
      loadProducts()
    } else {
      alert(data.error || 'Failed to update product visibility')
    }
  } catch (error) {
    console.error('Error updating product visibility:', error)
    alert('Failed to update product visibility')
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
    return
  }
  
  try {
    const data = await API.put(`/admin/products/${productId}/update`, {
      action: 'delete'
    })
    
    if (data.success) {
      alert('Product deleted successfully')
      loadProducts()
    } else {
      alert(data.error || 'Failed to delete product')
    }
  } catch (error) {
    console.error('Error deleting product:', error)
    alert('Failed to delete product')
  }
}

function closeEditModal() {
  const modal = document.getElementById('editProductModal')
  if (modal) {
    modal.style.display = 'none'
    document.getElementById('editProductForm').reset()
  }
}

function handleSearch(e) {
  currentSearch = e.target.value
  currentPage = 1
  loadProducts()
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
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showError(message) {
  const tbody = document.getElementById('productsTableBody')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">
          ${escapeHtml(message)}
        </td>
      </tr>
    `
  }
}

// Make functions globally accessible
window.editProduct = editProduct
window.toggleProductVisibility = toggleProductVisibility
window.deleteProduct = deleteProduct
window.saveProductChanges = saveProductChanges
window.closeEditModal = closeEditModal
window.changePage = changePage

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('editProductModal')
  if (event.target === modal) {
    closeEditModal()
  }
}

