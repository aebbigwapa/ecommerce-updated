/**
 * Rider Message Manager
 * Handles rider-specific chat functionality using the rider_messages API
 */

class RiderMessageManager {
  constructor() {
    this.messages = [];
    this.conversations = [];
    this.isDropdownOpen = false;
    this.unreadCount = 0;
    this.currentUser = null;
    this.token = null;
    this.refreshInterval = null;
    
    this.init();
  }

  async init() {
    try {
      console.log('🔧 RiderMessageManager: Starting initialization...');
      
      // Get current user info
      this.currentUser = await this.getCurrentUser();
      this.token = window.AuthManager ? AuthManager.getAuthToken() : null;
      
      console.log('🔧 RiderMessageManager: User:', this.currentUser);
      console.log('🔧 RiderMessageManager: Token exists:', !!this.token);
      
      if (!this.token || !this.currentUser) {
        console.warn('RiderMessageManager: No authentication available');
        this.renderUnauthenticatedState();
        return;
      }
      
      console.log('✅ RiderMessageManager initialized for user:', this.currentUser.name);
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Load initial messages
      await this.loadMessages();
      
      // Start auto-refresh
      this.startAutoRefresh();
      
    } catch (error) {
      console.error('RiderMessageManager initialization error:', error);
    }
  }

