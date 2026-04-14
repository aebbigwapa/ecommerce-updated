// Rider Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Rider Dashboard Loading...');
  
  // Use consistent authentication method - prioritize shared-auth.js if available
  let user = null;
  let token = null;
  
  if (typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn) {
    // Use the new shared authentication system
    user = AuthManager.getAuthUser();
    token = AuthManager.getAuthToken();
    console.log('✅ Using AuthManager - User:', user, 'Token:', token ? 'Present' : 'Missing');
  } else {
    // Fallback to old system with all possible keys
    const userKeys = ['auth_user', 'user_info', 'loggedInUser', 'logged_in_user'];
    const tokenKeys = ['auth_token', 'jwt_token', 'token'];
    
    // Try to get user data from any available key
    for (const key of userKeys) {
      const userData = localStorage.getItem(key);
      if (userData) {
        try {
          user = JSON.parse(userData);
          console.log(`✅ Found user data in ${key}:`, user);
          break;
        } catch (e) {
          console.warn(`⚠️ Failed to parse user data from ${key}:`, e);
        }
      }
    }
    
    // Try to get token from any available key
    for (const key of tokenKeys) {
      token = localStorage.getItem(key);
      if (token) {
        console.log(`✅ Found token in ${key}:`, token ? 'Present' : 'Missing');
        break;
      }
    }
  }

  // Debug: Log current authentication state
  console.log('🔍 Authentication Debug:');
  console.log('   - User:', user);
  console.log('   - User Role:', user?.role);
  console.log('   - Token:', token ? 'Present' : 'Missing');
  console.log('   - All localStorage keys:', Object.keys(localStorage));

  // Redirect if not authenticated
  if (!user || !token) {
    console.warn('❌ Not authenticated - redirecting to login');
    console.log('   - User present:', !!user);
    console.log('   - Token present:', !!token);
    window.location.href = '../Authenticator/login.html';
    return;
  }

  // Enforce rider role with better logging
  if (user.role !== 'rider') {
    console.warn(`❌ Wrong role: Expected 'rider', got '${user.role}' - redirecting`);
    if (user.role === 'seller') {
      console.log('↗️ Redirecting to seller dashboard');
      window.location.href = '../SellerDashboard/sellerdashboard.html';
    } else if (user.role === 'admin') {
      console.log('↗️ Redirecting to admin dashboard');
      window.location.href = '../AdminDashboard/admin-dashboard.html';
    } else {
      console.log('↗️ Redirecting to public page');
      window.location.href = '../Public/index.html';
    }
    return;
  }
  
  console.log('✅ Authentication successful - initializing rider dashboard');
  console.log(`👤 Welcome ${user.name || user.email} (Role: ${user.role})`);

  // Store user info in standardized format for consistency
  localStorage.setItem('auth_user', JSON.stringify(user));
  localStorage.setItem('auth_token', token);

  // Initialize dashboard
  initializeDashboard(user, token);
});

function initializeDashboard(user, token) {
  console.log('🚀 Rider Dashboard Initializing...');
  
  // Update user profile in topbar
  updateUserProfile(user);
  
  // Initialize sidebar toggle functionality
  initializeSidebar();
  
  // Initialize RiderMessageManager
  if (typeof RiderMessageManager !== 'undefined') {
    window.riderMessageManager = new RiderMessageManager();
    console.log('✅ RiderMessageManager initialized');
  }
  
  // Load dashboard data
  loadDashboardStats(token);
  loadRecentActivity(token);
  updateGoalProgress(token);
  
  // Set up refresh intervals
  setInterval(() => {
    loadDashboardStats(token);
    updateBadgeCounts(token);
    updateNotificationCount(token);
    if (window.riderMessageManager) {
      window.riderMessageManager.loadMessages();
    }
  }, 30000); // Refresh every 30 seconds
  
  // Set up delivery polling
  setInterval(() => {
    pollForNewDeliveries(token);
  }, 5000); // Check for new deliveries every 5 seconds
  
  // Initialize delivery tracking
  window.lastDeliveryCount = { available: 0, assigned: 0 };
  
  // Initialize notification handlers
  initializeNotifications(token);
  initializeMessageDropdown(token);
  
  // Update notification count on load
  updateNotificationCount(token);
  
  // Initialize earnings report
  initializeEarningsReport(token);
  
  // Initialize rider availability toggle
  initStatusToggle(token);
  
  console.log('✅ Rider Dashboard Initialized');
}

