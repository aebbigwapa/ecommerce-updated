        (function() {
            "use strict";

            // API Configuration
            const API_CONFIG = {
                // Use relative base to avoid CORS/host mismatches
                BASE_URL: '/api',
                ENDPOINTS: {
                    PRODUCTS: '/products',
                    CATEGORIES: '/categories',
                    SELLERS: '/sellers'
                }
            };

            // Configuration
            const CART_KEY = "bellaFashionCart";
            const CART_COUNT_KEY = "cart_count";
            const USER_INFO_KEYS = ["user_info", "loggedInUser"];
            const TOKEN_KEY = "jwt_token";
            const PLACEHOLDER_IMG = "/static/uploads/products/placeholder.svg";

            // State management
            const state = {
                page: 1,
                per_page: 100, // Increased from 24 to show all products
                sort_by: "relevance",
                search: "",
                total: 0,
                pages: 0,
                filters: {
                    categories: [],
                    sizes: [],
                    rating: null,
                    priceMin: "",
                    priceMax: "",
                },
                products: [],
                categories: [],
                loading: false
            };

            const STORAGE_KEYS = {
                recentSearches: 'market_recent_searches',
                savedFilters: 'market_saved_filters'
            };

            // Initialize the application
            document.addEventListener("DOMContentLoaded", () => {
                initializeCartSystem();
                initializeAuthState();
                initializeFilters();
                initializeSearch();
                initializePagination();
                initializeMobileFilters();
                initializeViewToggle();
                loadInitialData();
            });

            async function apiRequest(endpoint, options = {}) {
                const url = `${API_CONFIG.BASE_URL}${endpoint}`;
                let token = null;
                
                // Use AuthManager if available, fallback to localStorage
                if (typeof AuthManager !== 'undefined') {
                    token = AuthManager.getAuthToken();
                } else {
                    token = localStorage.getItem('auth_token') || localStorage.getItem(TOKEN_KEY);
                }
                
                const defaultOptions = {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token && { 'Authorization': `Bearer ${token}` })
                    }
                };

                try {
                    console.log('Making API request to:', url);
                    const response = await fetch(url, { ...defaultOptions, ...options });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    console.log('API response:', data);
                    return data;
                } catch (error) {
                    console.error('API request failed:', error);
                    throw error;
                }
            }

            async function fetchProducts(params = {}) {
                const queryParams = new URLSearchParams();
                
                // Add pagination
                queryParams.append('page', params.page || state.page);
                queryParams.append('per_page', params.per_page || state.per_page);
                
                // Add sorting
                queryParams.append('sort_by', params.sort_by || state.sort_by);
                
                // Add search
                if (params.search || state.search) {
                    queryParams.append('search', params.search || state.search);
                }
                
                // Add filters
                if (state.filters.categories.length > 0) {
                    // Map slugs -> display names expected by backend (products.category stores the readable name)
                    const selected = state.filters.categories.map(sel => {
                        const found = (state.categories || []).find(c => c && (c.slug === sel || c.name === sel));
                        return (found && (found.name || found.slug)) || sel;
                    });
                    // Send all selected categories as repeated params (category[])
                    selected.forEach(name => queryParams.append('category[]', name));
                }
                
                
                if (state.filters.rating) {
                    queryParams.append('rating', state.filters.rating);
                }
                
                if (state.filters.priceMin) {
                    queryParams.append('price_min', state.filters.priceMin);
                }
                
                if (state.filters.priceMax) {
                    queryParams.append('price_max', state.filters.priceMax);
                }

                // Sizes facet
                if (state.filters.sizes && state.filters.sizes.length) {
                    state.filters.sizes.forEach(sz => queryParams.append('size[]', sz));
                }
                
                // Stock filter (show all products by default; frontend filters can narrow later)
                // queryParams.append('stock_min', 1);
                
                console.log('Fetching products with params:', queryParams.toString());
                return apiRequest(`${API_CONFIG.ENDPOINTS.PRODUCTS}?${queryParams}`);
            }

            async function fetchCategories() {
                return apiRequest(API_CONFIG.ENDPOINTS.CATEGORIES);
            }

            // Load initial data
            async function loadInitialData() {
                state.loading = true;
                showLoadingState();

                try {
                    // Load categories for filters
                    try {
                        await loadCategories();
                    } catch (error) {
                        console.warn('Failed to load categories from API, using defaults:', error);
                        useDefaultCategories();
                    }
                    
                    // Apply URL-driven filters (e.g., category/category[])
                    applyURLFilters();
                    
                    // Load initial products
                    await loadProducts();
                } catch (error) {
                    console.error('Failed to load initial data:', error);
                    showErrorState('Failed to load products. Please check your connection and try again.');
                } finally {
                    state.loading = false;
                }
            }

            async function loadCategories() {
                try {
                    const categoriesData = await fetchCategories();
                    state.categories = categoriesData.categories || categoriesData;
                    renderCategoryFilters();
                } catch (error) {
                    console.error('Failed to load categories:', error);
                    throw error;
                }
            }

            function useDefaultCategories() {
                state.categories = [
                    { id: 1, name: 'Dresses', slug: 'dresses' },
                    { id: 2, name: 'Tops', slug: 'tops' },
                    { id: 3, name: 'Bottoms', slug: 'bottoms' },
                    { id: 4, name: 'Outerwear', slug: 'outerwear' },
                    { id: 5, name: 'Activewear', slug: 'activewear' },
                    { id: 6, name: 'Accessories', slug: 'accessories' },
                    { id: 7, name: 'Footwear', slug: 'footwear' }
                ];
                renderCategoryFilters();
            }

            async function loadProducts() {
                state.loading = true;
                showLoadingState();

                try {
                    const response = await fetchProducts({
                        page: state.page,
                        per_page: state.per_page,
                        sort_by: state.sort_by,
                        search: state.search
                    });
                    
                    // Normalize products array from various possible API shapes
                    let products = [];
                    if (Array.isArray(response)) {
                        products = response;
                    } else if (Array.isArray(response.products)) {
                        products = response.products;
                    } else if (Array.isArray(response.items)) {
                        products = response.items;
                    } else if (Array.isArray(response.results)) {
                        products = response.results;
                    } else if (response.data && Array.isArray(response.data)) {
                        products = response.data;
                    } else if (response.data && Array.isArray(response.data.items)) {
                        products = response.data.items;
                    } else if (response.product && typeof response.product === 'object') {
                        products = [response.product];
                    }
                    state.products = products;

                    // Do not filter by name; render whatever backend returns
                    state.total = state.products.length;
                    state.pages = Math.ceil((state.total) / state.per_page);
                    
                    renderProducts(state.products);
                    updateProductCount(state.total);
                    updatePagination();
                } catch (error) {
                    console.error('Failed to load products:', error);
                    showErrorState('Failed to load products. Please try again.');
                }
                
                state.loading = false;
            }

            function showLoadingState() {
                const grid = document.getElementById("productsGrid");
                if (grid) {
                    grid.innerHTML = `
                        <div class="products-loading">
                            <div class="loading-spinner"></div>
                            <p>Loading products...</p>
                        </div>
                    `;
                }
            }

            function showErrorState(message) {
                const grid = document.getElementById("productsGrid");
                if (grid) {
                    grid.innerHTML = `
                        <div class="no-products">
                            <i class="fas fa-exclamation-triangle" style="color: var(--accent-coral);"></i>
                            <p style="font-size: 1.1rem; margin: 0;">${message}</p>
                            <button onclick="window.location.reload()" class="btn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-dark); color: white; border: none; border-radius: 8px; cursor: pointer;">
                                Try Again
                            </button>
                        </div>
                    `;
                }
            }

            // Render dynamic filter options
            function renderCategoryFilters() {
                const container = document.getElementById('categoryFilters');
                if (!container || !state.categories.length) return;

                container.innerHTML = state.categories.map(category => `
                    <div class="filter-option">
                        <input type="checkbox" id="category-${category.slug}" value="${category.slug}">
                        <label for="category-${category.slug}">${escapeHtml(category.name)}</label>
                    </div>
                `).join('');

                // Add event listeners
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', handleFilterChange);
                });
            }

            // Cart system initialization
            function initializeCartSystem() {
                if (!localStorage.getItem(CART_COUNT_KEY)) {
                    localStorage.setItem(CART_COUNT_KEY, "0");
                }
                updateCartCountDisplay();
                
                window.addEventListener("storage", (e) => {
                    if (e.key === CART_KEY || e.key === CART_COUNT_KEY) {
                        updateCartCountDisplay();
                    }
                });
            }

            function updateCartCountDisplay() {
                const cartCountEl = document.querySelector(".cart-count");
                if (cartCountEl) {
                    const count = parseInt(localStorage.getItem(CART_COUNT_KEY) || "0", 10);
                    cartCountEl.textContent = isNaN(count) ? 0 : count;
                }
            }

            // Auth state management
            function initializeAuthState() {
                const authLinks = document.getElementById("authLinks");
                const userInfo = getUserInfo();
                
                if (authLinks && userInfo) {
                    const userName = userInfo.name || userInfo.email?.split("@")[0] || "User";
                    authLinks.innerHTML = `
                        <div class="dropdown">
                            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" style="color: var(--primary-dark); font-weight: 600;">
                                Hi, ${escapeHtml(userName)}
                            </a>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="profile.html"><i class="fas fa-user-circle me-2"></i>Profile</a></li>
                                <li><a class="dropdown-item" href="orders.html"><i class="fas fa-box me-2"></i>My Orders</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
                            </ul>
                        </div>
                    `;
                    
                    const logoutBtn = document.getElementById("logoutBtn");
                    if (logoutBtn) {
                        logoutBtn.addEventListener("click", (e) => {
                            e.preventDefault();
                            
                            // Use AuthManager if available
                            if (typeof AuthManager !== 'undefined') {
                                AuthManager.logout();
                            } else {
                                // Fallback cleanup
                                USER_INFO_KEYS.forEach(key => localStorage.removeItem(key));
                                localStorage.removeItem(TOKEN_KEY);
                                localStorage.removeItem('auth_token');
                            }
                            
                            location.reload();
                        });
                    }
                }
            }

            function getUserInfo() {
                for (const key of USER_INFO_KEYS) {
                    const data = localStorage.getItem(key);
                    if (data) {
                        try {
                            return JSON.parse(data);
                        } catch {
                            return { email: data };
                        }
                    }
                }
                return null;
            }

            // Filter system
            function initializeFilters() {
                // Rating filters
                document.querySelectorAll('input[name="rating"]').forEach(radio => {
                    radio.addEventListener("change", handleFilterChange);
                });
                
                // Price range filters
                const priceMin = document.getElementById("priceMin");
                const priceMax = document.getElementById("priceMax");
                
                if (priceMin) {
                    // Prevent negatives visually and in state
                    priceMin.addEventListener("input", () => {
                        if (priceMin.value !== '' && Number(priceMin.value) < 0) priceMin.value = 0;
                    });
                    priceMin.addEventListener("input", debounce(handleFilterChange, 500));
                }
                
                if (priceMax) {
                    priceMax.addEventListener("input", () => {
                        if (priceMax.value !== '' && Number(priceMax.value) < 0) priceMax.value = 0;
                    });
                    priceMax.addEventListener("input", debounce(handleFilterChange, 500));
                }
                
                // Clear filters
                const clearFiltersBtn = document.getElementById("clearFilters");
                if (clearFiltersBtn) {
                    clearFiltersBtn.addEventListener("click", clearAllFilters);
                }

                // Size filters
                document.querySelectorAll('#sizeFilters input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', handleFilterChange);
                });
                
                // Sort functionality
                const sortSelect = document.getElementById("sortSelect");
                if (sortSelect) {
                    sortSelect.addEventListener("change", handleSortChange);
                }

                // Saved filters UI
                document.getElementById('saveFiltersBtn')?.addEventListener('click', saveCurrentFilters);
                renderSavedFilters();
            }

            function handleFilterChange() {
                collectFilters();
                state.page = 1; // Reset to first page when filters change
                loadProducts();
            }

            function collectFilters() {
                // Categories
                state.filters.categories = Array.from(document.querySelectorAll('#categoryFilters input[type="checkbox"]:checked'))
                    .map(cb => cb.value);
                
                // Rating
                const ratingRadio = document.querySelector('input[name="rating"]:checked');
                state.filters.rating = ratingRadio ? parseInt(ratingRadio.value) : null;
                
                // Price range (clamp to non-negative)
                const _minEl = document.getElementById("priceMin");
                const _maxEl = document.getElementById("priceMax");
                let _minVal = _minEl?.value || "";
                let _maxVal = _maxEl?.value || "";
                if (_minVal !== "" && Number(_minVal) < 0) { _minVal = "0"; if (_minEl) _minEl.value = 0; }
                if (_maxVal !== "" && Number(_maxVal) < 0) { _maxVal = "0"; if (_maxEl) _maxEl.value = 0; }
                state.filters.priceMin = _minVal;
                state.filters.priceMax = _maxVal;

                // Sizes
                state.filters.sizes = Array.from(document.querySelectorAll('#sizeFilters input[type="checkbox"]:checked')).map(cb => cb.value);
            }

            function clearAllFilters() {
                // Clear checkboxes and radios
                document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                document.querySelectorAll('input[type="radio"]').forEach(rb => rb.checked = false);
                
                // Clear price inputs
                const priceMin = document.getElementById("priceMin");
                const priceMax = document.getElementById("priceMax");
                if (priceMin) priceMin.value = "";
                if (priceMax) priceMax.value = "";
                
                // Reset state
                state.filters = {
                    categories: [],
                    rating: null,
                    priceMin: "",
                    priceMax: ""
                };
                
                state.page = 1;
                loadProducts();
            }

            function handleSortChange() {
                const sortSelect = document.getElementById("sortSelect");
                if (!sortSelect) return;
                
                state.sort_by = sortSelect.value;
                state.page = 1; // Reset to first page when sort changes
                loadProducts();
            }

            // Search functionality
            function initializeSearch() {
                const searchInput = document.querySelector(".search-input");
                if (searchInput) {
                    searchInput.addEventListener("input", debounce(handleSearchChange, 300));
                    searchInput.addEventListener("input", debounce(handleAutocomplete, 200));
                    searchInput.addEventListener("focus", handleSearchFocus);
                    searchInput.addEventListener("blur", handleSearchBlur);
                    searchInput.addEventListener("keydown", handleSearchKeydown);
                }
                
                // Create autocomplete dropdown
                createAutocompleteDropdown();
            }

            function createAutocompleteDropdown() {
                const searchWrapper = document.querySelector(".search-wrapper");
                if (!searchWrapper || document.getElementById("autocompleteDropdown")) return;
                
                const dropdown = document.createElement("div");
                dropdown.id = "autocompleteDropdown";
                dropdown.className = "autocomplete-dropdown";
                dropdown.style.cssText = `
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border-radius: 0 0 12px 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    max-height: 400px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                    margin-top: 4px;
                `;
                searchWrapper.style.position = "relative";
                searchWrapper.appendChild(dropdown);
            }

            async function handleAutocomplete(e) {
                const query = e.target.value.trim();
                const dropdown = document.getElementById("autocompleteDropdown");
                
                if (!dropdown) return;
                
                if (query.length < 2) {
                    // Show recent searches when input is empty/few chars
                    const recents = getRecentSearches();
                    if (recents.length) {
                        renderRecentSearches(recents);
                        dropdown.style.display = 'block';
                    } else {
                        dropdown.style.display = "none";
                    }
                    return;
                }
                
                try {
                    const response = await apiRequest(`/products/autocomplete?q=${encodeURIComponent(query)}&limit=8`);
                    const suggestions = response.suggestions || [];
                    
                    if (suggestions.length === 0) {
                        dropdown.style.display = "none";
                        return;
                    }
                    
                    renderAutocompleteSuggestions(suggestions);
                    dropdown.style.display = "block";
                } catch (error) {
                    console.error("Autocomplete error:", error);
                    dropdown.style.display = "none";
                }
            }

            let autocompleteActiveIndex = -1;

            function renderAutocompleteSuggestions(suggestions) {
                const dropdown = document.getElementById("autocompleteDropdown");
                if (!dropdown) return;
                
                dropdown.innerHTML = suggestions.map((item, idx) => `
                    <div class="autocomplete-item" data-idx="${idx}" data-id="${item.id}" style="
                        padding: 12px 16px;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        cursor: pointer;
                        border-bottom: 1px solid #f0f0f0;
                        transition: background-color 0.2s;
                    " onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='white'">
                        <img src="${item.image_url}" alt="${item.name}" style="
                            width: 48px;
                            height: 48px;
                            object-fit: cover;
                            border-radius: 8px;
                        ">
                        <div style="flex: 1; min-width: 0;">
                            <div style="
                                font-weight: 500;
                                color: #2d3436;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                white-space: nowrap;
                            ">${item.name}</div>
                            <div style="
                                font-size: 0.875rem;
                                color: #636e72;
                                margin-top: 2px;
                            ">${item.category}${item.price ? ` • ₱${item.price.toFixed(2)}` : ''}</div>
                        </div>
                        <i class="fas fa-arrow-right" style="color: #b2bec3; font-size: 0.875rem;"></i>
                    </div>
                `).join("");
                
                // Add click/hover handlers
                dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
                    item.addEventListener("click", () => {
                        const productId = item.dataset.id;
                        window.location.href = `/Public/product.html?id=${productId}`;
                    });
                    item.addEventListener("mouseenter", () => setActiveAutocompleteIndex(Number(item.dataset.idx)));
                });
                setActiveAutocompleteIndex(0);
            }

            function handleSearchFocus() {
                const searchInput = document.querySelector(".search-input");
                const dropdown = document.getElementById("autocompleteDropdown");
                
                if (!searchInput || !dropdown) return;
                const q = searchInput.value.trim();
                if (q.length >= 2) {
                    const hasContent = dropdown.children.length > 0;
                    if (hasContent) dropdown.style.display = 'block';
                } else {
                    const recents = getRecentSearches();
                    if (recents.length) {
                        renderRecentSearches(recents);
                        dropdown.style.display = 'block';
                    }
                }
            }

            function setActiveAutocompleteIndex(idx) {
                const dropdown = document.getElementById("autocompleteDropdown");
                if (!dropdown) return;
                const items = Array.from(dropdown.querySelectorAll('.autocomplete-item'));
                if (!items.length) return;
                autocompleteActiveIndex = Math.max(0, Math.min(idx, items.length - 1));
                items.forEach((el, i) => {
                    el.style.backgroundColor = i === autocompleteActiveIndex ? '#f1f3f5' : 'white';
                });
            }

            function handleSearchKeydown(e) {
                const dropdown = document.getElementById("autocompleteDropdown");
                if (!dropdown || dropdown.style.display === 'none') return;
                const items = Array.from(dropdown.querySelectorAll('.autocomplete-item'));
                if (!items.length) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveAutocompleteIndex((autocompleteActiveIndex + 1) % items.length);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveAutocompleteIndex((autocompleteActiveIndex - 1 + items.length) % items.length);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const active = items[autocompleteActiveIndex];
                    if (active) {
                        const productId = active.dataset.id;
                        window.location.href = `/Public/product.html?id=${productId}`;
                    }
                } else if (e.key === 'Escape') {
                    dropdown.style.display = 'none';
                }
            }

            function handleSearchBlur() {
                const dropdown = document.getElementById("autocompleteDropdown");
                // Delay to allow click events on suggestions
                setTimeout(() => {
                    if (dropdown) {
                        dropdown.style.display = "none";
                    }
                }, 200);
            }

            function handleSearchChange(e) {
                state.search = e.target.value.trim();
                if (state.search) addRecentSearch(state.search);
                // Reset to first page and reload products when search changes
                state.page = 1;
                loadProducts();
            }

            // Recent searches utilities
            function getRecentSearches() {
                try {
                    const raw = localStorage.getItem(STORAGE_KEYS.recentSearches);
                    const arr = raw ? JSON.parse(raw) : [];
                    return Array.isArray(arr) ? arr : [];
                } catch { return []; }
            }
            function addRecentSearch(q) {
                if (!q) return;
                const arr = getRecentSearches().filter(x => x.toLowerCase() !== q.toLowerCase());
                arr.unshift(q);
                const trimmed = arr.slice(0, 10);
                localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(trimmed));
            }
            function renderRecentSearches(list) {
                const dropdown = document.getElementById('autocompleteDropdown');
                if (!dropdown) return;
                if (!list || !list.length) {
                    dropdown.innerHTML = '';
                    dropdown.style.display = 'none';
                    return;
                }
                dropdown.innerHTML = `
                    <div class="recent-searches-header" style="display:flex; align-items:center; justify-content:space-between; padding:8px 16px; border-bottom:1px solid #f0f0f0;">
                        <span style="font-size:0.85rem; font-weight:600; color:#636e72;">Recent searches</span>
                        <button type="button" class="btn btn-link btn-sm text-danger" id="clearRecentSearchesBtn" style="font-size:0.8rem; text-decoration:none; padding:0; color:#dc3545;">
                            Clear all
                        </button>
                    </div>
                    ${list.map((q, idx)=>`
                        <div class="autocomplete-item" data-idx="${idx}" data-query="${q}" style="padding:10px 16px; cursor:pointer; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-history" style="color:#b2bec3"></i>
                            <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(q)}</div>
                            <button type="button" class="btn btn-link btn-sm text-muted recent-remove-btn" data-query="${q}" title="Remove" style="padding:0; margin-left:4px;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                `;
                const clearBtn = dropdown.querySelector('#clearRecentSearchesBtn');
                if (clearBtn) {
                    clearBtn.addEventListener('click', (e)=> {
                        e.preventDefault();
                        e.stopPropagation();
                        clearAllRecentSearches();
                    });
                }
                dropdown.querySelectorAll('.autocomplete-item').forEach(item=>{
                    item.addEventListener('click', (e)=>{
                        if (e.target.closest('.recent-remove-btn')) return;
                        const q = item.getAttribute('data-query');
                        const input = document.querySelector('.search-input');
                        if (input) input.value = q;
                        state.search = q;
                        addRecentSearch(q);
                        loadProducts();
                        dropdown.style.display = 'none';
                    });
                });
                dropdown.querySelectorAll('.recent-remove-btn').forEach(btn=>{
                    btn.addEventListener('click',(e)=>{
                        e.preventDefault();
                        e.stopPropagation();
                        const q = btn.getAttribute('data-query');
                        removeRecentSearch(q);
                    });
                });
                setActiveAutocompleteIndex(0);
            }

            function removeRecentSearch(q) {
                if (!q) return;
                const current = getRecentSearches();
                const filtered = current.filter(x => x.toLowerCase() !== String(q).toLowerCase());
                localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(filtered));
                if (filtered.length) {
                    renderRecentSearches(filtered);
                    const dropdown = document.getElementById('autocompleteDropdown');
                    if (dropdown) dropdown.style.display = 'block';
                } else {
                    const dropdown = document.getElementById('autocompleteDropdown');
                    if (dropdown) {
                        dropdown.innerHTML = '';
                        dropdown.style.display = 'none';
                    }
                }
            }

            function clearAllRecentSearches() {
                try {
                    localStorage.removeItem(STORAGE_KEYS.recentSearches);
                } catch (_) {}
                const dropdown = document.getElementById('autocompleteDropdown');
                if (dropdown) {
                    dropdown.innerHTML = '';
                    dropdown.style.display = 'none';
                }
            }

            // Saved filters utilities
            function getSavedFilters() {
                try { const raw = localStorage.getItem(STORAGE_KEYS.savedFilters); return raw ? JSON.parse(raw) : []; } catch { return []; }
            }
            function saveCurrentFilters() {
                const nameInput = document.getElementById('saveFiltersName');
                const name = (nameInput?.value || '').trim() || `Filters ${new Date().toLocaleString()}`;
                const saved = getSavedFilters();
                const entry = { name, filters: JSON.parse(JSON.stringify(state.filters)) };
                saved.unshift(entry);
                localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(saved.slice(0, 20)));
                nameInput && (nameInput.value = '');
                renderSavedFilters();
            }
