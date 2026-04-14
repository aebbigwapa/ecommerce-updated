document.addEventListener('DOMContentLoaded', function() {
      // Global variables
      let currentView = 'product';
      let inventoryData = [];
      let filteredData = [];
      let currentEditingProduct = null;
      
      // Pagination state
      let currentPage = 1;
      let perPage = 10;
      let totalPages = 1;
      let totalItems = 0;
      let hasNext = false;
      let hasPrev = false;

      // DOM elements
      const inventoryTableBody = document.getElementById('inventoryTableBody');
      const inventoryGridContainer = document.getElementById('inventoryGridContainer');
      const inventoryListContainer = document.getElementById('inventoryListContainer');
      const emptyState = document.getElementById('emptyState');
      const totalCount = document.getElementById('totalCount');
      const totalProducts = document.getElementById('totalProducts');
      const totalVariants = document.getElementById('totalVariants');
      const lowStockCount = document.getElementById('lowStockCount');
      const outOfStockCount = document.getElementById('outOfStockCount');
      const paginationInfo = document.getElementById('paginationInfo');
      const searchInput = document.getElementById('searchInput');
      const approvalStatusFilter = document.getElementById('approvalStatusFilter');
      const sortByFilter = document.getElementById('sortBy');
      const clearSearchBtn = document.getElementById('clearSearch');
      const gridViewBtn = document.getElementById('gridViewBtn');
      const listViewBtn = document.getElementById('listViewBtn');
      const tableViewBtn = document.getElementById('tableViewBtn');
      
      // Current view mode
      let currentViewMode = 'grid'; // grid, list, table
      
      // Quick filter state
      let currentQuickFilter = 'all';

      // Initialize (wait for AuthManager to be ready to avoid first-load issues)
      waitForAuthAndInit();

      function initInventory() {
        setupEventListeners();
        loadInventoryData();
      }
      
      async function waitForAuthAndInit() {
        try {
          let tries = 0;
          while ((typeof AuthManager === 'undefined' || !AuthManager.isLoggedIn() || !AuthManager.getAuthToken()) && tries < 30) {
            await new Promise(r => setTimeout(r, 150));
            tries++;
          }
        } catch (e) {
          console.warn('AuthManager not ready in time, proceeding anyway');
        } finally {
          initInventory();
        }
      }

      function setupEventListeners() {
        // View mode toggle
        if (gridViewBtn) gridViewBtn.addEventListener('click', () => switchViewMode('grid'));
        if (listViewBtn) listViewBtn.addEventListener('click', () => switchViewMode('list'));
        if (tableViewBtn) tableViewBtn.addEventListener('click', () => switchViewMode('table'));

        // Filters
        if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 300));
        if (approvalStatusFilter) approvalStatusFilter.addEventListener('change', applyFilters);
        if (sortByFilter) sortByFilter.addEventListener('change', applyFilters);
        
        // Clear search button
        if (clearSearchBtn) {
          clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
              searchInput.value = '';
              applyFilters();
            }
          });
        }
        
        // Quick filter buttons
        const quickFilterButtons = document.querySelectorAll('.quick-filter-btn');
        quickFilterButtons.forEach(btn => {
          btn.addEventListener('click', function() {
            // Remove active class from all buttons
            quickFilterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            const filterType = this.getAttribute('data-filter');
            handleQuickFilter(filterType);
          });
        });

        // Sidebar toggle (use adminSidebar id in this layout)
        const sidebarToggle = document.getElementById('sidebarToggle');
        const adminSidebar = document.getElementById('adminSidebar');

        if (sidebarToggle && adminSidebar) {
          sidebarToggle.addEventListener('click', () => {
            adminSidebar.classList.toggle('collapsed');
          });
        }
      }

      function switchViewMode(mode) {
        const prevMode = currentViewMode;
        currentViewMode = mode;
        
        // Update buttons
        if (gridViewBtn) gridViewBtn.classList.toggle('active', mode === 'grid');
        if (listViewBtn) listViewBtn.classList.toggle('active', mode === 'list');
        if (tableViewBtn) tableViewBtn.classList.toggle('active', mode === 'table');
        
        // Show/hide view containers
        const gridView = document.getElementById('gridView');
        const listView = document.getElementById('listView');
        const tableView = document.getElementById('tableView');
        
        if (gridView) gridView.style.display = mode === 'grid' ? 'block' : 'none';
        if (listView) listView.style.display = mode === 'list' ? 'block' : 'none';
        if (tableView) tableView.style.display = mode === 'table' ? 'block' : 'none';
        
        // Reload data when switching to or from list view (structure differs)
        if (mode === 'list' || prevMode === 'list') {
          loadInventoryData();
        } else {
          displayInventory();
        }
      }
      

      async function loadInventoryData() {
        try {
            showLoading();
            
            const token = AuthManager.getAuthToken();
            if (!token || !AuthManager.isAuthenticated()) {
                console.log('No valid authentication, redirecting to login');
                window.location.href = '/templates/Authenticator/login.html';
                return;
            }
            
            // Check if user is seller
            const user = AuthManager.getUserInfo();
            if (!user || user.role !== 'seller') {
                console.log('User is not a seller, redirecting');
                window.location.href = '/templates/Public/index.html';
                return;
            }

            const params = new URLSearchParams({
                search: searchInput ? searchInput.value : '',
                approval_status: approvalStatusFilter ? approvalStatusFilter.value : '',
                view: currentViewMode === 'list' ? 'variant' : 'product',
                page: currentPage.toString(),
                per_page: perPage.toString(),
                _ts: Date.now().toString()
            });
            
            // Add sort_by if provided
            if (sortByFilter && sortByFilter.value) {
              params.append('sort_by', sortByFilter.value);
            }
            
            // Add quick filter parameter
            if (currentQuickFilter && currentQuickFilter !== 'all') {
              if (currentQuickFilter === 'low-stock') {
                params.append('stock_filter', 'low');
              } else if (currentQuickFilter === 'out-of-stock') {
                params.append('stock_filter', 'out');
              } else if (currentQuickFilter === 'in-stock') {
                params.append('stock_filter', 'in');
              } else if (currentQuickFilter === 'flash-sale' || currentQuickFilter === 'recent') {
                params.append('quick_filter', currentQuickFilter);
              }
            }

            const response = await fetch(`/api/seller/inventory?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Inventory API Response Status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Inventory API Error:', response.status, errorText);
                throw new Error(`Failed to load inventory (${response.status})`);
            }

            const data = await response.json();
            console.log('Inventory API Response:', data);
            console.log('View mode:', currentViewMode);
            console.log('User info:', user);
            
            if (data.success) {
                inventoryData = data.items || [];
                // No need for filteredData - server handles filtering and pagination
                
                // Update pagination state
                totalItems = data.total || 0;
                totalPages = data.total_pages || 1;
                currentPage = data.page || 1;
                hasNext = data.has_next || false;
                hasPrev = data.has_prev || false;
                
                console.log('Inventory data loaded:', inventoryData.length, 'items');
                console.log('Total in response:', data.total);
                console.log('Pagination:', `Page ${currentPage} of ${totalPages}`);
                console.log('Seller ID:', data.seller_id);
                if (inventoryData.length > 0) {
                    console.log('Sample data:', inventoryData[0]);
                } else {
                    console.log('No items returned from API');
                }
                displayInventory();
                renderPagination();
            } else {
                console.error('API Error:', data.error);
                throw new Error(data.error || 'Failed to load inventory');
            }
        } catch (error) {
            console.error('Error loading inventory:', error);
            showError('Failed to load inventory data');
        }
      }

      function displayInventory() {
        console.log('displayInventory called with:', inventoryData.length, 'items');
        console.log('Current view mode:', currentViewMode);
        console.log('Current page:', currentPage, 'of', totalPages);
        
        if (inventoryData.length === 0) {
          console.log('No data to display, showing empty state');
          showEmptyState();
          updateStats(); // Update stats even when empty
          updatePaginationInfo();
          return;
        }

        hideEmptyState();
        
        // Display based on current view mode
        if (currentViewMode === 'grid') {
          displayGridView();
        } else if (currentViewMode === 'list') {
          displayListView();
        } else if (currentViewMode === 'table') {
          displayTableView();
        }

        updateStats();
        updatePaginationInfo();
      }

function displayGridView() {
        if (!inventoryGridContainer) return;
        
        inventoryGridContainer.innerHTML = '';
        
        // Display current page items (already paginated from server)
        inventoryData.forEach(item => {
          const productCard = document.createElement('div');
          productCard.className = 'col-lg-3 col-md-4 col-sm-6';
          
          // Determine which image to display
          const displayImage = getProductDisplayImage(item);
          
          productCard.innerHTML = `
            <div class="product-inventory-card">
              <div class="product-image">
                <img src="${displayImage.url}" alt="${escapeHtml(item.name)}" class="img-fluid" data-product-id="${item.id}">
                ${displayImage.colorIndicator ? `<div class="image-color-indicator" title="${displayImage.colorName}" style="position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; border-radius: 50%; background-color: ${displayImage.colorHex}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>` : ''}
                <div class="product-badges">
                  <span class="badge ${getStatusBadgeClass(item.total_stock)}">${getStatusText(item.total_stock)}</span>
                  ${renderThumbnailsBadge(item)}
                </div>
                <div class="product-actions">
                  <button class="action-btn" onclick="editProduct('${item.id}')" title="Edit Product">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="action-btn" onclick="viewVariants('${item.id}')" title="View Variants">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="action-btn delete-btn" onclick="deleteProduct('${item.id}')" title="Delete Product">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                ${getColorSwatches(item)}
              </div>
              <div class="product-info">
                <h6 class="product-name">${escapeHtml(item.name)}</h6>
                <p class="product-category">${item.category || 'Uncategorized'}</p>
                <div class="product-stats">
                  <div class="stat-item">
                    <span class="stat-label">Stock:</span>
                    <span class="stat-value ${getStockColorClass(item.total_stock)}">${item.total_stock}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Variants:</span>
                    <span class="stat-value">${item.variant_count || 0}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Price:</span>
                    <span class="stat-value">${item.price_range || 'N/A'}</span>
                  </div>
                </div>
              </div>
              ${renderVariantThumbnails(item)}
            </div>
          `;
          inventoryGridContainer.appendChild(productCard);
          
          // Add hover functionality for color swatches
          setupColorSwatchHover(productCard, item);
        });
      }

function displayListView() {
        if (!inventoryListContainer) return;
        
        inventoryListContainer.innerHTML = '';
        
        // For list view, the backend returns individual variants when view=variant
        // Check if we have variant data (backend returns different structure for variants)
        const hasVariantData = inventoryData.length > 0 && inventoryData[0].hasOwnProperty('variant_id');
        
        // Display current page items (already paginated from server)
        inventoryData.forEach(item => {
          const listItem = document.createElement('div');
          
          if (hasVariantData) {
            // This is variant data from backend
            listItem.className = 'product-list-item variant-item';
            
            // Display color name if available, otherwise use the color value
            const colorName = item.color_name || item.color || 'Unknown Color';
            const productName = `${escapeHtml(item.product_name)} - ${escapeHtml(colorName)} - ${escapeHtml(item.size)}`;
            const stockValue = item.stock || 0;
            const priceValue = `₱${parseFloat(item.price).toFixed(2)}`;
            
            // Get color hex from color name for the indicator
            const colorHex = getColorHex(item.color);
            
            listItem.innerHTML = `
              <div class="product-image-small" style="position: relative;">
                <img src="${item.image_url || '/static/image.png'}" alt="${productName}">
                <div class="image-color-indicator" title="${colorName}" style="position: absolute; top: 4px; right: 4px; width: 12px; height: 12px; border-radius: 50%; background-color: ${colorHex}; border: 1px solid white;"></div>
                <div class="variant-indicator"><i class="fas fa-tag" title="Product Variant"></i></div>
              </div>
              <div class="product-details" style="width:100%">
                <div class="product-main-info">
                  <h6 class="product-name">${productName}</h6>
                  <p class="product-category">${item.category || 'Uncategorized'}</p>
                  <div class="variant-info"><span class="badge bg-info">Variant</span></div>
                </div>
                <div class="product-metrics">
                  <div class="metric">
                    <span class="metric-label">Stock:</span>
                    <span class="metric-value ${getStockColorClass(stockValue)}">${stockValue}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Price:</span>
                    <span class="metric-value">${priceValue}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Size:</span>
                    <span class="metric-value">${item.size}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Color:</span>
                    <span class="metric-value">${colorName}</span>
                  </div>
                </div>
              </div>
              <div class="product-status">
                <span class="badge ${getStatusBadgeClass(stockValue)}">${getStatusText(stockValue)}</span>
              </div>
            `;
          } else {
            // This is regular product data from backend
            listItem.className = 'product-list-item main-product';
            
            const displayImage = getProductDisplayImage(item);
            const productName = escapeHtml(item.name);
            const stockValue = item.total_stock || 0;
            const priceValue = item.price_range || 'N/A';
            
            listItem.innerHTML = `
              <div class="product-image-small" style="position: relative;">
                <img src="${displayImage.url}" alt="${productName}">
                ${displayImage.colorIndicator ? `<div class="image-color-indicator" title="${displayImage.colorName}" style="position: absolute; top: 4px; right: 4px; width: 12px; height: 12px; border-radius: 50%; background-color: ${displayImage.colorHex}; border: 1px solid white;"></div>` : ''}
              </div>
              <div class="product-details" style="width:100%">
                <div class="product-main-info">
                  <h6 class="product-name">${productName}</h6>
                  <p class="product-category">${item.category || 'Uncategorized'}</p>
                  <div class="extra-badges">${renderThumbnailsBadge(item)}</div>
                </div>
                <div class="product-metrics">
                  <div class="metric">
                    <span class="metric-label">Stock:</span>
                    <span class="metric-value ${getStockColorClass(stockValue)}">${stockValue}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Variants:</span>
                    <span class="metric-value">${item.variant_count || 0}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Price:</span>
                    <span class="metric-value">${priceValue}</span>
                  </div>
                </div>
                ${renderVariantThumbnails(item)}
              </div>
              <div class="product-status">
                <span class="badge ${getStatusBadgeClass(stockValue)}">${getStatusText(stockValue)}</span>
              </div>
              <div class="product-actions">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editProduct('${item.id}')">
                  <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-outline-info me-1" onclick="viewVariants('${item.id}')">
                  <i class="fas fa-eye"></i> Variants
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${item.id}')">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            `;
          }
          
          inventoryListContainer.appendChild(listItem);
        });
      }

