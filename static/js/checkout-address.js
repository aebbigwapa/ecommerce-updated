// Saved addresses integration for checkout
(function(){
  const token = AuthManager.getAuthToken && AuthManager.getAuthToken();
  const headers = token ? { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type':'application/json' };

  const savedWrap = document.getElementById('savedAddresses');
  const noState = document.getElementById('noAddressState');
  const btnAdd = document.getElementById('btnAddAddressCheckout');

  // Address selection state
  let addresses = [];
  let selectedId = null;

  function updatePlaceOrderState(){
    const btn = document.getElementById('placeOrderBtn');
    const prompt = document.getElementById('selectAddressPrompt');
    if (btn) {
      if (!selectedId) {
        btn.disabled = true;
        btn.title = 'Select a saved address to continue';
      } else {
        btn.disabled = false;
        btn.title = '';
      }
    }
    // Only show prompt if there are addresses but none selected
    // If no addresses exist, noAddressState message is shown instead
    if (prompt) {
      if (addresses.length > 0 && !selectedId) {
        prompt.classList.add('d-flex');
        prompt.style.setProperty('display', 'flex', 'important');
      } else {
        prompt.classList.remove('d-flex');
        prompt.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function addressCard(a){
    const full = [a.street, a.barangay, a.city, a.province, a.region, a.postal_code, 'Philippines'].filter(Boolean).join(', ');
    const addrId = a.id || (a.from_users_table ? 'users-table' : null);
    const sel = addrId === selectedId;
    return `<div class="col-12">
      <div class="d-flex align-items-start p-2 rounded border ${sel ? 'border-primary' : 'border-light'}" style="background:#fff; cursor:pointer;" data-id="${addrId}">
        <div class="me-2">${sel ? '<i class=\"fas fa-check-circle text-primary\"></i>' : '<i class=\"far fa-circle text-muted\"></i>'}</div>
        <div class="flex-grow-1">
          <div class="fw-semibold">${a.label || 'Address'} ${a.is_default ? '<span class=\"badge bg-primary ms-1\">Default</span>' : ''} ${a.from_users_table ? '<span class=\"badge bg-secondary ms-1\">From Registration</span>' : ''}</div>
          <div class="small text-muted">${a.contact_name || ''} ${a.contact_phone ? '('+a.contact_phone+')':''}</div>
          <div class="small">${full}</div>
        </div>
        ${a.from_users_table ? '' : '<div class="ms-2"><button class="btn btn-sm btn-outline-secondary" data-action="make-default" data-id="' + addrId + '">Set Default</button></div>'}
      </div>
    </div>`;
  }

  function render(){
    const prompt = document.getElementById('selectAddressPrompt');
    if (!addresses.length){
      savedWrap.innerHTML = '';
      if (noState) {
        noState.classList.add('d-flex');
        noState.style.setProperty('display', 'flex', 'important');
      }
      if (prompt) {
        prompt.classList.remove('d-flex');
        prompt.style.setProperty('display', 'none', 'important');
      }
      selectedId = null;
      window.selectedAddressId = null;
      updatePlaceOrderState();
    } else {
      if (noState) {
        noState.classList.remove('d-flex');
        noState.style.setProperty('display', 'none', 'important');
      }
      // Put default first
      const sorted = [...addresses].sort((x,y)=> (y.is_default?1:0) - (x.is_default?1:0));
      savedWrap.innerHTML = sorted.map(addressCard).join('');
      // Update prompt visibility based on selection
      if (prompt) {
        if (!selectedId) {
          prompt.classList.add('d-flex');
          prompt.style.setProperty('display', 'flex', 'important');
        } else {
          prompt.classList.remove('d-flex');
          prompt.style.setProperty('display', 'none', 'important');
        }
      }
    }
  }

  function fillCheckoutForm(a){
    const full = [a.street, a.barangay, a.city, a.province, a.region, a.postal_code, 'Philippines'].filter(Boolean).join(', ');
    const email = document.getElementById('email');
    const address = document.getElementById('address');
    const city = document.getElementById('city');
    const postal = document.getElementById('postal');
    const country = document.getElementById('country');

    address.value = full;
    city.value = a.city || '';
    postal.value = a.postal_code || '';
    country.value = 'Philippines';

    // Prefill email if available from profile (name/phone come from selected address)
    // Only prefill if email field is empty (don't overwrite if already filled)
    fetch('/api/account/profile', { headers }).then(r=>r.json()).then(data=>{
      if (data && data.success && data.user){
        if (email && !email.value) {
          email.value = data.user.email || '';
        }
      }
    }).catch(()=>{});
  }

  async function loadAddresses(){
    try{
      const res = await fetch('/api/account/addresses', { headers });
      const data = await res.json();
      if (!res.ok || !data.success){ throw new Error(data.error||'Failed'); }
      addresses = data.addresses || [];
      // Selection logic:
      // - If there is a default, select it
      // - Else if only one address, select it
      // - Else (multiple, no default), require explicit selection (show prompt)
      const def = addresses.find(a=>a.is_default);
      if (def) {
        // Use a special identifier for addresses from users table
        selectedId = def.id || (def.from_users_table ? 'users-table' : null);
      } else if (addresses.length === 1) {
        selectedId = addresses[0].id || (addresses[0].from_users_table ? 'users-table' : null);
      } else {
        selectedId = null; // force user selection
      }
      window.selectedAddressId = selectedId;
      // Find selected address - handle both regular IDs and 'users-table' identifier
      const selObj = addresses.find(a=>(a.id === selectedId) || (selectedId === 'users-table' && a.from_users_table)) || null;
      window.selectedAddressData = selObj;
      render();
      if (selObj) {
        fillCheckoutForm(selObj);
      }
      updatePlaceOrderState();
    }catch(e){
      console.warn('addresses load', e);
      addresses = [];
      render();
    }
  }

  // Click handlers
  savedWrap?.addEventListener('click', async (e)=>{
    const makeBtn = e.target.closest('button[data-action="make-default"]');
    if (makeBtn){
      const id = makeBtn.getAttribute('data-id');
      // Don't allow setting default for addresses from users table
      if (id === 'users-table') return;
      try{
        const res = await fetch(`/api/account/addresses/${id}`, { method:'PUT', headers, body: JSON.stringify({ is_default: true }) });
        const data = await res.json();
        if (res.ok && data.success){ await loadAddresses(); }
        else alert(data.error||'Failed to update');
      }catch(err){ alert('Failed'); }
      return;
    }
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const cardId = card.getAttribute('data-id');
    // Handle both regular IDs and 'users-table' identifier
    if (cardId === 'users-table') {
      selectedId = 'users-table';
    } else {
      selectedId = parseInt(cardId);
    }
    window.selectedAddressId = selectedId;
    const sel = addresses.find(a=>(a.id === selectedId) || (selectedId === 'users-table' && a.from_users_table)) || null;
    window.selectedAddressData = sel;
    render();
    if (sel) fillCheckoutForm(sel);
    updatePlaceOrderState();
  });

  // Add new modal & PSGC & map
  const addrModalEl = document.getElementById('checkoutAddressModal');
  const mapModalEl = document.getElementById('checkoutMapModal');
  const btnAddOpen = document.getElementById('btnAddAddressCheckout');
  const btnPinOnMap = document.getElementById('coBtnPinOnMap');
  const form = document.getElementById('checkoutAddressForm');
  const elR = document.getElementById('coAddrRegion');
  const elP = document.getElementById('coAddrProvince');
  const elC = document.getElementById('coAddrCity');
  const elB = document.getElementById('coAddrBarangay');
  const elStreet = document.getElementById('coAddrStreet');
  const elPostal = document.getElementById('coAddrPostal');
  const elLat = document.getElementById('coAddrLat');
  const elLng = document.getElementById('coAddrLng');

  const PSGC = {
    regions: 'https://psgc.gitlab.io/api/regions/',
    prov: code => `https://psgc.gitlab.io/api/regions/${code}/provinces/`,
    cities: code => `https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`,
    brgys: code => `https://psgc.gitlab.io/api/cities-municipalities/${code}/barangays/`
  };

  // Address normalization helpers (align with account page behavior)
  function cleanText(value){
    if (!value) return '';
    return value.replace(/\s*\([^)]*\)\s*/g, '').trim();
  }
  function normalizeRegionName(text){
    if (!text) return '';
    const match = text.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1].trim();
    return cleanText(text.replace(/^Region\s+[-IVXLC]+[A-Z-]*\s*/i, ''));
  }
  function getSelectedText(sel){
    if (!sel) return '';
    const val = sel.value;
    if (!val) return '';
    const t = sel.options[sel.selectedIndex]?.text || '';
    if (/^select\.?/i.test(t.trim())) return '';
    return t.trim();
  }

  const setOpts = (sel, arr, val, txt)=> sel.innerHTML = '<option value="">Select...</option>' + (arr||[]).map(x=>`<option value="${val(x)}">${txt(x)}</option>`).join('');
  async function loadRegions(){ const r=await fetch(PSGC.regions).then(r=>r.json()); setOpts(elR, r, x=>x.code, x=>x.name); }
  async function loadProv(){ if(!elR.value){elP.innerHTML='';elC.innerHTML='';elB.innerHTML='';return;} const r=await fetch(PSGC.prov(elR.value)).then(r=>r.json()); setOpts(elP, r, x=>x.code, x=>x.name); elC.innerHTML=''; elB.innerHTML=''; scheduleGeo(); }
  async function loadCities(){ if(!elP.value){elC.innerHTML='';elB.innerHTML='';return;} const r=await fetch(PSGC.cities(elP.value)).then(r=>r.json()); setOpts(elC, r, x=>x.code, x=>x.name); elB.innerHTML=''; scheduleGeo(); }
  async function loadBrgys(){ if(!elC.value){elB.innerHTML='';return;} const r=await fetch(PSGC.brgys(elC.value)).then(r=>r.json()); setOpts(elB, r, x=>x.code, x=>x.name); scheduleGeo(); }

  // Geocode
  let geoTimer;
  function composed(){
    const street = (elStreet?.value || '').trim();
    const bTxt = cleanText(getSelectedText(elB));
    const cTxt = cleanText(getSelectedText(elC));
    const pTxt = cleanText(getSelectedText(elP));
    const rTxt = normalizeRegionName(getSelectedText(elR));
    const postalRaw = (elPostal?.value || '').trim();
    const postalTxt = /^\d{4}$/.test(postalRaw) ? postalRaw : '';
    return [street, bTxt, cTxt, pTxt, rTxt, postalTxt, 'Philippines'].filter(Boolean).join(', ');
  }
  async function geocode(){
    // Require at least city and province for accuracy
    const streetTxt = (elStreet?.value || '').trim();
    const bTxt = cleanText(getSelectedText(elB));
    const cTxt = cleanText(getSelectedText(elC));
    const pTxt = cleanText(getSelectedText(elP));
    const rTxt = normalizeRegionName(getSelectedText(elR));
    const postalRaw = (elPostal?.value || '').trim();
    const postalTxt = /^\d{4}$/.test(postalRaw) ? postalRaw : '';

    if (!cTxt || !pTxt) return;

    async function tryStructured(params){
      try{
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        if (Array.isArray(data) && data.length){
          const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
        }
      }catch(_){ }
      return null;
    }

    let result = null;

    // Strategy 1: city + suburb + street
    let params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'ph', country: 'Philippines', addressdetails: '1' });
    if (pTxt) params.set('state', pTxt);
    if (cTxt) params.set('city', cTxt);
    if (postalTxt) params.set('postalcode', postalTxt);
    if (streetTxt) params.set('street', streetTxt);
    if (bTxt) params.set('suburb', bTxt);
    if (rTxt) params.set('state_district', rTxt);
    result = await tryStructured(params);

    // Strategy 2: town instead of city
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

    // Strategy 3: village for municipality
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

    // Strategy 4: free-text fallback
    if (!result) {
      const q = composed();
      try{
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        if (Array.isArray(data) && data.length){
          result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
      }catch(e){ console.warn('geocode fail', e); }
    }

    if (result && !isNaN(result.lat) && !isNaN(result.lon)){
      elLat.value = result.lat.toFixed(6); elLng.value = result.lon.toFixed(6);
      if (map) { map.setView([result.lat,result.lon],17); marker.setLatLng([result.lat,result.lon]); }
    }
  }
  function scheduleGeo(){ clearTimeout(geoTimer); geoTimer = setTimeout(geocode, 600); }

  elR?.addEventListener('change', loadProv); elP?.addEventListener('change', loadCities); elC?.addEventListener('change', loadBrgys);
  elB?.addEventListener('change', scheduleGeo); elStreet?.addEventListener('input', scheduleGeo); elPostal?.addEventListener('input', scheduleGeo);

  // Modal map
  let map, marker, mapModalInstance, addrModalInstance;
  mapModalEl?.addEventListener('shown.bs.modal', ()=>{
    if (!map){
      map = L.map('checkoutMap').setView([12.8797,121.7740], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
      marker = L.marker([12.8797,121.7740], { draggable:true }).addTo(map);
      marker.on('dragend', ()=>{ const {lat,lng}=marker.getLatLng(); elLat.value = lat.toFixed(6); elLng.value = lng.toFixed(6); });
    }
    const lat = parseFloat(elLat.value), lng = parseFloat(elLng.value);
    if (!isNaN(lat)&&!isNaN(lng)){ map.setView([lat,lng], 15); marker.setLatLng([lat,lng]); } else { map.setView([12.8797,121.7740], 5); marker.setLatLng([12.8797,121.7740]); geocode(); }
    setTimeout(()=> map.invalidateSize(),50);
  });
  btnAdd?.addEventListener('click', ()=>{ addrModalInstance = new bootstrap.Modal(addrModalEl); addrModalInstance.show(); loadRegions(); });
  btnPinOnMap?.addEventListener('click', ()=>{ mapModalInstance = new bootstrap.Modal(mapModalEl); mapModalInstance.show(); });

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      label: document.getElementById('coAddrLabel').value.trim(),
      contact_name: document.getElementById('coAddrContactName').value.trim(),
      contact_phone: document.getElementById('coAddrContactPhone').value.trim(),
      region_code: elR.value || null, region: elR.options[elR.selectedIndex]?.text || '',
      province_code: elP.value || null, province: elP.options[elP.selectedIndex]?.text || '',
      city_code: elC.value || null, city: elC.options[elC.selectedIndex]?.text || '',
      barangay_code: elB.value || null, barangay: elB.options[elB.selectedIndex]?.text || '',
      postal_code: elPostal.value.trim(), street: elStreet.value.trim(),
      latitude: parseFloat(elLat.value)||null, longitude: parseFloat(elLng.value)||null,
      is_default: document.getElementById('coAddrDefault').checked
    };
    try{
      const res = await fetch('/api/account/addresses', { method:'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok && data.success){
        // Reload and select the newly added (as default or last)
        await loadAddresses();
        bootstrap.Modal.getInstance(addrModalEl)?.hide();
      } else {
        alert(data.error || 'Failed to save address');
      }
    }catch(err){ alert('Failed to save address'); }
  });

  // Initial load with auth guard
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure user is authenticated; will redirect if not
    if (window.AuthManager && AuthManager.checkAuthAndRedirect && !AuthManager.isLoggedIn()) {
      AuthManager.checkAuthAndRedirect();
      return;
    }
    loadAddresses();
  });
})();
