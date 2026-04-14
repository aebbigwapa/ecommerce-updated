// Rider Management

let earningsChart = null

document.addEventListener("DOMContentLoaded", () => {
  initializePage()
})

function initializePage() {
  loadRiders()
  
  // Search functionality
  const searchInput = document.getElementById('riderSearch')
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300))
  }
}

async function loadRiders() {
  try {
    const data = await API.get('/admin/riders')
    
    if (data.success && data.riders) {
      renderRidersTable(data.riders)
    } else {
      showError('Failed to load riders')
    }
  } catch (error) {
    console.error('Error loading riders:', error)
    showError('Failed to load riders')
  }
}

function renderRidersTable(riders) {
  const tbody = document.getElementById('ridersTableBody')
  if (!tbody) return
  
  if (!riders || riders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem;">
          No riders found
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = riders.map(rider => `
    <tr>
      <td>${escapeHtml(rider.rider_name)}</td>
      <td>${escapeHtml(rider.rider_email)}</td>
      <td>${escapeHtml(rider.rider_phone || 'N/A')}</td>
      <td>${rider.total_deliveries}</td>
      <td>${rider.completed_deliveries}</td>
      <td>${rider.active_deliveries}</td>
      <td>₱${rider.total_earnings.toFixed(2)}</td>
      <td>
        ${rider.average_rating > 0 ? `${rider.average_rating.toFixed(1)} ⭐` : 'N/A'}
      </td>
      <td>
        <button class="btn-view-performance" onclick="viewRiderPerformance(${rider.rider_id})">
          <i class="fas fa-chart-line"></i> View Performance
        </button>
      </td>
    </tr>
  `).join('')
}

async function viewRiderPerformance(riderId) {
  try {
    const data = await API.get(`/admin/riders/${riderId}/performance`)
    
    if (data.success) {
      showRiderPerformanceModal(data.rider, data.deliveries, data.earnings)
    } else {
      alert('Failed to load rider performance')
    }
  } catch (error) {
    console.error('Error loading rider performance:', error)
    alert('Failed to load rider performance')
  }
}

function showRiderPerformanceModal(rider, deliveries, earnings) {
  const modal = document.getElementById('riderPerformanceModal')
  const title = document.getElementById('riderPerformanceTitle')
  const body = document.getElementById('riderPerformanceBody')
  
  if (!modal || !title || !body) return
  
  title.textContent = `Performance: ${rider.name}`
  
  // Calculate summary stats
  const totalEarnings = earnings.reduce((sum, e) => sum + e.daily_earnings, 0)
  const totalDeliveries = deliveries.length
  const completedDeliveries = deliveries.filter(d => d.status === 'delivered').length
  
  body.innerHTML = `
    <div style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1rem;">Rider Information</h3>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
        <div>
          <strong>Name:</strong> ${escapeHtml(rider.name)}
        </div>
        <div>
          <strong>Email:</strong> ${escapeHtml(rider.email)}
        </div>
        <div>
          <strong>Phone:</strong> ${escapeHtml(rider.phone || 'N/A')}
        </div>
        <div>
          <strong>Total Deliveries:</strong> ${totalDeliveries}
        </div>
        <div>
          <strong>Completed:</strong> ${completedDeliveries}
        </div>
        <div>
          <strong>Total Earnings:</strong> ₱${totalEarnings.toFixed(2)}
        </div>
      </div>
    </div>
    
    <div style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1rem;">Earnings Report (Last 30 Days)</h3>
      <div style="position: relative; height: 300px;">
        <canvas id="earningsChart"></canvas>
      </div>
    </div>
    
    <div>
      <h3 style="margin-bottom: 1rem;">Recent Delivery Assignments</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Earnings</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${deliveries.length > 0 ? deliveries.slice(0, 20).map(delivery => `
            <tr>
              <td>${escapeHtml(delivery.order_number)}</td>
              <td>${escapeHtml(delivery.customer_name || 'N/A')}</td>
              <td>
                <span class="status-badge ${getDeliveryStatusClass(delivery.status)}">
                  ${escapeHtml(delivery.status)}
                </span>
              </td>
              <td>₱${delivery.total_amount.toFixed(2)}</td>
              <td>₱${delivery.earnings.toFixed(2)}</td>
              <td>${UI.formatDate(delivery.created_at)}</td>
            </tr>
          `).join('') : '<tr><td colspan="6" style="text-align: center;">No deliveries found</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  
  // Render earnings chart
  if (earnings && earnings.length > 0) {
    setTimeout(() => {
      renderEarningsChart(earnings)
    }, 100)
  }
  
  modal.style.display = 'flex'
  modal.style.alignItems = 'center'
  modal.style.justifyContent = 'center'
}

function renderEarningsChart(earnings) {
  const ctx = document.getElementById('earningsChart')
  if (!ctx) return
  
  // Destroy existing chart
  if (earningsChart) {
    earningsChart.destroy()
  }
  
  const labels = earnings.map(e => {
    const date = new Date(e.date)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }).reverse()
  
  const data = earnings.map(e => e.daily_earnings).reverse()
  
  earningsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Earnings',
        data: data,
        borderColor: '#FF2BAC',
        backgroundColor: 'rgba(255, 43, 172, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₱' + value.toFixed(0)
            }
          }
        }
      }
    }
  })
}

function getDeliveryStatusClass(status) {
  const statusMap = {
    'delivered': 'status-completed',
    'in_transit': 'status-pending',
    'assigned': 'status-pending',
    'pending': 'status-pending'
  }
  return statusMap[status] || 'status-pending'
}

function closeRiderPerformanceModal() {
  const modal = document.getElementById('riderPerformanceModal')
  if (modal) {
    modal.style.display = 'none'
    if (earningsChart) {
      earningsChart.destroy()
      earningsChart = null
    }
  }
}

function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase()
  const rows = document.querySelectorAll('#ridersTableBody tr')
  
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
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showError(message) {
  const tbody = document.getElementById('ridersTableBody')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
          ${escapeHtml(message)}
        </td>
      </tr>
    `
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('riderPerformanceModal')
  if (event.target === modal) {
    closeRiderPerformanceModal()
  }
}

