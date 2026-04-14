// Admin Pending Users Page Logic
// Relies on admin.js (API, UI, TokenManager, Dashboard)

(function () {
  let currentUsers = [];
  let filteredUsers = [];
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function capitalizeFirst(s) {
    s = String(s || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function formatDateTime(dt) {
    try {
      if (!dt) return 'N/A';
      const d = new Date(dt);
      return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return 'N/A'; }
  }

  async function lookupAddressName(code, type) {
    if (!code || !code.match(/^\d+$/)) return null;
    try {
      const PSGC_API = {
        regions: 'https://psgc.gitlab.io/api/regions/',
        provinces: (code) => `https://psgc.gitlab.io/api/provinces/${code}/`,
        cities: (code) => `https://psgc.gitlab.io/api/cities-municipalities/${code}/`,
        barangays: (code) => `https://psgc.gitlab.io/api/barangays/${code}/`
      };
      
      let url = null;
      if (type === 'region') url = PSGC_API.regions + code + '/';
      else if (type === 'province') url = PSGC_API.provinces(code);
      else if (type === 'city') url = PSGC_API.cities(code);
      else if (type === 'barangay') url = PSGC_API.barangays(code);
      
      if (url) {
        const response = await fetch(url);
        const data = await response.json();
        return data.name || null;
      }
    } catch (e) {
      // Silently fail - return null to use code
    }
    return null;
  }

  function formatAddress(addressData) {
    if (!addressData) return 'Not provided';
    
    try {
      // If address is a string, try to parse it as JSON
      let addr = typeof addressData === 'string' ? JSON.parse(addressData) : addressData;
      
      // If it's still not an object, return as is
      if (typeof addr !== 'object' || addr === null) {
        return escapeHtml(String(addressData));
      }
      
      // First priority: Use the 'address' field if it exists and contains readable text (not just codes)
      if (addr.address) {
        const addressStr = String(addr.address).trim();
        // Check if it's not just codes and commas
        if (addressStr && !addressStr.match(/^[\d,\s]+$/)) {
          return escapeHtml(addressStr);
        }
      }
      
      // Second priority: Build address from individual fields, using names (not codes)
      // Helper function to check if a value is a code (numeric)
      function isCode(value) {
        if (!value) return false;
        const str = String(value).trim();
        return str.match(/^\d+$/) !== null;
      }
      
      // Helper function to get readable text from a field (skip if it's a code)
      function getReadableText(fieldName) {
        const value = addr[fieldName];
        if (!value) return null;
        const str = String(value).trim();
        // If it's a code, return null (we'll skip it)
        if (isCode(str)) return null;
        // Otherwise return the text
        return escapeHtml(str);
      }
      
      // Build readable address parts in order: Street, Barangay, City, Province, Region, Postal Code
      const addressParts = [];
      
      // Street
      const street = getReadableText('street');
      if (street) addressParts.push(street);
      
      // Barangay
      const barangay = getReadableText('barangay');
      if (barangay) addressParts.push(barangay);
      
      // City/Municipality
      const city = getReadableText('city');
      if (city) addressParts.push(city);
      
      // Province
      const province = getReadableText('province');
      if (province) addressParts.push(province);
      
      // Region
      const region = getReadableText('region');
      if (region) addressParts.push(region);
      
      // Postal Code (always include if present, even if numeric)
      if (addr.postal_code) {
        addressParts.push(escapeHtml(String(addr.postal_code)));
      }
      
      // If we have address parts, return them
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
      
      // Last fallback: return the address field even if it's codes (better than nothing)
      if (addr.address) {
        return escapeHtml(String(addr.address));
      }
      
      return 'Not provided';
    } catch (e) {
      // If parsing fails, return the original value escaped
      return escapeHtml(String(addressData));
    }
  }

  function parseAdditionalInfo(user) {
    const info = user?.additional_info;
    if (!info) return null;
    if (typeof info === 'object') return info;
    if (typeof info === 'string') {
      try {
        return JSON.parse(info);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function getDisplayPhone(user) {
    if (user?.phone) return String(user.phone);
    const info = parseAdditionalInfo(user);
    if (info) {
      const fallback =
        info.business_phone ||
        info.businessPhone ||
        info.contact_phone ||
        info.owner_phone ||
        info.phone ||
        info.business_contact ||
        info.emergency_contact;
      if (fallback) return String(fallback);
    }
    return 'N/A';
  }

  async function loadPendingUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px;">
            <i class=\"fas fa-spinner fa-spin\" style=\"font-size: 24px; color: #666;\"></i>
            <p style=\"margin-top: 10px; color: #666;\">Loading users...</p>
          </td>
        </tr>
      `;
    }
    try {
      // Get status filter (default to 'pending' to hide rejected by default)
      const statusFilter = document.getElementById('statusFilter')?.value || 'pending';
      const data = await API.get(`/admin/pending-users?status=${statusFilter}`);
      if (!data.success) throw new Error('Failed to load');
      const users = data.pending_users || [];
      currentUsers = users;
      applyFilters();
    } catch (err) {
      console.error('[Admin] loadPendingUsers failed:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding: 40px; color:#c00;">Failed to load users</td>
          </tr>
        `;
      }
    }
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users.length) {
      const statusFilter = document.getElementById('statusFilter')?.value || 'pending';
      const message = statusFilter === 'rejected' 
        ? 'No rejected registrations'
        : 'No pending registrations';
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px;">
            <i class=\"fas fa-check-circle\" style=\"font-size: 48px; color: #10b981;\"></i>
            <p style=\"margin-top: 10px; color: #666; font-size: 0.9rem;\">${message}</p>
          </td>
        </tr>
      `;
      return;
    }

    const statusFilter = document.getElementById('statusFilter')?.value || 'pending';
    const isRejectedView = statusFilter === 'rejected';
    
    tbody.innerHTML = users.map(u => {
      const phoneText = getDisplayPhone(u);
      const statusBadge = u.status === 'rejected' 
        ? '<span class="status-badge" style="background: #fee2e2; color: #991b1b; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">Rejected</span>'
        : '<span class="status-badge" style="background: #fef3c7; color: #92400e; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">Pending</span>';
      
      const actionButtons = isRejectedView
        ? `<button class="btn-view" data-action="view" data-id="${u.id}"><i class="fas fa-eye"></i> View</button>`
        : `
          <button class="btn-view" data-action="view" data-id="${u.id}"><i class="fas fa-eye"></i> View</button>
          <button class="btn-approve" data-action="approve" data-id="${u.id}" data-name="${escapeHtml(u.name)}"><i class="fas fa-check"></i> Approve</button>
          <button class="btn-reject" data-action="reject" data-id="${u.id}" data-name="${escapeHtml(u.name)}"><i class="fas fa-times"></i> Reject</button>
        `;
      
      return `
      <tr>
        <td>#${u.id}</td>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(phoneText)}</td>
        <td>${u.gender ? capitalizeFirst(u.gender) : 'N/A'}</td>
        <td>${u.role ? capitalizeFirst(u.role) : 'N/A'}</td>
        <td>${statusBadge}</td>
        <td>${formatDateTime(u.created_at)}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
    }).join('');

    // Delegate button clicks
    tbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = Number(btn.getAttribute('data-id'));
      const name = btn.getAttribute('data-name') || '';
      if (!id) return;

      if (action === 'view') return viewUserDetails(id);
      if (action === 'approve') return approveUser(id, name);
      if (action === 'reject') return rejectUser(id, name);
    };
  }

  async function viewUserDetails(userId) {
    try {
      // We already have the list; fetch again or find from current table cells if needed.
      // For simplicity, call the pending list and find.
      const data = await API.get('/admin/pending-users');
      const user = (data.pending_users || []).find(u => u.id === userId);
      if (!user) return;
      
      // Debug: Log user data to check ID documents
      console.log('User data for ID documents:', {
        id: user.id,
        role: user.role,
        id_document_front: user.id_document_front,
        id_document_back: user.id_document_back,
        id_document: user.id_document
      });

      const modalBody = document.getElementById('modalBody');
      if (!modalBody) return;
      
      // Parse additional_info if available
      const additionalInfo = parseAdditionalInfo(user) || {};
      const role = (user.role || '').toLowerCase();
      const phoneDisplay = getDisplayPhone({ ...user, additional_info: additionalInfo });
      
      let roleSpecificHTML = '';
      
      // Seller-specific details
      if (role === 'seller') {
        roleSpecificHTML = `
          <div class="user-detail-section" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <h3 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 15px; color: #333;">Business Information</h3>
            ${additionalInfo.business_name ? `<div class="user-detail-row"><div class="user-detail-label">Business Name:</div><div class="user-detail-value">${escapeHtml(additionalInfo.business_name)}</div></div>` : ''}
            ${additionalInfo.business_description ? `<div class="user-detail-row"><div class="user-detail-label">Business Description:</div><div class="user-detail-value">${escapeHtml(additionalInfo.business_description)}</div></div>` : ''}
            ${additionalInfo.business_email ? `<div class="user-detail-row"><div class="user-detail-label">Business Email:</div><div class="user-detail-value">${escapeHtml(additionalInfo.business_email)}</div></div>` : ''}
            ${additionalInfo.business_phone ? `<div class="user-detail-row"><div class="user-detail-label">Business Phone:</div><div class="user-detail-value">${escapeHtml(additionalInfo.business_phone)}</div></div>` : ''}
            ${additionalInfo.website ? `<div class="user-detail-row"><div class="user-detail-label">Website:</div><div class="user-detail-value">${escapeHtml(additionalInfo.website)}</div></div>` : ''}
            ${additionalInfo.primary_category ? `<div class="user-detail-row"><div class="user-detail-label">Primary Category:</div><div class="user-detail-value">${escapeHtml(additionalInfo.primary_category)}</div></div>` : ''}
            ${additionalInfo.categories && Array.isArray(additionalInfo.categories) ? `<div class="user-detail-row"><div class="user-detail-label">Categories:</div><div class="user-detail-value">${additionalInfo.categories.map(c => escapeHtml(c)).join(', ')}</div></div>` : ''}
            
            <h3 style="font-size: 0.9rem; font-weight: 600; margin: 20px 0 15px 0; color: #333; padding-top: 15px; border-top: 1px solid #e0e0e0;">Business Documents</h3>
            ${additionalInfo.business_registration_doc ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Business Registration:</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.business_registration_doc}" target="_blank">
                    <img src="${additionalInfo.business_registration_doc}" alt="Business Registration" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Document Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
            ${additionalInfo.tax_registration_doc ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Tax Registration:</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.tax_registration_doc}" target="_blank">
                    <img src="${additionalInfo.tax_registration_doc}" alt="Tax Registration" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Document Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
            ${additionalInfo.business_permit_doc ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Business Permit:</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.business_permit_doc}" target="_blank">
                    <img src="${additionalInfo.business_permit_doc}" alt="Business Permit" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Document Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
      
      // Rider-specific details
      if (role === 'rider') {
        roleSpecificHTML = `
          <div class="user-detail-section" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <h3 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 15px; color: #333;">Vehicle & License Information</h3>
            ${additionalInfo.vehicle_type ? `<div class="user-detail-row"><div class="user-detail-label">Vehicle Type:</div><div class="user-detail-value">${escapeHtml(additionalInfo.vehicle_type)}</div></div>` : ''}
            ${additionalInfo.vehicle_make_model ? `<div class="user-detail-row"><div class="user-detail-label">Vehicle Make/Model:</div><div class="user-detail-value">${escapeHtml(additionalInfo.vehicle_make_model)}</div></div>` : ''}
            ${additionalInfo.license_number ? `<div class="user-detail-row"><div class="user-detail-label">Driver's License Number:</div><div class="user-detail-value">${escapeHtml(additionalInfo.license_number)}</div></div>` : ''}
            ${additionalInfo.license_expiry ? `<div class="user-detail-row"><div class="user-detail-label">License Expiry Date:</div><div class="user-detail-value">${escapeHtml(additionalInfo.license_expiry)}</div></div>` : ''}
            ${additionalInfo.experience_description ? `<div class="user-detail-row"><div class="user-detail-label">Delivery Experience:</div><div class="user-detail-value">${escapeHtml(additionalInfo.experience_description)}</div></div>` : ''}
            ${additionalInfo.license_front ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Driver's License (Front):</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.license_front}" target="_blank">
                    <img src="${additionalInfo.license_front}" alt="License Front" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>License Front Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
            ${additionalInfo.license_back ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Driver's License (Back):</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.license_back}" target="_blank">
                    <img src="${additionalInfo.license_back}" alt="License Back" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>License Back Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
            
            <h3 style="font-size: 0.9rem; font-weight: 600; margin: 20px 0 15px 0; color: #333; padding-top: 15px; border-top: 1px solid #e0e0e0;">Vehicle Documents</h3>
            ${additionalInfo.or_document ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Official Receipt (OR):</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.or_document}" target="_blank">
                    <img src="${additionalInfo.or_document}" alt="Official Receipt" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>OR Document Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
            ${additionalInfo.cr_document ? `
              <div class="user-detail-row">
                <div class="user-detail-label">Certificate of Registration (CR):</div>
                <div class="user-detail-value">
                  <a href="${additionalInfo.cr_document}" target="_blank">
                    <img src="${additionalInfo.cr_document}" alt="Certificate of Registration" class="id-document-preview" style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>CR Document Unavailable</text></svg>';">
                  </a>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
      
      // Helper function to check if a value is a code (numeric)
      function isCode(value) {
        if (!value) return false;
        const str = String(value).trim();
        return str.match(/^\d+$/) !== null;
      }
      
      // Helper function to get display text for address fields
      // Priority: 1) If value is text (not code), use it; 2) If value is code, look it up; 3) If no value but code exists, look up code
      async function getAddressDisplayText(value, codeValue, type) {
        // If we have a value
        if (value) {
          const str = String(value).trim();
          // If it's a code, try to look it up
          if (isCode(str)) {
            const name = await lookupAddressName(str, type);
            return name || str; // Use lookup result or fall back to code
          }
          // If it's not a code, it's probably already text, so use it
          return str;
        }
        // If no value but we have a code, try to look it up
        if (codeValue) {
          const codeStr = String(codeValue).trim();
          if (isCode(codeStr)) {
            const name = await lookupAddressName(codeStr, type);
            return name || codeStr; // Use lookup result or fall back to code
          }
        }
        return null;
      }
      
      // Build address display
      let addressDisplay = formatAddress(user.address_string || user.address);
      if (user.street || user.barangay || user.city || user.province || user.region) {
        const addrParts = [];
        if (user.street) addrParts.push(user.street);
        if (user.barangay) addrParts.push(user.barangay);
        if (user.city) addrParts.push(user.city);
        if (user.province) addrParts.push(user.province);
        if (user.region) addrParts.push(user.region);
        if (user.postal_code) addrParts.push(user.postal_code);
        addressDisplay = addrParts.join(', ') || addressDisplay;
      }
      
      // Get address field display values (check if codes and look them up)
      const regionDisplay = await getAddressDisplayText(user.region, user.region_code, 'region');
      const provinceDisplay = await getAddressDisplayText(user.province, user.province_code, 'province');
      const cityDisplay = await getAddressDisplayText(user.city, user.city_code, 'city');
      const barangayDisplay = await getAddressDisplayText(user.barangay, user.barangay_code, 'barangay');
      
      modalBody.innerHTML = `
        <div class="user-detail-row"><div class="user-detail-label">User ID:</div><div class="user-detail-value">#${user.id}</div></div>
        <div class="user-detail-row"><div class="user-detail-label">Full Name:</div><div class="user-detail-value">${escapeHtml(user.name)}</div></div>
        ${user.suffix ? `<div class="user-detail-row"><div class="user-detail-label">Suffix:</div><div class="user-detail-value">${escapeHtml(user.suffix)}</div></div>` : ''}
        <div class="user-detail-row"><div class="user-detail-label">Email:</div><div class="user-detail-value">${escapeHtml(user.email)}</div></div>
        <div class="user-detail-row"><div class="user-detail-label">Phone:</div><div class="user-detail-value">${escapeHtml(phoneDisplay || 'Not provided')}</div></div>
        <div class="user-detail-row"><div class="user-detail-label">Gender:</div><div class="user-detail-value">${user.gender ? capitalizeFirst(user.gender) : 'Not specified'}</div></div>
        ${user.birthday ? `<div class="user-detail-row"><div class="user-detail-label">Birthday:</div><div class="user-detail-value">${formatDateTime(user.birthday)}</div></div>` : ''}
        <div class="user-detail-row"><div class="user-detail-label">Role:</div><div class="user-detail-value">${user.role ? capitalizeFirst(user.role) : 'Not specified'}</div></div>
        <div class="user-detail-row"><div class="user-detail-label">Address:</div><div class="user-detail-value">${addressDisplay}</div></div>
        ${regionDisplay ? `<div class="user-detail-row"><div class="user-detail-label">Region:</div><div class="user-detail-value">${escapeHtml(regionDisplay)}</div></div>` : ''}
        ${provinceDisplay ? `<div class="user-detail-row"><div class="user-detail-label">Province:</div><div class="user-detail-value">${escapeHtml(provinceDisplay)}</div></div>` : ''}
        ${cityDisplay ? `<div class="user-detail-row"><div class="user-detail-label">City/Municipality:</div><div class="user-detail-value">${escapeHtml(cityDisplay)}</div></div>` : ''}
        ${barangayDisplay ? `<div class="user-detail-row"><div class="user-detail-label">Barangay:</div><div class="user-detail-value">${escapeHtml(barangayDisplay)}</div></div>` : ''}
        ${user.street ? `<div class="user-detail-row"><div class="user-detail-label">Street:</div><div class="user-detail-value">${escapeHtml(user.street)}</div></div>` : ''}
        ${user.postal_code ? `<div class="user-detail-row"><div class="user-detail-label">Postal Code:</div><div class="user-detail-value">${escapeHtml(user.postal_code)}</div></div>` : ''}
        ${roleSpecificHTML}
        
        ${(user.id_document_front || user.id_document_back || user.id_document || role === 'buyer') ? `
          <div class="user-detail-section" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <h3 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 15px; color: #333;">ID Documents</h3>
            <div class="user-detail-row">
              <div class="user-detail-label">Valid ID:</div>
              <div class="user-detail-value" style="display: flex; flex-direction: column; gap: 15px;">
                ${user.id_document_front ? `
                  <div>
                    <strong style="display: block; margin-bottom: 5px; color: #666; font-size: 0.75rem;">Front Side:</strong>
                    <a href="${user.id_document_front}" target="_blank">
                      <img src="${user.id_document_front}" alt="ID Front" class="id-document-preview"
                        style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;"
                        onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Front Image Unavailable</text></svg>';">
                    </a>
                  </div>
                ` : ''}
                ${user.id_document_back ? `
                  <div>
                    <strong style="display: block; margin-bottom: 5px; color: #666; font-size: 0.75rem;">Back Side:</strong>
                    <a href="${user.id_document_back}" target="_blank">
                      <img src="${user.id_document_back}" alt="ID Back" class="id-document-preview"
                        style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;"
                        onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Back Image Unavailable</text></svg>';">
                    </a>
                  </div>
                ` : ''}
                ${!user.id_document_front && !user.id_document_back && user.id_document ? `
                  <div>
                    <strong style="display: block; margin-bottom: 5px; color: #666; font-size: 0.75rem;">ID Document:</strong>
                    <a href="${user.id_document}" target="_blank">
                      <img src="${user.id_document}" alt="ID Document" class="id-document-preview"
                        style="max-width: 200px; border-radius: 8px; border: 1px solid #e0e0e0;"
                        onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22>Document Preview Unavailable</text></svg>';">
                    </a>
                  </div>
                ` : ''}
                ${!user.id_document_front && !user.id_document_back && !user.id_document ? `
                  <div style="color: #dc3545; font-size: 0.85rem; font-weight: 500;">No ID documents uploaded</div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}
        
        <div class="user-detail-row"><div class="user-detail-label">Registered:</div><div class="user-detail-value">${formatDateTime(user.created_at)}</div></div>
        <div class="modal-actions">
          <button class="btn-reject" id="modalReject"><i class="fas fa-times"></i> Reject</button>
          <button class="btn-approve" id="modalApprove"><i class="fas fa-check"></i> Approve</button>
        </div>
      `;
      document.getElementById('userModal').style.display = 'block';
      document.getElementById('modalApprove').onclick = () => { approveUser(userId, user.name); closeUserModal(); };
      document.getElementById('modalReject').onclick = () => { rejectUser(userId, user.name); closeUserModal(); };
    } catch (e) {
      console.error('viewUserDetails failed:', e);
    }
  }

  function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) modal.style.display = 'none';
  }

  async function approveUser(userId, userName) {
    if (!confirm(`Are you sure you want to approve ${userName}?`)) return;
    try {
      const res = await API.post(`/admin/users/${userId}/approve`, {});
      if (res.success) {
        alert(`${userName} has been approved!`);
        await loadPendingUsers();
        if (typeof Dashboard !== 'undefined' && Dashboard.updateNavigationBadges) {
          Dashboard.updateNavigationBadges({});
        }
      }
    } catch (e) {
      console.error('approveUser failed:', e);
      alert('Failed to approve user');
    }
  }

  async function rejectUser(userId, userName) {
    const reason = prompt(`Why are you rejecting ${userName}? (optional)`);
    if (reason === null) return;
    try {
      const res = await API.post(`/admin/users/${userId}/reject`, { reason: reason || 'No reason provided' });
      if (res.success) {
        alert(`${userName} has been rejected`);
        await loadPendingUsers();
        if (typeof Dashboard !== 'undefined' && Dashboard.updateNavigationBadges) {
          Dashboard.updateNavigationBadges({});
        }
      }
    } catch (e) {
      console.error('rejectUser failed:', e);
      alert('Failed to reject user');
    }
  }

  // Filter functions
  function applyFilters() {
    const roleFilter = document.getElementById('roleFilter')?.value || 'all';
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';
    const searchInput = document.getElementById('searchFilter')?.value?.toLowerCase() || '';
    const sortBy = document.getElementById('sortBy')?.value || 'newest';

    // Apply filters
    filteredUsers = currentUsers.filter(user => {
      // Role filter
      if (roleFilter !== 'all') {
        const userRole = (user.role || '').toLowerCase();
        if (userRole !== roleFilter) return false;
      }

      // Date filter
      if (dateFilter !== 'all' && user.created_at) {
        const userDate = new Date(user.created_at);
        const now = new Date();
        const diffTime = now - userDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        switch (dateFilter) {
          case 'today':
            if (diffDays !== 0) return false;
            break;
          case 'last7days':
            if (diffDays > 7) return false;
            break;
          case 'last30days':
            if (diffDays > 30) return false;
            break;
          case 'last90days':
            if (diffDays > 90) return false;
            break;
        }
      }

      // Search filter (name, email, phone)
      if (searchInput) {
        const searchableText = [
          user.name || '',
          user.email || '',
          user.phone || '',
          getDisplayPhone(user) || ''
        ].join(' ').toLowerCase();
        if (!searchableText.includes(searchInput)) return false;
      }

      return true;
    });

    // Apply sorting
    filteredUsers.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'oldest':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        default:
          return 0;
      }
    });

    // Update counts
    const badge = document.getElementById('pendingUsersBadge');
    if (badge) {
      badge.textContent = currentUsers.length;
      badge.style.display = currentUsers.length > 0 ? 'inline' : 'none';
    }
    const count = document.getElementById('userCount');
    if (count) count.textContent = filteredUsers.length;
    
    const filteredCountEl = document.getElementById('filteredCount');
    const totalCountEl = document.getElementById('totalCount');
    if (filteredCountEl) filteredCountEl.textContent = filteredUsers.length;
    if (totalCountEl) totalCountEl.textContent = currentUsers.length;

    renderUsersTable(filteredUsers);
  }

  // Initialize filters and event listeners
  function initializeFilters() {
    const statusFilter = document.getElementById('statusFilter');
    const roleFilter = document.getElementById('roleFilter');
    const dateFilter = document.getElementById('dateFilter');
    const searchInput = document.getElementById('searchFilter');
    const sortBy = document.getElementById('sortBy');
    const clearFiltersBtn = document.getElementById('clearFilters');

    // Status filter triggers a reload from server (different data set)
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        // Reset other filters when status changes
        if (roleFilter) roleFilter.value = 'all';
        if (dateFilter) dateFilter.value = 'all';
        if (searchInput) searchInput.value = '';
        if (sortBy) sortBy.value = 'newest';
        loadPendingUsers();
      });
    }
    
    if (roleFilter) {
      roleFilter.addEventListener('change', applyFilters);
    }
    if (dateFilter) {
      dateFilter.addEventListener('change', applyFilters);
    }
    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }
    if (sortBy) {
      sortBy.addEventListener('change', applyFilters);
    }
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        if (statusFilter) statusFilter.value = 'pending';
        if (roleFilter) roleFilter.value = 'all';
        if (dateFilter) dateFilter.value = 'all';
        if (searchInput) searchInput.value = '';
        if (sortBy) sortBy.value = 'newest';
        loadPendingUsers();
      });
    }
  }

  // Expose small API to window for modal close
  window.closeUserModal = closeUserModal;

  document.addEventListener('DOMContentLoaded', () => {
    try {
      // Initialize filters
      initializeFilters();
      // Update nav badges similar to other admin pages
      if (typeof Dashboard !== 'undefined' && Dashboard.updateNavigationBadges) {
        Dashboard.updateNavigationBadges({});
      }
    } catch (_) {}

    // Search is now handled by applyFilters() through initializeFilters()

    // Close modal on outside click
    window.addEventListener('click', function (event) {
      const modal = document.getElementById('userModal');
      if (modal && event.target === modal) {
        const fn = window.closeUserModal || closeUserModal;
        if (typeof fn === 'function') fn();
      }
    });

    loadPendingUsers();
  });
})();