function updateUserProfile(user) {
  // User profile section removed - function kept for compatibility but does nothing
  // const userName = user.name || user.email.split("@")[0];
  // const userNameElement = document.querySelector('.user-name');
  // const userInitialsElement = document.getElementById('userInitials');
  // 
  // if (userNameElement) {
  //   userNameElement.textContent = userName;
  // }
  // 
  // // Update avatar initials
  // if (userInitialsElement) {
  //   const initials = getInitials(userName);
  //   userInitialsElement.textContent = initials;
  // }
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function initializeSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarToggleInline = document.getElementById('sidebarToggleInline');
  const mobileToggle = document.getElementById('mobileToggle');
  
  // Check localStorage for saved state, default to collapsed
  const savedState = localStorage.getItem('riderSidebarCollapsed');
  const isCollapsed = savedState === null ? true : savedState === 'true';
  
  // Apply initial state
  if (isCollapsed && sidebar) {
    sidebar.classList.add('collapsed');
  }
  
  // Toggle function that saves state
  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('riderSidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
  }
  
  // Desktop toggle (top button when collapsed)
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }
  
  // Inline toggle (beside Main when expanded)
  if (sidebarToggleInline) {
    sidebarToggleInline.addEventListener('click', toggleSidebar);
  }
  
  // Mobile sidebar toggle
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', function() {
      sidebar.classList.toggle('show');
      
      // Add overlay
      let overlay = document.querySelector('.sidebar-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
      }
      overlay.classList.toggle('show');
      
      // Close on overlay click
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
      });
    });
  }
}

async function loadDashboardStats(token) {
  try {
    // Load dashboard data from backend
    const dashboardResponse = await fetch('/api/rider/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (dashboardResponse.ok) {
      const data = await dashboardResponse.json();
      const stats = data.stats;
      
      // Update stats with proper fallbacks and logging
      console.log('📊 Updating dashboard stats:', stats);
      updateStatCard('statActive', stats.active_deliveries || 0);
      updateStatCard('statCompleted', stats.today_deliveries || 0);
      updateStatCard('statEarnings', `₱${(stats.today_earnings || 0).toFixed(2)}`);
      updateStatCard('statRating', `${(stats.average_rating || 0).toFixed(1)} ⭐`);
      
      // Log individual stat updates
      console.log('🚀 Active deliveries:', stats.active_deliveries);
      console.log('✅ Today deliveries:', stats.today_deliveries);
      console.log('💰 Today earnings:', stats.today_earnings);
      console.log('⭐ Average rating:', stats.average_rating);
      
      // Load recent activity if available - transform backend data to match frontend format
      if (data.recent_activity && data.recent_activity.length > 0) {
        const transformedActivities = data.recent_activity.map(activity => {
          // Determine activity type based on status
          let type = 'default';
          let title = 'Delivery Update';
          let description = '';
          
          if (activity.status === 'delivered' || activity.status === 'completed') {
            type = 'delivery_completed';
            title = 'Delivery Completed';
            description = `Order ${activity.order_number || 'N/A'} delivered successfully`;
          } else if (activity.status === 'accepted_by_rider' || activity.status === 'assigned') {
            type = 'delivery_accepted';
            title = 'Delivery Accepted';
            description = `Accepted order ${activity.order_number || 'N/A'}`;
          } else if (activity.status === 'picked_up' || activity.status === 'in_transit') {
            type = 'delivery_picked_up';
            title = 'Delivery Picked Up';
            description = `Picked up order ${activity.order_number || 'N/A'}`;
          } else {
            description = `Order ${activity.order_number || 'N/A'} - ${activity.status || 'pending'}`;
          }
          
          // Use completed_at if available, otherwise use created_at
          const timestamp = activity.completed_at || activity.created_at;
          
          return {
            id: activity.id,
            type: type,
            title: title,
            description: description,
            timestamp: timestamp,
            order_number: activity.order_number,
            amount: activity.amount,
            address: activity.address,
            status: activity.status // Include status for table display
          };
        });
        renderRecentActivity(transformedActivities);
      } else {
        renderEmptyActivity();
      }
    } else {
      console.error('Failed to load dashboard data - Response:', dashboardResponse.status, dashboardResponse.statusText);
      const errorData = await dashboardResponse.json().catch(() => ({}));
      console.error('Error response data:', errorData);
      showToast(`Failed to load dashboard data: ${errorData.error || dashboardResponse.statusText}`, 'error');
      renderEmptyStats();
    }
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    showToast('Connection error - please check your internet connection', 'error');
    renderEmptyStats();
  }
}

function updateStatCard(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    // Add updating animation
    element.classList.add('stat-updating');
    
    setTimeout(() => {
      element.textContent = value;
      element.classList.remove('stat-updating');
      element.classList.add('stat-updated');
      
      setTimeout(() => {
        element.classList.remove('stat-updated');
      }, 600);
    }, 150);
  }
}

