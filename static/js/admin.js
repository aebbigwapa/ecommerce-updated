// Admin Dashboard JavaScript

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const sidebar = document.getElementById("adminSidebar")
  const sidebarToggle = document.getElementById("sidebarToggle")
  const mobileToggle = document.getElementById("mobileToggle")

  // Create overlay for mobile
  const overlay = document.createElement("div")
  overlay.className = "sidebar-overlay"
  document.body.appendChild(overlay)

  // Sidebar Toggle (Desktop)
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed")
    })
  }

  // Mobile Toggle
  if (mobileToggle) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.add("active")
      overlay.classList.add("active")
    })
  }

  // Close sidebar when clicking overlay
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("active")
    overlay.classList.remove("active")
  })

  // Logout handler
  const logoutBtn = document.querySelector(".logout-btn")
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault()
      if (confirm("Are you sure you want to logout?")) {
        try {
          // Call logout API to clear server-side session
          await API.post('/auth/logout', {})
        } catch (error) {
          console.log('Logout API call failed, but continuing with client-side logout')
        }
        
        // Clear client-side tokens and session data
        TokenManager.remove()
        sessionStorage.clear()
        
        // Redirect to home page
        window.location.href = '/'
      }
    })
  }

  // Search functionality
  const searchInput = document.querySelector(".search-box input")
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase()
      // Add your search logic here
    })
  }

  // Notification button is wired via NotificationManager below
  const notificationBtnIcon = document.querySelector(".topbar-action .fa-bell")
  if (notificationBtnIcon && notificationBtnIcon.parentElement) {
    notificationBtnIcon.parentElement.id = notificationBtnIcon.parentElement.id || 'adminNotificationButton'
  }

  // Message button
  const messageBtn = document.querySelector(".topbar-action .fa-envelope")
  if (messageBtn) {
    messageBtn.parentElement.addEventListener("click", () => {
      // Add your message logic here
    })
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) {
      sidebar.classList.remove("active")
      overlay.classList.remove("active")
    }
  })

  // API Configuration
  const API_CONFIG = {
    baseURL: "/api", // relative to current origin to ensure cookies/sessions work
    timeout: 10000,
  }

  // Token management - Using unified AuthManager
  const TokenManager = {
    get: () => {
      if (typeof AuthManager !== 'undefined') {
        return AuthManager.getAuthToken();
      }
      // Fallback for backwards compatibility
      return localStorage.getItem("auth_token") || localStorage.getItem("token") || localStorage.getItem("admin_token");
    },
    set: (token) => {
      if (typeof AuthManager !== 'undefined') {
        // This should be handled by AuthManager.saveAuthState instead
        console.warn('Use AuthManager.saveAuthState instead of TokenManager.set');
      }
      localStorage.setItem("auth_token", token);
      localStorage.setItem("token", token);
      localStorage.setItem("admin_token", token);
    },
    remove: () => {
      if (typeof AuthManager !== 'undefined') {
        AuthManager.logout();
        return;
      }
      // Fallback cleanup
      localStorage.removeItem("auth_token");
      localStorage.removeItem("token");
      localStorage.removeItem("admin_token");
    },
    isValid: () => {
      if (typeof AuthManager !== 'undefined') {
        return AuthManager.isLoggedIn();
      }
      return !!TokenManager.get();
    },
  }

  // API utility functions
  const API = {
    async request(endpoint, options = {}) {
      const token = TokenManager.get()
      const headers = {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      }

      try {
        const response = await fetch(`${API_CONFIG.baseURL}${endpoint}`, {
          ...options,
          headers,
          credentials: 'same-origin',
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Request failed")
        }

        return data
      } catch (error) {
        console.error("[v0] API request failed:", error)
        throw error
      }
    },

    get(endpoint) {
      return this.request(endpoint, { method: "GET" })
    },

    post(endpoint, body) {
      return this.request(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    put(endpoint, body) {
      return this.request(endpoint, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    },

    delete(endpoint) {
      return this.request(endpoint, { method: "DELETE" })
    },
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, (m) => map[m]);
  }

  // UI utility functions
  const UI = {
    showLoading(container) {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 60px;">
          <div style="text-align: center;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: var(--primary-color); margin-bottom: 15px;"></i>
            <p style="color: var(--text-secondary);">Loading...</p>
          </div>
        </div>
      `
    },

    showError(container, message) {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 60px;">
          <div style="text-align: center;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #f5576c; margin-bottom: 15px;"></i>
            <p style="color: var(--text-secondary); margin-bottom: 10px;">Error loading data</p>
            <p style="color: var(--text-muted); font-size: 14px;">${message}</p>
            <button onclick="location.reload()" class="btn-secondary" style="margin-top: 20px;">
              <i class="fas fa-redo"></i> Retry
            </button>
          </div>
        </div>
      `
    },

    showEmpty(container, message) {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 60px;">
          <div style="text-align: center;">
            <i class="fas fa-inbox" style="font-size: 48px; color: var(--gray-400); margin-bottom: 15px;"></i>
            <p style="color: var(--text-secondary);">${message}</p>
          </div>
        </div>
      `
    },

    formatDate(dateString) {
      if (!dateString) return "N/A"
      const date = new Date(dateString)
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    },

    formatCurrency(amount) {
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(amount)
    },
  }

  // Notification manager for admin topbar
  const NotificationManager = {
    state: {
      items: [],
      unreadCount: 0,
      isOpen: false,
      eventSource: null,
    },

    init() {
      const button = document.getElementById('adminNotificationButton')
      const dropdown = document.getElementById('adminNotificationDropdown')
      const markAllBtn = document.getElementById('adminNotificationMarkAll')
      if (!button || !dropdown) return

      button.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggleDropdown()
      })

      if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.markAllRead()
        })
      }

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !button.contains(e.target)) {
          this.closeDropdown()
        }
      })

      this.fetchInitial()
      this.setupStream()
    },

    async fetchInitial() {
      try {
        const data = await API.get('/notifications')
        if (!data || data.error) return
        this.state.items = data.notifications || []
        this.state.unreadCount = data.unread_count || 0
        this.render()
      } catch (e) {
        console.warn('[Notifications] Failed to fetch initial notifications:', e)
      }
    },

    setupStream() {
      const token = TokenManager.get()
      if (!token || typeof EventSource === 'undefined') return

      try {
        const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`
        const es = new EventSource(url)
        this.state.eventSource = es

        es.onmessage = (event) => {
          if (!event.data) return
          try {
            const payload = JSON.parse(event.data)
            if (!payload || !payload.id) return
            // Prepend new notification and cap list length
            this.state.items = [payload, ...this.state.items].slice(0, 50)
            if (!payload.is_read) {
              this.state.unreadCount += 1
            }
            this.render()
          } catch (err) {
            console.warn('[Notifications] Failed to parse SSE payload:', err)
          }
        }

        es.onerror = (err) => {
          console.warn('[Notifications] SSE error, closing stream', err)
          es.close()
          this.state.eventSource = null
        }
      } catch (e) {
        console.warn('[Notifications] Failed to create SSE connection:', e)
      }
    },

    toggleDropdown() {
      this.state.isOpen = !this.state.isOpen
      const dropdown = document.getElementById('adminNotificationDropdown')
      if (dropdown) {
        dropdown.classList.toggle('open', this.state.isOpen)
      }
    },

    closeDropdown() {
      this.state.isOpen = false
      const dropdown = document.getElementById('adminNotificationDropdown')
      if (dropdown) {
        dropdown.classList.remove('open')
      }
    },

    async markRead(id) {
      try {
        await API.put(`/notifications/${id}/read`, {})
        this.state.items = this.state.items.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        )
        this.state.unreadCount = this.state.items.filter((n) => !n.is_read).length
        this.render()
      } catch (e) {
        console.warn('[Notifications] Failed to mark as read:', e)
      }
    },

    async markAllRead() {
      try {
        await API.put('/notifications/read-all', {})
        this.state.items = this.state.items.map((n) => ({ ...n, is_read: true }))
        this.state.unreadCount = 0
        this.render()
      } catch (e) {
        console.warn('[Notifications] Failed to mark all as read:', e)
      }
    },

    render() {
      const dot = document.getElementById('adminNotificationDot')
      const list = document.getElementById('adminNotificationList')
      if (dot) {
        dot.style.display = this.state.unreadCount > 0 ? 'block' : 'none'
      }
      if (!list) return

      if (!this.state.items.length) {
        list.innerHTML = '<div class="notification-empty">No notifications yet</div>'
        return
      }

      list.innerHTML = this.state.items
        .map((n) => {
          const timeAgo = n.time_ago || ''
          const readClass = n.is_read ? 'is-read' : 'is-unread'
          const msg = escapeHtml(n.message || '')
          return `
            <div class="notification-item ${readClass}" data-id="${n.id}">
              <div class="notification-main">
                <div class="notification-message">${msg}</div>
                ${timeAgo ? `<div class="notification-meta">${timeAgo}</div>` : ''}
              </div>
            </div>
          `
        })
        .join('')

      // Attach click handlers for each item to mark as read
      list.querySelectorAll('.notification-item').forEach((el) => {
        const id = parseInt(el.getAttribute('data-id'), 10)
        el.onclick = () => {
          this.markRead(id)
        }
      })
    },
  }

  // Dashboard specific functions
  const Dashboard = {
    commissionChartInstance: null,

    async loadStats(range) {
      try {
        // Store current commissions for PDF download
        this.currentCommissions = null
        
        const qs = range ? `?range=${range}` : ''
        const data = await API.get(`/admin/stats${qs}`)

        if (data.success && data.stats) {
          this.updateStatsCards(data.stats)
          this.updateNavigationBadges(data.stats)
          this.updateRecentCommissions(data.stats.recent_commissions || [])
          this.currentCommissions = data.stats.recent_commissions || []
          this.updateCommissionChart(data.stats.commission_data || [])
          
          // Update chart subtitle based on range
          const subtitle = document.querySelector('.card-subtitle')
          if (subtitle) {
            const rangeText = range === 'week' ? 'Last 7 days' : 
                             range === '1' ? 'Last month' :
                             range === '3' ? 'Last 3 months' :
                             range === '6' ? 'Last 6 months' :
                             range === '12' ? 'Last 12 months' : 'Monthly admin commission'
            subtitle.textContent = rangeText
          }
        }
      } catch (error) {
        console.error("[Admin] Failed to load dashboard stats:", error)
      }
    },

    async updateNavigationBadges(stats) {
      // Update pending user registrations badge
      try {
        const pendingUsers = await API.get("/admin/pending-users")
        const pendingBadge = document.getElementById('pendingUsersBadge')
        if (pendingBadge && pendingUsers.success) {
          const count = (pendingUsers.pending_users || []).length
          pendingBadge.textContent = count
          pendingBadge.style.display = count > 0 ? 'inline' : 'none'
        }
      } catch (error) {
        console.error('Error updating pending users badge:', error)
      }

      // Update seller applications badge with actual count
      try {
        const sellerData = await API.get("/admin/applications?type=seller&status=pending")
        const sellerBadge = document.getElementById('sellerAppsBadge')
        if (sellerBadge && sellerData.success) {
          const count = sellerData.applications.length
          sellerBadge.textContent = count
          sellerBadge.style.display = count > 0 ? 'inline' : 'none'
        }
      } catch (error) {
        console.error('Error updating seller badge:', error)
      }
      
      // Update rider applications badge with actual count
      try {
        const riderData = await API.get("/admin/applications?type=rider&status=pending")
        const riderBadge = document.getElementById('riderAppsBadge')
        if (riderBadge && riderData.success) {
          const count = riderData.applications.length
          riderBadge.textContent = count
          riderBadge.style.display = count > 0 ? 'inline' : 'none'
        }
      } catch (error) {
        console.error('Error updating rider badge:', error)
      }

      // Update flash sales pending badge
      try {
        const fsData = await API.get("/admin/flash-sales?status=pending")
        const fsBadge = document.getElementById('flashSalesBadge')
        if (fsBadge && fsData.success) {
          const count = (fsData.items || []).length
          fsBadge.textContent = count
          fsBadge.style.display = count > 0 ? 'inline' : 'none'
        }
      } catch (error) {
        console.error('Error updating flash sales badge:', error)
      }

      // Update pending products moderation badge
      try {
        const prodData = await API.get('/admin/products?status=pending')
        const prodBadge = document.getElementById('productsBadge')
        if (prodBadge && prodData.success) {
          const count = (prodData.products || []).length
          prodBadge.textContent = count
          prodBadge.style.display = count > 0 ? 'inline' : 'none'
        }
      } catch (error) {
        console.error('Error updating products badge:', error)
      }
    },

    updateStatsCards(stats) {
      const statsGrid = document.querySelector(".stats-grid")
      if (!statsGrid) return

      const totalEarnings = stats.admin_total_earnings || 0
      const monthEarnings = stats.admin_month_earnings || 0
      const todayEarnings = stats.admin_today_earnings || 0
      const totalOrders = stats.total_orders || 0
      const totalProducts = stats.total_products || 0
      const pendingOrders = stats.pending_orders || 0
      const pendingDeliveries = stats.pending_deliveries || 0

      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #FF2BAC 0%, #FF6BCE 100%);">
            <i class="fas fa-dollar-sign"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">₱${totalEarnings.toFixed(2)}</h3>
            <p class="stat-label">Total Earnings (Admin Commission)</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <i class="fas fa-calendar-alt"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">₱${monthEarnings.toFixed(2)}</h3>
            <p class="stat-label">This Month</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <i class="fas fa-calendar-day"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">₱${todayEarnings.toFixed(2)}</h3>
            <p class="stat-label">Today</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <i class="fas fa-shopping-cart"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">${totalOrders}</h3>
            <p class="stat-label">Total Orders</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <i class="fas fa-box"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">${totalProducts}</h3>
            <p class="stat-label">Total Products</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
            <i class="fas fa-clock"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">${pendingOrders}</h3>
            <p class="stat-label">Pending Orders</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
            <i class="fas fa-truck"></i>
          </div>
          <div class="stat-details">
            <h3 class="stat-value">${pendingDeliveries}</h3>
            <p class="stat-label">Pending Deliveries</p>
          </div>
        </div>
      `
    },

    updateRecentCommissions(commissions) {
      const container = document.getElementById('recentCommissions')
      if (!container) return

      if (!commissions.length) {
        UI.showEmpty(container, 'No recent commissions yet')
        return
      }

      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Product Subtotal</th>
              <th>Commission (5%)</th>
            </tr>
          </thead>
          <tbody>
            ${commissions.map(row => `
              <tr>
                <td>${row.order_number}</td>
                <td>${UI.formatDate(row.created_at)}</td>
                <td>₱${parseFloat(row.product_subtotal || 0).toFixed(2)}</td>
                <td><span class="status-badge status-completed">₱${parseFloat(row.admin_commission || 0).toFixed(2)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    },

    downloadCommissionsPDF() {
      if (!this.currentCommissions || this.currentCommissions.length === 0) {
        alert('No commission data available to download')
        return
      }

      if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please refresh the page.')
        return
      }

      const { jsPDF } = window.jspdf
      const doc = new jsPDF()

      // Title
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Recent Commissions Report', 14, 20)

      // Date
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Generated: ${dateStr}`, 14, 28)

      // Summary
      const totalSubtotal = this.currentCommissions.reduce((sum, c) => sum + parseFloat(c.product_subtotal || 0), 0)
      const totalCommission = this.currentCommissions.reduce((sum, c) => sum + parseFloat(c.admin_commission || 0), 0)

      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Summary', 14, 40)
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      let y = 48
      doc.text(`Total Orders: ${this.currentCommissions.length}`, 14, y)
      y += 8
      doc.text(`Total Product Subtotal: PHP ${totalSubtotal.toFixed(2)}`, 14, y)
      y += 8
      doc.text(`Total Commission (5%): PHP ${totalCommission.toFixed(2)}`, 14, y)
      y += 12

      // Format date helper
      const formatDate = (dateString) => {
        if (!dateString) return 'N/A'
        try {
          const date = new Date(dateString)
          return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })
        } catch (e) {
          return 'N/A'
        }
      }

      // Format currency helper - use PHP for PDF compatibility (jsPDF doesn't support peso symbol)
      const formatCurrency = (value) => {
        const num = parseFloat(value || 0)
        // Use PHP instead of ₱ for PDF compatibility
        return `PHP ${num.toFixed(2)}`
      }

      // Table
      doc.autoTable({
        startY: y,
        head: [['Order #', 'Date', 'Product Subtotal', 'Commission (5%)']],
        body: this.currentCommissions.map(c => [
          c.order_number || 'N/A',
          formatDate(c.created_at),
          formatCurrency(c.product_subtotal),
          formatCurrency(c.admin_commission)
        ]),
        theme: 'striped',
        headStyles: { 
          fillColor: [99, 102, 241], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'left',
          cellPadding: 5
        },
        styles: { 
          fontSize: 9,
          cellPadding: 5,
          halign: 'left',
          valign: 'middle',
          lineWidth: 0.1,
          lineColor: [200, 200, 200]
        },
        columnStyles: {
          0: { cellWidth: 50, halign: 'left' },
          1: { cellWidth: 45, halign: 'left' },
          2: { cellWidth: 50, halign: 'right', cellPadding: 5 },
          3: { cellWidth: 50, halign: 'right', cellPadding: 5 }
        },
        margin: { left: 14, right: 14, top: 0, bottom: 20 },
        tableWidth: 'wrap',
        showHead: 'everyPage',
        showFoot: 'never',
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        didParseCell: function(data) {
          // Ensure currency columns are right-aligned
          if (data.column.index === 2 || data.column.index === 3) {
            data.cell.styles.halign = 'right'
          }
        }
      })

      // Footer
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setFont(undefined, 'normal')
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }

      // Save
      const filename = `recent-commissions-${now.toISOString().split('T')[0]}.pdf`
      doc.save(filename)
    },

    updateCommissionChart(commissionData) {
      // Handle both old format (monthly) and new format (commissionData)
      const monthly = commissionData || []
      const container = document.getElementById('commissionChartContainer')
      const canvas = document.getElementById('commissionChartCanvas')
      if (!container || !canvas) return

      if (!monthly.length) {
        if (this.commissionChartInstance) {
          this.commissionChartInstance.destroy()
          this.commissionChartInstance = null
        }
        container.innerHTML = '<div style="text-align:center; color:#6b7280; padding:20px;">No commission data yet</div>'
        return
      }

      // If Chart.js is not loaded, fall back to simple text rendering
      if (typeof Chart === 'undefined') {
        const max = Math.max(...monthly.map(m => m.total_commission || 0)) || 1
        container.innerHTML = `
          <div style="width:100%; padding:8px 12px; font-size:12px;">
            ${monthly.map(m => {
              const value = m.total_commission || 0
              const width = Math.max(4, (value / max) * 100)
              return `
                <div style="display:flex; align-items:center; margin-bottom:4px;">
                  <div style="width:70px; color:#6b7280;">${m.label}</div>
                  <div style="flex:1; background:#e5e7eb; border-radius:999px; overflow:hidden; margin:0 8px;">
                    <div style="width:${width}%; background:linear-gradient(90deg,#FF2BAC,#FF6BCE); height:10px;"></div>
                  </div>
                  <div style="width:80px; text-align:right; color:#111827;">₱${value.toFixed(2)}</div>
                </div>
              `
            }).join('')}
          </div>
        `
        return
      }

      // Ensure container holds the canvas (in case fallback rewrote it)
      if (!canvas.getContext) {
        container.innerHTML = '<canvas id="commissionChartCanvas"></canvas>'
      }
      const ctx = document.getElementById('commissionChartCanvas').getContext('2d')

      const labels = monthly.map(m => m.label)
      const dataValues = monthly.map(m => m.total_commission || 0)
      
      // Calculate max value for better scaling
      const maxCommission = Math.max(...dataValues, 0)
      const suggestedMax = maxCommission > 0 ? Math.ceil(maxCommission * 1.2) : 100

      if (this.commissionChartInstance) {
        this.commissionChartInstance.data.labels = labels
        this.commissionChartInstance.data.datasets[0].data = dataValues
        this.commissionChartInstance.options.scales.y.max = suggestedMax
        this.commissionChartInstance.update()
      } else {
        this.commissionChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Admin Commission (₱)',
              data: dataValues,
              backgroundColor: 'rgba(255, 43, 172, 0.6)',
              borderColor: 'rgba(255, 43, 172, 1)',
              borderWidth: 2,
              borderRadius: 4,
              barThickness: 'flex',
              maxBarThickness: 50
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
              padding: {
                top: 10,
                bottom: 10,
                left: 10,
                right: 10
              }
            },
            scales: {
              x: {
                grid: {
                  display: false
                },
                ticks: {
                  maxRotation: 45,
                  minRotation: 0
                }
              },
              y: {
                beginAtZero: true,
                max: suggestedMax,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)'
                },
                ticks: {
                  callback: function (value) { 
                    return '₱' + value.toFixed(0)
                  },
                  stepSize: suggestedMax > 100 ? Math.ceil(suggestedMax / 10) : 10
                }
              }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const v = context.parsed.y || 0
                    return '₱' + v.toFixed(2)
                  }
                }
              }
            }
          }
        })
      }
    },

    async loadRecentOrders() {
      const tableContainer = document.querySelector("#recentOrdersTable")
      const tbody = document.querySelector("#recentOrdersTable .data-table tbody")
      if (!tbody || !tableContainer) return

      try {
        UI.showLoading(tableContainer)

        // Use the admin orders endpoint that should return recent orders
        const data = await API.get("/admin/orders?limit=5")

        if (data.success && data.orders && data.orders.length > 0) {
          // Restore table structure
          tableContainer.innerHTML = `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.orders.map(order => `
                  <tr>
                    <td>${order.order_number}</td>
                    <td>
                      <div class="customer-cell">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ccircle cx='20' cy='20' r='18' fill='%23e5e7eb'/%3E%3Cpath d='M20 12c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 10c-3.3 0-6 1.3-6 3v2h12v-2c0-1.7-2.7-3-6-3z' fill='%239ca3af'/%3E%3C/svg%3E" alt="Customer">
                        <span>${order.full_name || "N/A"}</span>
                      </div>
                    </td>
                    <td>Order Items</td>
                    <td>₱${parseFloat(order.total_amount || 0).toFixed(2)}</td>
                    <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                    <td>${UI.formatDate(order.created_at)}</td>
                    <td>
                      <button class="action-icon" onclick="viewOrder(${order.id})" title="View Order">
                        <i class="fas fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
        } else {
          UI.showEmpty(tableContainer, "No recent orders found")
        }
      } catch (error) {
        console.error('Error loading recent orders:', error)
        UI.showError(tableContainer, error.message || 'Failed to load recent orders')
      }
    },
  }

  // Product Moderation
  const ProductModeration = {
    state: { status: 'pending', rows: [] },

    renderLayout() {
      const container = document.getElementById('adminContent')
      if (!container) return
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Product Moderation</h1>
          <p class="page-subtitle">Review and approve products submitted by sellers before they go live.</p>
        </div>
        <div class="data-card">
          <div class="card-header" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
            <h2 class="card-title" style="margin:0;">Products</h2>
            <div class="d-flex align-items-center gap-2">
              <label class="text-muted" for="pmStatus">Status</label>
              <select id="pmStatus" class="form-select" style="min-width:160px;">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            <div class="d-flex align-items-center gap-2">
              <label class="text-muted" for="pmSellerFilter">Seller</label>
              <input id="pmSellerFilter" class="form-input" placeholder="ID, name, or email" style="min-width:220px;">
            </div>
          </div>
          <div class="table-container" id="productsTable">
            <div class="loading-placeholder">Loading products...</div>
          </div>
        </div>
      `
      const sel = document.getElementById('pmStatus')
      if (sel) {
        sel.value = this.state.status
        sel.addEventListener('change', () => { this.state.status = sel.value; this.load() })
      }
      const sellerInput = document.getElementById('pmSellerFilter')
      if (sellerInput) {
        sellerInput.addEventListener('input', () => this.renderTable(this.applySellerFilter(this.state.rows)))
      }
    },

    applySellerFilter(items) {
      const q = (document.getElementById('pmSellerFilter')?.value || '').trim().toLowerCase()
      if (!q) return items
      return items.filter(p => 
        String(p.seller_id || '').includes(q) ||
        (p.seller_name || '').toLowerCase().includes(q) ||
        (p.seller_email || '').toLowerCase().includes(q)
      )
    },

    renderTable(items) {
      const tableContainer = document.getElementById('productsTable')
      if (!tableContainer) return
      if (!items.length) { UI.showEmpty(tableContainer, 'No products found for this filter'); return }
      tableContainer.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Seller</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => `
              <tr>
                <td>#${p.id}</td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <img src="${(p.image_url || '/static/uploads/products/placeholder.svg')}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)" alt="">
                    <div>
                      <div class="fw-medium">${escapeHtml(p.name || 'Product')}</div>
                      <small class="text-muted">${(p.total_stock ?? 0)} in stock</small>
                    </div>
                  </div>
                </td>
                <td>${escapeHtml(p.category || '-')}</td>
                <td>
                  <div class="d-flex flex-column">
                    <span>${escapeHtml(p.seller_name || ('Seller #' + (p.seller_id || '')))}</span>
                    <small class="text-muted">${escapeHtml(p.seller_email || '')}</small>
                  </div>
                </td>
                <td><span class="status-badge status-${(p.approval_status || 'pending').toLowerCase()}">${(p.approval_status || 'pending')}</span></td>
                <td>${UI.formatDate(p.created_at)}</td>
                  <td>
                    <button class="action-icon" title="View Details" onclick="ProductModeration.view(${p.id})"><i class="fas fa-eye"></i></button>
                    ${p.approval_status === 'pending' ? `
                      <button class="action-icon" title="Approve" onclick="ProductModeration.approve(${p.id})"><i class="fas fa-check"></i></button>
                      <button class="action-icon" title="Reject" onclick="ProductModeration.reject(${p.id})"><i class="fas fa-times"></i></button>
                    ` : ''}
                    <button class="action-icon" title="Enforce (warn/suspend/disable)" onclick="ProductModeration.openEnforce(${p.seller_id})"><i class="fas fa-gavel"></i></button>
                  </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    },

    async load() {
      const tableContainer = document.getElementById('productsTable')
      if (!tableContainer) return
      UI.showLoading(tableContainer)
      try {
        const q = this.state.status === 'all' ? '' : `?status=${this.state.status}`
        const data = await API.get(`/admin/products${q}`)
        if (!data.success) throw new Error(data.error || 'Failed to load products')
        const items = data.products || []
        this.state.rows = items
        this.renderTable(this.applySellerFilter(items))
      } catch (e) {
        UI.showError(tableContainer, e.message || 'Failed to load products')
      }
    },

    openEnforce(sellerId) {
      try {
        const action = prompt("Enter action for seller (warn/suspend/disable/reinstate):")
        if (!action) return
        const a = action.trim().toLowerCase()
        if (a === 'reinstate') {
          const reason = prompt('Reason (optional):') || ''
          this.callReinstate(sellerId, reason)
          return
        }
        if (!['warn','suspend','disable'].includes(a)) {
          alert('Invalid action. Use warn, suspend, disable, or reinstate.')
          return
        }
        const reason = prompt('Reason (optional):') || ''
        let duration = null
        if (a === 'suspend') {
          const d = prompt('Duration in days (leave blank for indefinite):')
          if (d && !isNaN(parseInt(d))) duration = parseInt(d)
        }
        this.callEnforce(sellerId, a, reason, duration)
      } catch (e) { alert('Failed to start enforcement: ' + (e.message || e)) }
    },

    async callEnforce(sellerId, action, reason, duration_days) {
      try {
        const res = await API.post(`/admin/sellers/${sellerId}/enforce`, { action, reason, duration_days })
        if (res.success) { alert('Action applied'); Dashboard.updateNavigationBadges({}); }
      } catch (e) { alert('Enforcement failed: ' + (e.message || e)) }
    },

    async callReinstate(sellerId, reason) {
      try {
        const res = await API.post(`/admin/sellers/${sellerId}/reinstate`, { reason })
        if (res.success) { alert('Seller reinstated'); Dashboard.updateNavigationBadges({}); }
      } catch (e) { alert('Reinstate failed: ' + (e.message || e)) }
    },

    async approve(id) {
      if (!confirm('Approve this product?')) return
      try {
        const res = await API.post(`/admin/products/${id}/approve`, {})
        if (res.success) { 
          alert(res.message || 'Approved successfully.')
          await this.load(); 
          Dashboard.updateNavigationBadges({}); 
        }
      } catch (e) { alert('Approve failed: ' + e.message) }
    },

    async reject(id) {
      if (!confirm('Reject this product?')) return
      try {
        const res = await API.post(`/admin/products/${id}/reject`, {})
        if (res.success) { await this.load(); Dashboard.updateNavigationBadges({}); }
      } catch (e) { alert('Reject failed: ' + e.message) }
    },

    ensureModal() {
      if (document.getElementById('pmModal')) return
      const modal = document.createElement('div')
      modal.id = 'pmModal'
      modal.className = 'modal'
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
          <div class="modal-header">
            <h2 id="pmModalTitle" class="modal-title">Product Details</h2>
            <button class="modal-close" onclick="ProductModeration.closeModal()">&times;</button>
          </div>
          <div class="modal-body" id="pmModalBody"></div>
          <div class="modal-footer" id="pmModalActions"></div>
        </div>
      `
      document.body.appendChild(modal)
    },

    closeModal() {
      const m = document.getElementById('pmModal')
      if (m) m.classList.remove('show')
    },

    async view(id) {
      try {
        this.ensureModal()
        const titleEl = document.getElementById('pmModalTitle')
        const bodyEl = document.getElementById('pmModalBody')
        const actEl = document.getElementById('pmModalActions')
        titleEl.textContent = `Product #${id}`
        bodyEl.innerHTML = '<div style="text-align:center; padding: 24px; color:#666;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>'
        actEl.innerHTML = ''

        const data = await API.get(`/admin/products/${id}`)
        if (!data.success) throw new Error(data.error || 'Failed to load product')
        const p = data.product || data

        // Build variant table if available
        let variantsHTML = ''
        const scs = p.size_color_stock || {}
        if (Object.keys(scs).length) {
          variantsHTML = `
            <div class="mt-3">
              <h3 style="margin: 0 0 8px 0; font-size: 1rem;">Variants</h3>
              <div class="table-responsive">
                <table class="data-table">
                  <thead><tr><th>Size</th><th>Color</th><th>Stock</th><th>Price</th><th>Discount</th></tr></thead>
                  <tbody>
                    ${Object.entries(scs).map(([size, colors]) => Object.entries(colors).map(([hex, v]) => `
                      <tr>
                        <td>${size}</td>
                        <td><div class="d-flex align-items-center gap-2"><span class="color-dot" style="width:14px;height:14px;border-radius:50%;background:${hex};border:1px solid #ccc;"></span>${v.name || hex}</div></td>
                        <td>${v.stock || 0}</td>
                        <td>₱${(v.price||0).toFixed(2)}</td>
                        <td>${v.discount_price ? `₱${parseFloat(v.discount_price).toFixed(2)}` : '-'}</td>
                      </tr>
                    `).join('')).join('')}
                  </tbody>
                </table>
              </div>
            </div>`
        }

        // Get variant images if available
        let imagesHTML = ''
        if (p.variant_images && p.variant_images.length > 0) {
          imagesHTML = `
            <div class="mt-3">
              <h3 style="margin: 0 0 8px 0; font-size: 1rem;">Product Images</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${p.variant_images.map(img => `
                  <img src="${img.image_url || img}" alt="Product image" style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);">
                `).join('')}
              </div>
            </div>`
        }

        const img = p.image_url || p.image || '/static/image.png'
        const desc = p.description || ''
        const name = p.name || 'Product'
        const cat = p.category || '-'
        const sellerName = p.seller_name || 'Unknown Seller'
        const stock = p.total_stock || 0
        const price = p.price || 0
        const isFlashSale = p.is_flash_sale ? 'Yes' : 'No'

        bodyEl.innerHTML = `
          <div class="row" style="display:flex; gap:16px;">
            <div style="flex:0 0 220px;">
              <img src="${img}" alt="${name}" style="width:220px;height:220px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color)">
            </div>
            <div style="flex:1; min-width:0;">
              <h3 style="margin:0 0 6px 0;">${escapeHtml(name)}</h3>
              <div class="text-muted" style="margin-bottom:8px;">
                <div><strong>Category:</strong> ${escapeHtml(cat)}</div>
                <div><strong>Seller:</strong> ${escapeHtml(sellerName)}</div>
                <div><strong>Price:</strong> ₱${parseFloat(price).toFixed(2)}</div>
                <div><strong>Total Stock:</strong> ${stock}</div>
                <div><strong>Flash Sale:</strong> ${isFlashSale}</div>
              </div>
              <div style="margin-top: 12px;">
                <strong>Description:</strong>
                <p style="white-space:pre-wrap; margin-top: 4px;">${escapeHtml(desc)}</p>
              </div>
              ${variantsHTML}
              ${imagesHTML}
            </div>
          </div>
        `

        // Show modal
        const modal = document.getElementById('pmModal')
        if (modal) modal.classList.add('show')
      } catch (e) {
        alert('Failed to load product details: ' + e.message)
      }
    }
  }

  // Flash Sales management
  const FlashSales = {
    state: { status: 'pending' },

    renderLayout() {
      const container = document.getElementById('adminContent')
      if (!container) return
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Flash Sales Management</h1>
          <p class="page-subtitle">Review, approve, or decline flash sale requests from sellers.</p>
        </div>
        <div class="data-card">
          <div class="card-header" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
            <h2 class="card-title" style="margin:0;">Requests</h2>
            <div class="d-flex align-items-center gap-2">
              <label class="text-muted" for="fsStatus">Status</label>
              <select id="fsStatus" class="form-select" style="min-width:160px;">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div class="table-container" id="flashSalesTable">
            <div class="loading-placeholder">Loading flash sales...</div>
          </div>
        </div>
      `
      const sel = document.getElementById('fsStatus')
      if (sel) {
        sel.value = this.state.status
        sel.addEventListener('change', () => {
          this.state.status = sel.value
          this.load()
        })
      }
    },

    async load() {
      const tableContainer = document.getElementById('flashSalesTable')
      if (!tableContainer) return
      UI.showLoading(tableContainer)
      try {
        const data = await API.get(`/admin/flash-sales?status=${this.state.status}`)
        if (!data.success) throw new Error(data.error || 'Failed to load')
        const items = data.items || []
        this.state.items = items
        if (!items.length) { UI.showEmpty(tableContainer, 'No flash sale items found'); return }
        tableContainer.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Seller</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <img src="${item.image_url || '/static/image.png'}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">
                      <div>
                        <div class="fw-medium">${item.name || 'Product'}</div>
                        <small class="text-muted">#${item.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>${item.seller_id || '-'}</td>
                  <td><span class="status-badge status-${(item.flash_sale_status||'').toLowerCase()}">${(item.flash_sale_status||'').charAt(0).toUpperCase()+ (item.flash_sale_status||'').slice(1)}</span></td>
                  <td>${UI.formatDate(item.created_at)}</td>
                  <td>
                    <button class="action-icon" title="View Details" onclick="FlashSales.view(${item.id})"><i class="fas fa-eye"></i></button>
                    ${item.flash_sale_status === 'pending' ? `
                      <button class="action-icon" title="Approve" onclick="FlashSales.approve(${item.id})"><i class="fas fa-check"></i></button>
                      <button class="action-icon" title="Decline" onclick="FlashSales.decline(${item.id})"><i class="fas fa-times"></i></button>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
        
      } catch (e) {
        UI.showError(tableContainer, e.message || 'Failed to load')
      }
    },

    ensureModal() {
      if (document.getElementById('fsModal')) return
      const modal = document.createElement('div')
      modal.id = 'fsModal'
      modal.className = 'modal'
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
          <div class="modal-header">
            <h2 id="fsModalTitle" class="modal-title">Product Details</h2>
            <button class="modal-close" onclick="FlashSales.closeModal()">&times;</button>
          </div>
          <div class="modal-body" id="fsModalBody" style="max-height: 70vh; overflow:auto;"></div>
          <div class="modal-actions" id="fsModalActions" style="display:flex; gap:8px; justify-content:flex-end; padding: 8px 16px;"></div>
        </div>`
      document.body.appendChild(modal)
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal() })
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeModal() })
    },

    closeModal() {
      const m = document.getElementById('fsModal')
      if (m) m.classList.remove('show')
    },

    async view(id) {
      try {
        this.ensureModal()
        const titleEl = document.getElementById('fsModalTitle')
        const bodyEl = document.getElementById('fsModalBody')
        const actEl = document.getElementById('fsModalActions')
        titleEl.textContent = `Product #${id}`
        bodyEl.innerHTML = '<div style="text-align:center; padding: 24px; color:#666;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>'
        actEl.innerHTML = ''

        const res = await fetch(`/api/products/${id}`)
        const data = await res.json()
        const p = data.product || data

        // Build variant table if available
        let variantsHTML = ''
        const scs = p.size_color_stock || {}
        if (Object.keys(scs).length) {
          variantsHTML = `
            <div class="mt-3">
              <h3 style="margin: 0 0 8px 0; font-size: 1rem;">Variants</h3>
              <div class="table-responsive">
                <table class="data-table">
                  <thead><tr><th>Size</th><th>Color</th><th>Stock</th><th>Price</th><th>Discount</th></tr></thead>
                  <tbody>
                    ${Object.entries(scs).map(([size, colors]) => Object.entries(colors).map(([hex, v]) => `
                      <tr>
                        <td>${size}</td>
                        <td><div class="d-flex align-items-center gap-2"><span class="color-dot" style="width:14px;height:14px;border-radius:50%;background:${hex};border:1px solid #ccc;"></span>${v.name || hex}</div></td>
                        <td>${v.stock || 0}</td>
                        <td>₱${(v.price||0).toFixed(2)}</td>
                        <td>${v.discount_price ? `₱${parseFloat(v.discount_price).toFixed(2)}` : '-'}</td>
                      </tr>
                    `).join('')).join('')}
                  </tbody>
                </table>
              </div>
            </div>`
        }

        const img = p.image_url || p.image || '/static/image.png'
        const desc = p.description || ''
        const name = p.name || 'Product'
        const cat = p.category || '-'

        bodyEl.innerHTML = `
          <div class="row" style="display:flex; gap:16px;">
            <div style="flex:0 0 220px;">
              <img src="${img}" alt="${name}" style="width:220px;height:220px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color)">
            </div>
            <div style="flex:1; min-width:0;">
              <h3 style="margin:0 0 6px 0;">${name}</h3>
              <div class="text-muted" style="margin-bottom:8px;">Category: ${cat}</div>
              <p style="white-space:pre-wrap;">${desc}</p>
              ${variantsHTML}
            </div>
          </div>
        `

        // Actions (approve/decline when pending)
        const item = (this.state.items || []).find(it => it.id === id)
        actEl.innerHTML = ''
        if (item && item.flash_sale_status === 'pending') {
          const approveBtn = document.createElement('button')
          approveBtn.className = 'btn-primary'
          approveBtn.innerHTML = '<i class="fas fa-check"></i> Approve'
          approveBtn.onclick = async () => { await this.approve(id); this.closeModal() }
          const declineBtn = document.createElement('button')
          declineBtn.className = 'btn-danger'
          declineBtn.innerHTML = '<i class="fas fa-times"></i> Decline'
          declineBtn.onclick = async () => { await this.decline(id); this.closeModal() }
          actEl.appendChild(declineBtn)
          actEl.appendChild(approveBtn)
        }

        document.getElementById('fsModal').classList.add('show')
      } catch (e) {
        alert('Failed to load details: ' + (e.message || e))
      }
    },

    async approve(id) {
      if (!confirm('Approve this flash sale?')) return
      try {
        const res = await API.post(`/admin/flash-sales/${id}/approve`, {})
        if (res.success) { this.load(); Dashboard.updateNavigationBadges({}); }
      } catch (e) { alert('Approve failed: ' + e.message) }
    },

    async decline(id) {
      if (!confirm('Decline this flash sale?')) return
      try {
        const res = await API.post(`/admin/flash-sales/${id}/decline`, {})
        if (res.success) { this.load(); Dashboard.updateNavigationBadges({}); }
      } catch (e) { alert('Decline failed: ' + e.message) }
    }
  }

  // Seller Applications functions
  const SellerApplications = {
    async load() {
      const tbody = document.querySelector(".data-table tbody")
      if (!tbody) return

      try {
        // Show loading in tbody only
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i><br>Loading applications...</td></tr>'

        console.log('[SellerApplications] Fetching seller applications...')
        // Use the enhanced API with filtering for seller applications
        const data = await API.get("/admin/applications?type=seller&status=all")
        console.log('[SellerApplications] API Response:', data)

        if (data.success && data.applications) {
          if (data.applications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--gray-600);"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px;"></i><br>No seller applications found</td></tr>'
            return
          }

          // Update badge count (only pending applications)
          const pendingApps = data.applications.filter(app => app.status === 'pending')
          const badge = document.querySelector('#sellerAppsBadge')
          if (badge) {
            badge.textContent = pendingApps.length
            badge.style.display = pendingApps.length > 0 ? 'inline' : 'none'
          }

          // Populate table tbody only
          tbody.innerHTML = data.applications.map((app) => `
            <tr>
              <td>#SA-${String(app.id).padStart(3, "0")}</td>
              <td>
                <div class="customer-cell">
                  <img src="/placeholder.svg?height=32&width=32" alt="Seller">
                  <span>${app.user_name}</span>
                </div>
              </td>
              <td>${app.business_name || "N/A"}</td>
              <td>${this.getCategory(app.experience)}</td>
              <td>${UI.formatDate(app.created_at)}</td>
              <td><span class="status-badge status-${app.status.toLowerCase()}">${this.formatStatus(app.status)}</span></td>
              <td>
                <button class="action-icon" onclick="SellerApplications.viewDetails(${app.id})" title="View Details">
                  <i class="fas fa-eye"></i>
                </button>
                ${app.status === 'pending' ? `
                  <button class="action-icon" onclick="SellerApplications.approve(${app.id})" title="Approve">
                    <i class="fas fa-check"></i>
                  </button>
                  <button class="action-icon" onclick="SellerApplications.reject(${app.id})" title="Reject">
                    <i class="fas fa-times"></i>
                  </button>
                ` : ''}
              </td>
            </tr>
          `).join('')
          
          console.log(`[SellerApplications] Successfully loaded ${data.applications.length} seller applications`)
        } else {
          throw new Error(data.error || 'Failed to fetch applications')
        }
      } catch (error) {
        console.error('[SellerApplications] Error loading applications:', error)
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ef4444;"><i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i><br>Error: ${error.message}<br><button onclick="SellerApplications.load()" class="btn-secondary" style="margin-top: 10px;">Retry</button></td></tr>`
      }
    },

    getCategory(experienceStr) {
      try {
        const exp = JSON.parse(experienceStr || "{}")
        return exp.categories?.[0] || "General"
      } catch {
        return "General"
      }
    },

    formatStatus(status) {
      switch(status.toLowerCase()) {
        case 'pending': return 'Pending'
        case 'approved': return 'Approved'
        case 'rejected': return 'Rejected'
        default: return status
      }
    },

    async approve(appId) {
      if (!confirm("Are you sure you want to approve this application?")) return

      try {
        const data = await API.post(`/admin/applications/${appId}/approve`, {})

        if (data.success) {
          alert("Application approved successfully!")
          this.load()
        }
      } catch (error) {
        alert("Failed to approve application: " + error.message)
      }
    },

    async reject(appId) {
      if (!confirm("Are you sure you want to reject this application?")) return

      try {
        const data = await API.post(`/admin/applications/${appId}/reject`, {})

        if (data.success) {
          alert("Application rejected")
          this.load()
        }
      } catch (error) {
        alert("Failed to reject application: " + error.message)
      }
    },

    async viewDetails(appId) {
      try {
        console.log(`[SellerApplications] Loading details for application ${appId}`)
        
        // Get application details from API
        const data = await API.get(`/admin/applications/${appId}`)
        
        if (data.success && data.application) {
          this.showApplicationModal(data.application)
        } else {
          throw new Error(data.error || 'Application not found')
        }
      } catch (error) {
        console.error('[SellerApplications] Error loading application details:', error)
        alert(`Error loading application details: ${error.message}`)
      }
    },
    
    showApplicationModal(app) {
      const modal = document.getElementById('applicationModal')
      const modalTitle = document.getElementById('modalTitle')
      const modalBody = document.getElementById('modalBody')
      const modalActions = document.getElementById('modalActions')
      
      // Set modal title
      modalTitle.textContent = `Seller Application #SA-${String(app.id).padStart(3, '0')}`
      
      // Parse experience data
      let experience = {}
      try {
        experience = JSON.parse(app.experience || '{}')
      } catch (e) {
        console.warn('Failed to parse experience data:', e)
      }
      
      // Create modal content
      modalBody.innerHTML = `
        <div class="app-detail-section">
          <h3>Basic Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Application ID</label>
              <div class="value">#SA-${String(app.id).padStart(3, '0')}</div>
            </div>
            <div class="app-detail-item">
              <label>Status</label>
              <div class="value">
                <span class="app-status-large ${app.status.toLowerCase()}">
                  <i class="fas fa-${app.status === 'pending' ? 'clock' : app.status === 'approved' ? 'check-circle' : 'times-circle'}"></i>
                  ${this.formatStatus(app.status)}
                </span>
              </div>
            </div>
            <div class="app-detail-item">
              <label>Submitted</label>
              <div class="value">${UI.formatDate(app.created_at)}</div>
            </div>
            <div class="app-detail-item">
              <label>Last Updated</label>
              <div class="value">${UI.formatDate(app.updated_at)}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Applicant Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Full Name</label>
              <div class="value">${app.user_name || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Email Address</label>
              <div class="value">${app.email || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Phone Number</label>
              <div class="value ${!app.phone ? 'empty' : ''}">${app.phone || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Business Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Business Name</label>
              <div class="value">${app.business_name || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Business Type</label>
              <div class="value ${!experience.business_type ? 'empty' : ''}">${experience.business_type || 'Not specified'}</div>
            </div>
            <div class="app-detail-item">
              <label>Registration Number</label>
              <div class="value ${!app.business_registration ? 'empty' : ''}">${app.business_registration || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Tax ID</label>
              <div class="value ${!app.tax_id ? 'empty' : ''}">${app.tax_id || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Years in Business</label>
              <div class="value ${!experience.years_in_business ? 'empty' : ''}">${experience.years_in_business || 'Not specified'} years</div>
            </div>
            <div class="app-detail-item">
              <label>Category</label>
              <div class="value ${!experience.categories || !experience.categories.length ? 'empty' : ''}">
                ${experience.categories && experience.categories.length ? experience.categories[0] : 'Not specified'}
              </div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Contact Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Business Phone</label>
              <div class="value ${!experience.business_phone ? 'empty' : ''}">${experience.business_phone || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Business Email</label>
              <div class="value ${!experience.business_email ? 'empty' : ''}">${experience.business_email || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Website</label>
              <div class="value ${!experience.website ? 'empty' : ''}">${experience.website || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Address Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Street Address</label>
              <div class="value ${!experience.street_address ? 'empty' : ''}">${experience.street_address || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>City</label>
              <div class="value ${!experience.city ? 'empty' : ''}">${experience.city || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>State</label>
              <div class="value ${!experience.state ? 'empty' : ''}">${experience.state || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>ZIP Code</label>
              <div class="value ${!experience.zip_code ? 'empty' : ''}">${experience.zip_code || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        ${experience.description ? `
          <div class="app-detail-section">
            <h3>Business Description</h3>
            <div class="app-detail-item" style="grid-column: 1 / -1;">
              <div class="value" style="line-height: 1.6; white-space: pre-wrap;">${experience.description}</div>
            </div>
          </div>
        ` : ''}
      `
      
      // Set up action buttons
      modalActions.innerHTML = ''
      if (app.status === 'pending') {
        modalActions.innerHTML = `
          <button class="btn-primary" onclick="SellerApplications.approve(${app.id}); closeApplicationModal();" style="background: #10b981; border: none; padding: 10px 20px; border-radius: 8px; color: white; font-weight: 500; cursor: pointer;">
            <i class="fas fa-check"></i> Approve Application
          </button>
          <button class="btn-danger" onclick="SellerApplications.reject(${app.id}); closeApplicationModal();" style="background: #ef4444; border: none; padding: 10px 20px; border-radius: 8px; color: white; font-weight: 500; cursor: pointer;">
            <i class="fas fa-times"></i> Reject Application
          </button>
        `
      }
      
      // Show modal
      modal.classList.add('show')
      
      // Close on background click
      modal.onclick = (e) => {
        if (e.target === modal) {
          closeApplicationModal()
        }
      }
    },
  }

  // Rider Applications functions
  const RiderApplications = {
    async load() {
      const tbody = document.querySelector(".data-table tbody")
      if (!tbody) return

      try {
        // Show loading in tbody only
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i><br>Loading applications...</td></tr>'

        console.log('[RiderApplications] Fetching rider applications...')
        // Use the enhanced API with filtering for rider applications
        const data = await API.get("/admin/applications?type=rider&status=all")
        console.log('[RiderApplications] API Response:', data)

        if (data.success && data.applications) {
          if (data.applications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--gray-600);"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px;"></i><br>No rider applications found</td></tr>'
            return
          }

          // Update badge count (only pending applications)
          const pendingApps = data.applications.filter(app => app.status === 'pending')
          const badge = document.querySelector('#riderAppsBadge')
          if (badge) {
            badge.textContent = pendingApps.length
            badge.style.display = pendingApps.length > 0 ? 'inline' : 'none'
          }

          // Populate table tbody only
          tbody.innerHTML = data.applications.map((app) => `
            <tr>
              <td>#RA-${String(app.id).padStart(3, "0")}</td>
              <td>
                <div class="customer-cell">
                  <img src="/placeholder.svg?height=32&width=32" alt="Rider">
                  <span>${app.user_name}</span>
                </div>
              </td>
              <td>${this.getVehicleType(app.experience)}</td>
              <td>${app.license_number || "N/A"}</td>
              <td>${UI.formatDate(app.created_at)}</td>
              <td><span class="status-badge status-${app.status.toLowerCase()}">${this.formatStatus(app.status)}</span></td>
              <td>
                <button class="action-icon" onclick="RiderApplications.viewDetails(${app.id})" title="View Details">
                  <i class="fas fa-eye"></i>
                </button>
                ${app.status === 'pending' ? `
                  <button class="action-icon" onclick="RiderApplications.approve(${app.id})" title="Approve">
                    <i class="fas fa-check"></i>
                  </button>
                  <button class="action-icon" onclick="RiderApplications.reject(${app.id})" title="Reject">
                    <i class="fas fa-times"></i>
                  </button>
                ` : ''}
              </td>
            </tr>
          `).join('')
          
          console.log(`[RiderApplications] Successfully loaded ${data.applications.length} rider applications`)
        } else {
          throw new Error(data.error || 'Failed to fetch applications')
        }
      } catch (error) {
        console.error('[RiderApplications] Error loading applications:', error)
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ef4444;"><i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i><br>Error: ${error.message}<br><button onclick="RiderApplications.load()" class="btn-secondary" style="margin-top: 10px;">Retry</button></td></tr>`
      }
    },

    getVehicleType(experienceStr) {
      try {
        const exp = JSON.parse(experienceStr || "{}")
        return exp.vehicle_type || "N/A"
      } catch {
        return "N/A"
      }
    },

    formatStatus(status) {
      switch(status.toLowerCase()) {
        case 'pending': return 'Pending'
        case 'approved': return 'Approved'
        case 'rejected': return 'Rejected'
        default: return status
      }
    },

    async approve(appId) {
      if (!confirm("Are you sure you want to approve this application?")) return

      try {
        const data = await API.post(`/admin/applications/${appId}/approve`, {})

        if (data.success) {
          alert("Application approved successfully!")
          this.load()
        }
      } catch (error) {
        alert("Failed to approve application: " + error.message)
      }
    },

    async reject(appId) {
      if (!confirm("Are you sure you want to reject this application?")) return

      try {
        const data = await API.post(`/admin/applications/${appId}/reject`, {})

        if (data.success) {
          alert("Application rejected")
          this.load()
        }
      } catch (error) {
        alert("Failed to reject application: " + error.message)
      }
    },

    async viewDetails(appId) {
      try {
        console.log(`[RiderApplications] Loading details for application ${appId}`)
        
        // Get application details from API
        const data = await API.get(`/admin/applications/${appId}`)
        
        if (data.success && data.application) {
          this.showApplicationModal(data.application)
        } else {
          throw new Error(data.error || 'Application not found')
        }
      } catch (error) {
        console.error('[RiderApplications] Error loading application details:', error)
        alert(`Error loading application details: ${error.message}`)
      }
    },
    
    showApplicationModal(app) {
      const modal = document.getElementById('applicationModal')
      const modalTitle = document.getElementById('modalTitle')
      const modalBody = document.getElementById('modalBody')
      const modalActions = document.getElementById('modalActions')
      
      // Set modal title
      modalTitle.textContent = `Rider Application #RA-${String(app.id).padStart(3, '0')}`
      
      // Parse experience data
      let experience = {}
      try {
        experience = JSON.parse(app.experience || '{}')
      } catch (e) {
        console.warn('Failed to parse experience data:', e)
      }
      
      // Create modal content
      modalBody.innerHTML = `
        <div class="app-detail-section">
          <h3>Basic Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Application ID</label>
              <div class="value">#RA-${String(app.id).padStart(3, '0')}</div>
            </div>
            <div class="app-detail-item">
              <label>Status</label>
              <div class="value">
                <span class="app-status-large ${app.status.toLowerCase()}">
                  <i class="fas fa-${app.status === 'pending' ? 'clock' : app.status === 'approved' ? 'check-circle' : 'times-circle'}"></i>
                  ${this.formatStatus(app.status)}
                </span>
              </div>
            </div>
            <div class="app-detail-item">
              <label>Submitted</label>
              <div class="value">${UI.formatDate(app.created_at)}</div>
            </div>
            <div class="app-detail-item">
              <label>Last Updated</label>
              <div class="value">${UI.formatDate(app.updated_at)}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Applicant Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Full Name</label>
              <div class="value">${experience.full_name || app.user_name || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Email Address</label>
              <div class="value">${experience.email || app.email || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Phone Number</label>
              <div class="value ${!experience.phone && !app.phone ? 'empty' : ''}">${experience.phone || app.phone || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>Vehicle Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>Vehicle Type</label>
              <div class="value">${app.vehicle_type || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>Make & Model</label>
              <div class="value ${!experience.vehicle_make_model ? 'empty' : ''}">${experience.vehicle_make_model || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Plate Number</label>
              <div class="value ${!experience.vehicle_plate_number ? 'empty' : ''}">${experience.vehicle_plate_number || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        <div class="app-detail-section">
          <h3>License Information</h3>
          <div class="app-detail-grid">
            <div class="app-detail-item">
              <label>License Number</label>
              <div class="value">${app.license_number || 'N/A'}</div>
            </div>
            <div class="app-detail-item">
              <label>License Expiry</label>
              <div class="value ${!experience.license_expiry ? 'empty' : ''}">${experience.license_expiry || 'Not provided'}</div>
            </div>
            <div class="app-detail-item">
              <label>Availability</label>
              <div class="value ${!experience.availability ? 'empty' : ''}">${experience.availability || 'Not specified'}</div>
            </div>
          </div>
        </div>
        
        ${experience.experience_description ? `
          <div class="app-detail-section">
            <h3>Experience Description</h3>
            <div class="app-detail-item" style="grid-column: 1 / -1;">
              <div class="value" style="line-height: 1.6; white-space: pre-wrap;">${experience.experience_description}</div>
            </div>
          </div>
        ` : ''}
      `
      
      // Set up action buttons
      modalActions.innerHTML = ''
      if (app.status === 'pending') {
        modalActions.innerHTML = `
          <button class="btn-primary" onclick="RiderApplications.approve(${app.id}); closeApplicationModal();" style="background: #10b981; border: none; padding: 10px 20px; border-radius: 8px; color: white; font-weight: 500; cursor: pointer;">
            <i class="fas fa-check"></i> Approve Application
          </button>
          <button class="btn-danger" onclick="RiderApplications.reject(${app.id}); closeApplicationModal();" style="background: #ef4444; border: none; padding: 10px 20px; border-radius: 8px; color: white; font-weight: 500; cursor: pointer;">
            <i class="fas fa-times"></i> Reject Application
          </button>
        `
      }
      
      // Show modal
      modal.classList.add('show')
      
      // Close on background click
      modal.onclick = (e) => {
        if (e.target === modal) {
          closeApplicationModal()
        }
      }
    },
  }

  // Order Management functions
  const OrderManagement = {
    async load() {
      const tableContainer = document.getElementById('ordersTableContainer')
      const statsGrid = document.getElementById('orderStatsGrid')
      
      if (!tableContainer) return

      try {
        UI.showLoading(tableContainer)
        
        // Load order stats
        if (statsGrid) {
          try {
            const statsData = await API.get("/admin/stats")
            if (statsData.success && statsData.stats) {
              const stats = statsData.stats
              statsGrid.innerHTML = `
                <div class="stat-card">
                  <div class="stat-icon" style="background: linear-gradient(135deg, #FF2BAC 0%, #FF6BCE 100%);">
                    <i class="fas fa-shopping-cart"></i>
                  </div>
                  <div class="stat-details">
                    <h3 class="stat-value">${stats.total_orders || 0}</h3>
                    <p class="stat-label">Total Orders</p>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    <i class="fas fa-clock"></i>
                  </div>
                  <div class="stat-details">
                    <h3 class="stat-value">${stats.pending_orders || 0}</h3>
                    <p class="stat-label">Pending Orders</p>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                    <i class="fas fa-check-circle"></i>
                  </div>
                  <div class="stat-details">
                    <h3 class="stat-value">${(stats.total_orders || 0) - (stats.pending_orders || 0)}</h3>
                    <p class="stat-label">Completed Orders</p>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                    <i class="fas fa-dollar-sign"></i>
                  </div>
                  <div class="stat-details">
                    <h3 class="stat-value">PHP ${(stats.admin_total_earnings || 0).toFixed(2)}</h3>
                    <p class="stat-label">Total Commission</p>
                  </div>
                </div>
              `
            }
          } catch (e) {
            console.error('Failed to load order stats:', e)
          }
        }

        // Use the admin orders endpoint so this page works for admins only
        const data = await API.get("/admin/orders?limit=50")

        if (data.success && data.orders) {
          if (data.orders.length === 0) {
            UI.showEmpty(tableContainer, "No orders found")
            return
          }

          tableContainer.innerHTML = `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.orders
                  .map(
                    (order) => `
                  <tr>
                    <td>${order.order_number}</td>
                    <td>
                      <div class="customer-cell">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ccircle cx='20' cy='20' r='18' fill='%23e5e7eb'/%3E%3Cpath d='M20 12c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 10c-3.3 0-6 1.3-6 3v2h12v-2c0-1.7-2.7-3-6-3z' fill='%239ca3af'/%3E%3C/svg%3E" alt="Customer">
                        <span>${order.full_name || order.buyer_name || "N/A"}</span>
                      </div>
                    </td>
                    <td>${order.items ? order.items.length : 0} item(s)</td>
                    <td>${UI.formatCurrency(order.total_amount)}</td>
                    <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                    <td>${order.payment_status || 'N/A'}</td>
                    <td>${UI.formatDate(order.created_at)}</td>
                    <td>
                      <div style="display: flex; gap: 0.25rem; align-items: center;">
                        <button class="action-icon" onclick="viewOrder(${order.id})" title="View order details"><i class="fas fa-eye"></i></button>
                        <button class="action-icon" onclick="forceUpdateOrderStatus(${order.id})" title="Force update status" style="color: #3b82f6;"><i class="fas fa-edit"></i></button>
                        ${order.payment_status === 'paid' ? `<button class="action-icon" onclick="processRefund(${order.id})" title="Process refund" style="color: #ef4444;"><i class="fas fa-money-bill-wave"></i></button>` : ''}
                      </div>
                    </td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          `
        }
      } catch (error) {
        UI.showError(tableContainer, error.message)
      }
    },

    viewDetails(orderId) {
      viewOrder(orderId)
    },

    async updateStatus(orderId) {
      const newStatus = prompt("Enter new status (pending, confirmed, prepared, shipped, delivered, cancelled):")
      if (!newStatus) return

      try {
        const data = await API.put(`/orders/${orderId}/status`, { status: newStatus })

        if (data.success) {
          alert("Order status updated successfully!")
          this.load()
        }
      } catch (error) {
        alert("Failed to update order status: " + error.message)
      }
    },
  }

  // Initialize page-specific functionality
  async function initializePage() {
    const currentPath = window.location.pathname
    console.log("[Admin] Initializing page:", currentPath)

    // Check authentication using server session or token
    try {
      const me = await API.get('/auth/me')
      if (!me?.success || me?.user?.role !== 'admin') {
        throw new Error('Not admin')
      }
    } catch (e) {
      console.warn("[Admin] Auth check failed - redirecting to login")
      window.location.href = '/templates/Authenticator/login.html'
      return
    }

    // Initialize topbar notifications for admin
    NotificationManager.init()

    // Route based on URL path
    if (currentPath.includes('/admin/dashboard') || currentPath === '/admin/dashboard') {
      // Default: 6 months
      Dashboard.loadStats('6')
      Dashboard.loadRecentOrders()
      Dashboard.updateNavigationBadges({});

      const rangeSelect = document.getElementById('commissionRange')
      if (rangeSelect) {
        rangeSelect.addEventListener('change', () => {
          const range = rangeSelect.value
          Dashboard.loadStats(range)
        })
      }
      
      // Initialize PDF download button for Recent Commissions
      const downloadPDFBtn = document.getElementById('downloadCommissionsPDF')
      if (downloadPDFBtn) {
        downloadPDFBtn.addEventListener('click', () => {
          Dashboard.downloadCommissionsPDF()
        })
      }
    } else if (currentPath.includes('/admin/flash-sales')) {
      FlashSales.renderLayout();
      FlashSales.load();
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/products')) {
      ProductModeration.renderLayout();
      ProductModeration.load();
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/seller-applications')) {
      SellerApplications.load()
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/rider-applications')) {
      RiderApplications.load()
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/order-management')) {
      OrderManagement.load()
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/reports')) {
      console.log('[Admin] Reports page loaded')
      Dashboard.updateNavigationBadges({});
    } else if (currentPath.includes('/admin/settings')) {
      console.log('[Admin] Settings page loaded')
      Dashboard.updateNavigationBadges({});
    }
  }

  initializePage()

  // Make functions globally accessible
  // Expose selected modules globally for other admin pages
  window.API = API
  window.UI = UI
  window.TokenManager = TokenManager
  window.NotificationManager = NotificationManager
  window.SellerApplications = SellerApplications
  window.RiderApplications = RiderApplications
  window.OrderManagement = OrderManagement
  window.Dashboard = Dashboard
  window.FlashSales = FlashSales
  window.ProductModeration = ProductModeration
  
  function showOrderDetailsModal(order) {
    const modal = document.getElementById('orderDetailsModal')
    const titleEl = document.getElementById('orderDetailsTitle')
    const bodyEl = document.getElementById('orderDetailsBody')

    if (!modal || !titleEl || !bodyEl) {
      alert(`View order #${order.order_number} - Full order details would be shown here`)
      return
    }

    titleEl.textContent = `Order ${order.order_number}`

    // Format address
    const addressParts = []
    if (order.address) addressParts.push(order.address)
    if (order.city) addressParts.push(order.city)
    if (order.postal_code) addressParts.push(order.postal_code)
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A'
    
    // Format items
    let itemsHtml = ''
    if (order.items && order.items.length > 0) {
      itemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
              <th style="padding: 10px; text-align: left; font-size: 0.875rem;">Product</th>
              <th style="padding: 10px; text-align: center; font-size: 0.875rem;">Quantity</th>
              <th style="padding: 10px; text-align: right; font-size: 0.875rem;">Price</th>
              <th style="padding: 10px; text-align: right; font-size: 0.875rem;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="padding: 10px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${item.image_url ? `<img src="${item.image_url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : ''}
                    <div>
                      <div style="font-weight: 500;">${item.name || 'N/A'}</div>
                      ${item.size ? `<div style="font-size: 0.75rem; color: #666;">Size: ${item.size}</div>` : ''}
                      ${item.color ? `<div style="font-size: 0.75rem; color: #666;">Color: ${item.color}</div>` : ''}
                      ${item.seller_name ? `<div style="font-size: 0.75rem; color: #666;">Seller: ${item.seller_name}</div>` : ''}
                    </div>
                  </div>
                </td>
                <td style="padding: 10px; text-align: center;">${item.quantity || 0}</td>
                <td style="padding: 10px; text-align: right;">${UI.formatCurrency(item.price || 0)}</td>
                <td style="padding: 10px; text-align: right; font-weight: 500;">${UI.formatCurrency(item.subtotal || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    } else {
      itemsHtml = '<p style="color: #666; padding: 20px; text-align: center;">No items found for this order.</p>'
    }

    bodyEl.innerHTML = `
      <div class="app-detail-section">
        <h3>Order Overview</h3>
        <div class="app-detail-grid">
          <div class="app-detail-item">
            <label>Order Number</label>
            <div class="value">${order.order_number}</div>
          </div>
          <div class="app-detail-item">
            <label>Status</label>
            <div class="value"><span class="status-badge status-${order.status}">${order.status}</span></div>
          </div>
          <div class="app-detail-item">
            <label>Payment Status</label>
            <div class="value">${order.payment_status || 'N/A'}</div>
          </div>
          <div class="app-detail-item">
            <label>Date</label>
            <div class="value">${UI.formatDate(order.created_at)}</div>
          </div>
        </div>
      </div>

      <div class="app-detail-section">
        <h3>Customer</h3>
        <div class="app-detail-grid">
          <div class="app-detail-item">
            <label>Name</label>
            <div class="value">${order.full_name || order.buyer_name || 'N/A'}</div>
          </div>
          <div class="app-detail-item">
            <label>Email</label>
            <div class="value">${order.email || 'N/A'}</div>
          </div>
          ${order.phone ? `
          <div class="app-detail-item">
            <label>Phone</label>
            <div class="value">${order.phone}</div>
          </div>
          ` : ''}
          <div class="app-detail-item" style="grid-column: 1 / -1;">
            <label>Address</label>
            <div class="value">${fullAddress}</div>
          </div>
        </div>
      </div>

      <div class="app-detail-section">
        <h3>Amounts</h3>
        <div class="app-detail-grid">
          <div class="app-detail-item">
            <label>Total Amount</label>
            <div class="value">${UI.formatCurrency(order.total_amount)}</div>
          </div>
          <div class="app-detail-item">
            <label>Admin Commission (5%)</label>
            <div class="value">${order.admin_commission != null ? UI.formatCurrency(order.admin_commission) : 'N/A'}</div>
          </div>
          <div class="app-detail-item">
            <label>Seller Earnings</label>
            <div class="value">${order.seller_earnings != null ? UI.formatCurrency(order.seller_earnings) : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div class="app-detail-section">
        <h3>Order Items (${order.items ? order.items.length : 0})</h3>
        <div class="app-detail-item" style="grid-column: 1 / -1;">
          ${itemsHtml}
        </div>
      </div>
    `

    // Add admin actions
    const actionsEl = document.getElementById('orderDetailsActions')
    if (actionsEl) {
      actionsEl.innerHTML = `
        <button class="btn-secondary" onclick="hideOrderDetails()">Close</button>
        <button class="btn-primary" onclick="forceUpdateOrderStatus(${order.id})" style="background: #3b82f6;">
          <i class="fas fa-edit"></i> Force Update Status
        </button>
        ${order.payment_status === 'paid' ? `
          <button class="btn-primary" onclick="processRefund(${order.id})" style="background: #ef4444;">
            <i class="fas fa-money-bill-wave"></i> Process Refund
          </button>
        ` : ''}
      `
    }

    modal.classList.add('show')
  }

  window.viewOrder = async function(orderId) {
    try {
      const data = await API.get(`/admin/orders?limit=1&page=1&id=${orderId}`)
      // The current backend doesn't support filtering by id; fall back to separate call if needed
      const orderFromList = data && data.orders && data.orders.find(o => o.id === orderId)

      if (orderFromList) {
        showOrderDetailsModal(orderFromList)
        return
      }

      // Fallback: call a dedicated endpoint when available, or show simple alert
      alert(`View order #${orderId} - Full order details would be shown here`)
    } catch (e) {
      console.error('Failed to load order details', e)
      alert(`View order #${orderId} - Full order details would be shown here`)
    }
  }

  window.hideOrderDetails = function() {
    const modal = document.getElementById('orderDetailsModal')
    if (modal) modal.classList.remove('show')
  }

  window.forceUpdateOrderStatus = async function(orderId) {
    const statusOptions = ['pending', 'confirmed', 'prepared', 'shipped', 'delivered', 'cancelled']
    const statusLabels = ['Pending', 'Confirmed', 'Prepared', 'Shipped', 'Delivered', 'Cancelled']
    
    const statusList = statusOptions.map((status, index) => `${index + 1}. ${statusLabels[index]}`).join('\n')
    const userInput = prompt(`Enter new status for order #${orderId}:\n\n${statusList}\n\nEnter status name or number:`)
    
    if (!userInput) return
    
    let newStatus = userInput.trim().toLowerCase()
    
    // Check if user entered a number
    const statusIndex = parseInt(newStatus) - 1
    if (statusIndex >= 0 && statusIndex < statusOptions.length) {
      newStatus = statusOptions[statusIndex]
    }
    
    // Validate status
    if (!statusOptions.includes(newStatus)) {
      alert('Invalid status. Please enter one of: ' + statusOptions.join(', '))
      return
    }
    
    if (!confirm(`Are you sure you want to update order status to "${newStatus}"?`)) {
      return
    }
    
    try {
      const data = await API.put(`/admin/orders/${orderId}/force-update`, {
        status: newStatus
      })
      
      if (data.success) {
        alert(data.message || 'Order status updated successfully')
        if (OrderManagement && OrderManagement.load) {
          OrderManagement.load()
        }
        // Only hide if modal is open
        const modal = document.getElementById('orderDetailsModal')
        if (modal && modal.classList.contains('show')) {
          hideOrderDetails()
        }
      } else {
        alert(data.error || 'Failed to update order status')
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      alert('Failed to update order status: ' + (error.message || 'Unknown error'))
    }
  }
  
  window.exportOrders = async function() {
    try {
      // Fetch all orders
      const data = await API.get("/admin/orders?limit=1000")
      
      if (!data.success || !data.orders || data.orders.length === 0) {
        alert('No orders to export')
        return
      }
      
      // Check if jsPDF is available
      if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please refresh the page.')
        return
      }
      
      const { jsPDF } = window.jspdf
      const doc = new jsPDF()
      
      // Title
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Orders Export Report', 14, 20)
      
      // Date
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Generated: ${dateStr}`, 14, 28)
      
      // Summary
      const totalAmount = data.orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)
      const totalCommission = data.orders.reduce((sum, o) => sum + parseFloat(o.admin_commission || 0), 0)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Summary', 14, 40)
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      let y = 48
      doc.text(`Total Orders: ${data.orders.length}`, 14, y)
      y += 8
      doc.text(`Total Amount: PHP ${totalAmount.toFixed(2)}`, 14, y)
      y += 8
      doc.text(`Total Commission: PHP ${totalCommission.toFixed(2)}`, 14, y)
      y += 12
      
      // Format date helper
      const formatDate = (dateString) => {
        if (!dateString) return 'N/A'
        try {
          const date = new Date(dateString)
          return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })
        } catch (e) {
          return 'N/A'
        }
      }
      
      // Format currency helper
      const formatCurrency = (value) => {
        const num = parseFloat(value || 0)
        return `PHP ${num.toFixed(2)}`
      }
      
      // Table
      doc.autoTable({
        startY: y,
        head: [['Order #', 'Customer', 'Date', 'Status', 'Payment', 'Amount']],
        body: data.orders.map(o => [
          o.order_number || 'N/A',
          (o.full_name || o.buyer_name || 'N/A').substring(0, 20),
          formatDate(o.created_at),
          (o.status || 'N/A').substring(0, 15),
          (o.payment_status || 'N/A').substring(0, 10),
          formatCurrency(o.total_amount)
        ]),
        theme: 'striped',
        headStyles: { 
          fillColor: [99, 102, 241], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'left'
        },
        styles: { 
          fontSize: 8,
          cellPadding: 4,
          halign: 'left',
          valign: 'middle',
          lineWidth: 0.1,
          lineColor: [220, 220, 220]
        },
        columnStyles: {
          0: { cellWidth: 35, halign: 'left' },
          1: { cellWidth: 40, halign: 'left' },
          2: { cellWidth: 30, halign: 'left' },
          3: { cellWidth: 25, halign: 'left' },
          4: { cellWidth: 25, halign: 'left' },
          5: { cellWidth: 30, halign: 'right' }
        }
      })
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }
      
      // Save
      const filename = `orders-export-${now.toISOString().split('T')[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      console.error('Error exporting orders:', error)
      alert('Failed to export orders: ' + error.message)
    }
  }

  window.processRefund = async function(orderId) {
    const refundAmount = prompt('Enter refund amount (leave empty for full refund):')
    const refundReason = prompt('Enter refund reason:', 'Admin refund')
    
    if (refundReason === null) return // User cancelled
    
    if (!confirm(`Are you sure you want to process a refund${refundAmount ? ' of ₱' + refundAmount : ''} for this order?`)) {
      return
    }
    
    try {
      const data = await API.post(`/admin/orders/${orderId}/refund`, {
        refund_amount: refundAmount ? parseFloat(refundAmount) : null,
        refund_reason: refundReason || 'Admin refund'
      })
      
      if (data.success) {
        alert(data.message || 'Refund processed successfully')
        if (OrderManagement && OrderManagement.load) {
          OrderManagement.load()
        }
        hideOrderDetails()
      } else {
        alert(data.error || 'Failed to process refund')
      }
    } catch (error) {
      console.error('Error processing refund:', error)
      alert('Failed to process refund')
    }
  }
  
  // Global logout function
  window.adminLogout = async function() {
    if (confirm("Are you sure you want to logout?")) {
      try {
        // Call logout API to clear server-side session
        await API.post('/auth/logout', {})
      } catch (error) {
        console.log('Logout API call failed, but continuing with client-side logout')
      }
      
      // Clear client-side tokens and session data
      TokenManager.remove()
      sessionStorage.clear()
      
      // Redirect to home page
      window.location.href = '/'
    }
  }
  
  // Global modal control functions
  window.closeApplicationModal = function() {
    const modal = document.getElementById('applicationModal')
    if (modal) {
      modal.classList.remove('show')
      // Clear onclick handler
      modal.onclick = null
    }
  }
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeApplicationModal()
    }
  })
})
