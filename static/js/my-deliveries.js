/* My Deliveries Page JavaScript (externalized) */
(function() {
  // State
  let currentStatus = 'all';
  let deliveries = [];
  let filteredDeliveries = [];
  let mapVisible = false;
  let routeVisible = false;
  let searchQuery = '';
  let sortBy = 'newest';
  let currentPage = 1;
  let itemsPerPage = 20;
  let currentView = 'card'; // 'card' or 'table'

  // Proof upload state
  let currentDeliveryForProof = null;
  let signatureCanvas = null;
  let signatureCtx = null;
  let isDrawing = false;
  let uploadedPhoto = null;

  document.addEventListener('DOMContentLoaded', function() {
    // Logout (was inline)
    document.addEventListener('click', (e) => {
      const logout = e.target.closest('a.logout-btn');
      if (logout) {
        e.preventDefault();
        try {
          if (typeof AuthManager !== 'undefined' && typeof AuthManager.logout === 'function') {
            AuthManager.logout();
          }
        } catch {}
        window.location.href = '../Authenticator/login.html';
      }
    });

    // Auth ready delay then load
    setTimeout(loadMyDeliveries, 500);

    // Status tabs
    document.querySelectorAll('#statusTabs .nav-link').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('#statusTabs .nav-link').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentStatus = this.dataset.status;
        currentPage = 1; // Reset to first page
        filterAndRenderDeliveries();
      });
    });

    // Search input
    const searchInput = document.getElementById('deliverySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value.toLowerCase().trim();
        currentPage = 1; // Reset to first page
        filterAndRenderDeliveries();
        
        // Show/hide clear button
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
          clearBtn.style.display = searchQuery ? 'block' : 'none';
        }
      });
    }

    // Clear search button
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', function() {
        const searchInput = document.getElementById('deliverySearchInput');
        if (searchInput) {
          searchInput.value = '';
          searchQuery = '';
          currentPage = 1;
          filterAndRenderDeliveries();
          this.style.display = 'none';
        }
      });
    }

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', function(e) {
        sortBy = e.target.value;
        currentPage = 1; // Reset to first page
        filterAndRenderDeliveries();
      });
    }

    // Items per page select
    const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');
    if (itemsPerPageSelect) {
      itemsPerPageSelect.addEventListener('change', function(e) {
        itemsPerPage = e.target.value === 'all' ? 999999 : parseInt(e.target.value);
        currentPage = 1; // Reset to first page
        filterAndRenderDeliveries();
      });
    }

    // View toggle
    const viewToggleBtns = document.querySelectorAll('#viewToggle button');
    viewToggleBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        // Update active state
        viewToggleBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Switch view
        currentView = this.dataset.view;
        toggleViewDisplay();
        filterAndRenderDeliveries();
      });
    });

    // Map buttons
    document.getElementById('toggleMapBtn')?.addEventListener('click', toggleMap);
    document.getElementById('showRouteBtn')?.addEventListener('click', showRoute);
    document.getElementById('hideRouteBtn')?.addEventListener('click', hideRoute);

    // Map pin -> highlight card
    document.addEventListener('deliveryPinClicked', function(event) {
      const delivery = event.detail?.delivery;
      if (delivery?.id != null) highlightDeliveryCard(delivery.id);
    });

    // Auto-refresh
    setInterval(loadMyDeliveries, 30000);

    // Photo controls
    document.getElementById('takePhotoBtn')?.addEventListener('click', triggerPhotoUpload);
    document.getElementById('retakePhotoBtn')?.addEventListener('click', retakePhoto);
    document.getElementById('markDeliveredBtn')?.addEventListener('click', markAsDelivered);

    // Signature controls
    document.getElementById('clearSignatureBtn')?.addEventListener('click', clearSignature);
    document.getElementById('signatureModeBtn')?.addEventListener('click', toggleSignatureMode);

    // Photo input change
    const photoInput = document.getElementById('photoInput');
    if (photoInput) photoInput.addEventListener('change', onPhotoChange);

    // Signature init on modal show
    const proofModal = document.getElementById('proofUploadModal');
    if (proofModal) {
      proofModal.addEventListener('shown.bs.modal', initializeSignatureCanvas);
    }

    // Delivery cards event delegation
    const cardView = document.getElementById('cardView');
    if (cardView) {
      cardView.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('[data-action="details"]');
        if (detailsBtn) {
          const id = Number(detailsBtn.dataset.id);
          if (!Number.isNaN(id)) viewDeliveryDetails(id);
          return;
        }
        const statusBtn = e.target.closest('[data-action="update-status"]');
        if (statusBtn) {
          const id = Number(statusBtn.dataset.id);
          const ns = statusBtn.dataset.status;
          if (!Number.isNaN(id) && ns) updateDeliveryStatus(id, ns);
          return;
        }
        const card = e.target.closest('.delivery-card');
        if (card && card.dataset.deliveryId) {
          centerMapOnDelivery(Number(card.dataset.deliveryId));
        }
      });
    }
  });

  async function loadMyDeliveries() {
    const cardViewContainer = document.getElementById('cardView');
    if (cardViewContainer) {
      cardViewContainer.innerHTML = '<div class="col-12 text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-muted mb-3"></i><p class="text-muted">Loading your deliveries...</p></div>';
    }

    try {
      // Auth token
      let token = null;
      if (typeof AuthManager !== 'undefined') {
        token = AuthManager.getAuthToken();
      } else {
        const tokenKeys = ['auth_token', 'jwt_token', 'token'];
        for (const key of tokenKeys) {
          token = localStorage.getItem(key);
          if (token) break;
        }
      }

      if (!token) {
        showEmptyState('Authentication required. Please login again.');
        setTimeout(() => { window.location.href = '../Authenticator/login.html'; }, 2000);
        return;
      }

      const response = await fetch('/api/rider/deliveries', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (!data.deliveries || !Array.isArray(data.deliveries)) {
          showEmptyState('No deliveries data received from server.');
          return;
        }
        deliveries = data.deliveries.map((delivery) => ({
          id: delivery.id,
          order_number: delivery.order_number,
          customer_name: delivery.customer_name || 'Unknown Customer',
          customer_phone: delivery.customer_phone || 'N/A',
          customer_email: delivery.customer_email || 'N/A',
          pickup_address: delivery.pickup_address || delivery.seller_address || delivery.seller_full_address || 'Bella Fashion Store',
          delivery_address: delivery.delivery_address || delivery.buyer_address || delivery.buyer_full_address || 'Unknown Address',
          // Store all address variants for geocoding fallback
          buyer_address: delivery.buyer_address,
          buyer_full_address: delivery.buyer_full_address,
          seller_address: delivery.seller_address,
          seller_full_address: delivery.seller_full_address,
          delivery_fee: delivery.delivery_fee || 0,
          base_fee: delivery.base_fee || 0,
          tips: delivery.tips || 0,
          distance: delivery.distance ? `${delivery.distance} km` : 'N/A',
          buyer_lat: delivery.buyer_lat,
          buyer_lng: delivery.buyer_lng,
          seller_lat: delivery.seller_lat,
          seller_lng: delivery.seller_lng,
          seller_name: delivery.seller_name,
          seller_phone: delivery.seller_phone,
          estimated_time: delivery.estimated_time || '30-45 mins',
          actual_time: delivery.actual_time || null,
          delivery_type: delivery.delivery_type || 'standard',
          priority: delivery.priority || 'normal',
          status: delivery.status,
          order_total: delivery.order_total || 0,
          created_at: delivery.created_at || new Date().toISOString(),
          assigned_at: delivery.assigned_at,
          pickup_time: delivery.pickup_time,
          delivery_time: delivery.delivery_time,
          items: delivery.items || []
        }));

        updateStatusCounts();
        filterAndRenderDeliveries();
      } else {
        let errorData;
        try { errorData = await response.json(); } catch {}
        if (response.status === 401) {
          showEmptyState('Authentication expired. Redirecting to login...');
          setTimeout(() => { window.location.href = '../Authenticator/login.html'; }, 2000);
        } else if (response.status === 403) {
          showEmptyState('Access denied. Please ensure you have rider permissions.');
        } else {
          showEmptyState(`Failed to load deliveries: ${errorData?.error || 'Server error'}`);
        }
      }
    } catch (error) {
      showEmptyState('Unable to connect to server. Please check your connection.');
    }
  }

  function showEmptyState(message = 'No deliveries found') {
    const container = document.getElementById('cardView');
    if (!container) return;
    container.innerHTML = `
      <div class="col-12">
        <div class="text-center py-5">
          <i class="fas fa-route fa-3x text-muted mb-3"></i>
          <h4>${message}</h4>
          <p class="text-muted">Your active deliveries will appear here.</p>
          <button class="btn btn-primary mt-3" id="refreshDeliveriesBtn">
            <i class="fas fa-rotate-right me-2"></i>Refresh
          </button>
        </div>
      </div>`;
    deliveries = [];
    updateStatusCounts();
    container.querySelector('#refreshDeliveriesBtn')?.addEventListener('click', loadMyDeliveries);
  }

  function updateStatusCounts() {
    const counts = {
      all: deliveries.length,
      assigned: deliveries.filter(d => d.status === 'assigned').length,
      picked_up: deliveries.filter(d => d.status === 'picked_up').length,
      in_transit: deliveries.filter(d => d.status === 'in_transit').length
    };
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    setText('allCount', counts.all);
    setText('assignedCount', counts.assigned);
    setText('pickedUpCount', counts.picked_up);
    setText('inTransitCount', counts.in_transit);
    setText('statPendingPickup', counts.assigned);
    setText('statInTransit', counts.picked_up + counts.in_transit);
    setText('statNearDestination', counts.in_transit);
    const totalEarnings = deliveries.reduce((sum, d) => sum + (d.delivery_fee || 0), 0);
    setText('statTotalEarnings', `₱${totalEarnings.toFixed(2)}`);
  }

  function filterAndRenderDeliveries() {
    // Step 1: Filter by status
    let filtered = currentStatus === 'all' ? [...deliveries] : deliveries.filter(d => d.status === currentStatus);
    
    // Step 2: Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(d => {
        const searchableText = [
          d.order_number,
          d.customer_name,
          d.customer_phone,
          d.delivery_address,
          d.pickup_address
        ].join(' ').toLowerCase();
        return searchableText.includes(searchQuery);
      });
    }
    
    // Step 3: Sort
    filtered = sortDeliveries(filtered, sortBy);
    
    // Store filtered results
    filteredDeliveries = filtered;
    
    // Step 4: Paginate and render
    renderPaginatedDeliveries();
    
    // Update map if visible
    if (mapVisible && typeof riderMap !== 'undefined' && riderMap) {
      riderMap.loadDeliveryPins(filteredDeliveries);
    }
  }

  function sortDeliveries(deliveriesToSort, sortOption) {
    const sorted = [...deliveriesToSort];
    
    switch(sortOption) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'fee-high':
        sorted.sort((a, b) => b.delivery_fee - a.delivery_fee);
        break;
      case 'fee-low':
        sorted.sort((a, b) => a.delivery_fee - b.delivery_fee);
        break;
      case 'distance':
        sorted.sort((a, b) => {
          const distA = parseFloat(a.distance) || 0;
          const distB = parseFloat(b.distance) || 0;
          return distA - distB;
        });
        break;
    }
    
    return sorted;
  }

  function renderPaginatedDeliveries() {
    const totalItems = filteredDeliveries.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Adjust current page if needed
    if (currentPage > totalPages && totalPages > 0) {
      currentPage = totalPages;
    }
    if (currentPage < 1) {
      currentPage = 1;
    }
    
    // Calculate range
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const deliveriesToRender = filteredDeliveries.slice(startIndex, endIndex);
    
    // Update results summary
    updateResultsSummary(startIndex + 1, endIndex, totalItems);
    
    // Render based on current view
    if (currentView === 'card') {
      renderDeliveryCards(deliveriesToRender);
    } else {
      renderDeliveryTable(deliveriesToRender);
    }
    
    // Render pagination controls
    renderPaginationControls(totalPages);
  }

  function updateResultsSummary(start, end, total) {
    const summary = document.getElementById('resultsSummary');
    if (!summary) return;
    
    if (total > 0) {
      summary.style.display = 'flex';
      document.getElementById('showingStart').textContent = start;
      document.getElementById('showingEnd').textContent = end;
      document.getElementById('totalResults').textContent = total;
    } else {
      summary.style.display = 'none';
    }
  }

  function renderPaginationControls(totalPages) {
    const paginationControls = document.getElementById('paginationControls');
    const paginationList = document.getElementById('paginationList');
    
    if (!paginationControls || !paginationList) return;
    
    // Hide pagination if only 1 page or no items
    if (totalPages <= 1) {
      paginationControls.style.display = 'none';
      return;
    }
    
    paginationControls.style.display = 'flex';
    paginationList.innerHTML = '';
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}"><i class="fas fa-chevron-left"></i></a>`;
    paginationList.appendChild(prevLi);
    
    // Page numbers (show max 7 pages)
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // First page
    if (startPage > 1) {
      const firstLi = document.createElement('li');
      firstLi.className = 'page-item';
      firstLi.innerHTML = `<a class="page-link" href="#" data-page="1">1</a>`;
      paginationList.appendChild(firstLi);
      
      if (startPage > 2) {
        const dotsLi = document.createElement('li');
        dotsLi.className = 'page-item disabled';
        dotsLi.innerHTML = `<span class="page-link">...</span>`;
        paginationList.appendChild(dotsLi);
      }
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      const pageLi = document.createElement('li');
      pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
      pageLi.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
      paginationList.appendChild(pageLi);
    }
    
    // Last page
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const dotsLi = document.createElement('li');
        dotsLi.className = 'page-item disabled';
        dotsLi.innerHTML = `<span class="page-link">...</span>`;
        paginationList.appendChild(dotsLi);
      }
      
      const lastLi = document.createElement('li');
      lastLi.className = 'page-item';
      lastLi.innerHTML = `<a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a>`;
      paginationList.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}"><i class="fas fa-chevron-right"></i></a>`;
    paginationList.appendChild(nextLi);
    
    // Add click handlers
    paginationList.querySelectorAll('a.page-link').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const page = parseInt(this.dataset.page);
        if (page && page !== currentPage && page >= 1 && page <= totalPages) {
          currentPage = page;
          renderPaginatedDeliveries();
          // Scroll to top of delivery cards
          document.getElementById('cardView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function toggleViewDisplay() {
    const cardView = document.getElementById('cardView');
    const tableView = document.getElementById('tableView');
    
    if (currentView === 'card') {
      if (cardView) cardView.style.display = '';
      if (tableView) tableView.style.display = 'none';
    } else {
      if (cardView) cardView.style.display = 'none';
      if (tableView) tableView.style.display = 'block';
    }
  }

  function renderDeliveryCards(deliveriesToRender) {
    const container = document.getElementById('cardView');
    if (!container) return;

    if (deliveriesToRender.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="text-center py-5">
            <i class="fas fa-route fa-3x text-muted mb-3"></i>
            <h4>No deliveries found</h4>
            <p class="text-muted">No deliveries match the current filter.</p>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = deliveriesToRender.map(delivery => {
      const statusClass = getStatusClass(delivery.status);
      const statusIcon = getStatusIcon(delivery.status);
      const nextAction = getNextAction(delivery.status);
      return `
        <div class="col-lg-6">
          <div class="card delivery-card ${delivery.status} h-100" data-delivery-id="${delivery.id}">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <h6 class="card-title mb-0">#${delivery.order_number}</h6>
                <span class="badge ${statusClass}">
                  <i class="${statusIcon} me-1"></i>${delivery.status.replace('_', ' ')}
                </span>
              </div>
              <div class="customer-info mb-3">
                <p class="mb-1"><strong><i class="fas fa-user me-2"></i>${delivery.customer_name}</strong></p>
                <p class="mb-1 text-muted small"><i class="fas fa-phone me-2"></i>${delivery.customer_phone}</p>
                <p class="mb-0 text-muted small"><i class="fas fa-envelope me-2"></i>${delivery.customer_email}</p>
              </div>
              <div class="delivery-details mb-3">
                <div class="d-flex align-items-start mb-2">
                  <i class="fas fa-map-marker-alt text-success me-2 mt-1"></i>
                  <div>
                    <div class="fw-bold small">Pickup</div>
                    <div class="text-muted small">${delivery.pickup_address}</div>
                  </div>
                </div>
                <div class="d-flex align-items-start">
                  <i class="fas fa-map-marker-alt text-danger me-2 mt-1"></i>
                  <div>
                    <div class="fw-bold small">Delivery</div>
                    <div class="text-muted small">${delivery.delivery_address}</div>
                  </div>
                </div>
              </div>
              <div class="row g-2 text-center mb-3">
                <div class="col-4">
                  <div class="small text-muted">Distance</div>
                  <div class="fw-bold">${delivery.distance}</div>
                </div>
                <div class="col-4">
                  <div class="small text-muted">Time</div>
                  <div class="fw-bold">${delivery.estimated_time}</div>
                </div>
                <div class="col-4">
                  <div class="small text-muted">Fee</div>
                  <div class="fw-bold text-success">₱${delivery.delivery_fee.toFixed(2)}</div>
                </div>
              </div>
              ${nextAction ? `
              <div class="d-flex gap-2 mb-2">
                <button class="btn btn-outline-info btn-sm flex-fill" data-action="details" data-id="${delivery.id}">
                  <i class="fas fa-eye me-1"></i>Details
                </button>
                <button class="btn btn-${nextAction.color} btn-sm flex-fill" data-action="update-status" data-id="${delivery.id}" data-status="${nextAction.status}">
                  <i class="${nextAction.icon} me-1"></i>${nextAction.text}
                </button>
              </div>` : ''}
              <div class="d-flex gap-2">
                <button class="btn btn-outline-primary btn-sm flex-fill" onclick="openChatWithBuyer('${delivery.order_number}', '${delivery.customer_name}', '${delivery.customer_profile_picture || ''}')">
                  <i class="fas fa-comment-dots me-1"></i>Message Buyer
                </button>
                <button class="btn btn-outline-success btn-sm flex-fill" onclick="openChatWithSeller('${delivery.order_number}', '${delivery.seller_name || 'Seller'}', '${delivery.seller_profile_picture || ''}')">
                  <i class="fas fa-store me-1"></i>Message Seller
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderDeliveryTable(deliveriesToRender) {
    const tbody = document.getElementById('deliveryTableBody');
    if (!tbody) return;

    if (deliveriesToRender.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5">
            <i class="fas fa-route fa-3x text-muted mb-3"></i>
            <h5>No deliveries found</h5>
            <p class="text-muted">No deliveries match the current filter.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = deliveriesToRender.map(delivery => {
      const statusClass = getStatusClass(delivery.status);
      const statusIcon = getStatusIcon(delivery.status);
      const nextAction = getNextAction(delivery.status);
      
      return `
        <tr data-delivery-id="${delivery.id}" onclick="centerMapOnDelivery(${delivery.id})">
          <td>
            <strong>#${delivery.order_number}</strong>
          </td>
          <td>
            <div class="table-customer-info">
              <div><strong>${delivery.customer_name}</strong></div>
              <small class="text-muted">
                <i class="fas fa-phone me-1"></i>${delivery.customer_phone}
              </small>
            </div>
          </td>
          <td>
            <div class="table-address">
              <small class="text-success">
                <i class="fas fa-map-marker-alt me-1"></i><strong>Pickup:</strong> ${delivery.pickup_address}
              </small>
              <small class="text-danger mt-1">
                <i class="fas fa-map-marker-alt me-1"></i><strong>Delivery:</strong> ${delivery.delivery_address}
              </small>
            </div>
          </td>
          <td class="text-center">
            <strong>${delivery.distance}</strong>
          </td>
          <td class="text-center">
            <strong class="text-success">₱${delivery.delivery_fee.toFixed(2)}</strong>
          </td>
          <td class="text-center">
            <span class="badge ${statusClass}">
              <i class="${statusIcon} me-1"></i>${delivery.status.replace('_', ' ')}
            </span>
          </td>
          <td class="text-center" onclick="event.stopPropagation();">
            <div class="btn-group btn-group-sm" role="group">
              <button class="btn btn-outline-info" data-action="details" data-id="${delivery.id}" title="View Details">
                <i class="fas fa-eye"></i>
              </button>
              ${nextAction ? `
              <button class="btn btn-outline-${nextAction.color}" data-action="update-status" data-id="${delivery.id}" data-status="${nextAction.status}" title="${nextAction.text}">
                <i class="${nextAction.icon}"></i>
              </button>` : ''}
              <button class="btn btn-outline-primary" onclick="openChatWithBuyer('${delivery.order_number}', '${delivery.customer_name}', '${delivery.customer_profile_picture || ''}')" title="Message Buyer">
                <i class="fas fa-comment-dots"></i>
              </button>
              <button class="btn btn-outline-success" onclick="openChatWithSeller('${delivery.order_number}', '${delivery.seller_name || 'Seller'}', '${delivery.seller_profile_picture || ''}')" title="Message Seller">
                <i class="fas fa-store"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Add click handlers for action buttons in table
    tbody.querySelectorAll('[data-action="details"]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const id = Number(this.dataset.id);
        if (!Number.isNaN(id)) viewDeliveryDetails(id);
      });
    });

    tbody.querySelectorAll('[data-action="update-status"]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const id = Number(this.dataset.id);
        const ns = this.dataset.status;
        if (!Number.isNaN(id) && ns) updateDeliveryStatus(id, ns);
      });
    });
  }

  function getStatusClass(status) {
    const classes = { assigned: 'bg-info', picked_up: 'bg-warning', in_transit: 'bg-primary', delivered: 'bg-success' };
    return classes[status] || 'bg-secondary';
  }
  function getStatusIcon(status) {
    const icons = { assigned: 'fas fa-clock', picked_up: 'fas fa-box', in_transit: 'fas fa-truck', delivered: 'fas fa-check' };
    return icons[status] || 'fas fa-info';
  }
  function getNextAction(status) {
    const actions = {
      assigned: { status: 'picked_up', text: 'Mark Picked Up', icon: 'fas fa-box', color: 'warning' },
      picked_up: { status: 'in_transit', text: 'Start Delivery', icon: 'fas fa-truck', color: 'primary' },
      in_transit: { status: 'delivered', text: 'Mark Delivered', icon: 'fas fa-check', color: 'success' }
    };
    return actions[status];
  }

  async function updateDeliveryStatus(deliveryId, newStatus) {
    try {
      let token = null;
      if (typeof AuthManager !== 'undefined') {
        token = AuthManager.getAuthToken();
      } else {
        const tokenKeys = ['auth_token', 'jwt_token', 'token'];
        for (const key of tokenKeys) { token = localStorage.getItem(key); if (token) break; }
      }
      if (!token) {
        riderDashboard.showToast('Authentication required. Please login again.', 'error');
        setTimeout(() => { window.location.href = '../Authenticator/login.html'; }, 1500);
        return;
      }
      const response = await fetch(`/api/rider/deliveries/${deliveryId}/status`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        riderDashboard.showToast(`Delivery ${newStatus.replace('_', ' ')} successfully!`, 'success');
        loadMyDeliveries();
      } else {
        const error = await response.json();
        riderDashboard.showToast('Failed to update status: ' + (error.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      riderDashboard.showToast('Network error. Please try again.', 'error');
    }
  }

  function viewDeliveryDetails(deliveryId) {
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return;
    const modal = new bootstrap.Modal(document.getElementById('actionModal'));
    document.getElementById('actionModalTitle').textContent = `Delivery Details - #${delivery.order_number}`;
    document.getElementById('actionModalBody').innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">
          <strong>Customer Information:</strong><br>
          <div class="mt-2">
            <div><strong>Name:</strong> ${delivery.customer_name}</div>
            <div><strong>Phone:</strong> ${delivery.customer_phone}</div>
            <div><strong>Email:</strong> ${delivery.customer_email}</div>
          </div>
        </div>
        <div class="col-md-6">
          <strong>Order Details:</strong><br>
          <div class="mt-2">
            <div><strong>Status:</strong> <span class="badge ${getStatusClass(delivery.status)}">${delivery.status.replace('_', ' ')}</span></div>
            <div><strong>Fee:</strong> ₱${delivery.delivery_fee.toFixed(2)}</div>
            <div><strong>Distance:</strong> ${delivery.distance}</div>
          </div>
        </div>
        <div class="col-12">
          <strong>Addresses:</strong><br>
          <div class="mt-2">
            <div><strong>Pickup:</strong> ${delivery.pickup_address}</div>
            <div><strong>Delivery:</strong> ${delivery.delivery_address}</div>
          </div>
        </div>
        <div class="col-12">
          <strong>Items:</strong><br>
          <ul class="mt-2">
            ${delivery.items && delivery.items.length > 0 ? delivery.items.map(item => `<li>${item}</li>`).join('') : '<li>Order items information not available</li>'}
          </ul>
        </div>
      </div>`;
    document.getElementById('actionModalFooter').innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="button" class="btn btn-outline-primary" id="messageBuyerBtn">
        <i class="fas fa-comments me-2"></i>Message Buyer
      </button>
      <button type="button" class="btn btn-primary" id="openInMapBtn">
        <i class="fas fa-map me-2"></i>Open in Map
      </button>`;
    const openBtn = document.getElementById('openInMapBtn');
    if (openBtn) openBtn.addEventListener('click', () => openDeliveryInMap(delivery.buyer_lat, delivery.buyer_lng, delivery.delivery_address), { once: true });
    const msgBtn = document.getElementById('messageBuyerBtn');
    if (msgBtn) msgBtn.addEventListener('click', () => openBuyerChatForDelivery(delivery.order_number, delivery.customer_name), { once: true });
    modal.show();
  }

  function openDeliveryInMap(blat, blng, address) {
    if (blat != null && blng != null && !isNaN(blat) && !isNaN(blng)) {
      const url = `https://www.openstreetmap.org/?mlat=${blat}&mlon=${blng}#map=16/${blat}/${blng}`;
      window.open(url, '_blank');
    } else {
      const q = encodeURIComponent(address || '');
      window.open(`https://www.openstreetmap.org/search?query=${q}`, '_blank');
    }
  }
  window.openDeliveryInMap = openDeliveryInMap;
  window.viewDeliveryDetails = viewDeliveryDetails;

  // Map controls
  function toggleMap() {
    const mapContainer = document.getElementById('mapContainer');
    const toggleBtn = document.getElementById('toggleMapBtn');
    const showRouteBtn = document.getElementById('showRouteBtn');
    const hideRouteBtn = document.getElementById('hideRouteBtn');
    if (!mapContainer || !toggleBtn || !showRouteBtn || !hideRouteBtn) return;
    if (mapVisible) {
      mapContainer.style.display = 'none';
      toggleBtn.innerHTML = '<i class="fas fa-eye me-1"></i>Show Map';
      showRouteBtn.style.display = 'none';
      hideRouteBtn.style.display = 'none';
      mapVisible = false;
    } else {
      mapContainer.style.display = 'block';
      toggleBtn.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Hide Map';
      showRouteBtn.style.display = 'inline-block';
      hideRouteBtn.style.display = 'inline-block';
      mapVisible = true;
      if (typeof riderMap !== 'undefined' && riderMap) {
        if (!riderMap.map) {
          setTimeout(() => {
            riderMap.initializeMap('map').then(success => {
              if (success) riderMap.loadDeliveryPins(filteredDeliveries);
            });
          }, 100);
        } else {
          riderMap.loadDeliveryPins(filteredDeliveries);
        }
      }
    }
  }
  function showRoute() {
    if (typeof riderMap !== 'undefined' && riderMap && deliveries.length > 1) {
      const activeDeliveries = deliveries.filter(d => d.status !== 'delivered');
      riderMap.showRoute(activeDeliveries);
      routeVisible = true;
      const hideBtn = document.getElementById('hideRouteBtn');
      const showBtn = document.getElementById('showRouteBtn');
      if (hideBtn) hideBtn.style.display = 'inline-block';
      if (showBtn) showBtn.style.display = 'none';
      riderDashboard.showToast('Route displayed on map', 'success');
    } else {
      riderDashboard.showToast('Need at least 2 deliveries to show route', 'warning');
    }
  }
  function hideRoute() {
    if (typeof riderMap !== 'undefined' && riderMap) {
      riderMap.hideRoute();
      routeVisible = false;
      const hideBtn = document.getElementById('hideRouteBtn');
      const showBtn = document.getElementById('showRouteBtn');
      if (showBtn) showBtn.style.display = 'inline-block';
      if (hideBtn) hideBtn.style.display = 'none';
      riderDashboard.showToast('Route hidden', 'info');
    }
  }

  async function openBuyerChatForDelivery(orderNumber, participantName) {
    try {
      let token = null;
      if (typeof AuthManager !== 'undefined') token = AuthManager.getAuthToken();
      else { const ks = ['auth_token','jwt_token','token']; for (const k of ks) { token = localStorage.getItem(k); if (token) break; } }
      if (!token) { riderDashboard.showToast('Please login again', 'error'); setTimeout(()=>{window.location.href='../Authenticator/login.html';},1200); return; }
      // Hit conversations endpoint to ensure conversation exists for this order
      const res = await fetch('/api/rider/messages/conversations', { headers: { 'Authorization': `Bearer ${token}` } });
      let convId = null;
      if (res.ok) {
        const data = await res.json();
        const conv = (data.conversations || []).find(c => String(c.order_number || '') === String(orderNumber));
        if (conv) convId = conv.id;
      }
      // Navigate to rider messages, preselect conversation if found
      if (convId) {
        window.location.href = `messages.html?openChat=${encodeURIComponent(convId)}&order=${encodeURIComponent(orderNumber)}&participant=${encodeURIComponent(participantName || 'Customer')}`;
      } else {
        window.location.href = 'messages.html';
      }
    } catch (e) {
      riderDashboard.showToast('Failed to open chat', 'error');
      window.location.href = 'messages.html';
    }
  }

  function centerMapOnDelivery(deliveryId) {
    if (typeof riderMap !== 'undefined' && riderMap && riderMap.map && mapVisible) {
      riderMap.centerOnDelivery(deliveryId);
    } else if (!mapVisible) {
      toggleMap();
      setTimeout(() => {
        if (typeof riderMap !== 'undefined' && riderMap && riderMap.map) riderMap.centerOnDelivery(deliveryId);
      }, 1000);
    }
  }
  window.centerMapOnDelivery = centerMapOnDelivery;
  
  function highlightDeliveryCard(deliveryId) {
    // Remove previous highlights from both views
    document.querySelectorAll('.delivery-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('#deliveryTableBody tr').forEach(row => row.classList.remove('selected'));
    
    // Highlight the delivery in current view
    const element = document.querySelector(`[data-delivery-id="${deliveryId}"]`);
    if (element) {
      element.classList.add('selected');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Signature helpers
  function initializeSignatureCanvas() {
    signatureCanvas = document.getElementById('signatureCanvas');
    if (signatureCanvas) {
      signatureCtx = signatureCanvas.getContext('2d');
      signatureCtx.strokeStyle = '#000';
      signatureCtx.lineWidth = 2;
      signatureCtx.lineCap = 'round';
      signatureCanvas.addEventListener('mousedown', startDrawing);
      signatureCanvas.addEventListener('mousemove', draw);
      signatureCanvas.addEventListener('mouseup', stopDrawing);
      signatureCanvas.addEventListener('mouseout', stopDrawing);
      signatureCanvas.addEventListener('touchstart', handleTouch);
      signatureCanvas.addEventListener('touchmove', handleTouch);
      signatureCanvas.addEventListener('touchend', stopDrawing);
    }
  }
  function startDrawing(e) { isDrawing = true; const r = signatureCanvas.getBoundingClientRect(); signatureCtx.beginPath(); signatureCtx.moveTo(e.clientX - r.left, e.clientY - r.top); }
  function draw(e) { if (!isDrawing) return; const r = signatureCanvas.getBoundingClientRect(); signatureCtx.lineTo(e.clientX - r.left, e.clientY - r.top); signatureCtx.stroke(); }
  function stopDrawing() { isDrawing = false; signatureCtx.beginPath(); }
  function handleTouch(e) { e.preventDefault(); const t = e.touches[0]; const ev = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : e.type === 'touchmove' ? 'mousemove' : 'mouseup', { clientX: t.clientX, clientY: t.clientY }); signatureCanvas.dispatchEvent(ev); }
  function clearSignature() { if (signatureCtx) signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height); }
  window.clearSignature = clearSignature;
  function toggleSignatureMode() { riderDashboard.showToast('Signature mode toggled', 'info'); }
  window.toggleSignatureMode = toggleSignatureMode;

  // Photo helpers
  function triggerPhotoUpload() { document.getElementById('photoInput')?.click(); }
  window.triggerPhotoUpload = triggerPhotoUpload;
  function retakePhoto() { document.getElementById('photoPreview').style.display = 'none'; document.getElementById('photoPlaceholder').style.display = 'block'; document.getElementById('retakePhotoBtn').style.display = 'none'; uploadedPhoto = null; }
  window.retakePhoto = retakePhoto;
  function onPhotoChange(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(ev) {
        const preview = document.getElementById('photoPreview');
        preview.src = ev.target.result;
        preview.style.display = 'block';
        document.getElementById('photoPlaceholder').style.display = 'none';
        document.getElementById('retakePhotoBtn').style.display = 'inline-block';
        uploadedPhoto = file;
      };
      reader.readAsDataURL(file);
    }
  }

  function showDeliveryProofModal(deliveryId) {
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) { riderDashboard.showToast('Delivery not found', 'error'); return; }
    currentDeliveryForProof = delivery;
    document.getElementById('proofOrderNumber').textContent = `#${delivery.order_number}`;
    document.getElementById('proofDeliveryInfo').innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">
          <strong><i class="fas fa-user text-primary me-1"></i>Customer:</strong><br>
          <span>${delivery.customer_name}</span><br>
          <small class="text-muted"><i class="fas fa-phone me-1"></i>${delivery.customer_phone || 'N/A'}</small>
        </div>
        <div class="col-md-6">
          <strong><i class="fas fa-map-marker-alt text-danger me-1"></i>Address:</strong><br>
          <span class="small">${delivery.delivery_address}</span>
        </div>
      </div>`;
    retakePhoto();
    clearSignature();
    document.getElementById('deliveryNotes').value = '';
    document.getElementById('customerPresentCheck').checked = false;
    document.getElementById('idVerifiedCheck').checked = false;
    new bootstrap.Modal(document.getElementById('proofUploadModal')).show();
  }
  window.showDeliveryProofModal = showDeliveryProofModal;

  async function markAsDelivered() {
    if (!currentDeliveryForProof) { riderDashboard.showToast('No delivery selected', 'error'); return; }
    const hasPhoto = uploadedPhoto !== null;
    const hasSignature = isCanvasBlank(signatureCanvas) === false;
    const customerPresent = document.getElementById('customerPresentCheck').checked;
    if (!hasPhoto && !hasSignature && !customerPresent) {
      riderDashboard.showToast('Please provide at least one proof of delivery (photo, signature, or customer confirmation)', 'warning');
      return;
    }
    try {
      let token = null;
      if (typeof AuthManager !== 'undefined') token = AuthManager.getAuthToken();
      else { const ks = ['auth_token','jwt_token','token']; for (const k of ks) { token = localStorage.getItem(k); if (token) break; } }
      if (!token) { riderDashboard.showToast('Authentication required. Please login again.', 'error'); setTimeout(()=>{window.location.href='../Authenticator/login.html';},1500); return; }
      const formData = new FormData();
      if (hasPhoto && uploadedPhoto) formData.append('photo', uploadedPhoto);
      if (hasSignature && signatureCanvas) formData.append('signature_data', signatureCanvas.toDataURL('image/png'));
      formData.append('delivery_notes', document.getElementById('deliveryNotes').value || '');
      formData.append('customer_present', customerPresent ? 'true' : 'false');
      formData.append('customer_id_verified', document.getElementById('idVerifiedCheck').checked ? 'true' : 'false');
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }));
          formData.append('location_lat', position.coords.latitude.toString());
          formData.append('location_lng', position.coords.longitude.toString());
        } catch {}
      }
      const response = await fetch(`/api/rider/deliveries/${currentDeliveryForProof.id}/proof`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      if (response.ok) {
        const result = await response.json();
        bootstrap.Modal.getInstance(document.getElementById('proofUploadModal')).hide();
        if (typeof riderMap !== 'undefined' && riderMap && mapVisible) {
          const marker = riderMap.markers.find(m => m.deliveryData.id === currentDeliveryForProof.id);
          if (marker) marker.setIcon(riderMap.getMarkerIcon('delivered'));
        }
        loadMyDeliveries();
        riderDashboard.showToast(`Delivery completed with ${result.proof_type} proof uploaded successfully!`, 'success');
        currentDeliveryForProof = null;
      } else {
        const error = await response.json();
        riderDashboard.showToast('Failed to upload delivery proof: ' + (error.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      riderDashboard.showToast('Network error. Please check your connection and try again.', 'error');
    }
  }
  window.markAsDelivered = markAsDelivered;

  function isCanvasBlank(canvas) {
    const context = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    return !pixelBuffer.some(color => color !== 0);
  }

  // Chat Functions for Rider
  window.openChatWithBuyer = async function(orderNumber, buyerName, profilePicture = '') {
    // Set flag to indicate this is a buyer chat
    window.currentChatType = 'buyer';
    
    // Open the Chat Center modal (chat-center.js will create it if it doesn't exist)
    if (window.ChatCenter && typeof ChatCenter.open === 'function') {
      ChatCenter.open();
      
      // Wait a bit for the modal to render
      setTimeout(async () => {
        try {
          const token = AuthManager.getAuthToken();
          if (!token) {
            alert('Please log in to access chat');
            return;
          }
          const headers = { 'Authorization': `Bearer ${token}` };
          
          // Fetch chats to find the one for this order (only user's own chats)
          const res = await fetch('/api/chats', { 
            headers,
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            const chats = data.chats || [];
            
            // Find chat with this order number
            let chat = chats.find(c => c.order_number === orderNumber);
            
            if (chat) {
              // Select the existing chat with proper rider data
              if (typeof ChatCenter.selectChat === 'function') {
                const riderData = {
                  buyerName: chat.buyer_name || buyerName,
                  sellerName: chat.seller_name || 'Seller',
                  buyerId: chat.buyer_id,
                  sellerId: chat.seller_id,
                  targetType: 'buyer'
                };
                ChatCenter.selectChat(chat.id, buyerName, orderNumber, '', profilePicture, riderData);
              }
            } else {
              // No existing chat - need to create one first
              console.log('No existing chat found. Creating new chat...');
              
              // Try to create a new chat via API
              try {
                const createRes = await fetch('/api/chats', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    order_number: orderNumber,
                    participant_name: buyerName,
                    participant_type: 'buyer'
                  })
                });
                
                if (createRes.ok) {
                  const newChat = await createRes.json();
                  console.log('New chat created:', newChat);
                  
                  // Select the newly created chat with proper rider data
                  if (newChat.chat && newChat.chat.id && typeof ChatCenter.selectChat === 'function') {
                    const riderData = {
                      buyerName: buyerName,
                      sellerName: 'Seller',
                      buyerId: null,
                      sellerId: null,
                      targetType: 'buyer'
                    };
                    ChatCenter.selectChat(newChat.chat.id, buyerName, orderNumber, '', profilePicture, riderData);
                  }
                } else {
                  throw new Error('Failed to create chat');
                }
              } catch (createError) {
                console.error('Error creating new chat:', createError);
                alert('Could not create chat. The backend API may need to implement chat creation.');
              }
            }
          }
        } catch (error) {
          console.error('Error opening chat with buyer:', error);
        }
      }, 500);
    }
  };

  window.openChatWithSeller = async function(orderNumber, sellerName, profilePicture = '') {
    // Set flag to indicate this is a seller chat
    window.currentChatType = 'seller';
    
    // Open the Chat Center modal
    if (window.ChatCenter && typeof ChatCenter.open === 'function') {
      ChatCenter.open();
      
      // Wait a bit for the modal to render
      setTimeout(async () => {
        try {
          const token = AuthManager.getAuthToken();
          if (!token) {
            alert('Please log in to access chat');
            return;
          }
          const headers = { 'Authorization': `Bearer ${token}` };
          
          // Fetch chats to find the one for this order (only user's own chats)
          const res = await fetch('/api/chats', { 
            headers,
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            const chats = data.chats || [];
            
            // Find chat with this order number
            let chat = chats.find(c => c.order_number === orderNumber);
            
            if (chat) {
              // Select the existing chat with proper rider data
              if (typeof ChatCenter.selectChat === 'function') {
                const riderData = {
                  buyerName: chat.buyer_name || 'Buyer',
                  sellerName: chat.seller_name || chat.shop_name || sellerName,
                  buyerId: chat.buyer_id,
                  sellerId: chat.seller_id,
                  targetType: 'seller'
                };
                ChatCenter.selectChat(chat.id, sellerName, orderNumber, '', profilePicture, riderData);
              }
            } else {
              // No existing chat - need to create one first
              console.log('No existing chat found. Creating new chat...');
              
              // Try to create a new chat via API
              try {
                const createRes = await fetch('/api/chats', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    order_number: orderNumber,
                    participant_name: sellerName,
                    participant_type: 'seller'
                  })
                });
                
                if (createRes.ok) {
                  const newChat = await createRes.json();
                  console.log('New chat created:', newChat);
                  
                  // Select the newly created chat with proper rider data
                  if (newChat.chat && newChat.chat.id && typeof ChatCenter.selectChat === 'function') {
                    const riderData = {
                      buyerName: 'Buyer',
                      sellerName: sellerName,
                      buyerId: null,
                      sellerId: null,
                      targetType: 'seller'
                    };
                    ChatCenter.selectChat(newChat.chat.id, sellerName, orderNumber, '', profilePicture, riderData);
                  }
                } else {
                  throw new Error('Failed to create chat');
                }
              } catch (createError) {
                console.error('Error creating new chat:', createError);
                alert('Could not create chat. The backend API may need to implement chat creation.');
              }
            }
          }
        } catch (error) {
          console.error('Error opening chat with seller:', error);
        }
      }, 500);
    }
  };
})();
