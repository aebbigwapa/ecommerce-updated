// Order Summary JavaScript
let currentOrderId = null;
let currentOrderNumericId = null; // numeric DB id for status updates
let currentOrderStatus = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadOrderDetails();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  const cancelBtn = document.getElementById('cancelOrderBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', showCancelModal);
  }
  
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', confirmCancelOrder);
  }

  // Toggle custom reason input when selecting "Other"
  const reasonSelect = document.getElementById('cancelReasonSelect');
  const confirmBtn = document.getElementById('confirmCancelBtn');

  function updateCancelConfirmState() {
    const otherVal = document.getElementById('cancelReasonOther')?.value?.trim() || '';
    const legacyVal = document.getElementById('cancelReasonInput')?.value?.trim() || '';
    const selectVal = reasonSelect ? reasonSelect.value : '';
    const valid = !!(otherVal || legacyVal || selectVal);
    if (confirmBtn) confirmBtn.disabled = !valid;
  }

  if (reasonSelect) {
    reasonSelect.addEventListener('change', updateCancelConfirmState);
  }
  document.getElementById('cancelReasonOther')?.addEventListener('input', updateCancelConfirmState);
  document.getElementById('cancelReasonInput')?.addEventListener('input', updateCancelConfirmState);
}

// Get order ID from URL
function getOrderIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id') || urlParams.get('order_id') || urlParams.get('order_number');
}

// Load order details
async function loadOrderDetails() {
  const orderId = getOrderIdFromUrl();
  
  if (!orderId) {
    showError('Order ID not found in URL');
    return;
  }

  currentOrderId = orderId;

  try {
    // Check authentication using AuthManager
    const token = (AuthManager && AuthManager.getAuthToken && AuthManager.getAuthToken()) 
                  || localStorage.getItem('auth_token') 
                  || localStorage.getItem('token');
    
    if (!token) {
      console.warn('No authentication token found, redirecting to login...');
      window.location.href = '/templates/Authenticator/login.html';
      return;
    }

    const response = await fetch(`/api/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/templates/Authenticator/login.html';
        return;
      }
      throw new Error('Failed to load order details');
    }

    const data = await response.json();
    
    if (data.success && data.order) {
      displayOrderDetails(data.order);
    } else {
      throw new Error('Invalid order data received');
    }

  } catch (error) {
    console.error('Error loading order:', error);
    showError(error.message || 'Unable to load order details');
  }
}

// Display order details
function displayOrderDetails(order) {
  currentOrderStatus = order.status;
  // Ensure we have the numeric ID for endpoints that require it
  currentOrderNumericId = order.id || currentOrderNumericId;

  // Hide loading, show content
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('orderContent').style.display = 'block';

  // Order header
  document.getElementById('orderNumber').textContent = `Order #${order.order_number}`;
  document.getElementById('orderDate').textContent = `Placed on ${formatDate(order.created_at)}`;
  
  // Status badge
  const statusBadge = document.getElementById('orderStatusBadge');
  statusBadge.textContent = capitalizeFirst(order.status);
  statusBadge.className = `status-badge status-${order.status}`;

  // Show cancellation alert if cancelled
  if (order.status === 'cancelled') {
    const cancelAlert = document.getElementById('cancelAlert');
    const cancelReason = document.getElementById('cancelReason');
    cancelAlert.style.display = 'block';
    cancelReason.textContent = order.cancel_reason || 'No reason provided';
  }

  // Show eligibility info and cancel button if order can be cancelled
  const canCancel = ['pending', 'confirmed', 'prepared'].includes(order.status);
  if (canCancel) {
    document.getElementById('eligibilityInfo').style.display = 'block';
    document.getElementById('cancelOrderBtn').style.display = 'inline-block';
  }

  // Show review section if order is delivered
  if (order.status === 'delivered') {
    loadReviewEligibility(order.id, order.items);
  }

  // Display order items
  displayOrderItems(order.items);

  // Calculate and display totals using backend financial breakdown
  const subtotal = (typeof order.product_subtotal === 'number')
    ? order.product_subtotal
    : order.items.reduce((sum, item) => sum + item.subtotal, 0);
  const shipping = (typeof order.delivery_fee === 'number')
    ? order.delivery_fee
    : 0;
  const total = order.total_amount;

  document.getElementById('subtotalAmount').textContent = `₱${subtotal.toFixed(2)}`;
  document.getElementById('shippingAmount').textContent = `₱${shipping.toFixed(2)}`;
  document.getElementById('totalAmount').textContent = `₱${total.toFixed(2)}`;

  // Order information
  document.getElementById('infoOrderNumber').textContent = order.order_number;
  document.getElementById('infoOrderDate').textContent = formatDate(order.created_at);
  document.getElementById('infoPaymentMethod').textContent = formatPaymentMethod(order.payment_method);
  document.getElementById('infoPaymentStatus').textContent = capitalizeFirst(order.payment_status);

  // Tracking number (if available)
  if (order.tracking_number) {
    document.getElementById('trackingRow').style.display = 'flex';
    document.getElementById('infoTrackingNumber').textContent = order.tracking_number;
  }

  // Shipping information
  document.getElementById('infoCustomerName').textContent = order.customer_name || order.buyer?.full_name || 'N/A';
  document.getElementById('infoShippingAddress').textContent = order.shipping?.full_address || 'N/A';

  // Special notes (if available)
  if (order.special_notes && order.special_notes.trim()) {
    document.getElementById('specialNotesRow').style.display = 'flex';
    document.getElementById('infoSpecialNotes').textContent = order.special_notes;
  }
}

// Display order items
function displayOrderItems(items) {
  const container = document.getElementById('orderItems');
  container.innerHTML = '';

  items.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'order-item';
    
    const imageUrl = item.image_url || '/static/images/placeholder.jpg';
    const itemTotal = item.subtotal;

    itemEl.innerHTML = `
      <img src="${imageUrl}" alt="${item.name}" class="item-image" onerror="this.src='/static/images/placeholder.jpg'">
      <div class="item-details">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-variant">
            ${item.size ? `Size: ${item.size}` : ''} 
            ${item.size && item.color ? ' | ' : ''}
            ${item.color ? `Color: ${item.color}` : ''}
          </div>
        </div>
        <div class="item-price-section">
          <span class="item-quantity">Qty: ${item.quantity}</span>
          <span class="item-price">₱${itemTotal.toFixed(2)}</span>
        </div>
      </div>
    `;

    container.appendChild(itemEl);
  });
}