function renderSavedFilters() {
                const list = document.getElementById('savedFiltersList');
                if (!list) return;
                const saved = getSavedFilters();
                if (!saved.length) { list.innerHTML = '<li class="text-muted">No saved filters</li>'; return; }
                list.innerHTML = saved.map((s, i)=>`
                    <li class="saved-filter-item" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <a href="#" data-saved-idx="${i}" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <i class="fas fa-filter me-1"></i>${escapeHtml(s.name)}
                        </a>
                        <button class="btn btn-link btn-sm text-danger saved-filter-delete" data-del-idx="${i}" title="Delete saved filter" style="text-decoration:none;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </li>`).join('');
                // Apply saved filter on name click
                list.querySelectorAll('a[data-saved-idx]')?.forEach(a=>{
                    a.addEventListener('click', (e)=>{ e.preventDefault(); applySavedFilter(Number(a.getAttribute('data-saved-idx'))); });
                });
                // Delete saved filter on trash click
                list.querySelectorAll('.saved-filter-delete')?.forEach(btn=>{
                    btn.addEventListener('click', (e)=>{
                        e.preventDefault();
                        e.stopPropagation();
                        const idx = Number(btn.getAttribute('data-del-idx'));
                        removeSavedFilter(idx);
                    });
                });
            }
            function removeSavedFilter(idx){
                try {
                    const saved = getSavedFilters();
                    if (!Array.isArray(saved) || idx < 0 || idx >= saved.length) return;
                    saved.splice(idx, 1);
                    localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(saved));
                    renderSavedFilters();
                    try { showToast('Saved filter removed', 'info'); } catch(_) { /* optional */ }
                } catch (e) {
                    console.error('Failed to remove saved filter', e);
                }
            }
            function applySavedFilter(idx) {
                const saved = getSavedFilters();
                const entry = saved[idx]; if (!entry) return;
                const f = entry.filters || {};
                state.filters = Object.assign({ categories: [], sizes: [], rating: null, priceMin: '', priceMax: '' }, f);
                // Reflect in UI
                document.querySelectorAll('#categoryFilters input[type="checkbox"]').forEach(cb=>{ cb.checked = state.filters.categories.includes(cb.value); });
                document.querySelectorAll('#sizeFilters input[type="checkbox"]').forEach(cb=>{ cb.checked = (state.filters.sizes||[]).includes(cb.value); });
                const priceMin = document.getElementById('priceMin'); if (priceMin) priceMin.value = state.filters.priceMin || '';
                const priceMax = document.getElementById('priceMax'); if (priceMax) priceMax.value = state.filters.priceMax || '';
                state.page = 1; loadProducts();
            }

            // Pagination functionality
            function initializePagination() {
                const pagination = document.getElementById("pagination");
                if (!pagination) return;

                // Add event listeners to page buttons
                pagination.addEventListener("click", (e) => {
                    if (e.target.matches(".page-btn") && !e.target.disabled) {
                        const page = e.target.dataset.page;
                        
                        if (page === "prev") {
                            if (state.page > 1) {
                                state.page--;
                                loadProducts();
                            }
                        } else if (page === "next") {
                            if (state.page < state.pages) {
                                state.page++;
                                loadProducts();
                            }
                        } else if (page) {
                            state.page = parseInt(page);
                            loadProducts();
                        }
                    }
                });
            }

            function updatePagination() {
                const pagination = document.getElementById("pagination");
                if (!pagination) return;

                const totalPages = state.pages;
                const currentPage = state.page;
                
                if (totalPages <= 1) {
                    pagination.innerHTML = '';
                    return;
                }
                
                let paginationHTML = `
                    <button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                `;

                // Always show first page
                paginationHTML += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" data-page="1">1</button>`;

                // Show ellipsis if current page is far from start
                if (currentPage > 4) {
                    paginationHTML += '<span class="page-ellipsis">•••</span>';
                }

                // Show pages around current page
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);

                for (let i = start; i <= end; i++) {
                    if (i !== 1 && i !== totalPages) {
                        paginationHTML += `<button class="page-btn ${currentPage === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
                    }
                }

                // Show ellipsis if current page is far from end
                if (currentPage < totalPages - 3) {
                    paginationHTML += '<span class="page-ellipsis">•••</span>';
                }

                // Always show last page (if more than 1 page)
                if (totalPages > 1) {
                    paginationHTML += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
                }

                paginationHTML += `
                    <button class="page-btn" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                `;

                pagination.innerHTML = paginationHTML;
            }

            // Mobile filters
            function initializeMobileFilters() {
                const mobileFilterToggle = document.getElementById('mobileFilterToggle');
                const filtersSidebar = document.getElementById('filtersSidebar');
                
                if (mobileFilterToggle && filtersSidebar) {
                    mobileFilterToggle.addEventListener('click', () => {
                        filtersSidebar.classList.toggle('active');
                        document.body.style.overflow = filtersSidebar.classList.contains('active') ? 'hidden' : '';
                    });

                    // Close filters when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!filtersSidebar.contains(e.target) && !mobileFilterToggle.contains(e.target)) {
                            filtersSidebar.classList.remove('active');
                            document.body.style.overflow = '';
                        }
                    });
                }
            }

            // View toggle (grid/list)
            function initializeViewToggle() {
                const grid = document.getElementById('productsGrid');
                const buttons = Array.from(document.querySelectorAll('.view-btn'));
                if (!grid || !buttons.length) return;

                const applyView = (view) => {
                    // Normalize
                    const v = (view === 'list') ? 'list' : 'grid';
                    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === v));
                    if (v === 'list') {
                        grid.classList.add('list-view');
                    } else {
                        grid.classList.remove('list-view');
                    }
                    try { localStorage.setItem('market_view', v); } catch (_) {}
                };

                // Load saved preference or default to grid
                let saved = 'grid';
                try { saved = localStorage.getItem('market_view') || 'grid'; } catch (_) {}
                applyView(saved);

                // Wire up buttons
                buttons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const view = btn.getAttribute('data-view');
                        applyView(view);
                    });
                });
            }

            // URL filter helpers
            function getURLCategories() {
                const params = new URLSearchParams(window.location.search);
                const cats = [];
                // category[] repeated
                params.getAll('category[]').forEach(v => { if (v) cats.push(v); });
                // repeated category without []
                const allPlain = params.getAll('category');
                if (allPlain.length > 1) {
                    allPlain.forEach(v => { if (v) cats.push(v); });
                } else {
                    const single = params.get('category');
                    if (single) {
                        // support comma-separated
                        single.split(',').map(s => s.trim()).forEach(v => { if (v) cats.push(v); });
                    }
                }
                // Deduplicate and decode
                const decoded = Array.from(new Set(cats.map(c => decodeURIComponent(c))));
                return decoded;
            }

            function applyURLFilters() {
                const urlCats = getURLCategories();
                if (urlCats.length) {
                    state.filters.categories = urlCats;
                    // Try to pre-check matching checkboxes if present
                    const mapByName = new Map((state.categories || []).map(c => [c.name, c]));
                    urlCats.forEach(name => {
                        const cat = mapByName.get(name);
                        if (cat) {
                            const cb = document.getElementById(`category-${cat.slug}`);
                            if (cb) cb.checked = true;
                        }
                    });
                }
            }

            // Product rendering
            function renderProducts(products) {
                const grid = document.getElementById("productsGrid");
                if (!grid) return;

                if (!products || products.length === 0) {
                    const recents = getRecentSearches();
                    const suggestionsHtml = recents.length ? `
                        <div class="mt-2">
                            <div class="mb-1" style="font-weight:600; color:#636e72;">Recent searches</div>
                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                ${recents.map(s=>`<button class=\"btn btn-sm btn-light\" data-recent=\"${escapeHtml(s)}\">${escapeHtml(s)}</button>`).join('')}
                            </div>
                        </div>` : '';
                    grid.innerHTML = `
                        <div class="no-products">
                            <i class="fas fa-search"></i>
                            <p style="font-size: 1.1rem; margin: 0;">No products found matching your criteria.</p>
                            <button class="btn" id="clearAllFiltersBtn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-dark); color: white; border: none; border-radius: 8px; cursor: pointer;">Clear all filters</button>
                            ${suggestionsHtml}
                        </div>
                    `;
                    document.getElementById('clearAllFiltersBtn')?.addEventListener('click', clearAllFilters);
                    grid.querySelectorAll('button[data-recent]')?.forEach(btn=>{
                        btn.addEventListener('click', ()=>{
                            state.search = btn.getAttribute('data-recent');
                            const input = document.querySelector('.search-input');
                            if (input) input.value = state.search;
                            loadProducts();
                        });
                    });
                    return;
                }

                grid.innerHTML = products.map(product => createProductCard(product)).join('');

                // Add event listeners to product cards for navigation to product detail
                grid.querySelectorAll('.product-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        // Don't navigate if clicking on action buttons or color dots/chips/swatches
                        if (e.target.closest('.product-action-btn') || e.target.closest('.color-dot') || e.target.closest('.color-swatch') || e.target.closest('.color-chip')) {
                            return;
                        }
                        
                        const productId = card.dataset.productId;
                        if (productId) {
                            window.location.href = `product.html?id=${productId}`;
                        }
                    });
                });

                // Add event listeners to wishlist buttons
                grid.querySelectorAll('.wishlist-btn').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const productId = button.dataset.productId;
                        if (productId) {
                            toggleWishlist(productId, button);
                        }
                    });
                });

                // Add event listeners to view buttons (eye icon)
                grid.querySelectorAll('.product-action-btn:not(.wishlist-btn)').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const productId = e.target.closest('.product-card')?.dataset.productId;
                        if (productId) {
                            window.location.href = `product.html?id=${productId}`;
                        }
                    });
                });


                // Add event listeners to bottom-right cart buttons
                grid.querySelectorAll('.cart-redirect-btn').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const productId = e.target.closest('.product-card')?.dataset.productId;
                        if (productId) {
                            window.location.href = `product.html?id=${productId}`;
                        }
                    });
                });


                // Load wishlist status for logged in users
                loadWishlistStatus();
            }

            function createProductCard(product) {
                // Get price range from all sizes/colors if available
                let minPrice = product.price;
                let maxPrice = product.price;
                
                if (product.size_color_stock) {
                    const prices = [];
                    Object.values(product.size_color_stock).forEach(colorVariants => {
                        Object.values(colorVariants).forEach(variant => {
                            const price = variant.effective_price || variant.price || product.price;
                            prices.push(price);
                        });
                    });
                    
                    if (prices.length > 0) {
                        minPrice = Math.min(...prices);
                        maxPrice = Math.max(...prices);
                    }
                }

                const priceDisplay = minPrice === maxPrice ? 
                    `₱${minPrice.toFixed(2)}` : 
                    `₱${minPrice.toFixed(2)} - ₱${maxPrice.toFixed(2)}`;

                // Calculate discount if original price exists
                let discountHTML = '';
                let badgeHTML = '';
                if (product.original_price && product.original_price > minPrice) {
                    const discountPercent = Math.round(((product.original_price - minPrice) / product.original_price) * 100);
                    discountHTML = `<span class=\"original-price\">₱${product.original_price.toFixed(2)}</span>`;
                    badgeHTML = `<div class=\"product-badge\">-${discountPercent}%</div>`;
                }

                const displayImage = getProductDisplayImage(product);
                const pid = product.id || product.product_id || product._id || '';

                return `
                    <div class=\"product-card\" data-product-id=\"${pid}\">
                        <div class="product-image-container">
                            <img src="${displayImage}" alt="${escapeHtml(product.name)}" class="product-image" 
                                 onerror="this.src='${PLACEHOLDER_IMG}'">
                            ${badgeHTML}
                            <div class="product-actions">
                                <button class="product-action-btn wishlist-btn" data-product-id="${pid}" title="Add to Wishlist">
                                    <i class="far fa-heart"></i>
                                </button>
                                <button class="product-action-btn" title="View Product">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="product-info">
                            <h3 class="product-title">${escapeHtml(product.name)}</h3>
                            <div class="product-price">
                                <span class="current-price">${priceDisplay}</span>
                                ${discountHTML}
                            </div>
                            <div class="product-rating">
                                ${generateStarRating(product.rating || 0)}
                                <span class="rating-count">(${product.review_count || 0})</span>
                            </div>
                            <div class="product-actions-bottom">
                                <button class="mini-cart-btn cart-redirect-btn" title="View details">
                                    <i class="fas fa-shopping-cart"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            function updateProductCount(count) {
                const productCountEl = document.getElementById("productCount");
                if (productCountEl) {
                    productCountEl.textContent = `${count} products found`;
                }
            }

            // Utility functions
            function generateStarRating(rating) {
                const fullStars = Math.floor(rating);
                const hasHalfStar = rating % 1 >= 0.5;
                const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
                
                let stars = '';
                
                for (let i = 0; i < fullStars; i++) {
                    stars += '<i class="fas fa-star"></i>';
                }
                
                if (hasHalfStar) {
                    stars += '<i class="fas fa-star-half-alt"></i>';
                }
                
                for (let i = 0; i < emptyStars; i++) {
                    stars += '<i class="far fa-star"></i>';
                }
                
                return stars;
            }

            function escapeHtml(text) {
                if (text === null || text === undefined) return '';
                const div = document.createElement('div');
                div.textContent = String(text);
                return div.innerHTML;
            }

            // Choose the best image to display for a product card
            function getProductDisplayImage(product) {
                // Keep market page simple: use a single image like Shopee cards
                if (product.image_url) return product.image_url;
                if (product.image) return product.image;
                if (Array.isArray(product.images) && product.images.length > 0) {
                    const first = product.images[0];
                    if (typeof first === 'string') return first;
                    if (first && (first.url || first.image_url)) return first.url || first.image_url;
                }
                return PLACEHOLDER_IMG;
            }

            // Render color swatches for a product (use exact hex when available)
            function renderColorOptions(product) {
                const colors = getProductColors(product);
                if (!colors.length) return '';

                // Limit to first 6 and show a +N indicator if more
                const maxShow = 6;
                const visible = colors.slice(0, maxShow);
                const extraCount = Math.max(0, colors.length - visible.length);

                const parts = visible.map(({ label, hex }) => {
                    const resolved = (hex && String(hex).startsWith('#')) ? hex.toUpperCase() : (mapColorToHexStrict(label) || null);
                    const colorImage = getImageForColor(product, label) || '';
                    const title = label; // show name only, not code
                    if (resolved) {
                        const borderColor = isLightColor(resolved) ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.9)';
                        return `<button class=\"color-swatch\" data-color=\"${escapeHtml(label)}\" data-image=\"${escapeHtml(colorImage)}\" title=\"${escapeHtml(title)}\" style=\"background:${resolved}; border-color:${borderColor};\" aria-label=\"Select color ${escapeHtml(title)}\"></button>`;
                    }
                    // If we cannot resolve a color, show a small label chip so users can still see available colors set by seller
                    return `<span class=\"color-chip\" data-image=\"${escapeHtml(colorImage)}\" title=\"${escapeHtml(title)}\">${escapeHtml(label)}</span>`;
                }).filter(Boolean).join('');

                const extra = extraCount > 0 ? `<span class=\"color-swatch more\" title=\"+${extraCount} more\">+${extraCount}</span>` : '';
                return `${parts}${extra}`;
            }

            // Render color dots overlay for image (swatches only, no text chips)
            // Render color names (text) under rating
            function renderColorNames(product) {
                // First try in-stock colors
                let entries = buildColorEntries(product, true);
                // Fallback: show declared colors regardless of stock
                if (!entries.length) entries = buildColorEntries(product, false);
                if (!entries.length) return '';
                const maxShow = 6;
                const visible = entries.slice(0, maxShow);
                const extra = entries.length > maxShow ? `, +${entries.length - maxShow} more` : '';
                const list = visible.map(e => `<button class=\"color-link\" data-color=\"${escapeHtml(e.original || e.display)}\" data-image=\"${escapeHtml(e.image)}\">${escapeHtml(e.display)}</button>`).join(', ');
                return `<div class=\"product-color-names\"><span class=\"label\">Colors:</span> ${list}${extra}</div>`;
            }

            // Collect color entries {display, original, image} from many possible shapes
            function buildColorEntries(product, preferInStock) {
                const out = [];
                const seen = new Set();

                const pushEntry = (label, hex, img) => {
                    const disp = colorDisplayName(label, hex);
                    if (!disp) return;
                    const key = disp.toLowerCase();
                    if (seen.has(key)) return;
                    seen.add(key);
                    out.push({ display: disp, original: label, image: img || '' });
                };

                // 1) Use getProductColors (prefers in-stock)
                try {
                    const cols = getProductColors(product) || [];
                    cols.forEach(c => pushEntry((c.label||'').trim(), c.hex, getImageForColor(product, c.label)));
                } catch {}

                if (out.length && preferInStock) return out;

                // 2) Direct maps (images_by_color / color_images / etc.)
                const pick = (x) => {
                    if (!x) return null;
                    if (typeof x === 'string') return x;
                    if (Array.isArray(x)) return pick(x.find(Boolean));
                    if (typeof x === 'object') return x.image_url || x.url || x.image || x.src || null;
                    return null;
                };
                const maps = [product.images_by_color, product.color_images, product.image_map, product.images_by_colour, product.colour_images];
                for (const m of maps) {
                    if (m && typeof m === 'object') {
                        for (const [name, val] of Object.entries(m)) {
                            pushEntry(name, null, pick(val));
                        }
                    }
                }

                // 3) Variants (ignoring stock if preferInStock is false)
                if (Array.isArray(product.variants)) {
                    for (const v of product.variants) {
                        const name = v.color || v.colour || v.color_name || v.name || v.label;
                        if (!name) continue;
                        const img = pick(v.image || v.image_url || v.images);
                        pushEntry(name, v.hex || v.color_hex || v.code, img);
                        if (Array.isArray(v.attributes)) {
                            for (const a of v.attributes) {
                                if (/color|colour/i.test(a.name || a.key || '')) {
                                    pushEntry(a.value || a.name || a.label, a.hex || a.color_hex || a.code, pick(a.image || a.image_url || a.images));
                                }
                            }
                        }
                    }
                }

                // 4) size_color_stock keys
                if (product.size_color_stock && typeof product.size_color_stock === 'object') {
                    const keys = Object.keys(product.size_color_stock);
                    const sizeNames = ['xs','s','m','l','xl','xxl','2xl','3xl','one size','onesize','free size','free'];
                    const looksLikeSizes = keys.length && keys.some(k => sizeNames.includes(String(k).toLowerCase()));
                    if (!looksLikeSizes) {
                        for (const [colorName, sizes] of Object.entries(product.size_color_stock)) {
                            let img = null;
                            if (sizes && typeof sizes === 'object') {
                                for (const v of Object.values(sizes)) { img = img || pick(v && (v.image || v.image_url || v.images)); }
                            }
                            pushEntry(colorName, null, img);
                        }
                    } else {
                        for (const [, colorsMap] of Object.entries(product.size_color_stock)) {
                            if (colorsMap && typeof colorsMap === 'object') {
                                for (const [colorName, v] of Object.entries(colorsMap)) {
                                    const img = pick(v && (v.image || v.image_url || v.images));
                                    pushEntry(colorName, null, img);
                                }
                            }
                        }
                    }
                }

                // 5) images[] with a color field
                if (Array.isArray(product.images)) {
                    for (const im of product.images) {
                        const n = (im && (im.color || im.colour || im.label || im.name)) ? String(im.color || im.colour || im.label || im.name) : '';
                        if (n) pushEntry(n, null, pick(im));
                    }
                }

                return out;
            }

            // Turn raw label/hex into a user-friendly color name (avoid showing codes like #000000)
            function colorDisplayName(label, hex) {
                const raw = (label || '').toString().trim();
                // If label looks like a hex (#RGB or #RRGGBB), map hex->name
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
                    const name = hexToColorName(raw);
                    return name || null;
                }
                // If provided hex exists and maps cleanly to a name, prefer the name
                if (hex) {
                    const byHex = hexToColorName(hex);
                    if (byHex) return byHex;
                }
                // Otherwise, return the label if it is not another hex-like token
                if (!raw) return null;
                if (/^#[0-9a-fA-F]+$/.test(raw)) return null;
                // Title-case basic labels
                return raw.replace(/\b\w/g, (m) => m.toUpperCase());
            }

            function hexToColorName(hex) {
                if (!hex) return null;
                const h = (tryParseHex(hex) || '').toUpperCase();
                if (!h) return null;
                const map = {
                    '#000000':'Black','#FFFFFF':'White','#6C757D':'Gray','#C0C0C0':'Silver','#4A4A4A':'Graphite','#333333':'Charcoal','#2F3136':'Gunmetal',
                    '#DC3545':'Red','#800000':'Maroon','#800020':'Burgundy','#722F37':'Wine','#FF007F':'Rose','#FF00FF':'Magenta','#FF00A8':'Fuchsia','#FF69B4':'Pink','#FF7F50':'Coral','#FA8072':'Salmon','#FFCC99':'Peach','#FBCEB1':'Apricot',
                    '#FD7E14':'Orange','#E0AA3E':'Mustard','#FFBF00':'Amber','#FFC107':'Yellow','#DAA520':'Gold',
                    '#8B4513':'Brown','#D2B48C':'Tan','#C69C6D':'Camel','#C3B091':'Khaki','#F5F5DC':'Beige','#F4E7C6':'Sand','#C2B8A3':'Stone','#79553D':'Mocha','#6F4E37':'Coffee',
                    '#808000':'Olive','#28A745':'Green','#0B6623':'Forest','#3EB489':'Mint','#20C997':'Teal','#40E0D0':'Turquoise','#00FFFF':'Aqua','#17A2B8':'Cyan',
                    '#0D6EFD':'Blue','#001F3F':'Navy','#1560BD':'Denim','#6610F2':'Indigo','#87CEEB':'Sky','#A2CFFE':'Baby Blue',
                    '#6F42C1':'Purple','#8A2BE2':'Violet','#8E4585':'Plum','#C8A2C8':'Lilac','#E6E6FA':'Lavender',
                    '#B87333':'Copper','#CD7F32':'Bronze'
                };
                return map[h] || null;
            }

            // Try to fetch an image preview for a given color from various product shapes
            function getImageForColor(product, colorLabel) {
                const label = (colorLabel || '').toString().toLowerCase();
                const pick = (x) => {
                    if (!x) return null;
                    if (typeof x === 'string') return x;
                    if (Array.isArray(x)) {
                        const first = x.find(Boolean);
                        return pick(first);
                    }
                    if (typeof x === 'object') {
                        return x.image_url || x.url || x.image || x.src || null;
                    }
                    return null;
                };

                // Direct maps by color
                const mapCandidates = [
                    product.images_by_color,
                    product.color_images,
                    product.imagesMap,
                    product.image_map,
                    product.images_by_colour,
                    product.colour_images
                ];
                for (const m of mapCandidates) {
                    if (m && typeof m === 'object') {
                        const v = m[colorLabel] || m[label];
                        const img = pick(v);
                        if (img) return img;
                    }
                }

                // size_color_stock: color -> size or size -> color
                if (product.size_color_stock && typeof product.size_color_stock === 'object') {
                    const keys = Object.keys(product.size_color_stock);
                    const sizeNames = ['xs','s','m','l','xl','xxl','2xl','3xl','one size','onesize','free size','free'];
                    const looksLikeSizes = keys.length && keys.some(k => sizeNames.includes(String(k).toLowerCase()));
                    if (!looksLikeSizes) {
                        const entry = product.size_color_stock[colorLabel] || product.size_color_stock[label];
                        if (entry && typeof entry === 'object') {
                            for (const v of Object.values(entry)) {
                                const img = pick(v && (v.image || v.image_url || v.images));
                                if (img) return img;
                            }
                        }
                    } else {
                        for (const [, colorsMap] of Object.entries(product.size_color_stock)) {
                            const v = colorsMap && (colorsMap[colorLabel] || colorsMap[label]);
                            const img = pick(v && (v.image || v.image_url || v.images));
                            if (img) return img;
                        }
                    }
                }

                // variants[]
                if (Array.isArray(product.variants)) {
                    for (const v of product.variants) {
                        const cname = (v.color || v.colour || v.color_name || v.name || v.label || '').toString().toLowerCase();
                        if (cname === label) {
                            const img = pick(v.image || v.image_url || v.images);
                            if (img) return img;
                        }
                        // nested attributes
                        if (Array.isArray(v.attributes)) {
                            for (const a of v.attributes) {
                                if (/color|colour/i.test(a.name || a.key || '')) {
                                    const an = (a.value || a.name || a.label || '').toString().toLowerCase();
                                    if (an === label) {
                                        const img = pick(a.image || a.image_url || a.images);
                                        if (img) return img;
                                    }
                                }
                            }
                        }
                    }
                }

                // swatches array
                if (Array.isArray(product.swatches)) {
                    for (const s of product.swatches) {
                        const n = (s.name || s.label || s.value || '').toString().toLowerCase();
                        if (n === label) {
                            const img = pick(s.image || s.image_url || s.images);
                            if (img) return img;
                        }
                    }
                }

                // images array that may include color field
                if (Array.isArray(product.images)) {
                    for (const im of product.images) {
                        const n = (im && (im.color || im.colour || im.label || im.name)) ? String(im.color || im.colour || im.label || im.name).toLowerCase() : '';
                        if (n && n === label) {
                            const img = pick(im);
                            if (img) return img;
                        }
                    }
                }
                return null;
            }

            // Extract color labels and hex codes, preferring in-stock colors
            function getProductColors(product) {
                // 1) Prefer colors derived from size_color_stock (sum stock across sizes)
                const scs = getColorsFromSizeColorStock(product);
                if (scs.length) return scs;
                // 2) Next prefer variants[] where stock > 0
                const vars = getColorsFromVariants(product);
                if (vars.length) return vars;
                // 3) Fallback: any declared colors (no stock info)
                const out = [];
                const pushUnique = (label, hex) => {
                    const l = (label || '').toString().trim();
                    const h = tryParseHex(hex) || tryParseHex(l) || null;
                    if (!l && !h) return;
                    const key = `${l.toLowerCase()}|${h || ''}`;
                    if (!out.some(x => `${(x.label||'').toLowerCase()}|${x.hex||''}` === key)) {
                        out.push({ label: l || (h || '').toUpperCase(), hex: h });
                    }
                };
                const colorLikeFields = ['color','colour','color_name','colour_name','primary_color'];
                for (const k of colorLikeFields) {
                    if (product[k]) parseColorListFromString(product[k]).forEach(name => pushUnique(name));
                }
                const arrayFields = ['colors','available_colors','colors_available','availableColors','swatches'];
                for (const f of arrayFields) {
                    const arr = product[f];
                    if (Array.isArray(arr)) {
                        arr.forEach(c => {
                            if (typeof c === 'string') pushUnique(c, null);
                            else if (c && typeof c === 'object') pushUnique(c.name || c.label || c.value || c.title || '', c.hex || c.code || c.color_hex || c.value);
                        });
                    }
                }
                if (Array.isArray(product.color_variants)) {
                    product.color_variants.forEach(cv => pushUnique(cv.name || cv.label || '', cv.hex || cv.code || cv.color_hex));
                }
                if (Array.isArray(product.options)) {
                    product.options.forEach(opt => {
                        if (/color|colour/i.test(opt.name || opt.label || '')) {
                            (opt.values || opt.options || []).forEach(v => pushUnique(v.name || v.label || v, v.hex || v.code || v.color_hex));
                        }
                    });
                }
                if (Array.isArray(product.attributes)) {
                    product.attributes.forEach(attr => {
                        const key = attr.name || attr.key || attr.label;
                        const val = attr.value || attr.values || '';
                        if (/color|colour/i.test(String(key || ''))) {
                            if (Array.isArray(val)) val.forEach(v => pushUnique(v.name || v.label || v, v.hex || v.code || v.color_hex));
                            else parseColorListFromString(val).forEach(v => pushUnique(v));
                        }
                    });
                }
                if (product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes)) {
                    for (const [k, v] of Object.entries(product.attributes)) {
                        if (/color|colour/i.test(k)) {
                            if (Array.isArray(v)) v.forEach(e => pushUnique(e.name || e.label || e, e.hex || e.code || e.color_hex));
                            else parseColorListFromString(v).forEach(n => pushUnique(n));
                        }
                    }
                }
                return out;
            }

            function parseColorListFromString(val) {
                if (val == null) return [];
                const s = String(val);
                return s.split(/[,/|•·;]+/).map(x => x.trim()).filter(Boolean);
            }

            function getColorsFromSizeColorStock(product) {
                const out = [];
                const addColor = (name, value) => {
                    if (!name) return;
                    let total = 0; let hex = null;
                    if (value && typeof value === 'object') {
                        // Sum any numeric-ish fields in nested object
                        for (const v of Object.values(value)) {
                            if (v && typeof v === 'object') {
                                total += getStockValue(v);
                                hex = hex || v.hex || v.color_hex || v.code || null;
                            } else {
                                total += getStockValue(v);
                            }
                        }
                        hex = hex || value.hex || value.color_hex || value.code || null;
                    } else {
                        total = getStockValue(value);
                    }
                    const labelStr = String(name);
                    const resolvedHex = tryParseHex(hex) || tryParseHex(labelStr);
                    if (total > 0) out.push({ label: labelStr, hex: resolvedHex });
                };

                // Case A: color -> size map
                if (product.size_color_stock && typeof product.size_color_stock === 'object') {
                    const keys = Object.keys(product.size_color_stock || {});
                    const sizeNames = ['xs','s','m','l','xl','xxl','2xl','3xl','one size','onesize','free size','free'];
                    const looksLikeSizes = keys.length && keys.some(k => sizeNames.includes(String(k).toLowerCase()));

                    if (!looksLikeSizes) {
                        for (const [colorName, sizesMap] of Object.entries(product.size_color_stock)) {
                            addColor(colorName, sizesMap);
                        }
                    } else {
                        // Case B: size -> color map
                        const totals = new Map();
                        const hexes = new Map();
                        for (const [, colorsMap] of Object.entries(product.size_color_stock)) {
                            if (colorsMap && typeof colorsMap === 'object') {
                                for (const [colorName, val] of Object.entries(colorsMap)) {
                                    const prev = totals.get(colorName) || 0;
                                    const add = getStockValue(val);
                                    totals.set(colorName, prev + add);
                                    if (!hexes.has(colorName) && val && typeof val === 'object') {
                                        const h = val.hex || val.color_hex || val.code || null;
                                        if (h) hexes.set(colorName, h);
                                    }
                                }
                            }
                        }
                        for (const [name, t] of totals.entries()) {
                            if (t > 0) out.push({ label: String(name), hex: tryParseHex(hexes.get(name)) });
                        }
                    }
                }

                // Additional common shapes: color => stock maps
                const colorStockFields = ['stock_by_color','color_stock','colors_stock','available_by_color'];
                for (const f of colorStockFields) {
                    const m = product[f];
                    if (m && typeof m === 'object') {
                        for (const [colorName, val] of Object.entries(m)) addColor(colorName, val);
                    }
                }

                return out;
            }

            function getColorsFromVariants(product) {
                const out = [];
                if (!Array.isArray(product.variants)) return out;
                const push = (label, hex, stock) => {
                    if (!label && !hex) return;
                    const l = (label || '').toString().trim();
                    const h = tryParseHex(hex) || tryParseHex(l);
                    if (getSafeNumber(stock) <= 0) return; // only in-stock
                    if (!out.some(x => (x.label||'').toLowerCase() === l.toLowerCase())) out.push({ label: l || (h||'').toUpperCase(), hex: h });
                };
                product.variants.forEach(v => {
                    const name = v.color || v.colour || v.color_name || (v.attributes && (v.attributes.color || v.attributes.colour)) || v.name || v.label;
                    const hex = v.hex || v.code || v.color_hex || (v.attributes && (v.attributes.color_hex || v.attributes.hex));
                    const stock = getStockValue(v);
                    push(name, hex, stock);
                    if (Array.isArray(v.attributes)) {
                        v.attributes.forEach(a => {
                            if (/color|colour/i.test(a.name || a.key || '')) push(a.value || a.name || a.label, a.hex || a.color_hex || a.code, getStockValue(a));
                        });
                    }
                });
                return out;
            }

            function getSafeNumber(x) { const n = Number(x); return isFinite(n) ? n : 0; }
            function getStockValue(obj) {
                if (obj == null) return 0;
                if (typeof obj === 'number') return obj;
                if (typeof obj === 'boolean') return obj ? 1 : 0;
                if (typeof obj === 'string') {
                    const m = obj.match(/-?\d+(?:\.\d+)?/); if (m) return parseFloat(m[0]);
                    if (/true|yes|in\s*stock|available/i.test(obj)) return 1;
                    return 0;
                }
                if (typeof obj === 'object') {
                    const keys = ['stock','stocks','quantity','qty','available','available_qty','count','inventory','in_stock','on_hand','units','remaining'];
                    for (const k of keys) { if (k in obj) return getStockValue(obj[k]); }
                }
                return 0;
            }

            function tryParseHex(s) {
                if (!s) return null;
                const str = String(s).trim();
                const hexMatch = str.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/);
                if (hexMatch) return `#${hexMatch[1]}`.toUpperCase();
                return null;
            }

            // Strict mapping of common color names to hex; returns null if unknown
            function mapColorToHexStrict(name) {
                if (!name) return null;
                const n = String(name).toLowerCase().trim();
                const base = {
                    'black':'#000000','white':'#ffffff','grey':'#6c757d','gray':'#6c757d','silver':'#c0c0c0','graphite':'#4a4a4a','charcoal':'#333333','gunmetal':'#2f3136',
                    'red':'#dc3545','maroon':'#800000','burgundy':'#800020','wine':'#722f37','rose':'#ff007f','magenta':'#ff00ff','fuchsia':'#ff00a8','pink':'#ff69b4','coral':'#ff7f50','salmon':'#fa8072','peach':'#ffcc99','apricot':'#fbceb1',
                    'orange':'#fd7e14','mustard':'#e0aa3e','amber':'#ffbf00','yellow':'#ffc107','gold':'#daa520',
                    'brown':'#8b4513','tan':'#d2b48c','camel':'#c69c6d','khaki':'#c3b091','beige':'#f5f5dc','sand':'#f4e7c6','stone':'#c2b8a3','mocha':'#79553d','coffee':'#6f4e37',
                    'olive':'#808000','green':'#28a745','forest':'#0b6623','mint':'#3eb489','teal':'#20c997','turquoise':'#40e0d0','aqua':'#00ffff','cyan':'#17a2b8',
                    'blue':'#0d6efd','navy':'#001f3f','denim':'#1560bd','indigo':'#6610f2','sky':'#87ceeb','baby blue':'#a2cffe',
                    'purple':'#6f42c1','violet':'#8a2be2','plum':'#8e4585','lilac':'#c8a2c8','lavender':'#e6e6fa',
                    'copper':'#b87333','bronze':'#cd7f32'
                };
                if (base[n]) return base[n];
                // Try phrase match but only if the token is at word boundary to avoid accidental hits
                const tokens = Object.keys(base).sort((a,b)=>b.length-a.length);
                for (const t of tokens) {
                    const re = new RegExp(`(^|\n|\r|\t|\s)${t.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}(\s|$)`, 'i');
                    if (re.test(n)) return base[t];
                }
                return null;
            }

            function stringToColorHex(str) {
                const s = String(str || '').toLowerCase();
                let hash = 0;
                for (let i=0;i<s.length;i++){ hash = ((hash<<5)-hash) + s.charCodeAt(i); hash |= 0; }
                const palette = ['#FF6F61','#FFB400','#6BCB77','#4D96FF','#A66DD4','#FF6D00','#00B8A9','#F6416C','#28C76F','#00CFE8','#FDAC41','#2D9CDB','#B8DE6F','#B76E79','#845EC2'];
                const idx = Math.abs(hash) % palette.length;
                return palette[idx];
            }

            function isLightColor(hex) {
                const h = tryParseHex(hex);
                if (!h) return false;
                // parse #RRGGBB or #RGB
                let r,g,b;
                if (h.length === 4) { // #RGB
                    r = parseInt(h[1]+h[1],16); g = parseInt(h[2]+h[2],16); b = parseInt(h[3]+h[3],16);
                } else {
                    r = parseInt(h.substr(1,2),16); g = parseInt(h.substr(3,2),16); b = parseInt(h.substr(5,2),16);
                }
                const brightness = (r*299 + g*587 + b*114) / 1000; // 0-255
                return brightness > 200; // consider very light colors
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

            function showToast(message, type = "info") {
                // Remove existing toasts
                const existingToasts = document.querySelectorAll('.custom-toast');
                existingToasts.forEach(toast => toast.remove());
                
                const toast = document.createElement('div');
                toast.className = `custom-toast custom-toast-${type}`;
                toast.innerHTML = `
                    <div class="toast-content">
                        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                        <span>${escapeHtml(message)}</span>
                    </div>
                `;
                
                document.body.appendChild(toast);
                
                // Show toast
                setTimeout(() => {
                    toast.classList.add('show');
                }, 10);
                
                // Hide after 3 seconds
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.parentNode.removeChild(toast);
                        }
                    }, 300);
                }, 3000);
            }

            // Wishlist Management
            async function loadWishlistStatus() {
                // Check if user is logged in
                const token = localStorage.getItem('auth_token') || localStorage.getItem(TOKEN_KEY);
                if (!token) return;

                try {
                    const response = await apiRequest('/wishlist');
                    if (response.success && response.items) {
                        const wishlistProductIds = new Set(response.items.map(item => item.product_id));
                        
                        // Update wishlist button states
                        document.querySelectorAll('.wishlist-btn').forEach(button => {
                            const productId = parseInt(button.dataset.productId);
                            if (wishlistProductIds.has(productId)) {
                                const icon = button.querySelector('i');
                                if (icon) {
                                    icon.classList.remove('far');
                                    icon.classList.add('fas');
                                    button.classList.add('active');
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.log('Could not load wishlist status:', error);
                    // Silently fail - user might not be logged in
                }
            }

            async function toggleWishlist(productId, button) {
                // Check if user is logged in
                const token = localStorage.getItem('auth_token') || localStorage.getItem(TOKEN_KEY);
                if (!token) {
                    showToast('Please login to add items to your wishlist', 'info');
                    setTimeout(() => {
                        window.location.href = '/templates/Authenticator/login.html';
                    }, 1500);
                    return;
                }

                const icon = button.querySelector('i');
                const isInWishlist = icon && icon.classList.contains('fas');

                try {
                    if (isInWishlist) {
                        // Remove from wishlist
                        const response = await apiRequest(`/wishlist/${productId}`, {
                            method: 'DELETE'
                        });

                        if (response.success) {
                            icon.classList.remove('fas');
                            icon.classList.add('far');
                            button.classList.remove('active');
                            showToast('Removed from wishlist', 'success');
                        }
                    } else {
                        // Add to wishlist
                        const response = await apiRequest(`/wishlist/${productId}`, {
                            method: 'POST'
                        });

                        if (response.success) {
                            icon.classList.remove('far');
                            icon.classList.add('fas');
                            button.classList.add('active');
                            showToast('Added to wishlist', 'success');
                        }
                    }
                } catch (error) {
                    console.error('Error toggling wishlist:', error);
                    showToast(error.message || 'Failed to update wishlist', 'error');
                }
            }

            // Make functions available globally for HTML event handlers
            window.clearAllFilters = clearAllFilters;
            window.handleSortChange = handleSortChange;
            window.handleSearchChange = handleSearchChange;
            window.handleFilterChange = handleFilterChange;
        })();

        
