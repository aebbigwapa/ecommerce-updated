(function(){
  // Optional shim to avoid runtime errors if AuthManager isn't loaded here
  if (typeof window.AuthManager === 'undefined') {
    window.AuthManager = {
      isLoggedIn: function(){ return false; }
    };
  }

  // Message Manager Class (copied from index.html, lightly adapted for globals)
  class MessageManager {
    constructor() {
      this.messages = [];
      this.unreadCount = 0;
      this.messageBtn = document.getElementById('messageBtn');
      this.messageDropdown = document.getElementById('messageDropdown');
      this.messageList = document.getElementById('messageList');
      this.isLoading = false;
      this.hideTimeout = null;
      
      this.init();
    }
    
    async init() {
      this.setupEventListeners();
      
      if (window.AuthManager && typeof AuthManager.isLoggedIn === 'function' && AuthManager.isLoggedIn()) {
        await this.loadMessages();
      } else {
        this.renderUnauthenticatedState();
      }
    }

    setupEventListeners() {
      if (!this.messageBtn || !this.messageDropdown) {
        console.warn('Message elements not found');
        return;
      }

      // If the shared header controller exists, let it manage show/hide to avoid conflicts
      if (window.HeaderUI) {
        // Ensure a proper placeholder is present for empty state
        if (this.messageList && this.messageList.innerHTML.trim() === '') {
          this.messageList.innerHTML = '<div class="message-empty"><i class="fas fa-comments"></i><p>No messages</p><small>Start conversations with sellers about your orders.</small></div>';
        }
        // Only bind mark-all-read; skip visibility handlers (hover/click) to prevent instant hide
        const markAllReadBtn = document.getElementById('markAllMessagesRead');
        if (markAllReadBtn) {
          markAllReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.markAllAsRead();
          });
        }
        return;
      }

      // Always support click/tap to toggle (desktop and mobile)
      this.messageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDropdown();
      });

      document.addEventListener('click', (e) => {
        if (!this.messageBtn.contains(e.target) && 
            !this.messageDropdown.contains(e.target)) {
          this.hideDropdown();
        }
      });

      // Desktop hover enhancement
      if (window.innerWidth > 768) {
        this.messageBtn.addEventListener('mouseenter', () => {
          this.showDropdown();
        });

        this.messageDropdown.addEventListener('mouseenter', () => {
          clearTimeout(this.hideTimeout);
        });

        this.messageBtn.addEventListener('mouseleave', () => {
          this.hideTimeout = setTimeout(() => {
            if (!this.messageDropdown.matches(':hover')) {
              this.hideDropdown();
            }
          }, 100);
        });

        this.messageDropdown.addEventListener('mouseleave', () => {
          this.hideDropdown();
        });
      }

      // Mark all as read button
      const markAllReadBtn = document.getElementById('markAllMessagesRead');
      if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markAllAsRead();
        });
      }
    }

    showDropdown() {
      if (!this.messageDropdown) return;
      
      clearTimeout(this.hideTimeout);
      this.messageDropdown.style.display = 'block';
      this.messageDropdown.style.zIndex = '1060';
      
      if (window.AuthManager && typeof AuthManager.isLoggedIn === 'function' && AuthManager.isLoggedIn()) {
        if (this.messages.length === 0 && !this.isLoading) {
          this.loadMessages();
        }
      } else {
        this.renderUnauthenticatedState();
      }
    }

    hideDropdown() {
      if (this.messageDropdown) {
        this.messageDropdown.style.display = 'none';
      }
    }

    toggleDropdown() {
      if (this.messageDropdown.style.display === 'block') {
        this.hideDropdown();
      } else {
        this.showDropdown();
      }
    }

    async loadMessages() {
      if (this.isLoading) return;
      
      this.isLoading = true;
      
      if (this.messageList) {
        this.messageList.innerHTML = `
          <div class="loading-messages">
            <div class="spinner"></div>
            <p style="margin-top: 10px; font-size: 0.9rem; color: #666;">Loading messages...</p>
          </div>
        `;
      }

      try {
        // Get authentication token
        const token = window.AuthManager ? AuthManager.getAuthToken() : null;
        if (!token) {
          this.renderUnauthenticatedState();
          return;
        }

        // Fetch chat conversations from backend
        const response = await fetch('/api/chats', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            this.renderUnauthenticatedState();
            return;
          }
          throw new Error(`Failed to load chats: ${response.status}`);
        }

        const data = await response.json();
        const chats = data.chats || [];
        
        // Get current user info to determine chat perspective
        const currentUser = window.AuthManager ? AuthManager.getAuthUser() : null;
        const currentUserId = currentUser ? currentUser.id : null;
        
        // Convert chat conversations to message format
        this.messages = chats.map(chat => {
          // Convert UTC time to Philippine Time (GMT+8)
          let lastMessageTime = 'No messages';
          if (chat.last_message_time) {
            const utcDate = new Date(chat.last_message_time);
            // Add 8 hours for Philippine Time
            const phTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
            lastMessageTime = this.formatTimeAgo(phTime);
          }
          
          const isUnread = chat.unread_count && chat.unread_count > 0;
          const shopName = (chat.shop_name || '').trim();
          const sellerName = (chat.seller_name || '').trim();
          const buyerName = (chat.buyer_name || '').trim();
          
          // Determine display name based on user's role
          let displayName = '';
          let displaySubtitle = '';
          
          // Determine chat role and display name based on current user
          let chatType = '';
          let chatTypeIcon = '';
          let roleInChat = 'unknown';
          
          if (currentUserId && chat.seller_id && chat.buyer_id) {
            if (currentUserId == chat.seller_id) {
              // Current user is the seller - show buyer's name
              chatType = 'Seller Chat';
              chatTypeIcon = 'fas fa-store';
              roleInChat = 'seller';
              displayName = buyerName || 'Buyer';
              displaySubtitle = chat.order_number ? `Order: ${chat.order_number}` : '';
            } else if (currentUserId == chat.buyer_id) {
              // Current user is the buyer - show seller name + business name
              chatType = 'Buyer Chat';
              chatTypeIcon = 'fas fa-user';
              roleInChat = 'buyer';
              
              // Format: {Seller Name} {Business Name}
              if (sellerName && shopName && sellerName !== shopName) {
                displayName = `${sellerName} (${shopName})`;
              } else if (shopName) {
                displayName = shopName;
              } else if (sellerName) {
                displayName = sellerName;
              } else {
                displayName = 'Shop';
              }
              
              // Show order below
              displaySubtitle = chat.order_number ? `Order: ${chat.order_number}` : '';
            } else {
              // Fallback
              chatType = 'Chat';
              chatTypeIcon = 'fas fa-comments';
              displayName = shopName || chat.participant_name || 'Chat';
              displaySubtitle = chat.order_number || '';
            }
          } else {
            // Fallback to role-based detection
            const userRole = currentUser ? currentUser.role : 'buyer';
            if (userRole === 'seller') {
              chatType = 'Seller Chat';
              chatTypeIcon = 'fas fa-store';
              roleInChat = 'seller';
              displayName = buyerName || 'Buyer';
            } else {
              chatType = 'Buyer Chat'; 
              chatTypeIcon = 'fas fa-user';
              roleInChat = 'buyer';
              displayName = shopName || sellerName || 'Shop';
            }
            displaySubtitle = chat.order_number ? `Order: ${chat.order_number}` : '';
          }
          
          return {
            id: chat.id,
            sender: displayName,
            subtitle: displaySubtitle,
            preview: chat.last_message || 'No messages yet',
            time: lastMessageTime,
            is_read: !isUnread,
            avatar: this.getAvatarInitials(displayName),
            chat_id: chat.id,
            order_number: chat.order_number,
            shop_name: shopName,
            seller_name: sellerName,
            buyer_name: buyerName,
            unread_count: chat.unread_count || 0,
            chat_type: chatType,
            chat_type_icon: chatTypeIcon,
            role_in_chat: roleInChat,
            seller_id: chat.seller_id,
            buyer_id: chat.buyer_id
          };
        });
        
        this.unreadCount = chats.reduce((total, chat) => total + (chat.unread_count || 0), 0);
        this.updateMessageBadge();
        this.renderMessages();
        
      } catch (error) {
        console.error('Error loading messages:', error);
        this.handleMessageLoadError(error);
      } finally {
        this.isLoading = false;
      }
    }

    handleMessageLoadError(error) {
      if (this.messageList) {
        this.messageList.innerHTML = `
          <div class="message-empty">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Failed to load messages</p>
            <small>${error.message}</small>
            <button onclick="messageManager.loadMessages()" 
                    class="btn btn-primary-custom btn-sm mt-3">
              <i class="fas fa-sync"></i> Retry
            </button>
          </div>
        `;
      }
    }

    renderUnauthenticatedState() {
      if (!this.messageList) return;
      
      this.messageList.innerHTML = `
        <div class="message-empty">
          <i class="fas fa-comments"></i>
          <p>Login to view messages</p>
          <small>Sign in to see your messages and communications</small>
          <a href="/templates/Authenticator/login.html" 
             class="btn btn-primary-custom btn-sm mt-3">
            <i class="fas fa-sign-in-alt"></i> Login
          </a>
        </div>
      `;
    }

    renderMessages() {
      if (!this.messageList) return;

      if (!this.messages || this.messages.length === 0) {
        this.messageList.innerHTML = `
          <div class="message-empty">
            <i class="fas fa-comments"></i>
            <p>No messages</p>
            <small>Start conversations with sellers about your orders</small>
          </div>
        `;
        return;
      }

      this.messageList.innerHTML = this.messages.map(message => `
        <div class="message-item ${message.is_read ? '' : 'unread'}" 
             data-id="${message.id}" 
             data-chat-id="${message.chat_id}"
             data-role-in-chat="${message.role_in_chat}"
             data-seller-id="${message.seller_id || ''}"
             data-buyer-id="${message.buyer_id || ''}"
             onclick="messageManager.openChat(${message.chat_id}, '${this.escapeHtml(message.shop_name || message.sender)}', '${message.order_number || ''}')"
             style="cursor: pointer;">
          <div class="message-avatar">
            ${message.avatar}
          </div>
          <div class="message-content">
            <div class="message-header-row">
              <div class="message-sender">
                ${this.escapeHtml(message.sender)}
                ${message.unread_count > 0 ? `<span class="unread-badge">${message.unread_count}</span>` : ''}
              </div>
              <div class="message-time">${message.time}</div>
            </div>
            ${message.subtitle ? `<div class="message-subtitle" style="font-size: 0.8rem; color: #666; margin: 2px 0;">${this.escapeHtml(message.subtitle)}</div>` : ''}
            <div class="message-preview">${this.escapeHtml(message.preview)}</div>
          </div>
        </div>
      `).join('');
    }

    markAllAsRead() {
      // Mark all chats as read via API
      this.messages.forEach(async (message) => {
        if (!message.is_read && message.chat_id) {
          try {
            const token = window.AuthManager ? AuthManager.getAuthToken() : null;
            if (token) {
              await fetch(`/api/chats/${message.chat_id}/read`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
            }
          } catch (error) {
            console.error('Error marking chat as read:', error);
          }
        }
      });
      
      this.messages.forEach(message => message.is_read = true);
      this.unreadCount = 0;
      this.updateMessageBadge();
      this.renderMessages();
    }
    
    formatTimeAgo(date) {
      // Get current time in Philippine Time (already adjusted by caller)
      const now = new Date();
      // Add 8 hours for Philippine Time
      const phNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
      
      const diffMs = phNow - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      
      // Format date in Philippine locale
      return date.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== phNow.getFullYear() ? 'numeric' : undefined
      });
    }
    
    getAvatarInitials(name) {
      if (!name) return '??';
      const words = name.split(' ');
      if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
      }
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    
    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    updateMessageBadge() {
      // Update message count badge in header
      const badge = this.messageBtn ? this.messageBtn.querySelector('.cart-count') : null;
      if (badge) {
        const cnt = Number(this.unreadCount || 0);
        badge.textContent = cnt > 99 ? '99+' : String(cnt);
        badge.style.display = 'flex';
      }
    }
    
    openChat(chatId, participantName, orderNumber) {
      // Hide the dropdown first
      this.hideDropdown();
      
      // Check if we're on the orders page with chat functionality
      if (typeof selectChat === 'function') {
        // We're on a page with chat functionality (like orders.html)
        const modal = document.getElementById('chatCenterModal');
        if (modal) {
          const bootstrapModal = new bootstrap.Modal(modal);
          bootstrapModal.show();
          setTimeout(() => {
            selectChat(chatId, participantName, orderNumber);
          }, 300);
        }
      } else {
        // Redirect to orders page with chat functionality
        window.location.href = `/templates/Public/orders.html?openChat=${chatId}&participant=${encodeURIComponent(participantName)}&order=${orderNumber || ''}`;
      }
    }
  }

  // Expose globally
  window.MessageManager = MessageManager;
})();