function displayTableView() {
        if (!inventoryTableBody) return;
        
        inventoryTableBody.innerHTML = '';
        
        // Display current page items (already paginated from server)
        inventoryData.forEach(item => {
          const row = document.createElement('tr');
          const firstImage = getProductDisplayImage(item).url || item.image_url || '/static/image.png';
          row.innerHTML = `
            <td>
              <div class="product-image-table">
                <img src="${firstImage}" alt="${escapeHtml(item.name)}">
              </div>
            </td>
            <td>
              <div class="product-name-cell">
                <strong>${escapeHtml(item.name)}</strong>
                <small class="text-muted d-block">Added ${formatDate(item.created_at)}</small>
              </div>
            </td>
            <td><span class="category-tag">${item.category || 'Uncategorized'}</span></td>
            <td><span class="variants-count">${item.variant_count || 0} variants</span></td>
            <td><span class="stock-indicator ${getStockColorClass(item.total_stock)}">${item.total_stock}</span></td>
            <td><span class="price-range">${item.price_range || 'N/A'}</span></td>
            <td><span class="badge ${getStatusBadgeClass(item.total_stock)}">${getStatusText(item.total_stock)}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-action-btn" onclick="editProduct('${item.id}')" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="table-action-btn" onclick="viewVariants('${item.id}')" title="View Variants">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="table-action-btn" onclick="deleteProduct('${item.id}')" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          `;
          inventoryTableBody.appendChild(row);
        });
      }
      
      function updateStats() {
        const stats = calculateStats(inventoryData);
        
        if (totalProducts) totalProducts.textContent = stats.totalProducts;
        if (totalVariants) totalVariants.textContent = stats.totalVariants;
        if (lowStockCount) lowStockCount.textContent = stats.lowStock;
        if (outOfStockCount) outOfStockCount.textContent = stats.outOfStock;
        if (totalCount) totalCount.textContent = `${totalItems} products`;
      }
      
      function updatePaginationInfo() {
        if (paginationInfo) {
          if (totalItems === 0) {
            paginationInfo.textContent = 'No products to display';
          } else {
            const start = (currentPage - 1) * perPage + 1;
            const end = Math.min(currentPage * perPage, totalItems);
            paginationInfo.innerHTML = `Showing <strong>${start}-${end}</strong> of <strong>${totalItems}</strong> products`;
          }
        }
      }
      
      function renderPagination() {
        const paginationContainer = document.querySelector('.pagination');
        if (!paginationContainer) return;
        
        paginationContainer.innerHTML = '';
        
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${!hasPrev ? 'disabled' : ''}`;
        prevLi.innerHTML = `
          <a class="page-link" href="#" ${!hasPrev ? 'tabindex="-1" aria-disabled="true"' : ''}>
            <i class="fas fa-chevron-left"></i>
          </a>
        `;
        if (hasPrev) {
          prevLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(currentPage - 1);
          });
        }
        paginationContainer.appendChild(prevLi);
        
        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        // Adjust start if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
          startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // First page if not in range
        if (startPage > 1) {
          const firstLi = document.createElement('li');
          firstLi.className = 'page-item';
          firstLi.innerHTML = `<a class="page-link" href="#">1</a>`;
          firstLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(1);
          });
          paginationContainer.appendChild(firstLi);
          
          if (startPage > 2) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
            paginationContainer.appendChild(ellipsisLi);
          }
        }
        
        // Page number buttons
        for (let i = startPage; i <= endPage; i++) {
          const pageLi = document.createElement('li');
          pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
          pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
          if (i !== currentPage) {
            pageLi.querySelector('a').addEventListener('click', (e) => {
              e.preventDefault();
              goToPage(i);
            });
          }
          paginationContainer.appendChild(pageLi);
        }
        
        // Last page if not in range
        if (endPage < totalPages) {
          if (endPage < totalPages - 1) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
            paginationContainer.appendChild(ellipsisLi);
          }
          
          const lastLi = document.createElement('li');
          lastLi.className = 'page-item';
          lastLi.innerHTML = `<a class="page-link" href="#">${totalPages}</a>`;
          lastLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(totalPages);
          });
          paginationContainer.appendChild(lastLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${!hasNext ? 'disabled' : ''}`;
        nextLi.innerHTML = `
          <a class="page-link" href="#" ${!hasNext ? 'tabindex="-1" aria-disabled="true"' : ''}>
            <i class="fas fa-chevron-right"></i>
          </a>
        `;
        if (hasNext) {
          nextLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(currentPage + 1);
          });
        }
        paginationContainer.appendChild(nextLi);
      }
      
      function goToPage(page) {
        if (page < 1 || page > totalPages || page === currentPage) return;
        currentPage = page;
        loadInventoryData();
      }
      
      function calculateStats(data) {
        return {
          totalProducts: data.length,
          totalVariants: data.reduce((sum, item) => sum + (item.variant_count || 0), 0),
          lowStock: data.filter(item => item.total_stock > 0 && item.total_stock <= 10).length,
          outOfStock: data.filter(item => item.total_stock === 0).length
        };
      }
      
      function getStatusBadgeClass(stock) {
        if (stock === 0) return 'bg-danger';
        if (stock <= 10) return 'bg-warning';
        return 'bg-success';
      }
      
      function getStatusText(stock) {
        if (stock === 0) return 'Out of Stock';
        if (stock <= 10) return 'Low Stock';
        return 'In Stock';
      }
      