  async getCurrentUser() {
    try {
      // Try AuthManager first
      if (window.AuthManager) {
        return AuthManager.getAuthUser();
      }
      
      // Fallback to localStorage
      const userStr = localStorage.getItem('auth_user') || localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  setupEventListeners() {
    console.log('🔧 RiderMessageManager: Setting up event listeners...');
    
    // Message button click
    const messageBtn = document.getElementById('messageBtn');
    console.log('🔧 RiderMessageManager: messageBtn found:', !!messageBtn);
    
    if (messageBtn) {
      messageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔧 RiderMessageManager: Message button clicked');
        this.toggleDropdown();
      });
    }

    // Mark all messages as read
    const markAllReadBtn = document.getElementById('markAllMessagesRead');
    console.log('🔧 RiderMessageManager: markAllMessagesRead found:', !!markAllReadBtn);
    
    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.markAllAsRead();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('messageDropdown');
      const messageBtn = document.getElementById('messageBtn');
      
      if (dropdown && messageBtn && 
          !dropdown.contains(e.target) && 
          !messageBtn.contains(e.target)) {
        this.closeDropdown();
      }
    });
    
    console.log('✅ RiderMessageManager: Event listeners setup complete');
  }

  toggleDropdown() {
    const dropdown = document.getElementById('messageDropdown');
    if (!dropdown) return;

    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    const dropdown = document.getElementById('messageDropdown');
    if (!dropdown) return;

    dropdown.style.display = 'block';
    this.isDropdownOpen = true;
    
    // Mark messages as read when dropdown opens
    setTimeout(() => {
      this.markAllAsRead();
    }, 1000);
  }

  closeDropdown() {
    const dropdown = document.getElementById('messageDropdown');
    if (!dropdown) return;

    dropdown.style.display = 'none';
    this.isDropdownOpen = false;
  }

  async loadMessages() {
    try {
      console.log('🔧 RiderMessageManager: Loading messages...');
      
      if (!this.token) {
        console.warn('RiderMessageManager: No token available');
        return;
      }

      // Fetch rider conversations from backend
      const response = await fetch('/api/rider/messages/conversations', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔧 RiderMessageManager: API response status:', response.status);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.warn('RiderMessageManager: Unauthorized access');
          this.renderUnauthenticatedState();
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔧 RiderMessageManager: API response data:', data);
      
      this.conversations = data.conversations || [];
      
      // Convert conversations to message format for display
      this.messages = this.conversations.map(conv => ({
        id: conv.id,
        chat_id: conv.id,
        participant_name: conv.participant_name,
        participant_type: conv.participant_type,
        order_number: conv.order_number,
        last_message: conv.last_message,
        created_at: conv.last_message_time,
        is_read: conv.unread_count === 0,
        unread_count: conv.unread_count,
        delivery_status: conv.delivery_status
      }));

      console.log('🔧 RiderMessageManager: Processed messages:', this.messages);

      // Update badge count
      this.updateBadgeCount();
      
      // Render messages
      this.renderMessages();
      
      console.log(`✅ Loaded ${this.messages.length} rider conversations`);

    } catch (error) {
      console.error('RiderMessageManager: Error loading messages:', error);
      this.renderErrorState();
    }
  }

  renderMessages() {
    const messageList = document.getElementById('messageList');
    console.log('🔧 RiderMessageManager: messageList element found:', !!messageList);
    
    if (!messageList) {
      console.warn('RiderMessageManager: messageList element not found');
      return;
    }

    if (this.messages.length === 0) {
      console.log('🔧 RiderMessageManager: No messages to display');
      messageList.innerHTML = `
        <div class="text-center py-4">
          <i class="fas fa-comments fa-2x text-muted mb-2"></i>
          <p class="text-muted mb-0">No messages yet</p>
          <small class="text-muted">Start a conversation from your deliveries</small>
        </div>
      `;
      return;
    }

    console.log(`🔧 RiderMessageManager: Rendering ${this.messages.length} messages`);

    const messagesHtml = this.messages.slice(0, 10).map(message => {
      const timeAgo = this.formatTimeAgo(new Date(message.created_at));
      const unreadBadge = message.unread_count > 0 ? 
        `<span class="badge bg-danger rounded-pill ms-auto">${message.unread_count}</span>` : '';
      
      const participantIcon = message.participant_type === 'buyer' ? 'fa-user' : 'fa-store';
      const statusBadge = this.getDeliveryStatusBadge(message.delivery_status);

      return `
        <a href="messages.html?conversation=${message.chat_id}" class="message-item d-flex align-items-start p-3 border-bottom text-decoration-none">
          <div class="message-avatar me-3">
            <div class="avatar-circle bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;">
              <i class="fas ${participantIcon}"></i>
            </div>
          </div>
          <div class="message-content flex-grow-1">
            <div class="d-flex justify-content-between align-items-start mb-1">
              <h6 class="mb-0 text-dark">${escapeHtml(message.participant_name)}</h6>
              ${unreadBadge}
            </div>
            <div class="d-flex justify-content-between align-items-center mb-1">
              <small class="text-muted">Order #${message.order_number}</small>
              ${statusBadge}
            </div>
            <p class="mb-0 text-muted small">${escapeHtml(message.last_message || 'No messages yet')}</p>
            <small class="text-muted">${timeAgo}</small>
          </div>
        </a>
      `;
    }).join('');

    messageList.innerHTML = messagesHtml;
    console.log('✅ RiderMessageManager: Messages rendered successfully');
  }

  getDeliveryStatusBadge(status) {
    if (!status) return '';
    
    const statusConfig = {
      'assigned': { color: 'info', icon: 'fa-clock' },
      'picked_up': { color: 'warning', icon: 'fa-box' },
      'in_transit': { color: 'primary', icon: 'fa-truck' },
      'delivered': { color: 'success', icon: 'fa-check-circle' }
    };
    
    const config = statusConfig[status.toLowerCase()] || { color: 'secondary', icon: 'fa-question' };
    
    return `<span class="badge bg-${config.color} bg-opacity-10 text-${config.color} rounded-pill">
      <i class="fas ${config.icon} me-1"></i>${status}
    </span>`;
  }

  renderErrorState() {
    const messageList = document.getElementById('messageList');
    if (!messageList) return;

    messageList.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-exclamation-triangle fa-2x text-warning mb-2"></i>
        <p class="text-muted mb-0">Error loading messages</p>
        <small class="text-muted">Please try again later</small>
      </div>
    `;
  }

  renderUnauthenticatedState() {
    const messageList = document.getElementById('messageList');
    if (!messageList) return;

    messageList.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-lock fa-2x text-muted mb-2"></i>
        <p class="text-muted mb-0">Please log in to view messages</p>
        <small class="text-muted">Authentication required</small>
      </div>
    `;
  }

  updateBadgeCount() {
    const badge = document.getElementById('messagesBadge');
    const messageBtn = document.getElementById('messageBtn');
    
    this.unreadCount = this.messages.filter(m => !m.is_read).length;
    
    if (badge) {
      badge.textContent = this.unreadCount;
      badge.style.display = this.unreadCount > 0 ? 'inline-block' : 'none';
    }
    
    // Add notification dot to message button if needed
    if (messageBtn) {
      const existingDot = messageBtn.querySelector('.notification-dot');
      if (this.unreadCount > 0 && !existingDot) {
        const dot = document.createElement('span');
        dot.className = 'notification-dot';
        messageBtn.appendChild(dot);
      } else if (this.unreadCount === 0 && existingDot) {
        existingDot.remove();
      }
    }
  }

  async markAllAsRead() {
    try {
      if (!this.token || this.messages.length === 0) return;

      // Mark all conversations as read
      const readPromises = this.messages.map(async (message) => {
        if (!message.is_read && message.chat_id) {
          try {
            await fetch(`/api/rider/messages/${message.chat_id}/read`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
              }
            });
          } catch (error) {
            console.error('Error marking conversation as read:', error);
          }
        }
      });

      await Promise.all(readPromises);
      
      // Update local state
      this.messages.forEach(message => {
        message.is_read = true;
        message.unread_count = 0;
      });
      
      // Update UI
      this.updateBadgeCount();
      this.renderMessages();
      
      console.log('✅ All rider messages marked as read');

    } catch (error) {
      console.error('Error marking all messages as read:', error);
    }
  }

  startAutoRefresh() {
    // Refresh messages every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadMessages();
    }, 30000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  formatTimeAgo(date) {
    if (!date) return 'Just now';
    
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

  destroy() {
    this.stopAutoRefresh();
    this.closeDropdown();
  }
}

// Utility function
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-initialize when DOM is ready (only if not already initialized)
document.addEventListener('DOMContentLoaded', () => {
  if (!window.riderMessageManager && 
      (window.location.pathname.includes('/RiderDashboard/') || 
       window.location.pathname.includes('RiderDashboard'))) {
    window.riderMessageManager = new RiderMessageManager();
    console.log('✅ RiderMessageManager auto-initialized');
  }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RiderMessageManager;
}