async function loadRecentActivity(token) {
  const activityContainer = document.getElementById('activityTimeline');
  if (!activityContainer) return;
  
  try {
    // Activity is now loaded as part of dashboard stats
    // This function is kept for compatibility but may not be needed
  } catch (error) {
    console.error('Error loading recent activity:', error);
    renderEmptyActivity();
  }
}

function renderRecentActivity(activities) {
  const tbody = document.getElementById('activityTableBody');
  if (!tbody) return;
  
  if (activities.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5">
          <i class="fas fa-history fa-2x text-muted mb-3"></i>
          <p class="text-muted">No recent activity</p>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = activities.map(activity => {
    // Parse timestamp safely
    let dateObj;
    let dateStr = 'N/A';
    if (activity.timestamp) {
      try {
        dateObj = new Date(activity.timestamp);
        // Check if date is valid
        if (!isNaN(dateObj.getTime())) {
          dateStr = dateObj.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch (e) {
        dateStr = 'Invalid Date';
      }
    }
    
    // Format status for display
    const statusDisplay = formatStatus(activity.status);
    
    // Get status badge color
    const statusColors = {
      'delivered': 'success',
      'completed': 'success',
      'in_transit': 'info',
      'picked_up': 'warning',
      'assigned': 'primary',
      'accepted_by_rider': 'primary',
      'pending': 'secondary',
      'cancelled': 'danger',
      'confirmed': 'info',
      'prepared': 'warning',
      'shipped': 'primary'
    };
    const statusColor = statusColors[activity.status?.toLowerCase()] || 'secondary';
    
    return `
      <tr>
        <td class="fw-medium">${escapeHtml(activity.order_number || 'N/A')}</td>
        <td><span class="badge bg-${statusColor}">${escapeHtml(statusDisplay)}</span></td>
        <td>${escapeHtml(activity.address || 'N/A')}</td>
        <td>₱${(activity.amount || 0).toFixed(2)}</td>
        <td>${dateStr}</td>
      </tr>
    `;
  }).join('');
}

function renderEmptyActivity() {
  const tbody = document.getElementById('activityTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center py-5">
        <i class="fas fa-history fa-2x text-muted mb-3"></i>
        <p class="text-muted mb-1">No recent activity</p>
        <p class="text-muted small">Your delivery activities will appear here</p>
      </td>
    </tr>
  `;
}

function renderEmptyStats() {
  updateStatCard('statActive', 0);
  updateStatCard('statCompleted', 0);
  updateStatCard('statEarnings', '₱0.00');
  updateStatCard('statRating', '0.0 ⭐');
  renderEmptyActivity();
}

function getActivityIcon(type) {
  const icons = {
    'delivery_completed': 'fas fa-check-circle',
    'delivery_accepted': 'fas fa-plus-circle',
    'delivery_picked_up': 'fas fa-box',
    'earnings': 'fas fa-wallet',
    'rating': 'fas fa-star',
    'default': 'fas fa-info-circle'
  };
  return icons[type] || icons.default;
}

function getActivityIconColor(type) {
  const colors = {
    'delivery_completed': 'linear-gradient(135deg, #28a745, #20c997)',
    'delivery_accepted': 'linear-gradient(135deg, #007bff, #6610f2)',
    'delivery_picked_up': 'linear-gradient(135deg, #ffc107, #fd7e14)',
    'earnings': 'linear-gradient(135deg, #28a745, #20c997)',
    'rating': 'linear-gradient(135deg, #e83e8c, #fd7e14)',
    'default': 'linear-gradient(135deg, #6c757d, #495057)'
  };
  return colors[type] || colors.default;
}

async function updateGoalProgress(token) {
  try {
    const response = await fetch('/api/rider/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      const stats = data.stats;
      
      // Calculate goals from actual stats
      const goals = {
        deliveries: { current: stats.today_deliveries || 0, target: 10 },
        earnings: { current: stats.today_earnings || 0, target: 500 },
        rating: { current: stats.average_rating || 0, target: 5.0 }
      };
      
      updateGoalProgressBars(goals);
    } else {
      updateEmptyGoals();
    }
  } catch (error) {
    console.error('Error loading goals:', error);
    updateEmptyGoals();
  }
}

function updateGoalProgressBars(goals) {
  // Deliveries goal
  const deliveries = goals.deliveries || { current: 0, target: 10 };
  const deliveryProgress = Math.min((deliveries.current / deliveries.target) * 100, 100);
  const deliveriesEl = document.getElementById('goalDeliveries');
  const deliveriesBarEl = document.getElementById('goalDeliveriesBar');
  if (deliveriesEl) deliveriesEl.textContent = deliveries.current;
  if (deliveriesBarEl) deliveriesBarEl.style.width = `${deliveryProgress}%`;
  
  // Earnings goal
  const earnings = goals.earnings || { current: 0, target: 500 };
  const earningsProgress = Math.min((earnings.current / earnings.target) * 100, 100);
  const earningsEl = document.getElementById('goalEarnings');
  const earningsBarEl = document.getElementById('goalEarningsBar');
  if (earningsEl) earningsEl.textContent = earnings.current;
  if (earningsBarEl) earningsBarEl.style.width = `${earningsProgress}%`;
  
  // Rating goal
  const rating = goals.rating || { current: 5.0, target: 5.0 };
  const ratingProgress = Math.min((rating.current / rating.target) * 100, 100);
  const ratingEl = document.getElementById('goalRating');
  const ratingBarEl = document.getElementById('goalRatingBar');
  if (ratingEl) ratingEl.textContent = rating.current.toFixed(1);
  if (ratingBarEl) ratingBarEl.style.width = `${ratingProgress}%`;
}

function updateEmptyGoals() {
  updateGoalProgressBars({
    deliveries: { current: 0, target: 10 },
    earnings: { current: 0, target: 500 },
    rating: { current: 0, target: 5.0 }
  });
}

async function updateBadgeCounts(token) {
  try {
    // Update available deliveries badge
    const availableResponse = await fetch('/api/rider/deliveries/available', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (availableResponse.ok) {
      const data = await availableResponse.json();
      const count = data.deliveries ? data.deliveries.length : 0;
      updateBadge('availableBadge', count);
    }
    
    // Update active deliveries badge
    const activeResponse = await fetch('/api/rider/deliveries', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (activeResponse.ok) {
      const data = await activeResponse.json();
      const count = data.deliveries ? data.deliveries.length : 0;
      updateBadge('activeBadge', count);
    }
  } catch (error) {
    console.error('Error updating badge counts:', error);
    updateBadge('availableBadge', 0);
    updateBadge('activeBadge', 0);
  }
}

// Poll for new deliveries and show notifications for new assignments
async function pollForNewDeliveries(token) {
  try {
    // Get current delivery counts
    const [availableResponse, assignedResponse] = await Promise.all([
      fetch('/api/rider/deliveries/available', {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch('/api/rider/deliveries', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ]);
    
    let newAvailableCount = 0;
    let newAssignedCount = 0;
    
    if (availableResponse.ok) {
      const availableData = await availableResponse.json();
      newAvailableCount = availableData.deliveries ? availableData.deliveries.length : 0;
    }
    
    if (assignedResponse.ok) {
      const assignedData = await assignedResponse.json();
      newAssignedCount = assignedData.deliveries ? assignedData.deliveries.length : 0;
    }
    
    // Initialize tracking on first run
    if (!window.lastDeliveryCount) {
      window.lastDeliveryCount = { available: newAvailableCount, assigned: newAssignedCount };
      return;
    }
    
    // Check for new available deliveries
    if (newAvailableCount > window.lastDeliveryCount.available) {
      const newDeliveries = newAvailableCount - window.lastDeliveryCount.available;
      console.log(`🆕 ${newDeliveries} new delivery(s) available!`);
      
      showToast(
        `${newDeliveries} new delivery${newDeliveries > 1 ? 's' : ''} available for pickup!`,
        'info',
        6000
      );
      
      // Update badge immediately
      updateBadge('availableBadge', newAvailableCount);
      
      // Also update dashboard stats to show real-time data
      loadDashboardStats(token);
    }
    
    // Check for new assigned deliveries
    if (newAssignedCount > window.lastDeliveryCount.assigned) {
      const newAssignments = newAssignedCount - window.lastDeliveryCount.assigned;
      console.log(`🎯 ${newAssignments} new delivery(s) assigned to you!`);
      
      showToast(
        `You have been assigned ${newAssignments} new delivery${newAssignments > 1 ? 's' : ''}!`,
        'success',
        8000
      );
      
      // Update badge immediately
      updateBadge('activeBadge', newAssignedCount);
      
      // Also update dashboard stats to show real-time data
      loadDashboardStats(token);
    }
    
    // Update the tracking counts
    window.lastDeliveryCount = {
      available: newAvailableCount,
      assigned: newAssignedCount
    };
    
  } catch (error) {
    console.error('Error polling for new deliveries:', error);
    // Continue polling silently even if there are errors
  }
}

function updateBadge(badgeId, count) {
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

function initializeNotifications(token) {
  const notificationBtn = document.getElementById('notificationBtn');
  const notificationDropdown = document.getElementById('notificationDropdown');
  const notificationList = document.getElementById('notificationList');
  const markAllReadBtn = document.getElementById('markAllRead');
  
  if (!notificationBtn || !notificationDropdown || !notificationList) {
    console.warn('Notification elements not found');
    return;
  }
  
  // Set up hover behavior (same as message dropdown)
  let hideTimer;
  const notificationContainer = notificationBtn.closest('.notification-container');
  
  if (notificationContainer) {
    notificationContainer.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      notificationDropdown.style.display = 'block';
      loadNotifications(token);
    });
    
    notificationContainer.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => {
        notificationDropdown.style.display = 'none';
      }, 200);
    });
    
    notificationDropdown.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
    });
    
    notificationDropdown.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => {
        notificationDropdown.style.display = 'none';
      }, 200);
    });
  }
  
  // Mark all as read
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await fetch('/api/notifications/read-all', {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          loadNotifications(token);
          updateNotificationCount(token);
        }
      } catch (error) {
        console.error('Error marking all as read:', error);
      }
    });
  }
  
  // Refresh notifications periodically
  setInterval(() => {
    if (notificationDropdown.style.display === 'block') {
      loadNotifications(token);
    }
    updateNotificationCount(token);
  }, 30000); // Every 30 seconds
}

function initializeMessageDropdown(token) {
  const messageBtn = document.getElementById('messageBtn');
  const messageDropdown = document.getElementById('messageDropdown');
  
  if (!messageBtn || !messageDropdown) {
    console.warn('Message elements not found');
    return;
  }
  
  // Set up hover behavior (same as notification dropdown)
  let hideTimer;
  const messageContainer = messageBtn.closest('.position-relative') || messageBtn.parentElement;
  
  // Create container if it doesn't exist
  if (!messageContainer.classList.contains('message-container')) {
    messageContainer.classList.add('message-container');
  }
  
  messageContainer.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    messageDropdown.style.display = 'block';
    
    // Load messages when dropdown is opened
    if (typeof RiderMessageManager !== 'undefined' && window.riderMessageManager) {
      window.riderMessageManager.loadRecentMessages();
    }
  });
  
  messageContainer.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      messageDropdown.style.display = 'none';
    }, 200);
  });
  
  messageDropdown.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
  });
  
  messageDropdown.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      messageDropdown.style.display = 'none';
    }, 200);
  });
}

async function loadNotifications(token) {
  const notificationList = document.getElementById('notificationList');
  if (!notificationList) return;
  
  try {
    const response = await fetch('/api/notifications', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      const notifications = data.notifications || [];
      displayNotifications(notifications);
      updateNotificationCount(token, notifications);
    } else {
      notificationList.innerHTML = `
        <div class="notification-empty">
          <i class="fas fa-bell"></i>
          <p>Failed to load notifications</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
    notificationList.innerHTML = `
      <div class="notification-empty">
        <i class="fas fa-bell"></i>
        <p>Failed to load notifications</p>
      </div>
    `;
  }
}

function displayNotifications(notifications) {
  const notificationList = document.getElementById('notificationList');
  if (!notificationList) return;
  
  if (notifications.length === 0) {
    notificationList.innerHTML = `
      <div class="notification-empty">
        <i class="fas fa-bell"></i>
        <p>No notifications</p>
      </div>
    `;
    return;
  }
  
  notificationList.innerHTML = notifications.map(notif => {
    const isUnread = !notif.is_read;
    const timeAgo = formatNotificationTime(notif.created_at);
    const icon = getNotificationIcon(notif.type);
    
    return `
      <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" data-type="${notif.type || ''}" data-ref="${notif.reference_id || ''}">
        ${notif.image_url ? 
          `<img src="${escapeHtml(notif.image_url)}" alt="" class="notification-image" onerror="this.style.display='none';">` :
          `<div class="notification-icon">${icon}</div>`
        }
        <div class="notification-content">
          <div class="notification-message">${escapeHtml(notif.message || 'Notification')}</div>
          <div class="notification-time">${timeAgo}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers - need to get token from AuthManager
  const getToken = () => {
    if (typeof AuthManager !== 'undefined' && AuthManager.getAuthToken) {
      return AuthManager.getAuthToken();
    }
    return localStorage.getItem('auth_token') || localStorage.getItem('token');
  };
  
  notificationList.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notifId = item.getAttribute('data-id');
      const notifType = item.getAttribute('data-type');
      const notifRef = item.getAttribute('data-ref');
      const currentToken = getToken();
      
      // Mark as read
      if (notifId && currentToken) {
        try {
          await fetch(`/api/notifications/${notifId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentToken}` }
          });
          // Update the item to remove unread styling
          item.classList.remove('unread');
        } catch (e) {
          console.error('Error marking notification as read:', e);
        }
      }
      
      // Handle navigation based on notification type
      handleNotificationClick(notifType, notifRef);
    });
  });
}

function getNotificationIcon(type) {
  const icons = {
    'order_placed': '<i class="fas fa-shopping-bag"></i>',
    'order_shipped': '<i class="fas fa-truck"></i>',
    'order_delivered': '<i class="fas fa-check-circle"></i>',
    'order_cancelled': '<i class="fas fa-times-circle"></i>',
    'delivery_assigned': '<i class="fas fa-route"></i>',
    'delivery_completed': '<i class="fas fa-check-double"></i>',
    'price_drop': '<i class="fas fa-tag"></i>',
    'stock_alert': '<i class="fas fa-bell"></i>',
    'chat_message': '<i class="fas fa-comments"></i>',
    'default': '<i class="fas fa-bell"></i>'
  };
  return icons[type] || icons.default;
}

function handleNotificationClick(type, referenceId) {
  if (!type || !referenceId) return;
  
  const typeLower = type.toLowerCase();
  
  if (typeLower.startsWith('order_')) {
    window.location.href = `/templates/UserProfile/my_orders.html?orderId=${encodeURIComponent(referenceId)}`;
  } else if (typeLower === 'price_drop' || typeLower === 'stock_alert') {
    window.location.href = `/templates/Public/product.html?id=${encodeURIComponent(referenceId)}`;
  } else if (typeLower === 'chat_message') {
    // Could navigate to messages page
    window.location.href = `/templates/RiderDashboard/messages.html`;
  } else if (typeLower === 'delivery_assigned' || typeLower === 'delivery_completed') {
    window.location.href = `/templates/RiderDashboard/my-deliveries.html`;
  }
}

function formatNotificationTime(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  } catch (e) {
    return '';
  }
}

async function updateNotificationCount(token, notifications = null) {
  try {
    if (!notifications) {
      const response = await fetch('/api/notifications/count', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const unreadCount = data.unread_count || 0;
        const notificationDot = document.querySelector('.notification-dot');
        if (notificationDot) {
          notificationDot.style.display = unreadCount > 0 ? 'block' : 'none';
        }
      }
    } else {
      const unreadCount = notifications.filter(n => !n.is_read).length;
      const notificationDot = document.querySelector('.notification-dot');
      if (notificationDot) {
        notificationDot.style.display = unreadCount > 0 ? 'block' : 'none';
      }
    }
  } catch (error) {
    console.error('Error updating notification count:', error);
  }
}

// Earnings Report Functions
let earningsChart = null;
let currentEarningsData = null; // Store earnings data for PDF download

function initializeEarningsReport(token) {
  const loadBtn = document.getElementById('loadEarningsReportBtn');
  if (!loadBtn) return;
  
  // Set default dates (last 7 days)
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 7);
  
  const fromInput = document.getElementById('earningsReportFrom');
  const toInput = document.getElementById('earningsReportTo');
  
  if (fromInput) {
    fromInput.value = fromDate.toISOString().split('T')[0];
  }
  if (toInput) {
    toInput.value = toDate.toISOString().split('T')[0];
  }
  
  loadBtn.addEventListener('click', () => {
    loadEarningsReport(token);
  });
  
  // PDF download button
  const downloadBtn = document.getElementById('downloadEarningsPDFBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadEarningsPDF();
    });
  }
  
  // Load on page load
  loadEarningsReport(token);
}

async function loadEarningsReport(token) {
  const fromInput = document.getElementById('earningsReportFrom');
  const toInput = document.getElementById('earningsReportTo');
  const tbody = document.getElementById('earningsReportBody');
  
  if (!fromInput || !toInput || !tbody) return;
  
  const from = fromInput.value;
  const to = toInput.value;
  
  if (!from || !to) {
    showToast('Please select both start and end dates', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`/api/rider/earnings-report?from=${from}&to=${to}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load earnings report');
    }
    
    const data = await response.json();
    
    if (data.success && data.daily_earnings) {
      currentEarningsData = data.daily_earnings; // Store for PDF
      renderEarningsChart(data.daily_earnings);
      renderEarningsTable(data.daily_earnings);
      
      // Show download button if data exists
      const downloadBtn = document.getElementById('downloadEarningsPDFBtn');
      if (downloadBtn) {
        downloadBtn.style.display = data.daily_earnings.length > 0 ? 'inline-block' : 'none';
      }
    } else {
      currentEarningsData = null;
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-muted">
            No earnings data found for the selected date range
          </td>
        </tr>
      `;
      
      // Hide download button
      const downloadBtn = document.getElementById('downloadEarningsPDFBtn');
      if (downloadBtn) {
        downloadBtn.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error loading earnings report:', error);
    showToast('Failed to load earnings report', 'error');
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-danger">
          Error loading earnings report. Please try again.
        </td>
      </tr>
    `;
  }
}

function renderEarningsChart(dailyEarnings) {
  const canvas = document.getElementById('earningsChart');
  if (!canvas) return;
  
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart if it exists
  if (earningsChart) {
    earningsChart.destroy();
  }
  
  // Sort by date
  const sorted = [...dailyEarnings].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const labels = sorted.map(item => {
    const date = new Date(item.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const earnings = sorted.map(item => parseFloat(item.total_earnings || 0));
  
  // Calculate max value for better scaling
  const maxEarnings = Math.max(...earnings, 0);
  const suggestedMax = maxEarnings > 0 ? Math.ceil(maxEarnings * 1.2) : 100;
  
  earningsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Earnings (₱)',
        data: earnings,
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 2,
        borderRadius: 4,
        barThickness: 'flex',
        maxBarThickness: 50
      }]
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
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `₱${context.parsed.y.toFixed(2)}`;
            }
          }
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
            callback: function(value) {
              return '₱' + value.toFixed(0);
            },
            stepSize: suggestedMax > 100 ? Math.ceil(suggestedMax / 10) : 10
          }
        }
      }
    }
  });
}