// Image display logic functions
      function getAllProductImageUrls(item) {
        // Build a list of all images: default image first, then unique variant images
        const urls = [];
        const defaultUrl = item.default_image_url || item.image_url;
        if (defaultUrl) urls.push(defaultUrl);

        if (item.color_variants && Array.isArray(item.color_variants)) {
          item.color_variants.forEach(variant => {
            const images = Array.isArray(variant.images) ? variant.images.slice() : [];
            images
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
              .forEach(img => {
                const url = img && (img.url || img);
                if (url && !urls.includes(url)) urls.push(url);
              });
          });
        }

        // Fallback placeholder when nothing exists
        if (urls.length === 0) urls.push('/static/image.png');
        return urls;
      }

      function hasExtraThumbnails(item) {
        try {
          const urls = getAllProductImageUrls(item);
          return Array.isArray(urls) && urls.length > 1;
        } catch (e) {
          return false;
        }
      }

      function renderThumbnailsBadge(item) {
        if (!hasExtraThumbnails(item)) return '';
        return `<span class="badge thumbs-badge"><i class="fas fa-images me-1"></i>Thumbnails</span>`;
      }

      
      function renderVariantThumbnails(item) {

        // If color variants exist, group thumbnails by color
        if (item && Array.isArray(item.color_variants) && item.color_variants.length > 0) {
          // Create grouped variant display
          const groupsHtml = item.color_variants.map(variant => {
            const colorName = variant.color || 'Variant';
            const colorHex = variant.color_hex || getColorHex(colorName);
            const images = Array.isArray(variant.images) ? variant.images.slice() : [];
            // Sort and map to URLs (supports object or string)
            const urls = images
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
              .map(img => (img && (img.url || img)))
              .filter(Boolean);

            const uniqueUrls = Array.from(new Set(urls));
            const thumbs = uniqueUrls.map(u => `
              <img src="${u}" alt="${escapeHtml(colorName)}" onerror="this.style.visibility='hidden'">
            `).join('');

            return `
              <div class="variant-group">
                <div class="variant-group-header">
                  <span class="color-dot" style="background:${colorHex}"></span>
                  <span class="variant-group-name">${escapeHtml(colorName)}</span>
                  <span class="variant-group-count">(${uniqueUrls.length})</span>
                </div>
                <div class="variant-thumbs">${thumbs || '<span class="text-muted" style="font-size:0.85rem;">No images</span>'}</div>
              </div>
            `;
          }).join('');

          return `
            <div class="variant-groups">
              ${groupsHtml}
            </div>
          `;
        }

        // Fallback: show a flat strip of thumbnails if we don't have color variants
        const urls = getAllProductImageUrls(item);
        if (!urls || urls.length <= 1) return '';

        const thumbs = urls.map(u => `
          <img src="${u}" alt="thumb" onerror="this.style.visibility='hidden'">
        `).join('');

        return `
          <div class="variant-thumbs">
            ${thumbs}
          </div>
        `;
      }

      function getProductDisplayImage(item) {
        // Priority order:
        // 1. Default product image
        // 2. First color variant image (lowest display_order)
        // 3. Legacy image_url or placeholder image
        
        let displayImage = {
          url: '/static/image.png',
          colorIndicator: false,
          colorName: '',
          colorHex: ''
        };
        
        // 1) Prefer explicit default image if available
        if (item.default_image_url) {
          displayImage.url = item.default_image_url;
          return displayImage;
        }
        
        // 2) Otherwise, try first available color variant image
        if (item.color_variants && item.color_variants.length > 0) {
          const colorWithImage = item.color_variants
            .filter(variant => variant.images && variant.images.length > 0)
            .sort((a, b) => {
              const aOrder = (a.images[0]?.display_order ?? 999);
              const bOrder = (b.images[0]?.display_order ?? 999);
              return aOrder - bOrder || (a.color || '').localeCompare(b.color || '');
            })[0];
          
          if (colorWithImage) {
            const primaryImage = colorWithImage.images
              .slice()
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0];
            
            displayImage = {
              url: (primaryImage && (primaryImage.url || primaryImage)) || displayImage.url,
              colorIndicator: true,
              colorName: colorWithImage.color_name || colorWithImage.color,
              colorHex: colorWithImage.color_hex || colorWithImage.color || '#808080'
            };
            return displayImage;
          }
        }
        
        // 3) Fallbacks
        if (item.image_url) {
          displayImage.url = item.image_url; // Legacy field support
        }
        
        return displayImage;
      }
      
      function getColorSwatches(item) {
        if (!item.color_variants || item.color_variants.length <= 1) {
          return '';
        }
        
        const swatches = item.color_variants.slice(0, 5).map(variant => {
          const primaryImage = variant.images && variant.images.length > 0 
            ? (variant.images.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0])
            : null;
          
          const imageUrl = primaryImage ? (primaryImage.url || primaryImage) : '';
          const colorHex = variant.color_hex || getColorHex(variant.color);
          
          return `<div class="color-swatch" 
                data-color-hex="${colorHex}" 
                data-color-name="${variant.color}" 
                data-image="${imageUrl}" 
                style="background-color: ${colorHex}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; margin: 2px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" 
                title="${variant.color}"></div>`;
        }).join('');
        
        const moreCount = item.color_variants.length > 5 ? item.color_variants.length - 5 : 0;
        const moreIndicator = moreCount > 0 ? `<small class="text-muted">+${moreCount}</small>` : '';
        
        return `<div class="color-swatches" style="position: absolute; bottom: 8px; left: 8px; display: flex; align-items: center; flex-wrap: wrap;">
          ${swatches}
          ${moreIndicator}
        </div>`;
      }
      
      // Utility function to get hex color from color name
      function getColorHex(colorName) {
        const colorMap = {
          'black': '#000000',
          'white': '#FFFFFF',
          'red': '#FF0000',
          'blue': '#0000FF',
          'green': '#008000',
          'yellow': '#FFFF00',
          'pink': '#FFC0CB',
          'purple': '#800080',
          'gray': '#808080',
          'grey': '#808080',
          'brown': '#A52A2A',
          'beige': '#F5F5DC',
          'navy': '#000080',
          'orange': '#FFA500',
          'coral': '#FF7F50',
          'maroon': '#800000',
          'olive': '#808000',
          'teal': '#008080',
          'silver': '#C0C0C0',
          'gold': '#FFD700'
        };
        
        const lowerColorName = colorName.toLowerCase();
        return colorMap[lowerColorName] || '#808080'; // Default to gray if color not found
      }
      
      function setupColorSwatchHover(productCard, item) {
        const swatches = productCard.querySelectorAll('.color-swatch');
        const productImage = productCard.querySelector('.product-image img');
        const colorIndicator = productCard.querySelector('.image-color-indicator');
        
        if (!productImage) return;
        
        // Store original image data
        const originalImage = productImage.src;
        const originalColor = colorIndicator ? {
          hex: colorIndicator.style.backgroundColor,
          name: colorIndicator.title
        } : null;
        
        swatches.forEach(swatch => {
          swatch.addEventListener('mouseenter', () => {
            const newImage = swatch.dataset.image;
            const colorHex = swatch.dataset.colorHex;
            const colorName = swatch.dataset.colorName;
            
            if (newImage) {
              productImage.src = newImage;
              
              if (colorIndicator) {
                colorIndicator.style.backgroundColor = colorHex;
                colorIndicator.title = colorName;
              }
            }
          });
          
          swatch.addEventListener('mouseleave', () => {
            // Restore original image
            productImage.src = originalImage;
            
            if (colorIndicator && originalColor) {
              colorIndicator.style.backgroundColor = originalColor.hex;
              colorIndicator.title = originalColor.name;
            }
          });
        });
      }


      function applyFilters() {
        // Reset to page 1 when filters change
        currentPage = 1;
        // Reload data from server with new filters
        loadInventoryData();
      }
      
      function handleQuickFilter(filterType) {
        currentQuickFilter = filterType;
        // Reset to page 1 when filter changes
        currentPage = 1;
        // Reload data from server with new filter
        loadInventoryData();
      }
      
      // Legacy filter function (kept for backward compatibility, but now we use server-side filtering)
      function applyFiltersLegacy() {
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const approvalStatusValue = approvalStatusFilter ? approvalStatusFilter.value : '';
        const stockValue = stockFilter ? stockFilter.value : '';

        filteredData = inventoryData.filter(item => {
          // Search filter
          if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) {
            return false;
          }

          // Approval status filter
          if (approvalStatusValue && item.approval_status !== approvalStatusValue) {
            return false;
          }

          // Stock filter
          const stock = item.total_stock;
          if (stockValue === 'low' && stock > 10) return false;
          if (stockValue === 'out' && stock > 0) return false;
          if (stockValue === 'in' && stock === 0) return false;

          return true;
        });

        displayInventory();
      }

      function showEmptyState() {
        if (emptyState) emptyState.style.display = 'block';
        
        // Hide all view containers
        const gridView = document.getElementById('gridView');
        const listView = document.getElementById('listView');
        const tableView = document.getElementById('tableView');
        
        if (gridView) gridView.style.display = 'none';
        if (listView) listView.style.display = 'none';
        if (tableView) tableView.style.display = 'none';
        
        const emptyMessage = document.getElementById('emptyMessage');
        if (emptyMessage) {
          emptyMessage.innerHTML = 'You haven\'t added any products yet.';
        }
      }

      function hideEmptyState() {
        if (emptyState) emptyState.style.display = 'none';
        
        // Show current view container
        const gridView = document.getElementById('gridView');
        const listView = document.getElementById('listView');
        const tableView = document.getElementById('tableView');
        
        if (gridView) gridView.style.display = currentViewMode === 'grid' ? 'block' : 'none';
        if (listView) listView.style.display = currentViewMode === 'list' ? 'block' : 'none';
        if (tableView) tableView.style.display = currentViewMode === 'table' ? 'block' : 'none';
      }

      function showLoading() {
        inventoryTableBody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-4">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </td>
          </tr>
        `;
      }

      function showError(message) {
        inventoryTableBody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-4 text-danger">
              <i class="fas fa-exclamation-triangle me-2"></i>${message}
            </td>
          </tr>
        `;
      }

      // Handle edit product form submit (details + variants + images)
      const editForm = document.getElementById('editProductForm');
      if (editForm) {
        editForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const token = AuthManager.getAuthToken();
          if (!token) return showToast('Please login', 'danger');
          const id = document.getElementById('editProductId').value;

          // 1) Update basic details
          const payload = {
            name: document.getElementById('editName').value.trim(),
            description: document.getElementById('editDescription').value.trim(),
            category: document.getElementById('editCategory').value.trim(),
            is_flash_sale: document.getElementById('editFlashSale').checked
          };

          try {
            const resp = await fetch(`/api/products/${id}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Update failed');
          } catch (err) {
            return showToast('Failed to update details: ' + err.message, 'danger');
          }

          // 2) Update variants in batch
          try {
            const rows = document.querySelectorAll('#editVariantsTableBody tr');
            const updates = [];
            rows.forEach(row => {
              const size = row.dataset.size;
              const oldColor = row.dataset.color;
              const newColor = (row.querySelector('input[data-field="color_hex"]').value || oldColor).trim();
              const stock = parseInt(row.querySelector('input[data-field="stock"]').value || '0');
              const price = parseFloat(row.querySelector('input[data-field="price"]').value || '0');
              const discount = row.querySelector('input[data-field="discount"]').value;
              const colorName = row.querySelector('input[data-field="color_name"]').value.trim();

              const updateData = {
                product_id: parseInt(id),
                size: size,
                old_color: oldColor,
                color: normalizeHex(newColor),
                stock_quantity: stock,
                price: price
              };
              if (discount !== '' && !isNaN(parseFloat(discount))) {
                const pct = Math.max(0, Math.min(100, parseFloat(discount)));
                const newPrice = Number(price) * (1 - pct/100);
                updateData.discount_price = Number.isFinite(newPrice) ? Math.max(0, Number(newPrice.toFixed(2))) : undefined;
              }
              if (colorName) updateData.color_name = colorName;

              updates.push(fetch(`/api/products/${id}/stock`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updateData)
              }).then(async r => {
                const jd = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(jd.error || `Variant update failed (${size}/${oldColor} -> ${newColor})`);
                return jd;
              }));
            });

            await Promise.all(updates);
          } catch (err) {
            return showToast('Some variants failed to update: ' + err.message, 'danger');
          }

          // 3) Optional: upload images if provided (from new gallery state)
          try {
            const hasDefaultNew = editImageState.default.some(i => i.file);
            const hasColorNew = Object.values(editImageState.colors).some(arr => arr.some(i => i.file));

            if (hasDefaultNew || hasColorNew) {
              const fd = new FormData();

              // Default images with order and primary flag
              editImageState.default.forEach((item, idx) => {
                if (item.file) {
                  fd.append('default_images[]', item.file);
                  fd.append('default_image_orders[]', idx);
                }
                if (item.primary) {
                  fd.append('default_primary_index', idx);
                }
              });

              // Color images with orders
              Object.entries(editImageState.colors).forEach(([hex, arr]) => {
                arr.forEach((item, idx) => {
                  if (item.file) {
                    fd.append('variant_images[]', item.file);
                    fd.append('variant_colors[]', hex);
                    fd.append('variant_color_names[]', inferColorNameFromHex(hex));
                    fd.append('variant_display_orders[]', idx);
                  }
                });
              });

              const imgResp = await fetch(`/api/products/${id}/images`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fd
              });
              if (!imgResp.ok) {
                const errText = await imgResp.text();
                console.warn('Image update failed:', errText);
                showToast('Images could not be updated (optional step)', 'warning');
              } else {
                // Re-fetch product to reflect images immediately
                const r = await fetch(`/api/products/${id}`);
                const d = await r.json();
                if (r.ok && d.success && d.product) {
                  populateEditImages(d.product);
                }
              }
            }
          } catch (err) {
            console.warn('Image upload error:', err);
            showToast('Images could not be updated (optional step)', 'warning');
          }

          showToast('Product updated successfully', 'success');
          const modalInst = bootstrap.Modal.getInstance(document.getElementById('editProductModal'));
          if (modalInst) modalInst.hide();
          loadInventoryData();
        });
      }

      // Global functions
      window.viewVariants = async function(productId) {
        const modalEl = document.getElementById('variantModal');
        const loadingEl = document.getElementById('modalLoading');
        const detailsEl = document.getElementById('variantDetails');
        const modalTitleEl = document.getElementById('variantModalLabel');
        const modalCategoryEl = document.getElementById('productModalCategory');
        
        if (!modalEl) return;
        
        // Show modal with loading state
        loadingEl.style.display = 'block';
        detailsEl.style.display = 'none';
        new bootstrap.Modal(modalEl).show();
        
        try {
          // Fetch detailed product information from API
          // Note: This endpoint doesn't require authentication, but we'll send token if available
          const token = AuthManager.getAuthToken();
          const headers = {};
          
          // Only add Authorization header if we have a valid token
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch(`/api/products/${productId}`, {
            headers: headers
          });
          
          if (!response.ok) {
            throw new Error('Failed to fetch product details');
          }
          
          const data = await response.json();
          if (!data.success || !data.product) {
            throw new Error('Product not found');
          }
          
          const product = data.product;
          
          // Update modal title and category
          if (modalTitleEl) modalTitleEl.textContent = product.name || 'Product Details';
          if (modalCategoryEl) modalCategoryEl.textContent = product.category || 'Uncategorized';
          
          // Build product overview
          const overviewEl = document.getElementById('productOverview');
          if (overviewEl) {
            overviewEl.innerHTML = `
              <div class="mb-3">
                <strong>Product Name:</strong><br>
                <span class="text-muted">${escapeHtml(product.name || 'N/A')}</span>
              </div>
              <div class="mb-3">
                <strong>Description:</strong><br>
                <span class="text-muted">${escapeHtml(product.description || 'No description provided')}</span>
              </div>
              <div class="mb-3">
                <strong>Base Price:</strong><br>
                <span class="text-success fw-bold">₱${parseFloat(product.price || 0).toFixed(2)}</span>
              </div>
              <div class="mb-3">
                <strong>Category:</strong><br>
                <span class="badge bg-secondary">${escapeHtml(product.category || 'Uncategorized')}</span>
              </div>
              <div class="mb-3">
                <strong>Status:</strong><br>
                <span class="badge ${product.is_flash_sale ? 'bg-danger' : 'bg-primary'}">
                  ${product.is_flash_sale ? 'Flash Sale' : 'Regular Product'}
                </span>
              </div>
            `;
          }
          
          // Build product stats
          const statsEl = document.getElementById('productStats');
          if (statsEl) {
            const totalVariants = product.size_color_stock ? 
              Object.values(product.size_color_stock).reduce((sum, colors) => sum + Object.keys(colors).length, 0) : 0;
            const totalStock = product.total_stock || 0;
            
            statsEl.innerHTML = `
              <div class="row g-3">
                <div class="col-6">
                  <div class="stat-card text-center p-3 bg-light rounded">
                    <h4 class="mb-1 text-primary">${totalVariants}</h4>
                    <small class="text-muted">Total Variants</small>
                  </div>
                </div>
                <div class="col-6">
                  <div class="stat-card text-center p-3 bg-light rounded">
                    <h4 class="mb-1 ${getStockColorClass(totalStock).replace('text-', '')}">${totalStock}</h4>
                    <small class="text-muted">Total Stock</small>
                  </div>
                </div>
                <div class="col-6">
                  <div class="stat-card text-center p-3 bg-light rounded">
                    <h4 class="mb-1 text-info">${Object.keys(product.size_color_stock || {}).length}</h4>
                    <small class="text-muted">Sizes Available</small>
                  </div>
                </div>
                <div class="col-6">
                  <div class="stat-card text-center p-3 bg-light rounded">
                    <h4 class="mb-1 text-warning">${(product.variant_images || []).length}</h4>
                    <small class="text-muted">Product Images</small>
                  </div>
                </div>
              </div>
            `;
          }
          
          // Build enhanced product images gallery
          const imagesEl = document.getElementById('productImages');
          if (imagesEl) {
            let imagesHtml = '';
            
            // Group images by color for better organization
            const imagesByColor = {};
            
            // Add primary image to 'default' category
            if (product.image_url) {
              imagesByColor['Primary'] = [{
                image_url: product.image_url,
                color: 'Primary',
                size: '',
                isPrimary: true
              }];
            }
            
            // Group variant images by color
            if (product.variant_images && product.variant_images.length > 0) {
              product.variant_images.forEach(img => {
                const colorKey = img.color || 'Other';
                if (!imagesByColor[colorKey]) {
                  imagesByColor[colorKey] = [];
                }
                imagesByColor[colorKey].push(img);
              });
            }
            
            if (Object.keys(imagesByColor).length > 0) {
              imagesHtml = `
                <div class="enhanced-image-gallery">
                  <div class="gallery-header d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">
                      <i class="fas fa-images text-primary me-2"></i>
                      Product Gallery
                      <span class="badge bg-primary ms-2">${Object.values(imagesByColor).flat().length} images</span>
                    </h6>
                    <div class="gallery-controls">
                      <button class="btn btn-sm btn-outline-secondary" onclick="toggleGalleryView(this)" data-view="grid">
                        <i class="fas fa-th"></i> Grid
                      </button>
                      <button class="btn btn-sm btn-outline-secondary" onclick="toggleGalleryView(this)" data-view="list">
                        <i class="fas fa-list"></i> List
                      </button>
                    </div>
                  </div>
                  
                  <div class="gallery-content" data-gallery-view="grid">
                    ${Object.entries(imagesByColor).map(([colorName, images]) => `
                      <div class="color-image-group mb-4">
                        <div class="color-group-header d-flex align-items-center mb-3">
                          ${colorName !== 'Primary' && colorName !== 'Other' ? `
                            <div class="color-indicator me-2" style="width: 20px; height: 20px; background-color: ${getColorHex(colorName)}; border-radius: 50%; border: 2px solid #dee2e6;"></div>
                          ` : `
                            <i class="fas fa-${colorName === 'Primary' ? 'star' : 'image'} text-muted me-2"></i>
                          `}
                          <h6 class="mb-0 text-muted">${colorName} ${colorName === 'Primary' ? 'Image' : `(${images.length} image${images.length > 1 ? 's' : ''})`}</h6>
                        </div>
                        
                        <div class="images-grid row g-2">
                          ${images.map((img, index) => `
                            <div class="col-6 col-md-4 col-lg-3">
                              <div class="image-thumbnail position-relative">
                                <img src="${img.image_url}" 
                                     alt="${img.color || colorName} ${img.size ? '- ' + img.size : ''}" 
                                     class="img-fluid rounded border gallery-image" 
                                     style="aspect-ratio: 1; object-fit: cover; cursor: pointer; transition: transform 0.2s;" 
                                     onclick="openImageLightbox('${img.image_url}', '${img.color || colorName}', ${index}, '${colorName}')" 
                                     onmouseover="this.style.transform='scale(1.02)'" 
                                     onmouseout="this.style.transform='scale(1)'" 
                                     onerror="this.parentElement.style.display='none'">
                                
                                ${img.isPrimary ? `
                                  <div class="position-absolute top-0 end-0 m-1">
                                    <span class="badge bg-warning text-dark">
                                      <i class="fas fa-star"></i> Primary
                                    </span>
                                  </div>
                                ` : ''}
                                
                                ${img.size ? `
                                  <div class="position-absolute bottom-0 start-0 end-0 bg-gradient bg-dark bg-opacity-75 text-white text-center py-1" style="font-size: 0.75rem; border-radius: 0 0 0.375rem 0.375rem;">
                                    Size: ${img.size}
                                  </div>
                                ` : ''}
                                
                                <div class="image-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50 opacity-0 transition-opacity" style="border-radius: 0.375rem; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                                  <i class="fas fa-search-plus text-white fs-4"></i>
                                </div>
                              </div>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            } else {
              imagesHtml = `
                <div class="alert alert-info d-flex align-items-center">
                  <i class="fas fa-info-circle me-2"></i>
                  <div>
                    <strong>No images available</strong><br>
                    <small class="text-muted">Add images to this product to see them here.</small>
                  </div>
                </div>
              `;
            }
            
            imagesEl.innerHTML = imagesHtml;
          }
          
          // Build variants table
          const variantsEl = document.getElementById('variantsTable');
          if (variantsEl && product.size_color_stock) {
            let tableHtml = `
              <div class="table-responsive">
                <table class="table table-hover">
                  <thead class="table-light">
                    <tr>
                      <th>Size</th>
                      <th>Color</th>
                      <th>Stock</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
            `;
            
            Object.entries(product.size_color_stock).forEach(([size, colors]) => {
              Object.entries(colors).forEach(([colorHex, colorData]) => {
                const stock = colorData.stock || 0;
                const price = colorData.price || 0;
                const discountPrice = colorData.discount_price;
                const colorName = colorData.name || colorHex;
                
                tableHtml += `
                  <tr>
                    <td><span class="badge bg-light text-dark">${escapeHtml(size)}</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2">
                        <span class="color-dot" style="width: 16px; height: 16px; background-color: ${colorHex}; border-radius: 50%; border: 1px solid #ccc;"></span>
                        <span>${escapeHtml(colorName)}</span>
                      </div>
                    </td>
                    <td><span class="${getStockColorClass(stock)}">${stock}</span></td>
                    <td>
                      ${discountPrice ? `
                        <span class="text-success fw-bold">₱${parseFloat(discountPrice).toFixed(2)}</span>
                        <br><small class="text-muted text-decoration-line-through">₱${parseFloat(price).toFixed(2)}</small>
                      ` : `
                        <span class="fw-bold">₱${parseFloat(price).toFixed(2)}</span>
                      `}
                    </td>
                    <td><span class="badge ${getStatusBadgeClass(stock)}">${getStatusText(stock)}</span></td>
                  </tr>
                `;
              });
            });
            
            tableHtml += `
                  </tbody>
                </table>
              </div>
            `;
            
            variantsEl.innerHTML = tableHtml;
          } else {
            // Handle products without proper variant structure
            if (variantsEl) {
              variantsEl.innerHTML = `
                <div class="alert alert-warning">
                  <i class="fas fa-exclamation-triangle me-2"></i>
                  This product doesn't have detailed variant information configured. 
                  You may need to edit the product to add size and color variants.
                </div>
              `;
            }
          }
          
          // Setup edit button
          const editBtn = document.getElementById('editProductBtn');
          if (editBtn) {
            editBtn.onclick = () => editProduct(productId);
          }
          
          // Hide loading and show content
          loadingEl.style.display = 'none';
          detailsEl.style.display = 'block';
          
        } catch (error) {
          console.error('Error loading product details:', error);
          
          // Show error state
          loadingEl.style.display = 'none';
          detailsEl.style.display = 'block';
          detailsEl.innerHTML = `
            <div class="alert alert-danger">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Failed to load product details: ${error.message}
            </div>
          `;
        }
      };

      window.editProduct = async function(productId) {
        try {
          const token = AuthManager.getAuthToken();
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          // Fetch current product details
          const resp = await fetch(`/api/products/${productId}`, { headers });
          const data = await resp.json();
          if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to load product');
          const p = data.product;
          currentEditingProduct = p;

          // Populate form
          document.getElementById('editProductId').value = p.id;
          document.getElementById('editName').value = p.name || '';
          document.getElementById('editDescription').value = p.description || '';

          // Display calculated total stock (read-only)
          document.getElementById('displayTotalStock').textContent = parseInt(p.total_stock || 0);
          
          // Set category dropdown
          document.getElementById('editCategory').value = p.category || '';
          document.getElementById('editFlashSale').checked = !!p.is_flash_sale;

          // Build variants editor
          buildEditVariantsTable(p);

          // Build images tab
          populateEditImages(p);

          // Hook Add Variant button
          const addBtn = document.getElementById('addVariantBtn');
          if (addBtn) addBtn.onclick = () => openAddVariant(p.id, p);

          // Show modal
          const modalEl = document.getElementById('editProductModal');
          const modal = new bootstrap.Modal(modalEl);
          
          // Ensure scrolling works when modal is shown
          modalEl.addEventListener('shown.bs.modal', function() {
            const tabContent = modalEl.querySelector('.tab-content');
            if (tabContent) {
              // Force enable scrolling
              tabContent.style.overflowY = 'auto';
              tabContent.style.maxHeight = 'calc(90vh - 200px)';
            }
            // Ensure body can scroll (Bootstrap might have disabled it)
            document.body.style.overflow = '';
          });
          
          modal.show();
        } catch (e) {
          showToast('Failed to open edit modal: ' + e.message, 'danger');
        }
      };

      function buildEditVariantsTable(product) {
        const tbody = document.getElementById('editVariantsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let computedTotal = 0;
        const sizeColor = product.size_color_stock || {};
        const sizes = Object.keys(sizeColor);
        const empty = document.getElementById('editVariantsEmpty');
        if (empty) empty.classList.toggle('d-none', sizes.length !== 0);
        Object.entries(sizeColor).forEach(([size, colors]) => {
          Object.entries(colors).forEach(([colorHex, colorData]) => {
            const stock = colorData.stock || 0;
            const price = colorData.price || 0;
            const discountPrice = colorData.discount_price || '';
            const colorName = colorData.name || '';
            // Convert discount price to percent for UI
            let discountPercent = '';
            if (price && discountPrice && Number(price) > 0 && Number(discountPrice) < Number(price)) {
              discountPercent = Math.round((1 - (Number(discountPrice) / Number(price))) * 10000) / 100;
            }
            computedTotal += stock || 0;

            const tr = document.createElement('tr');
            tr.dataset.size = size;
            tr.dataset.color = colorHex; // original color for old_color
            tr.innerHTML = `
              <td><span class=\"badge bg-light text-dark\">${escapeHtml(size)}</span></td>
              <td>
                <div class=\"color-suite\">
                  <input type=\"color\" class=\"form-control form-control-color p-0\" data-field=\"color_picker\" value=\"${colorHex}\" title=\"Pick color\">
                  <input type=\"text\" class=\"form-control form-control-sm hex\" data-field=\"color_hex\" value=\"${escapeHtml(colorHex)}\" placeholder=\"#000000\" readonly style=\"background-color: #f8f9fa; cursor: not-allowed;\">
                  <input type=\"text\" class=\"form-control form-control-sm name\" data-field=\"color_name\" value=\"${escapeHtml(colorName)}\" placeholder=\"Name\" readonly style=\"background-color: #f8f9fa; cursor: not-allowed;\">
                </div>
              </td>
              <td><input type=\"number\" class=\"form-control form-control-sm\" data-field=\"stock\" min=\"0\" value=\"${stock}\" placeholder=\"0\"></td>
              <td><input type=\"number\" class=\"form-control form-control-sm\" data-field=\"price\" min=\"0\" step=\"0.01\" value=\"${price}\" placeholder=\"0.00\"></td>
              <td><input type=\"number\" class=\"form-control form-control-sm\" data-field=\"discount\" min=\"0\" max=\"100\" step=\"0.01\" value=\"${discountPercent}\" placeholder=\"0-100\"></td>
            `;
            tbody.appendChild(tr);

            // Wire up color pickers and auto-name behavior per row
            const picker = tr.querySelector('input[data-field=\"color_picker\"]');
            const hexInput = tr.querySelector('input[data-field=\"color_hex\"]');
            const nameInput = tr.querySelector('input[data-field=\"color_name\"]');
            
            // Define helper functions first
            const syncHexToPicker = (hex) => { 
              hexInput.value = normalizeHex(hex); 
            };
            const applyAutoName = (hex) => {
              const normalized = normalizeHex(hex);
              const generated = inferColorNameFromHex(normalized);
              // Always use auto-generated name (no manual editing allowed)
              nameInput.value = generated;
              nameInput.dataset.autoName = generated;
            };
            
            // Ensure hex input is read-only and prevent editing
            if (hexInput) {
              hexInput.setAttribute('readonly', 'readonly');
              hexInput.readOnly = true; // Set readonly property
              hexInput.style.backgroundColor = '#f8f9fa';
              hexInput.style.cursor = 'not-allowed';
              // Prevent any input events
              hexInput.addEventListener('keydown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              });
              hexInput.addEventListener('input', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Restore value from color picker
                syncHexToPicker(picker.value);
                return false;
              });
              hexInput.addEventListener('paste', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              });
              hexInput.addEventListener('focus', (e) => {
                e.target.blur(); // Remove focus immediately
              });
            }
            
            // Ensure color name input is read-only and prevent editing
            if (nameInput) {
              nameInput.setAttribute('readonly', 'readonly');
              nameInput.readOnly = true; // Set readonly property
              nameInput.style.backgroundColor = '#f8f9fa';
              nameInput.style.cursor = 'not-allowed';
              // Prevent any input events
              nameInput.addEventListener('keydown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              });
              nameInput.addEventListener('input', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Restore value from auto-generated name
                applyAutoName(picker.value);
                return false;
              });
              nameInput.addEventListener('paste', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              });
              nameInput.addEventListener('focus', (e) => {
                e.target.blur(); // Remove focus immediately
              });
            }

            // Sync color picker changes to hex input (one-way: picker -> hex)
            picker.addEventListener('input', () => {
              const val = picker.value;
              syncHexToPicker(val);
              applyAutoName(val);
            });
            
            // Initial sync to ensure hex input shows current color
            syncHexToPicker(colorHex);
            applyAutoName(colorHex);
          });
        });
        const stockEl = document.getElementById('displayTotalStock');
        if (stockEl) stockEl.textContent = computedTotal;
      }

      // Image editing state
      let editImageState = { default: [], colors: {} };

      function populateEditImages(product) {
        editImageState = { default: [], colors: {} };

        // Build default gallery from existing image_url if present
        if (product.image_url) {
          editImageState.default.push({ url: product.image_url, existing: true, primary: true });
        }
        // Include images from product_variant_images
        if (Array.isArray(product.variant_images)) {
          product.variant_images.forEach(img => {
            if (!img || !img.image_url) return;
            const tag = (img.color_hex || img.color || '').toString();
            if (tag.toLowerCase() === 'default') {
              editImageState.default.push({ url: img.image_url, existing: true, primary: false });
              return;
            }
            const hex = tag || null;
            if (hex) {
              const key = normalizeHex(hex);
              if (!editImageState.colors[key]) editImageState.colors[key] = [];
              editImageState.colors[key].push({ url: img.image_url, existing: true, color: key, name: img.color_name || img.color || '' });
            }
          });
        }

        renderDefaultGallery();
        renderColorGalleries(product);
        setupDefaultDropzone();
      }

      function setupDefaultDropzone() {
        const drop = document.getElementById('editDefaultDrop');
        const input = document.getElementById('editDefaultInput');
        if (!drop || !input) return;
        drop.addEventListener('click', () => input.click());
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#FF2BAC'; });
        drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
        drop.addEventListener('drop', e => {
          e.preventDefault();
          drop.style.borderColor = '';
          const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (files.length) addDefaultFiles(files);
        });
        input.addEventListener('change', e => {
          const files = Array.from(e.target.files);
          addDefaultFiles(files);
          input.value = '';
        });
      }

      function addDefaultFiles(files) {
        files.forEach(file => {
          editImageState.default.push({ file, url: URL.createObjectURL(file), existing: false, primary: false });
        });
        // ensure at least one primary
        if (!editImageState.default.some(i => i.primary)) {
          const first = editImageState.default[0]; if (first) first.primary = true;
        }
        renderDefaultGallery();
      }

      function renderDefaultGallery() {
        const grid = document.getElementById('editDefaultGrid');
        if (!grid) return;
        grid.innerHTML = '';
        editImageState.default.forEach((item, index) => {
          const col = document.createElement('div');
          col.className = 'col-6 col-md-3';
          col.innerHTML = `
            <div class="thumb" draggable="true" data-index="${index}">
              <span class="handle"><i class="fas fa-grip-vertical"></i></span>
              <button type="button" class="remove" title="Remove">×</button>
              ${item.primary ? '<span class="primary"><i class="fas fa-star me-1"></i>Primary</span>' : ''}
              <img src="${item.url}" alt="default">
            </div>`;
          grid.appendChild(col);

          const t = col.querySelector('.thumb');
          const remove = col.querySelector('.remove');
          t.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', index.toString()); });
          t.addEventListener('dragover', e => e.preventDefault());
          t.addEventListener('drop', e => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const to = index;
            if (!isNaN(from) && from !== to) {
              const arr = editImageState.default;
              const [m] = arr.splice(from, 1);
              arr.splice(to, 0, m);
              renderDefaultGallery();
            }
          });
          t.addEventListener('click', (e) => {
            if (e.shiftKey) { // set primary on Shift+Click
              editImageState.default.forEach(i => i.primary = false);
              editImageState.default[index].primary = true;
              renderDefaultGallery();
            }
          });
          remove.addEventListener('click', () => {
            const arr = editImageState.default;
            const wasPrimary = arr[index].primary;
            arr.splice(index, 1);
            if (wasPrimary && arr[0]) arr[0].primary = true;
            renderDefaultGallery();
          });
        });
      }

      function renderColorGalleries(product) {
        const wrap = document.getElementById('editColorGalleries');
        if (!wrap) return;
        wrap.innerHTML = '';
        const scs = product.size_color_stock || {};
        const seen = new Set();
        Object.values(scs).forEach(colors => {
          Object.entries(colors).forEach(([hex, cd]) => {
            const key = normalizeHex(hex);
            if (seen.has(key)) return; seen.add(key);
            if (!editImageState.colors[key]) editImageState.colors[key] = [];
            const col = document.createElement('div'); col.className = 'col-12';
            const title = cd.name || key;
            col.innerHTML = `
              <div class="subtle-card">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <div class="d-flex align-items-center gap-2">
                    <span class="color-dot" style="width:16px;height:16px;border-radius:50%;border:1px solid #ccc;background:${key}"></span>
                    <div class="section-title mb-0">${escapeHtml(title)}</div>
                  </div>
                </div>
                <div class=\"row g-2\" id=\"grid-${key.replace('#','')}\" data-color=\"${key}\"></div>
              </div>`;
            wrap.appendChild(col);

            // Render existing thumbs
            const grid = col.querySelector(`#grid-${key.replace('#','')}`);
            // Remove add button and direct upload; variants are added via Add Variant modal
            renderColorGrid(key);
          });
        });
      }

      function renderColorGrid(colorHex) {
        const grid = document.querySelector(`#grid-${colorHex.replace('#','')}`);
        if (!grid) return;
        grid.innerHTML = '';
        const arr = editImageState.colors[colorHex] || [];
        arr.forEach((item, index) => {
          const col = document.createElement('div'); col.className = 'col-6 col-md-3';
          col.innerHTML = `
            <div class="thumb" draggable="true" data-index="${index}">
              <span class="handle"><i class="fas fa-grip-vertical"></i></span>
              <button type="button" class="remove" title="Remove">×</button>
              <img src="${item.url}" alt="${colorHex}">
            </div>`;
          grid.appendChild(col);

          const t = col.querySelector('.thumb');
          const remove = col.querySelector('.remove');
          t.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', index.toString());
            e.dataTransfer.setData('color', colorHex);
          });
          t.addEventListener('dragover', e => e.preventDefault());
          t.addEventListener('drop', e => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const arrRef = editImageState.colors[colorHex];
            const to = index;
            if (!isNaN(from) && arrRef) {
              const [m] = arrRef.splice(from, 1);
              arrRef.splice(to, 0, m);
              renderColorGrid(colorHex);
            }
          });
          remove.addEventListener('click', () => {
            const arrRef = editImageState.colors[colorHex];
            arrRef.splice(index, 1);
            renderColorGrid(colorHex);
          });
        });
      }

      window.editVariant = async function(variantId) {
        // Implementation for editing variant
        // Search in current page data first
        let variant = inventoryData.find(item => item.variant_id == variantId);
        // If not found on current page, might need to reload or search differently
        if (!variant) {
          console.warn(`Variant ${variantId} not found on current page. You may need to navigate to the page containing this variant.`);
          return;
        }

        document.getElementById('editVariantId').value = variantId;
        document.getElementById('editStock').value = variant.stock;
        document.getElementById('editPrice').value = variant.price;

        const modal = new bootstrap.Modal(document.getElementById('editVariantModal'));
        modal.show();
      };

      window.saveVariantChanges = async function() {
        try {
          const variantId = document.getElementById('editVariantId').value;
          const stock = parseInt(document.getElementById('editStock').value);
          const price = parseFloat(document.getElementById('editPrice').value);
          
          if (!variantId || isNaN(stock) || isNaN(price) || stock < 0 || price < 0) {
            showToast('Please fill in all fields with valid values', 'warning');
            return;
          }
          
          // Show loading state
          const saveBtn = document.querySelector('#editVariantModal .btn-primary');
          const originalText = saveBtn.innerHTML;
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';
          
          // Update variant via API
          const token = AuthManager.getAuthToken();
          const response = await fetch(`/api/products/variants/${variantId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              stock_quantity: stock,
              price: price
            })
          });
          
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to update variant');
          
          showToast('Variant updated successfully!', 'success');
          
          // Close modal
          const modal = bootstrap.Modal.getInstance(document.getElementById('editVariantModal'));
          modal.hide();
          
          // Refresh inventory data
          loadInventoryData();
          
        } catch (error) {
          console.error('Error saving variant changes:', error);
          showToast('Failed to save changes: ' + error.message, 'danger');
        } finally {
          // Restore button state
          const saveBtn = document.querySelector('#editVariantModal .btn-primary');
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Changes';
          }
        }
      };
      
      window.saveInlineVariantChanges = async function() {
        try {
          const productId = document.getElementById('variantProductId').value;
          const size = document.getElementById('variantSize').value;
          const oldColor = document.getElementById('variantColor').value;
          const newColor = document.getElementById('variantColorPicker') ? document.getElementById('variantColorPicker').value : oldColor;
          const stock = parseInt(document.getElementById('variantStock').value);
          const price = parseFloat(document.getElementById('variantPrice').value);
          const discountPercent = document.getElementById('variantDiscountPercent').value;
          const colorName = document.getElementById('variantColorName').value;
          
          if (!productId || !size || !newColor || isNaN(stock) || isNaN(price) || stock < 0 || price < 0) {
            showToast('Please fill in all required fields with valid values', 'warning');
            return;
          }
          
          // Show loading state
          const saveBtn = document.querySelector('#inlineVariantModal .btn-primary');
          const originalText = saveBtn.innerHTML;
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';
          
          // Prepare update data
          const updateData = {
            product_id: parseInt(productId),
            size: size,
            old_color: oldColor,  // For identifying which variant to update
            color: newColor,      // New color value
            stock_quantity: stock,
            price: price
          };
          
          // Add optional fields if provided
          if (discountPercent && !isNaN(parseFloat(discountPercent))) {
            const pct = Math.max(0, Math.min(100, parseFloat(discountPercent)));
            updateData.discount_price = Math.max(0, Number((price * (1 - pct/100)).toFixed(2)));
          }
          if (colorName && colorName.trim()) {
            updateData.color_name = colorName.trim();
          }
          
          // Update variant via API
          const token = AuthManager.getAuthToken();
          const response = await fetch(`/api/products/${productId}/stock`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateData)
          });
          
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to update variant');
          
          showToast('Variant updated successfully!', 'success');
          
          // Close modal
          const modal = bootstrap.Modal.getInstance(document.getElementById('inlineVariantModal'));
          modal.hide();
          
          // Refresh inventory data
          loadInventoryData();
          
        } catch (error) {
          console.error('Error saving inline variant changes:', error);
          showToast('Failed to save changes: ' + error.message, 'danger');
        } finally {
          // Restore button state
          const saveBtn = document.querySelector('#inlineVariantModal .btn-primary');
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Changes';
          }
        }
      };

      window.deleteProduct = async function(productId) {
        try {
          // Fetch name to show in confirm modal
          const headers = {};
          const token = AuthManager.getAuthToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const resp = await fetch(`/api/products/${productId}`, { headers });
          let name = 'this product';
          if (resp.ok) {
            const data = await resp.json();
            name = data.product?.name || name;
          }
          document.getElementById('deleteProductName').textContent = name;
          const confirmBtn = document.getElementById('confirmDeleteProductBtn');
          const modalEl = document.getElementById('deleteProductModal');
          const modal = new bootstrap.Modal(modalEl);
          modal.show();

          // Attach one-time handler
          const onConfirm = async () => {
            confirmBtn.disabled = true;
            try {
              const delResp = await fetch(`/api/products/${productId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${AuthManager.getAuthToken()}` }
              });
              const delData = await delResp.json();
              if (!delResp.ok) throw new Error(delData.error || 'Delete failed');
              showToast('Product deleted', 'success');
              modal.hide();
              loadInventoryData();
            } catch (err) {
              showToast('Failed to delete: ' + err.message, 'danger');
            } finally {
              confirmBtn.disabled = false;
              confirmBtn.removeEventListener('click', onConfirm);
            }
          };
          confirmBtn.addEventListener('click', onConfirm);
          modalEl.addEventListener('hidden.bs.modal', () => {
            confirmBtn.removeEventListener('click', onConfirm);
          }, { once: true });
        } catch (e) {
          showToast('Failed to open delete dialog', 'danger');
        }
      };

      window.deleteVariant = function(variantId) {
        if (confirm('Are you sure you want to delete this variant?')) {
          showToast('Delete variant functionality coming soon!', 'warning');
        }
      };
      
      window.editVariantInline = async function(productId, size, colorHex) {
        try {
          const token = AuthManager.getAuthToken();
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          
          // Fetch product details to get variant information
          const resp = await fetch(`/api/products/${productId}`, { headers });
          const data = await resp.json();
          if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to load product');
          
          // Try to find variant in different possible data structures
          let variant = null;
          let variants = [];
          
          // Check if data has variants array
          if (data.variants && Array.isArray(data.variants)) {
            variants = data.variants;
          }
          // Check if product has size_color_stock object structure
          else if (data.product?.size_color_stock) {
            const sizeColorStock = data.product.size_color_stock;
            for (const [sizeKey, colors] of Object.entries(sizeColorStock)) {
              for (const [colorKey, stockInfo] of Object.entries(colors)) {
                variants.push({
                  size: sizeKey,
                  color: colorKey,
                  color_name: stockInfo.name || colorKey,
                  stock_quantity: stockInfo.stock,
                  price: stockInfo.price,
                  discount_price: stockInfo.discount_price
                });
              }
            }
          }
          
          // Find the specific variant
          variant = variants.find(v => {
            const sizeMatch = v.size === size;
            // Try matching both color hex and color name
            const colorHexMatch = v.color === colorHex;
            const colorNameMatch = (v.color_name && v.color_name === colorHex) || (v.name && v.name === colorHex);
            return sizeMatch && (colorHexMatch || colorNameMatch);
          });
          
          if (!variant) {
            console.error('Variant not found. Looking for:', { size, color: colorHex });
            console.error('Available variants:', variants);
            showToast(`Variant not found: ${size}/${colorHex}`, 'error');
            return;
          }
          
          // Create and show inline variant editing modal
          createInlineVariantEditModal(productId, variant, data.product);
          
        } catch (error) {
          console.error('Error loading variant for editing:', error);
          showToast('Failed to load variant: ' + error.message, 'danger');
        }
      };
      
      function createInlineVariantEditModal(productId, variant, product) {
        // Remove existing modal if any
        const existingModal = document.getElementById('inlineVariantModal');
        if (existingModal) {
          existingModal.remove();
        }
        
        // Create modal HTML
        const modalHtml = `
          <div class="modal fade" id="inlineVariantModal" tabindex="-1" aria-labelledby="inlineVariantModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <div>
                    <h5 class="modal-title" id="inlineVariantModalLabel">
                      <i class="fas fa-edit me-2 text-primary"></i>Edit Variant
                    </h5>
                    <p class="mb-0 text-muted">${product.name} - ${variant.size} / ${variant.color_name || variant.color}</p>
                  </div>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="inlineVariantForm">
                    <input type="hidden" id="variantProductId" value="${productId}">
                    <input type="hidden" id="variantSize" value="${variant.size}">
                    <input type="hidden" id="variantColor" value="${variant.color}">
                    
                    <div class="row g-3">
                      <div class="col-md-6">
                        <label for="variantStock" class="form-label fw-semibold">
                          <i class="fas fa-boxes me-1"></i>Stock Quantity
                        </label>
                        <input type="number" class="form-control" id="variantStock" 
                               value="${variant.stock_quantity}" min="0" required>
                        <div class="form-text">Current stock: ${variant.stock_quantity} units</div>
                      </div>
                      
                      <div class="col-md-6">
                        <label for="variantPrice" class="form-label fw-semibold">
                          <i class="fas fa-peso-sign me-1"></i>Price (₱)
                        </label>
                        <input type="number" class="form-control" id="variantPrice" 
                               value="${variant.price}" step="0.01" min="0" required>
                        <div class="form-text">Current variant price</div>
                      </div>
                    </div>
                    
                    <div class="row g-3 mt-2">
                      <div class="col-md-6">
                        <label for=\"variantDiscountPercent\" class=\"form-label fw-semibold\">
                          <i class=\"fas fa-percentage me-1\"></i>Discount (%)
                        </label>
                        <input type=\"number\" class=\"form-control\" id=\"variantDiscountPercent\" 
                               value=\"${(variant.discount_price && variant.price && Number(variant.price)>0 && Number(variant.discount_price)<Number(variant.price)) ? Math.round((1-Number(variant.discount_price)/Number(variant.price))*10000)/100 : ''}\" step=\"0.01\" min=\"0\" max=\"100\" 
                               placeholder=\"0-100\">
                        <div class="form-text">Leave empty for no discount</div>
                      </div>
                      
                      <div class="col-md-6">
                        <label class="form-label fw-semibold mb-2">
                          <i class="fas fa-palette me-1"></i>Color Settings
                        </label>
                        <div class="d-flex align-items-end gap-2 mb-2">
                          <div style="flex: 0 0 60px;">
                            <label for="variantColorPicker" class="form-label small mb-1">Color</label>
                            <input type="color" class="form-control form-control-color p-1" id="variantColorPicker" 
                                   value="${variant.color}" title="Choose color" style="width: 50px; height: 38px;">
                          </div>
                          <div style="flex: 1;">
                            <label for="variantColorName" class="form-label small mb-1">Display Name</label>
                            <input type="text" class="form-control form-control-sm" id="variantColorName" 
                                   value="${variant.color_name || ''}" placeholder="Auto-generated" readonly style="background-color: #f8f9fa; cursor: not-allowed;">
                          </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 text-muted small">
                          <span>Preview:</span>
                          <div class="color-preview" style="width: 16px; height: 16px; background: ${variant.color}; border: 1px solid #ccc; border-radius: 3px; flex-shrink: 0;"></div>
                          <span class="text-truncate">${variant.color_name || variant.color}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div class="mt-3 p-3 bg-light rounded">
                      <h6 class="mb-2"><i class="fas fa-info-circle me-1 text-info"></i>Variant Information</h6>
                      <div class="row g-2">
                        <div class="col-sm-4">
                          <small class="text-muted d-block">Size:</small>
                          <strong>${variant.size}</strong>
                        </div>
                        <div class="col-sm-4">
                          <small class="text-muted d-block">Color:</small>
                          <div class="d-flex align-items-center">
                            <div class="color-swatch me-2" style="width: 16px; height: 16px; background: ${variant.color}; border: 1px solid #ddd; border-radius: 3px;"></div>
                            <strong>${variant.color_name || variant.color}</strong>
                          </div>
                        </div>
                        <div class="col-sm-4">
                          <small class="text-muted d-block">Current Status:</small>
                          <span class="badge ${variant.stock_quantity > 0 ? (variant.stock_quantity <= 10 ? 'bg-warning' : 'bg-success') : 'bg-danger'}">
                            ${variant.stock_quantity > 0 ? (variant.stock_quantity <= 10 ? 'Low Stock' : 'In Stock') : 'Out of Stock'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Cancel
                  </button>
                  <button type="button" class="btn btn-primary" onclick="saveInlineVariantChanges()" 
                          style="background: linear-gradient(135deg, #FF2BAC 0%, #FF6BCE 100%); border: none;">
                    <i class="fas fa-save me-1"></i>Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('inlineVariantModal'));
        modal.show();
        
        // Add color picker event listener with automatic color name generation
        const colorPicker = document.getElementById('variantColorPicker');
        const colorPreview = document.querySelector('.color-preview');
        const colorName = document.getElementById('variantColorName');
        
        // Make color name input read-only
        if (colorName) {
          colorName.setAttribute('readonly', 'readonly');
          colorName.readOnly = true;
          colorName.style.backgroundColor = '#f8f9fa';
          colorName.style.cursor = 'not-allowed';
          // Prevent any input events
          colorName.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          });
          colorName.addEventListener('input', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Restore value from auto-generated name
            const generatedName = generateColorName(colorPicker.value);
            colorName.value = generatedName;
            return false;
          });
          colorName.addEventListener('paste', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          });
          colorName.addEventListener('focus', (e) => {
            e.target.blur();
          });
        }
        
        // Color name generation function
        function generateColorName(hexColor) {
          const colorMap = {
            '#000000': 'Black',
            '#ffffff': 'White',
            '#ff0000': 'Red',
            '#00ff00': 'Lime',
            '#0000ff': 'Blue',
            '#ffff00': 'Yellow',
            '#ff00ff': 'Magenta',
            '#00ffff': 'Cyan',
            '#800000': 'Maroon',
            '#008000': 'Green',
            '#000080': 'Navy',
            '#808000': 'Olive',
            '#800080': 'Purple',
            '#008080': 'Teal',
            '#c0c0c0': 'Silver',
            '#808080': 'Gray',
            '#ffa500': 'Orange',
            '#ffc0cb': 'Pink',
            '#a52a2a': 'Brown',
            '#dda0dd': 'Plum',
            '#90ee90': 'Light Green',
            '#add8e6': 'Light Blue',
            '#f0e68c': 'Khaki',
            '#e6e6fa': 'Lavender',
            '#ffd700': 'Gold',
            '#40e0d0': 'Turquoise',
            '#ee82ee': 'Violet',
            '#98fb98': 'Pale Green',
            '#f5deb3': 'Wheat',
            '#d2691e': 'Chocolate'
          };
          
          const lowerHex = hexColor.toLowerCase();
          if (colorMap[lowerHex]) {
            return colorMap[lowerHex];
          }
          
          // Generate descriptive name based on RGB values
          const r = parseInt(hexColor.slice(1, 3), 16);
          const g = parseInt(hexColor.slice(3, 5), 16);
          const b = parseInt(hexColor.slice(5, 7), 16);
          
          // Determine dominant color
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const diff = max - min;
          
          if (diff < 30) {
            // Grayscale
            if (max < 50) return 'Very Dark';
            if (max < 100) return 'Dark Gray';
            if (max < 150) return 'Gray';
            if (max < 200) return 'Light Gray';
            return 'Very Light';
          }
          
          // Color-based naming
          let colorName = '';
          if (r === max) {
            if (g > b) colorName = g > 150 ? 'Orange' : 'Red';
            else colorName = b > 150 ? 'Pink' : 'Red';
          } else if (g === max) {
            if (r > b) colorName = r > 150 ? 'Yellow' : 'Green';
            else colorName = b > 150 ? 'Cyan' : 'Green';
          } else {
            if (r > g) colorName = r > 150 ? 'Purple' : 'Blue';
            else colorName = g > 150 ? 'Teal' : 'Blue';
          }
          
          // Add lightness descriptor
          const brightness = (r + g + b) / 3;
          if (brightness < 100) colorName = 'Dark ' + colorName;
          else if (brightness > 200) colorName = 'Light ' + colorName;
          
          return colorName;
        }
        
        if (colorPicker && colorPreview) {
          colorPicker.addEventListener('input', function() {
            const selectedColor = this.value;
            colorPreview.style.background = selectedColor;
            
            // Always auto-generate color name (read-only field)
            if (colorName) {
              const generatedName = generateColorName(selectedColor);
              colorName.value = generatedName;
              
              // Update preview text
              const previewText = document.querySelector('.color-preview').nextElementSibling;
              if (previewText) {
                previewText.textContent = generatedName;
              }
            }
          });
        }
        
        // Clean up when modal is hidden
        document.getElementById('inlineVariantModal').addEventListener('hidden.bs.modal', function() {
          this.remove();
        });
      }

      // Utility functions
      function getStockColorClass(stock) {
        if (stock === 0) return 'text-danger';
        if (stock <= 10) return 'text-warning';
        return 'text-success';
      }

      function escapeHtml(text) {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
      }

      function formatDate(dateString) {
        if (!dateString) return 'Unknown';
        return new Date(dateString).toLocaleDateString();
      }

      function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
          const later = () => {
            clearTimeout(timeout);
            func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      }

      function showToast(message, type = 'info') {
        // Simple toast implementation
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} position-fixed`;
        toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
        toast.innerHTML = `
          ${message}
          <button type="button" class="btn-close ms-2" onclick="this.parentElement.remove()"></button>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 5000);
      }
      
      function normalizeHex(hex) {
        if (!hex) return '#000000';
        let v = hex.trim();
        if (!v.startsWith('#')) v = '#' + v;
        return '#' + v.substring(1, 7).toLowerCase();
      }

      function inferColorNameFromHex(hexColor) {
        // Common map
        const map = {
          '#000000':'Black','#ffffff':'White','#ff0000':'Red','#00ff00':'Lime','#0000ff':'Blue',
          '#ffff00':'Yellow','#ff00ff':'Magenta','#00ffff':'Cyan','#800000':'Maroon','#008000':'Green',
          '#000080':'Navy','#808000':'Olive','#800080':'Purple','#008080':'Teal','#c0c0c0':'Silver',
          '#808080':'Gray','#ffa500':'Orange','#ffc0cb':'Pink','#a52a2a':'Brown','#ffd700':'Gold',
          '#40e0d0':'Turquoise','#dda0dd':'Plum','#90ee90':'Light Green','#add8e6':'Light Blue',
          '#f0e68c':'Khaki','#e6e6fa':'Lavender','#d2691e':'Chocolate'
        };
        const hex = normalizeHex(hexColor);
        if (map[hex]) return map[hex];
        // Heuristic
        const r = parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
        const max=Math.max(r,g,b), min=Math.min(r,g,b); const diff=max-min;
        let name;
        if (diff < 25) {
          const avg=(r+g+b)/3; if (avg<60) return 'Very Dark'; if (avg<110) return 'Dark Gray'; if (avg<170) return 'Gray'; if (avg<220) return 'Light Gray'; return 'Very Light';
        }
        if (max===r) name = g>b ? (g>150?'Orange':'Red') : (b>150?'Pink':'Red');
        else if (max===g) name = r>b ? (r>150?'Yellow':'Green') : (b>150?'Cyan':'Green');
        else name = r>g ? (r>150?'Purple':'Blue') : (g>150?'Teal':'Blue');
        const bright=(r+g+b)/3; if (bright<100) name='Dark '+name; else if (bright>200) name='Light '+name; 
        return name;
      }

      // Enhanced image gallery functions
      window.toggleGalleryView = function(button) {
        const view = button.dataset.view;
        const gallery = document.querySelector('.gallery-content');
        const buttons = document.querySelectorAll('.gallery-controls button');
        
        // Update active button
        buttons.forEach(btn => btn.classList.remove('btn-primary', 'btn-outline-secondary'));
        buttons.forEach(btn => btn.classList.add('btn-outline-secondary'));
        button.classList.remove('btn-outline-secondary');
        button.classList.add('btn-primary');
        
        // Update gallery view
        if (gallery) {
          gallery.setAttribute('data-gallery-view', view);
          
          if (view === 'list') {
            gallery.querySelectorAll('.images-grid').forEach(grid => {
              grid.className = 'images-list d-flex flex-wrap gap-2';
              grid.querySelectorAll('.col-6, .col-md-4, .col-lg-3').forEach(col => {
                col.className = '';
                col.style.width = '60px';
              });
            });
          } else {
            gallery.querySelectorAll('.images-list').forEach(grid => {
              grid.className = 'images-grid row g-2';
              grid.querySelectorAll('> div').forEach(col => {
                col.className = 'col-6 col-md-4 col-lg-3';
                col.style.width = '';
              });
            });
          }
        }
      };
      
      // Add Variant modal logic
      window.openAddVariant = function(productId, product) {
        try {
          // Populate sizes select from product + standard sizes
          const sizeSelect = document.getElementById('addVariantSize');
          if (sizeSelect) {
            sizeSelect.innerHTML = '';
            // Use shoe sizes for Shoes & Accessories category, clothing sizes for others
            const isShoesCategory = product.category === 'Shoes & Accessories';
            const standard = isShoesCategory 
              ? ['35','36','37','38','39','40','41','42','43','44','45','46']
              : ['XS','S','M','L','XL','XXL'];
            const existing = Object.keys(product.size_color_stock || {});
            const sizes = Array.from(new Set([...standard, ...existing]));
            // Sort sizes: numerical (including decimals) first, then clothing sizes
            sizes.sort((a, b) => {
              const aNum = parseFloat(a);
              const bNum = parseFloat(b);
              if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
              if (!isNaN(aNum)) return -1;
              if (!isNaN(bNum)) return 1;
              const order = {'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6};
              return (order[a] || 99) - (order[b] || 99);
            });
            sizes.forEach(s => {
              const opt = document.createElement('option'); opt.value = s; opt.textContent = s; sizeSelect.appendChild(opt);
            });
            
            // Show custom size input for shoes category
            const customSizeContainer = document.getElementById('customSizeInputContainer');
            const customSizeInput = document.getElementById('customSizeInput');
            const useCustomSizeBtn = document.getElementById('useCustomSizeBtn');
            
            if (customSizeContainer && isShoesCategory) {
              customSizeContainer.style.display = 'block';
              
              // Handle custom size input
              if (useCustomSizeBtn && customSizeInput) {
                useCustomSizeBtn.onclick = () => {
                  const customSize = customSizeInput.value.trim();
                  if (!customSize) {
                    alert('Please enter a size');
                    return;
                  }
                  
                  const sizeNum = parseFloat(customSize);
                  if (isNaN(sizeNum) || sizeNum < 20 || sizeNum > 60) {
                    alert('Please enter a valid size between 20 and 60');
                    return;
                  }
                  
                  const sizeStr = sizeNum.toString();
                  
                  // Check if size already exists
                  let exists = false;
                  for (let i = 0; i < sizeSelect.options.length; i++) {
                    if (sizeSelect.options[i].value === sizeStr) {
                      exists = true;
                      break;
                    }
                  }
                  
                  if (!exists) {
                    // Add to dropdown
                    const opt = document.createElement('option');
                    opt.value = sizeStr;
                    opt.textContent = sizeStr;
                    sizeSelect.appendChild(opt);
                  }
                  
                  // Select the size
                  sizeSelect.value = sizeStr;
                  customSizeInput.value = '';
                };
                
                // Also allow Enter key
                customSizeInput.onkeypress = (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    useCustomSizeBtn.click();
                  }
                };
              }
            } else if (customSizeContainer) {
              customSizeContainer.style.display = 'none';
            }
          }

          const picker = document.getElementById('addVariantColorPicker');
          const hexInput = document.getElementById('addVariantColorHex');
          const nameInput = document.getElementById('addVariantColorName');
          
          // Initialize with default color
          const defaultColor = '#000000';
          hexInput.value = defaultColor;
          picker.value = defaultColor;
          nameInput.value = '';
          
          // Make color name input read-only
          if (nameInput) {
            nameInput.setAttribute('readonly', 'readonly');
            nameInput.readOnly = true;
            nameInput.style.backgroundColor = '#f8f9fa';
            nameInput.style.cursor = 'not-allowed';
            // Prevent any input events
            nameInput.addEventListener('keydown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              return false;
            });
            nameInput.addEventListener('input', (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Restore value from auto-generated name
              const n = normalizeHex(picker.value);
              nameInput.value = inferColorNameFromHex(n);
              return false;
            });
            nameInput.addEventListener('paste', (e) => {
              e.preventDefault();
              e.stopPropagation();
              return false;
            });
            nameInput.addEventListener('focus', (e) => {
              e.target.blur();
            });
          }
          
          // Sync function - updates hex input and color name when picker changes
          const sync = (hex) => {
            const n = normalizeHex(hex);
            hexInput.value = n; // Update read-only hex input
            picker.value = n;
            // Always use auto-generated name
            const gen = inferColorNameFromHex(n);
            nameInput.value = gen;
            nameInput.dataset.autoName = gen;
          };
          
          // Only sync from color picker to hex input (one-way)
          picker.oninput = () => sync(picker.value);
          
          // Initial sync
          sync(picker.value);

          const modal = new bootstrap.Modal(document.getElementById('addVariantModal'));
          modal.show();

          // Preview image
          const imgInput = document.getElementById('addVariantImage');
          const preview = document.getElementById('addVariantPreview');
          imgInput.onchange = () => {
            preview.classList.add('d-none');
            preview.innerHTML = '';
            const f = imgInput.files[0];
            if (f) {
              const url = URL.createObjectURL(f);
              preview.innerHTML = `<img src="${url}" alt="preview">`;
              preview.classList.remove('d-none');
            }
          };

          const form = document.getElementById('addVariantForm');
          form.onsubmit = async (e) => {
            e.preventDefault();
            const size = document.getElementById('addVariantSize').value.trim();
            const color = normalizeHex(document.getElementById('addVariantColorHex').value.trim());
            const colorName = document.getElementById('addVariantColorName').value.trim();
            const stock = parseInt(document.getElementById('addVariantStock').value || '0');
            const price = parseFloat(document.getElementById('addVariantPrice').value || '0');
            const discountPctRaw = document.getElementById('addVariantDiscountPercent').value;
            const imageFile = document.getElementById('addVariantImage').files[0];

            if (!size || !/^#([0-9A-Fa-f]{6})$/.test(color) || isNaN(stock) || isNaN(price)) {
              return showToast('Please fill size, color, price and stock correctly', 'warning');
            }
            if (!imageFile) {
              return showToast('Please add an image for this variant', 'warning');
            }
            if (discountPctRaw && (parseFloat(discountPctRaw) < 0 || parseFloat(discountPctRaw) > 100)) {
              return showToast('Discount must be less than price', 'warning');
            }

            const btn = document.getElementById('addVariantSaveBtn');
            const original = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';

            try {
              const token = AuthManager.getAuthToken();
              const payload = { product_id: parseInt(productId), size, color, stock_quantity: stock, price };
              if (discountPctRaw) { const pct = Math.max(0, Math.min(100, parseFloat(discountPctRaw))); payload.discount_price = Math.max(0, Number((price * (1 - pct/100)).toFixed(2))); }
              if (colorName) payload.color_name = colorName;

              // Create or upsert variant: try POST /stock, then fallback to POST /variants, then PUT /stock
              let resp, jd;
              try {
                resp = await fetch(`/api/products/${productId}/stock`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify(payload)
                });
                jd = await resp.json().catch(() => ({}));
              } catch (_) {}

              if (!resp || !resp.ok) {
                // Fallback 1: POST to variants collection
                try {
                  resp = await fetch(`/api/products/variants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                  });
                  jd = await resp.json().catch(() => ({}));
                } catch (_) {}
              }

              if (!resp || !resp.ok) {
                // Fallback 2: PUT on /stock (some backends upsert on PUT)
                try {
                  const putPayload = { ...payload, old_color: color };
                  resp = await fetch(`/api/products/${productId}/stock`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(putPayload)
                  });
                  jd = await resp.json().catch(() => ({}));
                } catch (_) {}
              }

              if (!resp || !resp.ok) {
                // Fallback 3: merge into size_color_data via PUT /api/products/{id}
                const merged = JSON.parse(JSON.stringify(product.size_color_stock || {}));
                if (!merged[size]) merged[size] = {};
                merged[size][color] = {
                  name: colorName || inferColorNameFromHex(color),
                  price: price,
                  discount_price: discountPctRaw ? Math.max(0, Number((price * (1 - Math.max(0, Math.min(100, parseFloat(discountPctRaw)))/100)).toFixed(2))) : null,
                  stock: stock
                };
                const upd = await fetch(`/api/products/${productId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({ size_color_data: merged })
                });
                if (!upd.ok) {
                  const txt = await upd.text();
                  throw new Error((jd && (jd.error || jd.message)) || txt || 'Variant save failed');
                }
              }

              // Upload image
              const fd = new FormData();
              fd.append('variant_images[]', imageFile);
              fd.append('variant_colors[]', color);
              fd.append('variant_color_names[]', colorName || inferColorNameFromHex(color));
              fd.append('variant_display_orders[]', 0);
              const up = await fetch(`/api/products/${productId}/images`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
              if (!up.ok) {
                const t = await up.text(); console.warn('Variant image upload failed:', t);
              }

              showToast('Variant added', 'success');
              bootstrap.Modal.getInstance(document.getElementById('addVariantModal')).hide();
              // Refresh inventory and re-fetch product to show the new image in the Images tab immediately
              loadInventoryData();
              const r = await fetch(`/api/products/${productId}`);
              const d = await r.json();
              if (r.ok && d.success && d.product) {
                populateEditImages(d.product);
              } else {
                // fallback: reopen product details
                editProduct(productId);
                return;
              }
              // Keep modal open and update sections without reopening
              buildEditVariantsTable(d.product);
            } catch (err) {
              showToast('Failed to add variant: ' + err.message, 'danger');
            } finally {
              btn.disabled = false; btn.innerHTML = original;
            }
          };
        } catch (e) {
          showToast('Failed to open add variant', 'danger');
        }
      };

      // Image lightbox functionality
      window.openImageLightbox = function(imageUrl, colorName, imageIndex, groupName) {
        // Create lightbox overlay
        const lightbox = document.createElement('div');
        lightbox.id = 'imageLightbox';
        lightbox.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center';
        lightbox.style.cssText = 'background: rgba(0,0,0,0.9); z-index: 9999; backdrop-filter: blur(5px);';
        
        lightbox.innerHTML = `
          <div class="lightbox-content position-relative text-center" style="max-width: 90vw; max-height: 90vh;">
            <div class="lightbox-header d-flex justify-content-between align-items-center mb-3">
              <div class="text-white">
                <h5 class="mb-1">${colorName} ${groupName !== colorName ? '- ' + groupName : ''}</h5>
                <small class="text-light opacity-75">Click image to close • Use arrow keys to navigate</small>
              </div>
              <button class="btn btn-outline-light btn-sm" onclick="closeLightbox()">
                <i class="fas fa-times"></i>
              </button>
            </div>
            
            <div class="lightbox-image-container">
              <img src="${imageUrl}" 
                   alt="${colorName}" 
                   class="img-fluid rounded shadow-lg" 
                   style="max-height: 80vh; cursor: pointer;" 
                   onclick="closeLightbox()">
            </div>
            
            <div class="lightbox-footer mt-3">
              <div class="d-flex justify-content-center gap-2">
                <button class="btn btn-outline-light btn-sm" onclick="navigateImage(-1)">
                  <i class="fas fa-chevron-left"></i> Previous
                </button>
                <button class="btn btn-outline-light btn-sm" onclick="navigateImage(1)">
                  Next <i class="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>
          </div>
        `;
        
        // Add click to close functionality
        lightbox.addEventListener('click', (e) => {
          if (e.target === lightbox) {
            closeLightbox();
          }
        });
        
        // Add keyboard navigation
        const keyHandler = (e) => {
          switch(e.key) {
            case 'Escape':
              closeLightbox();
              break;
            case 'ArrowLeft':
              navigateImage(-1);
              break;
            case 'ArrowRight':
              navigateImage(1);
              break;
          }
        };
        
        document.addEventListener('keydown', keyHandler);
        lightbox.keyHandler = keyHandler; // Store for cleanup
        
        document.body.appendChild(lightbox);
        
        // Fade in animation
        requestAnimationFrame(() => {
          lightbox.style.opacity = '0';
          lightbox.style.transition = 'opacity 0.3s ease';
          requestAnimationFrame(() => {
            lightbox.style.opacity = '1';
          });
        });
      };
      
      window.closeLightbox = function() {
        const lightbox = document.getElementById('imageLightbox');
        if (lightbox) {
          // Remove keyboard handler
          if (lightbox.keyHandler) {
            document.removeEventListener('keydown', lightbox.keyHandler);
          }
          
          // Fade out animation
          lightbox.style.transition = 'opacity 0.3s ease';
          lightbox.style.opacity = '0';
          
          setTimeout(() => {
            lightbox.remove();
          }, 300);
        }
      };
      
      window.navigateImage = function(direction) {
        // Get all gallery images from current color group
        const currentGroup = document.querySelector('.color-image-group:hover') || document.querySelector('.color-image-group');
        if (!currentGroup) return;
        
        const images = currentGroup.querySelectorAll('.gallery-image');
        const lightboxImg = document.querySelector('#imageLightbox img');
        
        if (!lightboxImg || images.length <= 1) return;
        
        let currentIndex = -1;
        images.forEach((img, index) => {
          if (img.src === lightboxImg.src) {
            currentIndex = index;
          }
        });
        
        if (currentIndex !== -1) {
          const nextIndex = (currentIndex + direction + images.length) % images.length;
          const nextImg = images[nextIndex];
          
          if (nextImg) {
            lightboxImg.src = nextImg.src;
            lightboxImg.alt = nextImg.alt;
            
            // Update header info
            const header = document.querySelector('#imageLightbox .lightbox-header h5');
            if (header) {
              header.textContent = nextImg.alt;
            }
          }
        }
      };
    });
