// Account page logic: auth check, tabs, profile, addresses with map + PSGC loaders, password, orders, notifications
(function(){
  console.log('Account.js initializing...');
  
  // DECLARE UTILITY FUNCTIONS FIRST (before they're used)
  const headers = () => {
    const token = AuthManager.getAuthToken();
    return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };
  };

  function apiFetch(url, options = {}){
    const baseHeaders = headers();
    return fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...baseHeaders, ...(options.headers || {}) },
    });
  }

  // PSGC API configuration
  const API = {
    regions: 'https://psgc.gitlab.io/api/regions/',
    provincesByRegion: (code) => `https://psgc.gitlab.io/api/regions/${code}/provinces/`,
    citiesByProvince: (code) => `https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`,
    barangaysByCity: (code) => `https://psgc.gitlab.io/api/cities-municipalities/${code}/barangays/`
  };
  
  // Wait for DOM to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccountPage);
  } else {
    initAccountPage();
  }
  
  function initAccountPage() {
    console.log('DOM ready, checking authentication...');
    
    const token = (AuthManager.getAuthToken && AuthManager.getAuthToken()) || null;
    const isLoggedIn = AuthManager.isLoggedIn && AuthManager.isLoggedIn();
    
    console.log('Auth check - Token:', !!token, 'Logged in:', isLoggedIn);
    
    if (!isLoggedIn || !token) {
      console.log('Not authenticated, redirecting...');
      window.location.href = '/templates/Authenticator/login.html';
      return;
    }
    
    console.log('Authentication successful, initializing page...');
    
    // Only setup navigation if the element exists (account.html page)
    if (document.getElementById('accountNav')) {
      setupNavigation();
    }
    
    loadInitialData();
  }
  
  function setupNavigation() {
    // Elements
    const nav = document.getElementById('accountNav');
    const sections = document.querySelectorAll('.account-content .section');
    
    if (!nav) return; // Silently exit if not on account.html page
    
    console.log('Setting up navigation - Sections found:', sections.length);
    
    // Tab switching
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-link');
      if (!btn) return;
      
      console.log('Navigation clicked:', btn.getAttribute('data-target'));
      
      // Remove active class from all nav links
      document.querySelectorAll('.account-nav .nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show target section
      const targetSelector = btn.getAttribute('data-target');
      const target = document.querySelector(targetSelector);
      
      if (!target) {
        console.error('Target section not found:', targetSelector);
        return;
      }
      
      // Hide all sections
      sections.forEach(s => s.classList.remove('active'));
      // Show target section
      target.classList.add('active');
      
      console.log('Navigation successful, showing section:', targetSelector);
    });
  }
  
  function loadInitialData() {
    console.log('Loading initial data...');
    
    // Only load data if the respective elements exist on the page
    if (document.getElementById('ovName') || document.getElementById('editName')) {
      loadProfile();
    }
    if (document.getElementById('addrRegion')) {
      loadRegions();
    }
    if (document.getElementById('addressList')) {
      loadAddresses();
    }
    if (document.getElementById('accountOrdersList')) {
      loadAccountOrders();
    }
    if (document.getElementById('notifList')) {
      loadNotifications();
    }
  }

  // Profile
  async function loadProfile(){
    try {
      console.log('Loading profile data...');
      const res = await apiFetch('/api/account/profile');
      const data = await res.json();
      if (!data.success) {
        console.warn('Profile load failed:', data.error);
        return;
      }
      const u = data.user || {};
      console.log('Profile loaded successfully:', u);
      const elName = document.getElementById('ovName'); if (elName) elName.textContent = u.name || '-';
      const elEmail = document.getElementById('ovEmail'); if (elEmail) elEmail.textContent = u.email || '-';
      const elPhone = document.getElementById('ovPhone'); if (elPhone) elPhone.textContent = u.phone || '-';
      const fName = document.getElementById('editName'); if (fName) fName.value = u.name || '';
      const fEmail = document.getElementById('editEmail'); if (fEmail) fEmail.value = u.email || '';
      const fPhone = document.getElementById('editPhone'); if (fPhone) fPhone.value = u.phone || '';
    } catch(err){ console.error('loadProfile error:', err); }
  }

  document.getElementById('editProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('editName').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      email: document.getElementById('editEmail').value.trim()
    };
    const res = await apiFetch('/api/account/profile', { method:'PUT', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      await loadProfile();
      alert('Profile updated');
    } else {
      alert(data.error || 'Failed to update profile');
    }
  });

  // Password
  document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('curPwd').value;
    const np = document.getElementById('newPwd').value;
    const cp = document.getElementById('confirmPwd').value;
    if (np !== cp) { alert('Passwords do not match'); return; }
    const res = await apiFetch('/api/account/password', { method:'PUT', body: JSON.stringify({ current_password: cur, new_password: np }) });
    const data = await res.json();
    if (data.success) { alert('Password updated'); e.target.reset(); }
    else { alert(data.error || 'Failed to update password'); }
  });

  // Addresses
  const btnAddAddress = document.getElementById('btnAddAddress');
  const addressFormWrap = document.getElementById('addressFormWrap');
  const addressForm = document.getElementById('addressForm');
  const addressList = document.getElementById('addressList');
  const addrCancel = document.getElementById('addrCancel');
  let editingAddressId = null;            // track currently edited address id
  let currentAddressesCache = [];         // cache addresses for inline edit

  // Map modal logic
  let mapModalMap, mapModalMarker, mapModalInstance;
  const mapModalEl = document.getElementById('mapModal');

  function initMapModal() {
    if (!mapModalMap) {
      mapModalMap = L.map('mapModalMap').setView([12.8797, 121.7740], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapModalMap);
      mapModalMarker = L.marker([12.8797, 121.7740], { draggable: true }).addTo(mapModalMap);
      mapModalMarker.on('dragend', () => {
        const { lat, lng } = mapModalMarker.getLatLng();
        document.getElementById('addrLat').value = lat.toFixed(6);
        document.getElementById('addrLng').value = lng.toFixed(6);
      });
    }
    // If lat/lng already set, use them
    const latVal = parseFloat(document.getElementById('addrLat').value);
    const lngVal = parseFloat(document.getElementById('addrLng').value);
    if (!isNaN(latVal) && !isNaN(lngVal)) {
      mapModalMap.setView([latVal, lngVal], 15);
      mapModalMarker.setLatLng([latVal, lngVal]);
    } else {
      mapModalMap.setView([12.8797, 121.7740], 5);
      mapModalMarker.setLatLng([12.8797, 121.7740]);
    }
    setTimeout(() => mapModalMap.invalidateSize(), 50);
    // If lat/lng not provided yet, try geocoding the current address to initialize the pin
    if (isNaN(latVal) || isNaN(lngVal)) {
      geocodeAndUpdatePin();
    }
  }

  // Open/close modal handlers
  document.getElementById('btnPinOnMap')?.addEventListener('click', () => {
    mapModalInstance = new bootstrap.Modal(mapModalEl);
    mapModalInstance.show();
  });
  mapModalEl?.addEventListener('shown.bs.modal', initMapModal);

  btnAddAddress?.addEventListener('click', () => {
    editingAddressId = null;
    resetAddressFormLabels();
    addressForm.reset();
    // Clear selects
    if (elRegion) elRegion.value = '';
    if (elProvince) elProvince.innerHTML = '';
    if (elCity) elCity.innerHTML = '';
    if (elBarangay) elBarangay.innerHTML = '';
    addressFormWrap.style.display = '';
  });
  addrCancel?.addEventListener('click', () => {
    editingAddressId = null;
    resetAddressFormLabels();
    addressFormWrap.style.display = 'none';
  });

  // PSGC API loaders (API declaration moved to top of file)
  const elRegion = document.getElementById('addrRegion');
  const elProvince = document.getElementById('addrProvince');
  const elCity = document.getElementById('addrCity');
  const elBarangay = document.getElementById('addrBarangay');
  const elStreet = document.getElementById('addrStreet');
  const elPostal = document.getElementById('addrPostal');

  // Address -> geocode with Nominatim and move pin automatically
  let geoDebounce;

  function cleanText(value) {
    if (!value) return '';
    // Remove parenthetical descriptors like "(Municipality)", "(City)", etc.
    return value.replace(/\s*\([^)]*\)\s*/g, '').trim();
  }
  function normalizeRegionName(text) {
    if (!text) return '';
    // Prefer the alias inside parentheses for region names (e.g., "Region IV-A (CALABARZON)" -> "CALABARZON")
    const match = text.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1].trim();
    return cleanText(text.replace(/^Region\s+[-IVXLC]+[A-Z-]*\s*/i, ''));
  }
  function getSelectedText(selectEl) {
    if (!selectEl) return '';
    const value = selectEl.value;
    if (!value) return '';
    const text = selectEl.options[selectEl.selectedIndex]?.text || '';
    // Exclude placeholders like "Select..."
    if (/^select\.?/i.test(text.trim())) return '';
    return text.trim();
  }
  function composeAddress() {
    const street = (elStreet?.value || '').trim();
    const barangayTxt = cleanText(getSelectedText(elBarangay));
    const cityTxt = cleanText(getSelectedText(elCity));
    const provinceTxt = cleanText(getSelectedText(elProvince));
    const regionTxt = normalizeRegionName(getSelectedText(elRegion));
    const postalTxt = (elPostal?.value || '').trim();

    const parts = [
      street,
      barangayTxt,
      cityTxt,
      provinceTxt,
      regionTxt,
      // Only include postal if it looks valid (PH is typically 4 digits)
      /^\d{4}$/.test(postalTxt) ? postalTxt : '',
      'Philippines'
    ].filter(p => p && p.length > 0);

    return parts.join(', ');
  }
  async function geocodeAndUpdatePin() {
    // Collect normalized parts
    const streetTxt = (elStreet?.value || '').trim();
    const bTxt = cleanText(getSelectedText(elBarangay));
    const cTxt = cleanText(getSelectedText(elCity));
    const pTxt = cleanText(getSelectedText(elProvince));
    const rTxt = normalizeRegionName(getSelectedText(elRegion));
    const postalRaw = (elPostal?.value || '').trim();
    const postalTxt = /^\d{4}$/.test(postalRaw) ? postalRaw : '';

    // Require at least city/municipality and province for accuracy
    if (!cTxt || !pTxt) return;

    async function tryStructured(params) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
        }
      } catch(_) {}
      return null;
    }

    let result = null;

    // Strategy 1: state=Province, city=Municipality, suburb=Barangay, street=Street
    let params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'ph', country: 'Philippines', addressdetails: '1' });
    if (pTxt) params.set('state', pTxt);
    if (cTxt) params.set('city', cTxt);
    if (postalTxt) params.set('postalcode', postalTxt);
    if (streetTxt) params.set('street', streetTxt);
    if (bTxt) params.set('suburb', bTxt);
    if (rTxt) params.set('state_district', rTxt);
    result = await tryStructured(params);

    // Strategy 2: use town instead of city
    if (!result) {
      params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'ph', country: 'Philippines', addressdetails: '1' });
      if (pTxt) params.set('state', pTxt);
      if (cTxt) params.set('town', cTxt);
      if (postalTxt) params.set('postalcode', postalTxt);
      if (streetTxt) params.set('street', streetTxt);
      if (bTxt) params.set('suburb', bTxt);
      if (rTxt) params.set('state_district', rTxt);
      result = await tryStructured(params);
    }

    // Strategy 3: use village for municipality
    if (!result && cTxt) {
      params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'ph', country: 'Philippines', addressdetails: '1' });
      if (pTxt) params.set('state', pTxt);
      params.set('village', cTxt);
      if (postalTxt) params.set('postalcode', postalTxt);
      if (streetTxt) params.set('street', streetTxt);
      if (bTxt) params.set('suburb', bTxt);
      if (rTxt) params.set('state_district', rTxt);
      result = await tryStructured(params);
    }

    // Strategy 4: free-text fallback with barangay included
    if (!result) {
      const parts = [streetTxt, bTxt, cTxt, pTxt, rTxt, postalTxt, 'Philippines'].filter(Boolean).join(', ');
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(parts)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
      } catch(e) { console.warn('free-text geocode failed', e); }
    }

    if (result && !isNaN(result.lat) && !isNaN(result.lon)) {
      document.getElementById('addrLat').value = result.lat.toFixed(6);
      document.getElementById('addrLng').value = result.lon.toFixed(6);
      if (typeof mapModalMap !== 'undefined' && mapModalMap) {
        mapModalMap.setView([result.lat, result.lon], 17);
        mapModalMarker.setLatLng([result.lat, result.lon]);
      }
    }
  }
  function scheduleGeocode() {
    clearTimeout(geoDebounce);
    geoDebounce = setTimeout(geocodeAndUpdatePin, 600);
  }

  function setOptions(select, items, getVal, getText){
    select.innerHTML = '<option value="">Select...</option>' + items.map(it => `<option value="${getVal(it)}">${getText(it)}</option>`).join('');
  }

  async function loadRegions(){
    try {
      const res = await fetch(API.regions);
      const data = await res.json();
      setOptions(elRegion, data, x => x.code, x => `${x.name}`);
    } catch(err){ console.error('regions', err); }
  }
  async function loadProvinces(regionCode){
    if (!regionCode) { elProvince.innerHTML = ''; elCity.innerHTML=''; elBarangay.innerHTML=''; return; }
    const res = await fetch(API.provincesByRegion(regionCode));
    const data = await res.json();
    setOptions(elProvince, data, x => x.code, x => x.name);
    elCity.innerHTML = ''; elBarangay.innerHTML='';
  }
  async function loadCities(provinceCode){
    if (!provinceCode) { elCity.innerHTML=''; elBarangay.innerHTML=''; return; }
    const res = await fetch(API.citiesByProvince(provinceCode));
    const data = await res.json();
    setOptions(elCity, data, x => x.code, x => x.name);
    elBarangay.innerHTML='';
  }
  async function loadBarangays(cityCode){
    if (!cityCode) { elBarangay.innerHTML=''; return; }
    const res = await fetch(API.barangaysByCity(cityCode));
    const data = await res.json();
    setOptions(elBarangay, data, x => x.code, x => x.name);
  }

  elRegion?.addEventListener('change', e => { loadProvinces(e.target.value); scheduleGeocode(); });
  elProvince?.addEventListener('change', e => { loadCities(e.target.value); scheduleGeocode(); });
  elCity?.addEventListener('change', e => { loadBarangays(e.target.value); scheduleGeocode(); });
  elBarangay?.addEventListener('change', scheduleGeocode);
  elStreet?.addEventListener('input', scheduleGeocode);
  elPostal?.addEventListener('input', scheduleGeocode);

  // Save (create or update) address
  addressForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      label: document.getElementById('addrLabel').value.trim(),
      contact_name: document.getElementById('addrContactName').value.trim(),
      contact_phone: document.getElementById('addrContactPhone').value.trim(),
      region_code: elRegion.value || null,
      region: elRegion.options[elRegion.selectedIndex]?.text || '',
      province_code: elProvince.value || null,
      province: elProvince.options[elProvince.selectedIndex]?.text || '',
      city_code: elCity.value || null,
      city: elCity.options[elCity.selectedIndex]?.text || '',
      barangay_code: elBarangay.value || null,
      barangay: elBarangay.options[elBarangay.selectedIndex]?.text || '',
      postal_code: document.getElementById('addrPostal').value.trim(),
      street: document.getElementById('addrStreet').value.trim(),
      latitude: parseFloat(document.getElementById('addrLat').value) || null,
      longitude: parseFloat(document.getElementById('addrLng').value) || null,
      is_default: document.getElementById('addrDefault').checked
    };

    let res, data;
    if (editingAddressId) {
      // Update existing
      res = await apiFetch(`/api/account/addresses/${editingAddressId}`, { method:'PUT', body: JSON.stringify(body) });
      data = await res.json();
    } else {
      // Create new
      res = await apiFetch('/api/account/addresses', { method:'POST', body: JSON.stringify(body) });
      data = await res.json();
    }

    if (data?.success) {
      editingAddressId = null;
      resetAddressFormLabels();
      addressForm.reset();
      addressFormWrap.style.display='none';
      await loadAddresses();
    } else {
      alert(data?.error || 'Failed to save address');
    }
  });

  async function loadAddresses(){
    const addressList = document.getElementById('addressList');
    if (!addressList) return; // Exit if element doesn't exist
    
    try {
      const res = await apiFetch('/api/account/addresses');
      const data = await res.json();
      if (!data.success) { addressList.innerHTML = '<div class="text-muted">No addresses</div>'; return; }
      currentAddressesCache = data.addresses || [];
      addressList.innerHTML = currentAddressesCache.map(a => `
        <div class="address-item" data-id="${a.id || 'users-table'}" data-from-users="${a.from_users_table || false}">
          <div class="d-flex align-items-center justify-content-between">
            <div class="title">${a.label || 'Address'}</div>
            ${a.is_default ? '<span class="badge bg-primary">Default</span>' : ''}
            ${a.from_users_table ? '<span class="badge bg-secondary ms-2">From Registration</span>' : ''}
          </div>
          <div class="meta mt-1">${a.contact_name || ''} ${a.contact_phone ? '('+a.contact_phone+')':''}</div>
          <div class="mt-2">${[a.street, a.barangay, a.city, a.province, a.region, a.postal_code].filter(Boolean).join(', ')}</div>
          <div class="actions">
            ${a.from_users_table ? '' : `
              <button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${a.id}">Edit</button>
              <button class="btn btn-sm btn-outline-secondary" data-action="set-default" data-id="${a.id}">Set Default</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${a.id}">Delete</button>
            `}
            ${a.from_users_table ? '<small class="text-muted">Add a new address to manage multiple addresses</small>' : ''}
          </div>
        </div>`).join('');
    } catch(err){ console.error('loadAddresses', err); }
  }

  addressList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') {
      e.preventDefault();
      startEditAddress(id);
      return;
    }
    if (action === 'delete') {
      if (!confirm('Delete this address?')) return;
      const res = await apiFetch(`/api/account/addresses/${id}`, { method:'DELETE' });
      const data = await res.json();
      if (data.success) loadAddresses(); else alert(data.error||'Failed');
    }
    if (action === 'set-default') {
      const res = await apiFetch(`/api/account/addresses/${id}`, { method:'PUT', body: JSON.stringify({ is_default: true }) });
      const data = await res.json();
      if (data.success) loadAddresses(); else alert(data.error||'Failed');
    }
  });

  
  async function startEditAddress(id) {
    const addr = currentAddressesCache.find(a => String(a.id) === String(id));
    if (!addr) { await loadAddresses(); return; }

    // Show form and set editing state
    editingAddressId = id;
    setAddressFormToEditMode();
    addressFormWrap.style.display = '';

    // Fill simple fields
    document.getElementById('addrLabel').value = addr.label || '';
    document.getElementById('addrContactName').value = addr.contact_name || '';
    document.getElementById('addrContactPhone').value = addr.contact_phone || '';
    document.getElementById('addrPostal').value = addr.postal_code || '';
    document.getElementById('addrStreet').value = addr.street || '';
    document.getElementById('addrLat').value = addr.latitude || '';
    document.getElementById('addrLng').value = addr.longitude || '';
    document.getElementById('addrDefault').checked = !!addr.is_default;

    // Set selects with codes; ensure cascading loads happen in order
    if (elRegion) {
      elRegion.value = addr.region_code || '';
      await loadProvinces(addr.region_code);
    }
    if (elProvince) {
      elProvince.value = addr.province_code || '';
      await loadCities(addr.province_code);
    }
    if (elCity) {
      elCity.value = addr.city_code || '';
      await loadBarangays(addr.city_code);
    }
    if (elBarangay) {
      elBarangay.value = addr.barangay_code || '';
    }
  }

  function setAddressFormToEditMode() {
    const submitBtn = addressForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Address';
    const addBtn = document.getElementById('btnAddAddress');
    if (addBtn) addBtn.classList.add('btn-primary-custom');
  }
  function resetAddressFormLabels() {
    const submitBtn = addressForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Save Address';
    const addBtn = document.getElementById('btnAddAddress');
    if (addBtn) addBtn.classList.remove('btn-primary-custom');
  }
  
  // Notifications
  async function loadNotifications(){
    const list = document.getElementById('notifList');
    if (!list) return; // Exit if element doesn't exist
    
    try {
      const res = await apiFetch('/api/notifications');
      const data = await res.json();
      if (!data.success || !data.notifications?.length) { list.innerHTML = '<div class="text-muted">No notifications</div>'; return; }
      list.innerHTML = data.notifications.map(n => `
        <div class="notif ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
          <div class="pic">${n.image_url ? `<img src="${n.image_url}" alt="">`: ''}</div>
          <div class="body">
            <div>${n.message}</div>
            <div class="small text-muted">${n.time_ago || ''}</div>
          </div>
        </div>`).join('');
    } catch(err){ console.error('loadNotifications', err); }
  }

  function getNotificationLink(notif){
    if (!notif) return null;
    const type = String(notif.type || '').toLowerCase();
    const ref = notif.reference_id;
    if ((type === 'price_drop' || type === 'stock_alert') && ref) return `/Public/product.html?id=${encodeURIComponent(ref)}`;
    if (type.startsWith('order_') && ref) return `/templates/UserProfile/my_orders.html?orderId=${encodeURIComponent(ref)}`;
    if (type === 'chat_message' && ref) {
      // For chat notifications, return null and handle opening chat directly
      return null;
    }
    return null;
  }

  document.getElementById('notifList')?.addEventListener('click', async (e) => {
    const item = e.target.closest('.notif[data-id]');
    if (!item) return;
    e.preventDefault();
    const id = item.getAttribute('data-id');
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
    } catch(_) {}
    try {
      const res = await apiFetch('/api/notifications');
      const data = await res.json();
      const notif = (data.notifications || []).find(n => String(n.id) === String(id));
      
      // Handle chat notifications differently
      if (notif && notif.type === 'chat_message') {
        // Open the chat center
        if (window.openAccountChatCenter) {
          window.openAccountChatCenter();
        }
        return;
      }
      
      const url = getNotificationLink(notif);
      if (url) window.location.href = url;
    } catch(_) {}
  });

  // Orders functionality
  let currentAccountOrders = [];
  let filteredAccountOrders = [];
  let currentChatId = null;
  let chatPollingInterval = null;
  
  // Pagination variables
  let currentPage = 1;
  const ordersPerPage = 10;
  let totalOrders = 0;

  // Load orders from API
  async function loadAccountOrders(){
    const spinner = document.getElementById('accountLoadingSpinner');
    const ordersList = document.getElementById('accountOrdersList');
    
    if (!ordersList) return; // Exit if element doesn't exist
    
    try {
      if (spinner) spinner.style.display = 'flex';
      
      const res = await apiFetch('/api/orders');
      const data = await res.json();
      
      if (!data.success || !data.orders?.length) {
        displayAccountEmptyState('No orders yet');
        return;
      }
      
      currentAccountOrders = data.orders || [];
      filteredAccountOrders = [...currentAccountOrders];
      
      // Debug: Log the structure of the first order to understand the data format
      if (currentAccountOrders.length > 0) {
        console.log('Order data structure debug:', {
          firstOrder: currentAccountOrders[0],
          firstOrderItems: currentAccountOrders[0].items,
          sampleItem: currentAccountOrders[0].items && currentAccountOrders[0].items[0] || null
        });
      }
      
      displayAccountOrders(filteredAccountOrders);
      
    } catch(err) {
      console.error('loadAccountOrders', err);
      displayAccountEmptyState('Failed to load orders. Please try again.');
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  }

  // Display orders in the UI with pagination
  function displayAccountOrders(orders, page = 1) {
    const ordersList = document.getElementById('accountOrdersList');
    const paginationContainer = document.getElementById('ordersPagination');
    
    if (!orders || orders.length === 0) {
      displayAccountEmptyState('No orders found');
      if (paginationContainer) paginationContainer.style.display = 'none';
      return;
    }
    
    totalOrders = orders.length;
    currentPage = page;
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * ordersPerPage;
    const endIndex = Math.min(startIndex + ordersPerPage, totalOrders);
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    // Display orders
    ordersList.innerHTML = paginatedOrders.map(order => createAccountOrderCard(order)).join('');
    
    // Show/update pagination if more than one page
    if (totalOrders > ordersPerPage) {
      updatePagination();
      if (paginationContainer) paginationContainer.style.display = 'block';
    } else {
      if (paginationContainer) paginationContainer.style.display = 'none';
    }
  }

  // Create HTML for order card
  function createAccountOrderCard(order) {
    if (!order) return '<div class="alert alert-danger">Invalid order data</div>';
    
    let orderDate = 'Unknown date';
    try {
      if (order.created_at) {
        orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      }
    } catch (error) {
      console.error('Error formatting date:', error);
    }
    
    const statusConfig = getAccountStatusConfig(order.status);
    const items = order.items || [];
    const firstThreeItems = items.slice(0, 3);
    const remainingCount = items.length - 3;
    
    return `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <div class="order-number">#${escapeAccountHtml(order.order_number)}</div>
            <div class="order-date">${orderDate}</div>
          </div>
          <span class="status-badge ${statusConfig.class}">${statusConfig.label}</span>
          ${getAccountInfoPill(order)}
        </div>
        
        <div class="order-card-body">
          <div class="order-items">
            ${firstThreeItems.map(item => {
              // Use the comprehensive image resolution function
              const imageSrc = resolveProductImagePath(item);
              // Resolve product id robustly
              const pid = item.product_id || item.productId || item.id;
              
              return `
              <div class="order-item">
                ${imageSrc ? 
                  `<img src="${imageSrc}" alt="${escapeAccountHtml(item.name || item.product_name)}" class="item-image" onerror="console.log('Image failed to load:', this.src); this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                  ''
                }
                <div class="item-image-fallback" style="${imageSrc ? 'display: none;' : 'display: flex;'}">
                  <i class="fas fa-image"></i>
                </div>
                <div class="item-info">
                  <div class="item-name">${escapeAccountHtml(item.name || item.product_name || 'Product')}</div>
                  <div class="item-details">
                    Qty: ${item.quantity} ${item.size ? `• Size: ${item.size}` : ''} ${item.color ? `• Color: ${item.color}` : ''}
                  </div>
${String((order.status||'').toLowerCase()) === 'delivered' ? `<div class=\"mt-1\"><a href=\"#\" class=\"small text-decoration-none\" onclick=\"writeAccountReview(${order.id}, ${'${pid}'}); return false;\"><i class=\"fas fa-pen me-1\"></i>Write Review</a></div>` : ''}
                </div>
              </div>
              `;
            }).join('')}
            ${remainingCount > 0 ? `
              <div class="order-item">
                <div class="item-image-fallback">
                  <i class="fas fa-plus"></i>
                </div>
                <div class="item-info">
                  <div class="item-name">+${remainingCount} more item${remainingCount > 1 ? 's' : ''}</div>
                  <div class="item-details">Click details to view all</div>
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="order-summary">
            <div>
              <strong>Total: <span class="order-total">₱${parseFloat(order.total_amount || 0).toFixed(2)}</span></strong>
            </div>
            <div class="text-muted">
              ${items.length} item${items.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div class="order-actions">
            <a href="#" class="btn-chat" onclick="openAccountChatWithSeller('${escapeAccountHtml(order.order_number || '')}', '${escapeAccountHtml(getAccountSellerName(order))}'); return false;">
              <i class="fas fa-comments"></i> Chat Seller
            </a>
            <a href="#" class="btn-details" onclick="viewAccountOrderDetails(${order.id}); return false;">
              <i class="fas fa-eye"></i> View Details
            </a>
            ${getAccountOrderActionButton(order)}
          </div>
        </div>
      </div>
    `;
  }

  // Helper functions
  function resolveProductImagePath(item) {
    if (!item) return '';
    
    // List of possible image field names (in priority order)
    const imageFields = [
      'image', 'product_image', 'main_image', 'primary_image',
      'image_url', 'product_image_url', 'main_image_url',
      'thumbnail', 'thumb', 'photo', 'picture', 'img'
    ];
    
    let imageSrc = '';
    
    // Try each field until we find an image
    for (const field of imageFields) {
      if (item[field] && typeof item[field] === 'string' && item[field].trim()) {
        imageSrc = item[field].trim();
        console.log(`Found image in field '${field}':`, imageSrc);
        break;
      }
    }
    
    // If still no image, check if there's an images array
    if (!imageSrc && item.images && Array.isArray(item.images) && item.images.length > 0) {
      imageSrc = item.images[0];
      console.log('Found image in images array:', imageSrc);
    }
    
    if (!imageSrc) {
      console.log('No image found for item:', item);
      return '';
    }
    
    // Handle different path formats
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      // Full URL - use as-is
      return imageSrc;
    } else if (imageSrc.startsWith('/static/')) {
      // Already has correct static path
      return imageSrc;
    } else if (imageSrc.startsWith('/')) {
      // Starts with / but not /static/ - use as-is
      return imageSrc;
    } else {
      // Relative filename - assume it's in products directory
      return '/static/uploads/products/' + imageSrc;
    }
  }
  
  function getAccountStatusConfig(status) {
    if (!status || typeof status !== 'string') {
      return { label: 'Unknown', class: 'status-pending' };
    }
    
    const configs = {
      'pending': { label: 'Pending', class: 'status-pending' },
      'confirmed': { label: 'Confirmed', class: 'status-confirmed' },
      'prepared': { label: 'Ready', class: 'status-prepared' },
      'shipped': { label: 'Shipped', class: 'status-shipped' },
      'delivered': { label: 'Delivered', class: 'status-delivered' },
      'cancelled': { label: 'Cancelled', class: 'status-cancelled' }
    };
    
    return configs[status.toLowerCase()] || { label: status, class: 'status-pending' };
  }

  function getAccountInfoPill(order) {
    try {
      const status = (order.status || '').toLowerCase();
      const payment = (order.payment_status || '').toLowerCase();
      
      if (status === 'pending' && (!payment || payment === 'pending')) {
        return '<span class="info-pill pill-awaiting-buyer"><i class="fas fa-user-clock me-1"></i>Awaiting buyer</span>';
      }
      if (status === 'pending' && payment === 'paid') {
        return '<span class="info-pill pill-awaiting-seller"><i class="fas fa-store me-1"></i>Awaiting seller</span>';
      }
      if (status === 'cancelled') {
        return '<span class="info-pill pill-cancelled-buyer"><i class="fas fa-ban me-1"></i>Cancelled</span>';
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function getAccountOrderActionButton(order) {
    const status = (order.status || '').toLowerCase();
    
    // Show cancel button for orders that can be cancelled (pending, confirmed, prepared)
    if (['pending', 'confirmed', 'prepared'].includes(status)) {
      return `<button class="btn-secondary btn-cancel" onclick="redirectToCancelOrder(${order.id}); return false;"><i class="fas fa-times-circle me-1"></i>Cancel Order</button>`;
    }
    
    switch(status) {
      case 'shipped':
        return `<button class="btn-secondary" onclick="trackAccountOrder('${order.tracking_number || order.order_number}')">Track Package</button>`;
      case 'delivered':
        return `<button class="btn-secondary" onclick="writeAccountReview(${order.id})">Write Review</button>`;
      case 'cancelled':
        return `<span class="text-muted"><i class="fas fa-ban me-1"></i>Order Cancelled</span>`;
      default:
        return `<button class="btn-secondary" onclick="contactAccountSupport()">Contact Support</button>`;
    }
  }

  function getAccountSellerName(order) {
    if (!order) return 'Seller';
    
    if (order.items && order.items.length > 0) {
      const firstItem = order.items[0];
      if (firstItem.seller_info && firstItem.seller_info.business_name) {
        return firstItem.seller_info.business_name;
      }
      if (firstItem.seller_name) {
        return firstItem.seller_name;
      }
    }
    
    if (order.seller_info && order.seller_info.business_name) {
      return order.seller_info.business_name;
    }
    if (order.seller_name) {
      return order.seller_name;
    }
    
    return 'Seller';
  }

  // Update pagination controls
  function updatePagination() {
    const totalPages = Math.ceil(totalOrders / ordersPerPage);
    const paginationControls = document.getElementById('paginationControls');
    const paginationStart = document.getElementById('paginationStart');
    const paginationEnd = document.getElementById('paginationEnd');
    const paginationTotal = document.getElementById('paginationTotal');
    
    if (!paginationControls) return;
    
    // Update pagination info
    const startItem = (currentPage - 1) * ordersPerPage + 1;
    const endItem = Math.min(currentPage * ordersPerPage, totalOrders);
    
    if (paginationStart) paginationStart.textContent = startItem;
    if (paginationEnd) paginationEnd.textContent = endItem;
    if (paginationTotal) paginationTotal.textContent = totalOrders;
    
    // Generate pagination buttons
    let paginationHTML = '';
    
    // Previous button
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    paginationHTML += `
      <li class="page-item ${prevDisabled}">
        <a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;" aria-label="Previous">
          <i class="fas fa-chevron-left"></i>
        </a>
      </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    // First page and ellipsis
    if (startPage > 1) {
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="changePage(1); return false;">1</a>
        </li>
      `;
      if (startPage > 2) {
        paginationHTML += `
          <li class="page-item disabled">
            <a class="page-link" href="#">...</a>
          </li>
        `;
      }
    }
    
    // Current page range
    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? 'active' : '';
      paginationHTML += `
        <li class="page-item ${activeClass}">
          <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
        </li>
      `;
    }
    
    // Last page and ellipsis
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += `
          <li class="page-item disabled">
            <a class="page-link" href="#">...</a>
          </li>
        `;
      }
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="changePage(${totalPages}); return false;">${totalPages}</a>
        </li>
      `;
    }
    
    // Next button
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    paginationHTML += `
      <li class="page-item ${nextDisabled}">
        <a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;" aria-label="Next">
          <i class="fas fa-chevron-right"></i>
        </a>
      </li>
    `;
    
    paginationControls.innerHTML = paginationHTML;
  }
  
  // Change page function
  window.changePage = function(page) {
    const totalPages = Math.ceil(totalOrders / ordersPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    displayAccountOrders(filteredAccountOrders, page);
    
    // Scroll to top of orders list
    const ordersList = document.getElementById('accountOrdersList');
    if (ordersList) {
      ordersList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  function displayAccountEmptyState(message) {
    const ordersList = document.getElementById('accountOrdersList');
    if (!ordersList) return; // Exit if element doesn't exist
    ordersList.innerHTML = `
      <div class="empty-orders-state">
        <i class="fas fa-shopping-bag"></i>
        <h5>No Orders Found</h5>
        <p>${message}</p>
        <a href="/templates/Public/market.html" class="btn btn-primary-custom">
          <i class="fas fa-shopping-cart me-2"></i>Start Shopping
        </a>
      </div>
    `;
  }

  function escapeAccountHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  // Filter and search functions
  window.filterAccountOrders = function(status) {
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    if (status) {
      filteredAccountOrders = currentAccountOrders.filter(order => order.status === status);
    } else {
      filteredAccountOrders = [...currentAccountOrders];
    }
    
    // Reset to first page when filtering
    currentPage = 1;
    displayAccountOrders(filteredAccountOrders, 1);
  };

  window.searchAccountOrders = function() {
    const searchTerm = document.getElementById('accountSearchInput').value.toLowerCase();
    
    if (!searchTerm) {
      filteredAccountOrders = [...currentAccountOrders];
    } else {
      filteredAccountOrders = currentAccountOrders.filter(order => {
        return order.order_number.toLowerCase().includes(searchTerm) ||
               order.items.some(item => 
                 (item.name || item.product_name || '').toLowerCase().includes(searchTerm)
               );
      });
    }
    
    // Reset to first page when searching
    currentPage = 1;
    displayAccountOrders(filteredAccountOrders, 1);
  };

  // Placeholder functions for order actions
  window.viewAccountOrderDetails = function(orderId) {
    // Redirect to Order Summary page
    window.location.href = `/order/summary?id=${orderId}`;
  };

  window.redirectToCancelOrder = function(orderId) {
    // Redirect to Order Summary page where user can cancel with reason
    window.location.href = `/order/summary?id=${orderId}`;
  };

  window.cancelAccountOrder = async function(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ status: 'cancelled', cancel_reason: 'Cancelled by buyer' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to cancel order');
        return;
      }
      alert('Order cancelled successfully');
      await loadAccountOrders();
    } catch (e) {
      console.error('Cancel error', e);
      alert('Network error. Please try again.');
    }
  };

  window.trackAccountOrder = function(trackingNumber) {
    alert(`Tracking order: ${trackingNumber}`);
  };

  window.writeAccountReview = function(orderId, productId) {
    // Redirect to standalone review page for this order and optional product
    const url = productId ?
      `/templates/UserProfile/write_review.html?order_id=${encodeURIComponent(orderId)}&product_id=${encodeURIComponent(productId)}` :
      `/templates/UserProfile/write_review.html?order_id=${encodeURIComponent(orderId)}`;
    window.location.href = url;
  };

  window.contactAccountSupport = function() {
    alert('Support contact feature coming soon!');
  };

  window.openAccountChatCenter = function() {
      try { 
        if (window.HeaderUI && typeof HeaderUI.openGlobalChatCenter === 'function') {
          HeaderUI.openGlobalChatCenter(); 
          return; 
        } 
      } catch(_) {}
      
      try {
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('accountChatCenterModal'));
        modal.show();
        
        // Load chat list
        if (window.ChatCenter && typeof window.ChatCenter.loadChatListFallback === 'function') {
          window.ChatCenter.loadChatListFallback();
        }
        // Update admin chat button visibility
        if (window.ChatCenter && typeof window.ChatCenter.updateAdminChatButton === 'function') {
          window.ChatCenter.updateAdminChatButton();
        }
        return;
      } catch(_) {}
      
      // Fallback: show local modal if present
      const fallbackEl = document.getElementById('chatCenterModal') || document.getElementById('accountChatCenterModal');
      if (fallbackEl) {
        const modal = new bootstrap.Modal(fallbackEl);     
        modal.show();
      }
    };

  window.openAccountChatWithSeller = function(orderNumber, sellerName) {
    console.log(`Opening chat with ${sellerName} for order ${orderNumber}`);
    
    // Show loading state on the button that was clicked
    const clickedButton = event.target.closest('.btn-chat');
    if (clickedButton) {
      const originalText = clickedButton.innerHTML;
      clickedButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening...';
      clickedButton.disabled = true;
      
      // Reset button after a delay
      setTimeout(() => {
        clickedButton.innerHTML = originalText;
        clickedButton.disabled = false;
      }, 2000);
    }
    
    // First, try to open the chat center modal
    const chatModal = document.getElementById('chatCenterModal');
    if (chatModal) {
      try {
        // Check if Bootstrap is available
        if (typeof bootstrap === 'undefined') {
          throw new Error('Bootstrap not loaded');
        }
        
        const modal = new bootstrap.Modal(chatModal, {
          backdrop: true,
          keyboard: true,
          focus: true
        });
        
        // Show the modal
        modal.show();
        
        // Add event listener for when modal is fully shown
        chatModal.addEventListener('shown.bs.modal', function() {
          console.log('Chat modal opened successfully');
          initiateChatWithSeller(orderNumber, sellerName);
        }, { once: true });
        
      } catch (error) {
        console.error('Error opening chat modal:', error);
        showChatNotification(`Chat with ${sellerName}`, `Ready to discuss order ${orderNumber}. The chat modal will open shortly.`, 'info');
      }
    } else {
      console.error('Chat modal not found in DOM');
      showChatNotification('Chat Center', `To chat with ${sellerName} about order ${orderNumber}, please use the Chat Center button above.`, 'warning');
    }
  };
  
  // Helper function to show notifications
  function showChatNotification(title, message, type = 'info') {
    // Create a toast-like notification
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    notification.innerHTML = `
      <strong>${title}</strong><br>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
  
  // Helper function to initiate chat with specific seller
  async function initiateChatWithSeller(orderNumber, sellerName) {
    try {
      console.log('Initiating chat with seller:', sellerName, 'for order:', orderNumber);
      
      // First, load the chat list to see if there's an existing chat
      if (window.ChatCenter && typeof window.ChatCenter.loadChatListFallback === 'function') {
        await window.ChatCenter.loadChatListFallback();
        
        // Give the chat list a moment to render
        setTimeout(() => {
          // Try to find existing chat with this seller
          const chatList = document.getElementById('chatList');
          if (chatList) {
            const existingChats = chatList.querySelectorAll('.chat-list-item');
            let foundExistingChat = false;
            
            for (const chatItem of existingChats) {
              const chatParticipant = chatItem.querySelector('.chat-participant span');
              if (chatParticipant && chatParticipant.textContent.toLowerCase().includes(sellerName.toLowerCase())) {
                // Found existing chat, click it
                console.log('Found existing chat with seller:', sellerName);
                chatItem.click();
                foundExistingChat = true;
                break;
              }
            }
            
            if (!foundExistingChat) {
              // No existing chat found, create new chat UI
              createNewChatWithSeller(orderNumber, sellerName);
            }
          } else {
            createNewChatWithSeller(orderNumber, sellerName);
          }
        }, 300);
      } else {
        createNewChatWithSeller(orderNumber, sellerName);
      }
      
    } catch (error) {
      console.error('Error initiating chat with seller:', error);
      createNewChatWithSeller(orderNumber, sellerName);
    }
  }
  
  // Function to create a new chat interface with seller
  function createNewChatWithSeller(orderNumber, sellerName) {
    console.log('Creating new chat with seller:', sellerName);
    
    // Set flag to indicate this is a seller chat
    window.currentChatType = 'seller';
    
    // Update the chat header to show we're starting a new chat
    const chatHeader = document.getElementById('chatWindowHeader');
    if (chatHeader) {
      const chatNameEl = chatHeader.querySelector('.chat-details .chat-name');
      const chatStatusEl = chatHeader.querySelector('.chat-details .chat-status');
      
      if (chatNameEl) {
        chatNameEl.innerHTML = `<span class="badge bg-warning text-dark me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">SELLER</span>${escapeAccountHtml(sellerName)}`;
      }
      if (chatStatusEl) {
        chatStatusEl.innerHTML = `<i class="fas fa-shopping-bag me-1"></i>Order: ${escapeAccountHtml(orderNumber)}`;
      }
    }
    
    // Show new chat interface in the chat messages area
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="empty-chat-state">
          <i class="fas fa-comments fa-3x text-muted mb-3"></i>
          <p class="text-muted mb-3">No messages yet with this seller.</p>
          <div class="text-start" style="max-width: 300px; margin: 0 auto;">
            <p class="text-muted small mb-2"><strong>Chat Type:</strong> <span class="badge bg-warning text-dark">Seller</span></p>
            <p class="text-muted small mb-2"><strong>Order ID:</strong> ${escapeAccountHtml(orderNumber)}</p>
            <p class="text-muted small mb-2"><strong>Seller Name:</strong> ${escapeAccountHtml(sellerName)}</p>
          </div>
          <p class="text-muted small mt-4"><i class="fas fa-arrow-down me-2"></i>Start a conversation with the seller below</p>
        </div>
      `;
    }
    
    // Enable the chat input area
    const inputArea = document.getElementById('chatInputArea');
    const input = document.getElementById('chatMessageInput');
    const sendBtn = document.getElementById('sendMessageBtn');
    
    if (inputArea) inputArea.style.display = 'block';
    if (input) {
      input.disabled = false;
      input.placeholder = `Type your message to ${sellerName}...`;
      input.focus();
    }
    if (sendBtn) {
      sendBtn.disabled = false;
      // Override the send function to handle new chat creation
      sendBtn.onclick = () => sendMessageToSeller(sellerName, orderNumber);
    }
    
    // Also bind Enter key for this new chat
    if (input && !input.hasAttribute('data-new-chat-bound')) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessageToSeller(sellerName, orderNumber);
        }
      });
      input.setAttribute('data-new-chat-bound', 'true');
    }
  }
  
  // Function to send message to seller (handles new chat creation)
  async function sendMessageToSeller(sellerName, orderNumber) {
    const input = document.getElementById('chatMessageInput');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    const sendBtn = document.getElementById('sendMessageBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    try {
      // Create new chat with seller
      const token = (window.AuthManager && AuthManager.getAuthToken) ? AuthManager.getAuthToken() : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      
      // Try to create/send message to seller
      const response = await fetch('/api/chats/create-with-seller', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          seller_name: sellerName,
          order_number: orderNumber,
          message: message
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Chat created/message sent:', data);
        
        // Clear input
        input.value = '';
        
        // Show success message
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
          chatMessages.innerHTML += `
            <div class="chat-message own">
              <div class="chat-message-avatar"><i class="fas fa-user"></i></div>
              <div class="chat-message-content">
                <div class="chat-message-bubble">${escapeAccountHtml(message)}</div>
                <div class="chat-message-time">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
              </div>
            </div>
            <div class="text-center py-3">
              <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                Message sent to ${escapeAccountHtml(sellerName)}! They will receive your message.
              </div>
            </div>
          `;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Refresh chat list to show the new conversation
        if (window.ChatCenter && window.ChatCenter.loadChatListFallback) {
          setTimeout(() => window.ChatCenter.loadChatListFallback(), 1000);
        }
        
      } else {
        throw new Error('Failed to send message to seller');
      }
      
    } catch (error) {
      console.error('Error sending message to seller:', error);
      
      // Show error message
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger mx-4';
        errorDiv.innerHTML = `
          <i class="fas fa-exclamation-circle me-2"></i>
          <strong>Failed to send message.</strong><br>
          Please try again or use the Chat Center to manually start a conversation.
        `;
        chatMessages.appendChild(errorDiv);
      }
    } finally {
      // Reset send button
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
      }
    }
  }

})();