function renderEarningsTable(dailyEarnings) {
  const tbody = document.getElementById('earningsReportBody');
  if (!tbody) return;
  
  if (dailyEarnings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          No earnings data found for the selected date range
        </td>
      </tr>
    `;
    return;
  }
  
  // Sort by date descending
  const sorted = [...dailyEarnings].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  tbody.innerHTML = sorted.map(item => {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    return `
      <tr>
        <td class="fw-medium">${dateStr}</td>
        <td>${item.delivery_count || 0}</td>
        <td>${escapeHtml(item.sellers || 'N/A')}</td>
        <td>${escapeHtml(item.buyers || 'N/A')}</td>
        <td class="fw-bold text-success">₱${parseFloat(item.total_earnings || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function downloadEarningsPDF() {
  if (!currentEarningsData || currentEarningsData.length === 0) {
    showToast('No earnings data available to download', 'warning');
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library not loaded. Please refresh the page.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Get date range
  const fromInput = document.getElementById('earningsReportFrom');
  const toInput = document.getElementById('earningsReportTo');
  const fromDate = fromInput ? fromInput.value : '';
  const toDate = toInput ? toInput.value : '';

  // Title
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('Rider Earnings Report', 14, 20);

  // Date range
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated: ${dateStr}`, 14, 28);
  
  if (fromDate && toDate) {
    const fromFormatted = new Date(fromDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const toFormatted = new Date(toDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    doc.text(`Period: ${fromFormatted} to ${toFormatted}`, 14, 35);
  }

  // Calculate totals
  const sorted = [...currentEarningsData].sort((a, b) => new Date(a.date) - new Date(b.date));
  const totalDeliveries = sorted.reduce((sum, item) => sum + (parseInt(item.delivery_count) || 0), 0);
  const totalBaseFee = sorted.reduce((sum, item) => sum + parseFloat(item.base_fee || 0), 0);
  const totalEarnings = sorted.reduce((sum, item) => sum + parseFloat(item.total_earnings || 0), 0);

  // Summary
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Summary', 14, 48);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  let y = 56;
  doc.text(`Total Days: ${sorted.length}`, 14, y);
  y += 8;
  doc.text(`Total Deliveries: ${totalDeliveries}`, 14, y);
  y += 8;
  doc.setFont(undefined, 'bold');
  doc.text(`Total Earnings: PHP ${totalEarnings.toFixed(2)}`, 14, y);
  y += 15;

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return 'N/A';
    }
  };

  // Format currency helper - use PHP for PDF compatibility
  const formatCurrency = (value) => {
    const num = parseFloat(value || 0);
    return `PHP ${num.toFixed(2)}`;
  };

  // Table
  doc.autoTable({
    startY: y,
    head: [['Date', 'Deliveries', 'Seller', 'Buyer', 'Total Earnings']],
    body: sorted.map(item => [
      formatDate(item.date),
      (item.delivery_count || 0).toString(),
      (item.sellers || 'N/A').substring(0, 35), // Limit length for PDF
      (item.buyers || 'N/A').substring(0, 35), // Limit length for PDF
      formatCurrency(item.total_earnings)
    ]),
    theme: 'striped',
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 40 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'left', cellWidth: 50 },
      3: { halign: 'left', cellWidth: 50 },
      4: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineWidth: 0.1,
      lineColor: [200, 200, 200]
    },
    didParseCell: function (data) {
      // Right-align currency columns
      if ([4].includes(data.column.index)) {
        data.cell.styles.halign = 'right';
      }
      // Left-align text columns (seller, buyer)
      if ([2, 3].includes(data.column.index)) {
        data.cell.styles.halign = 'left';
      }
    }
  });

  // Generate filename
  const filename = `Rider_Earnings_Report_${fromDate || 'all'}_${toDate || 'all'}_${now.toISOString().split('T')[0]}.pdf`;
  
  // Save PDF
  doc.save(filename);
  showToast('Earnings report downloaded successfully', 'success');
}

// Utility functions
function formatStatus(status) {
  if (!status) return 'N/A';
  
  const statusMap = {
    'delivered': 'Delivered',
    'completed': 'Completed',
    'in_transit': 'In Transit',
    'picked_up': 'Picked Up',
    'assigned': 'Assigned',
    'accepted_by_rider': 'Accepted',
    'pending': 'Pending',
    'cancelled': 'Cancelled',
    'confirmed': 'Confirmed',
    'prepared': 'Prepared',
    'shipped': 'Shipped'
  };
  
  // Convert to title case if not in map
  const formatted = statusMap[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  return formatted;
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info', duration = 4000) {
  const colors = {
    success: '#28a745',
    error: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
  };
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  const toast = document.createElement('div');
  toast.className = 'toast align-items-center text-white';
  toast.style = `position:fixed;top:20px;right:20px;min-width:300px;z-index:1055;background:${colors[type]};border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);`;
  
  toast.innerHTML = `
    <div class="d-flex align-items-center p-3">
      <i class="${icons[type]} me-2"></i>
      <div class="toast-body flex-grow-1">${message}</div>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast"></button>
    </div>
  `;
  
  document.body.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: duration });
  bsToast.show();
  
  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

// Navigation helper
function navigateTo(page) {
  window.location.href = page;
}

// ================== RIDER STATUS MANAGEMENT ==================
function initStatusToggle(token) {
  // Status toggle button removed - function kept for compatibility but does nothing
  // const btn = document.getElementById('riderStatusToggle');
  // if (!btn) return;
  // // Fetch current status and render
  // fetchRiderStatus(token).then(status => renderRiderStatus(status)).catch(() => renderRiderStatus('offline'));
  // btn.addEventListener('click', async () => {
  //   try {
  //     const current = btn.dataset.status || 'offline';
  //     const next = current === 'available' ? 'offline' : 'available';
  //     const ok = await setRiderStatus(token, next);
  //     if (ok) renderRiderStatus(next);
  //   } catch (e) {
  //     showToast('Failed to toggle status', 'error');
  //   }
  // });
}

async function fetchRiderStatus(token) {
  const res = await fetch('/api/rider/status', { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error('status fetch failed');
  const data = await res.json();
  return (data && data.status) || 'offline';
}

async function setRiderStatus(token, status) {
  const res = await fetch('/api/rider/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
  if (!res.ok) return false;
  return true;
}

function renderRiderStatus(status) {
  // Status toggle button removed - function kept for compatibility but does nothing
  // const btn = document.getElementById('riderStatusToggle');
  // const icon = document.getElementById('riderStatusIcon');
  // const textEl = document.getElementById('riderStatusText');
  // if (btn) btn.dataset.status = status;
  // if (icon) {
  //   if (status === 'available') {
  //     icon.classList.remove('fa-toggle-off');
  //     icon.classList.add('fa-toggle-on');
  //     icon.style.color = '#28a745';
  //   } else {
  //     icon.classList.remove('fa-toggle-on');
  //     icon.classList.add('fa-toggle-off');
  //     icon.style.color = '#6c757d';
  //   }
  // }
  // if (textEl) {
  //   textEl.innerHTML = status === 'available'
  //     ? '<small class="text-muted">Ready for deliveries</small>'
  //     : '<small class="text-muted">Offline</small>';
  // }
}


// Export functions for global use
window.riderDashboard = {
  showToast,
  navigateTo,
  updateStatCard,
  formatTimeAgo
};