// Show cancel modal
function showCancelModal() {
  const modalEl = document.getElementById('cancelOrderModal');
  const reasonSelect = document.getElementById('cancelReasonSelect');
  const otherInput = document.getElementById('cancelReasonOther');
  const legacyInput = document.getElementById('cancelReasonInput');
  const confirmBtn = document.getElementById('confirmCancelBtn');
  
  // Reset fields
  if (reasonSelect) reasonSelect.value = '';
  if (otherInput) otherInput.value = '';
  if (legacyInput) legacyInput.value = '';
  if (confirmBtn) confirmBtn.disabled = true;
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// Confirm cancel order
async function confirmCancelOrder() {
  // Gather cancellation reason from select/textarea (backward compatible)
  let cancelReason = '';
  const selectEl = document.getElementById('cancelReasonSelect');
  const otherEl = document.getElementById('cancelReasonOther');
  const legacyEl = document.getElementById('cancelReasonInput');
  const typedVal = (otherEl?.value?.trim()) || (legacyEl?.value?.trim()) || '';
  if (typedVal) {
    cancelReason = typedVal;
  } else if (selectEl && selectEl.value) {
    if (selectEl.value === 'Other') {
      alert('Please type your reason in the text box.');
      return;
    }
    cancelReason = selectEl.value;
  }

  // Hard requirement: require a reason (either selected or typed)
  if (!cancelReason) {
    alert('Please select a reason or type your own before cancelling.');
    return;
  }
  
  try {
    // Check authentication using AuthManager
    const token = (AuthManager && AuthManager.getAuthToken && AuthManager.getAuthToken()) 
                  || localStorage.getItem('auth_token') 
                  || localStorage.getItem('token');
    
    if (!token) {
      console.warn('No authentication token found, redirecting to login...');
      window.location.href = '/templates/Authenticator/login.html';
      return;
    }

    // Show loading
    const confirmBtn = document.getElementById('confirmCancelBtn');
    const originalText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Cancelling...';

    const endpoint = `/api/orders/${currentOrderNumericId || currentOrderId}/status`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'cancelled',
        cancel_reason: cancelReason || 'Cancelled by buyer'
      })
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    if (response.ok && data.success) {
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('cancelOrderModal'));
      modal.hide();

      // Show success message
      alert('Order cancelled successfully!');
      
      // Reload page to show updated status
      window.location.reload();
    } else {
      throw new Error(data.error || 'Failed to cancel order');
    }

  } catch (error) {
    console.error('Error cancelling order:', error);
    alert(`Error: ${error.message}`);
    
    // Reset button
    const confirmBtn = document.getElementById('confirmCancelBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = 'Yes, Cancel Order';
  }
}

// Show error state
function showError(message) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('errorState').style.display = 'block';
  document.getElementById('errorMessage').textContent = message;
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPaymentMethod(method) {
  const methodMap = {
    'GCASH': 'GCash',
    'PH_GCASH': 'GCash',
    'CARD': 'Credit/Debit Card',
    'COD': 'Cash on Delivery'
  };
  return methodMap[method] || method || 'N/A';
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========== REVIEW FUNCTIONS ==========

// Load review eligibility for order
async function loadReviewEligibility(orderId, orderItems) {
  try {
    const token = (AuthManager && AuthManager.getAuthToken && AuthManager.getAuthToken()) 
                  || localStorage.getItem('auth_token') 
                  || localStorage.getItem('token');
    
    const response = await fetch(`/api/orders/${orderId}/review-eligibility`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (data.eligible && data.products && data.products.length > 0) {
      document.getElementById('reviewSection').style.display = 'block';
      displayReviewForms(orderId, data.products, orderItems);
    }
  } catch (error) {
    console.error('Error checking review eligibility:', error);
  }
}

// Display review forms for products
function displayReviewForms(orderId, products, orderItems) {
  const container = document.getElementById('reviewProducts');
  container.innerHTML = '';

  products.forEach(product => {
    const orderItem = orderItems.find(item => item.product_id === product.product_id);
    const productDiv = document.createElement('div');
    productDiv.className = 'review-product-item';
    productDiv.dataset.productId = product.product_id;

    if (product.already_reviewed) {
      productDiv.innerHTML = `
        <div class="review-product-header">
          <div class="review-product-name">${product.product_name}</div>
          <span class="review-submitted-badge">
            <i class="fas fa-check-circle me-1"></i>Reviewed
          </span>
        </div>
        <p class="text-muted mb-0">
          <small>Thank you for your feedback!</small>
        </p>
      `;
    } else {
      productDiv.innerHTML = `
        <div class="review-product-header">
          <div class="review-product-name">${product.product_name}</div>
        </div>
        <div class="star-rating" data-product-id="${product.product_id}">
          ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-rating="${i}">★</span>`).join('')}
        </div>
        <textarea 
          class="review-textarea" 
          placeholder="Share your experience with this product..."
          id="review-comment-${product.product_id}"
        ></textarea>
        <div class="mt-2">
          <button 
            class="review-submit-btn" 
            onclick="submitReview(${orderId}, ${product.product_id})"
            id="submit-${product.product_id}"
          >
            <i class="fas fa-paper-plane me-2"></i>Submit Review
          </button>
        </div>
      `;
    }

    container.appendChild(productDiv);
  });

  // Setup star rating listeners
  setupStarRatings();
}

// Setup star rating interactions
function setupStarRatings() {
  document.querySelectorAll('.star-rating').forEach(ratingDiv => {
    const stars = ratingDiv.querySelectorAll('.star');
    let selectedRating = 0;

    stars.forEach((star, index) => {
      star.addEventListener('click', () => {
        selectedRating = index + 1;
        ratingDiv.dataset.rating = selectedRating;
        updateStars(stars, selectedRating);
      });

      star.addEventListener('mouseenter', () => {
        updateStars(stars, index + 1);
      });
    });

    ratingDiv.addEventListener('mouseleave', () => {
      updateStars(stars, selectedRating);
    });
  });
}

function updateStars(stars, rating) {
  stars.forEach((star, index) => {
    if (index < rating) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

// Submit review
async function submitReview(orderId, productId) {
  try {
    const token = (AuthManager && AuthManager.getAuthToken && AuthManager.getAuthToken()) 
                  || localStorage.getItem('auth_token') 
                  || localStorage.getItem('token');
    
    const ratingDiv = document.querySelector(`.star-rating[data-product-id="${productId}"]`);
    const rating = parseInt(ratingDiv.dataset.rating);
    const comment = document.getElementById(`review-comment-${productId}`).value.trim();
    const submitBtn = document.getElementById(`submit-${productId}`);

    if (!rating) {
      alert('Please select a star rating');
      return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';

    const response = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        order_id: orderId,
        rating: rating,
        comment: comment
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Replace form with success message
      const productItem = document.querySelector(`[data-product-id="${productId}"]`);
      productItem.innerHTML = `
        <div class="review-product-header">
          <div class="review-product-name">${productItem.querySelector('.review-product-name').textContent}</div>
          <span class="review-submitted-badge">
            <i class="fas fa-check-circle me-1"></i>Reviewed
          </span>
        </div>
        <p class="text-success mb-0">
          <i class="fas fa-check me-1"></i>Thank you for your feedback!
        </p>
      `;
    } else {
      throw new Error(data.error || 'Failed to submit review');
    }
  } catch (error) {
    console.error('Error submitting review:', error);
    alert(`Error: ${error.message}`);
    
    // Re-enable button
    const submitBtn = document.getElementById(`submit-${productId}`);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Submit Review';
    }
  }
}
