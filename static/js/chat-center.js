(function(){
  const ChatCenter = {
    // Ensure modal exists in DOM
    ensureModal() {
      let modal = document.getElementById('chatCenterModal');
      if (modal) return modal;


      const container = document.getElementById('chatCenterPlaceholder') || document.body;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="modal fade" id="chatCenterModal" tabindex="-1">
          <div class="modal-dialog modal-xl">
            <div class="modal-content">
              <div class="modal-header border-0 pb-2">
                <h5 class="modal-title d-flex align-items-center">
                  <i class="fas fa-comments text-primary me-2"></i>
                  Chat Center
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body p-0">
                <div class="chat-container">
                  <div class="chat-sidebar">
                    <div class="chat-sidebar-header">
                      <h6 class="mb-0">Recent Conversations</h6>
                      <button class="btn btn-outline-primary btn-sm" id="chatWithAdminBtn" onclick="window.ChatCenter && ChatCenter.createAdminChat()" style="display: none;">
                        <i class="fas fa-headset me-1"></i>Chat with Admin
                      </button>
                    </div>
                    <div class="chat-list" id="chatList">
                      <div class="text-center py-4 text-muted">Loading...</div>
                    </div>
                  </div>
                  <div class="chat-window">
                    <div class="chat-window-header" id="chatWindowHeader">
                      <div class="chat-participant-info">
                        <div class="chat-avatar"><i class="fas fa-user-circle"></i></div>
                        <div class="chat-details">
                          <div class="chat-name">Select a conversation</div>
                          <div class="chat-status">Click a chat to start messaging</div>
                        </div>
                      </div>
                      <div class="chat-actions">
                        <button class="btn btn-outline-primary btn-sm" id="chatAdminBtnInModal" style="display: none;" onclick="window.ChatCenter && ChatCenter.createAdminChatFromCurrentChat()" title="Chat with Admin about this order">
                          <i class="fas fa-headset me-1"></i>Chat Admin
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="refreshChatMessages && refreshChatMessages()">
                          <i class="fas fa-sync-alt"></i>
                        </button>
                      </div>
                    </div>
                    <div class="chat-messages" id="chatMessages">
                      <div class="empty-chat-state">
                        <i class="fas fa-comments fa-3x text-muted mb-3"></i>
                        <h6 class="text-muted">Start a conversation</h6>
                        <p class="text-muted mb-0">Select a chat to begin messaging.</p>
                      </div>
                    </div>
                    <div class="chat-input-area" id="chatInputArea" style="display:none;">
                      <div class="chat-input-container">
                        <input type="text" class="form-control" id="chatMessageInput" placeholder="Type your message..." disabled>
                        <button class="btn btn-primary" id="sendMessageBtn" onclick="window.ChatCenter && ChatCenter.sendMessage()" disabled>
                          <i class="fas fa-paper-plane"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      container.appendChild(wrapper);
      return document.getElementById('chatCenterModal');
    },


    currentChatId: null,
    currentOrderNumber: null,
    currentOrderId: null,


    open() {
      const modalEl = this.ensureModal();
      if (!modalEl) {
        console.error('ChatCenter: Modal element not found');
        return;
      }
      try {
        // Check if Bootstrap is available
        if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
          console.error('ChatCenter: Bootstrap Modal not available');
          // Fallback: show modal manually
          modalEl.style.display = 'block';
          modalEl.classList.add('show');
          document.body.classList.add('modal-open');
          const backdrop = document.createElement('div');
          backdrop.className = 'modal-backdrop fade show';
          backdrop.id = 'chatCenterBackdrop';
          document.body.appendChild(backdrop);
          return;
        }
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      } catch (error) {
        console.error('ChatCenter: Error opening modal:', error);
        // Fallback: show modal manually
        modalEl.style.display = 'block';
        modalEl.classList.add('show');
        document.body.classList.add('modal-open');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.id = 'chatCenterBackdrop';
        document.body.appendChild(backdrop);
      }


      // If page defines its own loader, prefer that
      if (typeof window.loadChatList === 'function') {
        setTimeout(() => window.loadChatList(), 10);
        this.bindEnterKey();
        return;
      }


      // Fallback minimal loader
      this.loadChatListFallback();
      this.bindEnterKey();
      
      // Show/hide "Chat with Admin" button based on user role
      this.updateAdminChatButton();
    },
    
    updateAdminChatButton() {
      const adminBtn = document.getElementById('chatWithAdminBtn');
      if (!adminBtn) return;
      
      const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
      const isBuyer = currentUser && (currentUser.role === 'buyer' || currentUser.role === 'user');
      
      if (isBuyer) {
        adminBtn.style.display = 'block';
      } else {
        adminBtn.style.display = 'none';
      }
    },
    
    async createAdminChat() {
      try {
        const token = this.getToken();
        if (!token) {
          alert('Please log in to chat with admin');
          return;
        }
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        
        // Show loading state
        const adminBtn = document.getElementById('chatWithAdminBtn');
        if (adminBtn) {
          adminBtn.disabled = true;
          adminBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Creating...';
        }
        
        // Create admin chat
        const res = await fetch('/api/buyer/chats', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ chat_type: 'admin' })
        });
        
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to create admin chat');
        }
        
        const data = await res.json();
        if (data.success && data.chat) {
          // Reload chat list to show the new admin chat
          await this.loadChatListFallback();
          
          // Select the new admin chat
          setTimeout(() => {
            const chatId = data.chat.id;
            // Get admin name from the chat list
            const chatList = document.getElementById('chatList');
            if (chatList) {
              const chatItems = chatList.querySelectorAll('.chat-list-item');
              for (const item of chatItems) {
                const onclick = item.getAttribute('onclick');
                if (onclick && onclick.includes(`ChatCenter.selectChat(${chatId}`)) {
                  item.click();
                  break;
                }
              }
            }
          }, 500);
        }
      } catch (e) {
        console.error('Error creating admin chat:', e);
        alert(e.message || 'Failed to create admin chat. Please try again.');
      } finally {
        const adminBtn = document.getElementById('chatWithAdminBtn');
        if (adminBtn) {
          adminBtn.disabled = false;
          adminBtn.innerHTML = '<i class="fas fa-headset me-1"></i>Chat with Admin';
        }
      }
    },

    async createAdminChatFromCurrentChat() {
      try {
        const token = this.getToken();
        if (!token) {
          alert('Please log in to chat with admin');
          return;
        }

        if (!this.currentOrderNumber && !this.currentOrderId) {
          alert('No order context available. Please select a conversation with an order first.');
          return;
        }
        
        // Show loading state
        const adminBtn = document.getElementById('chatAdminBtnInModal');
        if (adminBtn) {
          adminBtn.disabled = true;
          adminBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Opening...';
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };

        // Create admin chat with order context
        const res = await fetch('/api/chats/create-with-admin', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            order_id: this.currentOrderId,
            order_number: this.currentOrderNumber
          })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to create admin chat');
        }

        const data = await res.json();
        
        // Handle both response formats (chat_id or chat.id)
        let chatId = null;
        if (data.success) {
          if (data.chat_id) {
            chatId = data.chat_id;
          } else if (data.chat && data.chat.id) {
            chatId = data.chat.id;
          }
        }
        
        if (chatId) {
          // Reload chat list to show the new admin chat
          await this.loadChatListFallback();

          // Select the new admin chat
          setTimeout(() => {
            const chatList = document.getElementById('chatList');
            if (chatList) {
              const chatItems = chatList.querySelectorAll('.chat-list-item');
              for (const item of chatItems) {
                const onclick = item.getAttribute('onclick');
                if (onclick && onclick.includes(`ChatCenter.selectChat(${chatId}`)) {
                  item.click();
                  break;
                }
              }
            }
          }, 500);
        } else if (!data.success) {
          throw new Error(data.error || 'Failed to create admin chat');
        }
      } catch (e) {
        console.error('Error creating admin chat:', e);
        alert(e.message || 'Failed to create admin chat. Please try again.');
      } finally {
        const adminBtn = document.getElementById('chatAdminBtnInModal');
        if (adminBtn) {
          adminBtn.disabled = false;
          adminBtn.innerHTML = '<i class="fas fa-headset me-1"></i>Chat Admin';
        }
      }
    },


    bindEnterKey() {
      const chatInput = document.getElementById('chatMessageInput');
      if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
      }
    },


    getToken() {
      try { return window.AuthManager && AuthManager.getAuthToken ? AuthManager.getAuthToken() : null; } catch(_) { return null; }
    },


    renderChatListItem(c, displayName, userType, orderNumber, profilePic, riderData, shopName='', participantRole='') {
      const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      
      // Build type badge and subtitle for display
      let typeBadge = '';
      let subtitle = '';
      
      if (userType === 'buyer') {
        // For sellers viewing a buyer chat, don't show shop name
        subtitle = '';
      } else if (userType === 'admin') {
        typeBadge = '<span class="badge bg-danger" style="font-size: 0.65rem; padding: 0.2rem 0.4rem;">ADMIN</span>';
        subtitle = '<small class="text-muted d-block">Support Team</small>';
      } else if (userType === 'rider') {
        typeBadge = '<span class="badge bg-success" style="font-size: 0.65rem; padding: 0.2rem 0.4rem;">RIDER</span>';
      } else if (userType === 'seller') {
        typeBadge = '<span class="badge bg-warning text-dark" style="font-size: 0.65rem; padding: 0.2rem 0.4rem;">SELLER</span>';
      } else if (shopName) {
        // For other cases (e.g., buyers viewing sellers)
        typeBadge = `<small class="text-primary">${this.escapeHtml(shopName)}</small>`;
      }
      
      // Get product name from last_message or participant_name for display in order info
      // For riders: don't use participant_name as it might contain rider's name
      // For others: use participant_name or shopName
      let productInfo = '';
      if (riderData) {
        // For riders: use shopName or empty, never participant_name
        productInfo = shopName || '';
      } else {
        // For non-riders: use participant_name or shopName
        productInfo = c.participant_name || shopName || '';
      }
      
      // Escape data for onclick attribute
      const escapedDisplayName = this.escapeHtml(displayName).replace(/'/g, "\\'");
      const escapedOrderNumber = (orderNumber || '').replace(/'/g, "\\'");
      const escapedProductInfo = productInfo.replace(/'/g, "\\'");
      const escapedProfilePic = profilePic ? this.escapeHtml(profilePic).replace(/'/g, "\\'") : '';
      const escapedParticipantRole = (participantRole || '').replace(/'/g, "\\'");
      const orderId = c.order_id || null;
      
      // Build onclick - pass productInfo in shopName parameter for order display
      // pass riderData as JSON string if available, and participant role
      // Store order_id in data attribute for later retrieval
      let onclickData;
      if (riderData) {
        const riderDataStr = JSON.stringify(riderData).replace(/"/g, '&quot;');
        onclickData = `window.ChatCenter && ChatCenter.selectChat(${c.id}, '${escapedDisplayName}', '${escapedOrderNumber}', '${escapedProductInfo}', '${escapedProfilePic}', JSON.parse('${riderDataStr}'), '${escapedParticipantRole}')`;
      } else {
        onclickData = `window.ChatCenter && ChatCenter.selectChat(${c.id}, '${escapedDisplayName}', '${escapedOrderNumber}', '${escapedProductInfo}', '${escapedProfilePic}', null, '${escapedParticipantRole}')`;
      }
      
      // Add data attribute for order_id
      const dataOrderId = orderId ? `data-order-id="${orderId}"` : '';
      
      return `
        <div class="chat-list-item" onclick="${onclickData}" ${dataOrderId || ''}>
          <div class="d-flex align-items-center gap-2 mb-2">
            ${profilePic ? 
              `<img src="${this.escapeHtml(profilePic)}" alt="${this.escapeHtml(displayName)}" class="rounded-circle" style="width: 40px; height: 40px; object-fit: cover; border: 2px solid #e9ecef; flex-shrink: 0;" onerror="this.outerHTML='<div class=\\'rounded-circle text-white d-flex align-items-center justify-content-center\\'style=\\'width:40px;height:40px;font-size:14px;border:2px solid #e9ecef;background:#6c757d;flex-shrink:0\\'>${initials}</div>'">` 
              : `<div class="rounded-circle text-white d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; font-size: 14px; border: 2px solid #e9ecef; background: #6c757d; flex-shrink: 0;">${initials}</div>` 
            }
            <div style="flex: 1; min-width: 0;">
              <div class="chat-participant d-flex justify-content-between align-items-center gap-2">
                <span class="text-truncate">${typeBadge} ${this.escapeHtml(displayName)}</span>
                ${c.unread_count > 0 ? `<span class="chat-unread-badge">${c.unread_count}</span>` : ''}
              </div>
              ${subtitle}
              <div class="chat-preview">${this.escapeHtml(c.last_message || 'No messages yet')}</div>
            </div>
          </div>
          <div class="d-flex justify-content-between align-items-center">
            <div class="chat-time">${c.last_message_time ? this.formatPhilippineTime(c.last_message_time) : 'No messages'}</div>
            ${orderNumber ? `<small class="text-muted">Order #${orderNumber}</small>` : ''}
          </div>
        </div>`;
    },


    async loadChatListFallback() {
      const chatList = document.getElementById('chatList');
      if (!chatList) {
        console.error('Chat list element not found');
        return;
      }
      try {
        const token = this.getToken();
        if (!token) {
          chatList.innerHTML = '<div class="text-center py-4 text-warning"><i class="fas fa-lock me-2"></i>Please log in to view your conversations</div>';
          return;
        }
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Get current user to determine if they're a rider
        const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
        const isRider = currentUser && currentUser.role === 'rider';
        
        // Use different endpoint for riders
        const apiEndpoint = isRider ? '/api/rider/messages/conversations' : '/api/chats';
        
        const res = await fetch(apiEndpoint, { 
          headers,
          credentials: 'include' // Ensure cookies are sent for authentication
        });
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to load chats:', res.status, errorText);
          if (res.status === 401) {
            chatList.innerHTML = '<div class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Authentication required. Please log in again.</div>';
            return;
          }
          chatList.innerHTML = `<div class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Failed to load chats. Please try again later.</div>`;
          return;
        }
        const data = await res.json();
        // Handle different response formats - rider API returns 'conversations', regular API returns 'chats'
        let chats = data.chats || data.conversations || data || [];
        
        // currentUser and isRider already declared above (line 390-391), reuse them
        
        // For riders using the rider API: No filtering needed - API already returns correct conversations
        // For other users using regular API: Filter if needed (but not for riders)
        if (!isRider && currentUser && currentUser.id) {
          // Only apply filtering for non-rider users using the regular /api/chats endpoint
          // (Rider API already handles this server-side)
        }
        
        // Update admin chat button visibility
        this.updateAdminChatButton();
        
        if (chats.length === 0) {
          // Reuse currentUser from above scope
          const isBuyer = currentUser && (currentUser.role === 'buyer' || currentUser.role === 'user');
          
          if (isBuyer) {
            chatList.innerHTML = `
              <div class="text-center py-4 text-muted">
                <p>No conversations yet</p>
                <button class="btn btn-primary btn-sm" onclick="window.ChatCenter && ChatCenter.createAdminChat()">
                  <i class="fas fa-headset me-1"></i>Chat with Admin
                </button>
              </div>
            `;
          } else {
            chatList.innerHTML = '<div class="text-center py-4 text-muted">No conversations yet</div>';
          }
          return;
        }
        chatList.innerHTML = chats.map(c => {
          // Determine if rider should see buyer or seller
          // currentUser and isRider already declared above
          
          let displayName, userType, typeLabel, typeBadge;
          
          if (isRider) {
            // For riders, create TWO separate list items - one for buyer, one for seller
            // Use participant_name if buyer_name is the rider's own name (data issue)
            let buyerName = c.buyer_name || 'Buyer';
            
            // If buyer_name matches current user (rider), use participant_name instead
            // Compare both as strings to handle type mismatch
            if (currentUser && String(currentUser.id) === String(c.buyer_id) && c.participant_name) {
              console.log('Rider detected as buyer_id, using participant_name:', c.participant_name);
              buyerName = c.participant_name;
            }
            // Also check if buyer_name is the same as current user's name (fallback)
            else if (currentUser && c.buyer_name === currentUser.name && c.participant_name) {
              console.log('Buyer name matches rider name, using participant_name:', c.participant_name);
              buyerName = c.participant_name;
            }
            
            const sellerName = c.seller_name || c.shop_name || 'Seller';
            
            // We'll render two items for this conversation
            const buyerItem = this.renderChatListItem(c, buyerName, 'buyer', c.order_number, null, {buyerName, sellerName, buyerId: c.buyer_id, sellerId: c.seller_id, targetType: 'buyer'}, '');
            const sellerItem = this.renderChatListItem(c, sellerName, 'seller', c.order_number, null, {buyerName, sellerName, buyerId: c.buyer_id, sellerId: c.seller_id, targetType: 'seller'}, '');
            
            return buyerItem + sellerItem;
          } else {
            // For sellers: show buyer name
            // For buyers: show seller name with appropriate badge
            // Riders use their separate chat system
            const isSeller = currentUser && currentUser.role === 'seller';
            const isBuyer = currentUser && (currentUser.role === 'buyer' || currentUser.role === 'user');
            const isAdmin = currentUser && currentUser.role === 'admin';
            
            if (isAdmin) {
              // Admin can see chats with buyers, sellers, or riders
              // Determine participant type based on which ID is set
              let participantName, participantType, profilePic, participantRole;
              
              if (c.buyer_id && !c.seller_id && !c.rider_id) {
                // Buyer-admin chat
                participantName = c.buyer_name || c.participant_name || 'Buyer';
                participantType = 'buyer';
                participantRole = 'buyer';
                profilePic = c.buyer_profile_pic || c.profile_picture || null;
              } else if (c.seller_id && !c.buyer_id && !c.rider_id) {
                // Seller-admin chat
                participantName = c.seller_name || c.participant_name || 'Seller';
                participantType = 'seller';
                participantRole = 'seller';
                profilePic = c.seller_profile_pic || c.profile_picture || null;
              } else if (c.rider_id) {
                // Rider-admin chat
                participantName = c.rider_name || c.participant_name || 'Rider';
                participantType = 'rider';
                participantRole = 'rider';
                profilePic = c.profile_picture || null;
              } else if (c.buyer_id && c.seller_id) {
                // This shouldn't happen for admin chats, but handle it
                participantName = c.buyer_name || c.participant_name || 'User';
                participantType = 'buyer';
                participantRole = 'buyer';
                profilePic = c.buyer_profile_pic || c.profile_picture || null;
              } else {
                // Fallback
                participantName = c.participant_name || 'User';
                participantType = 'user';
                participantRole = '';
                profilePic = c.profile_picture || null;
              }
              
              return this.renderChatListItem(c, participantName, participantType, c.order_number, profilePic, null, c.shop_name || '', participantRole);
            } else if (isSeller) {
              // Seller always sees the buyer's name (chat visibility is now restricted to buyer-seller only)
              displayName = c.buyer_name || 'Buyer';
              const shopName = c.shop_name || '';
              const profilePic = c.participant_profile_picture || c.profile_picture || null;
              return this.renderChatListItem(c, displayName, 'buyer', c.order_number, profilePic, null, shopName);
            } else if (isBuyer) {
              // Buyer can see seller chats or admin chats
              if (c.is_admin_chat || c.admin_id) {
                // This is an admin chat
                const adminName = c.admin_name || c.participant_name || 'Admin';
                const profilePic = c.admin_profile_pic || c.profile_picture || null;
                return this.renderChatListItem(c, adminName, 'admin', null, profilePic, null, '', 'admin');
              } else {
                // This is a seller chat
                const sellerName = c.seller_name || c.participant_name || 'Seller';
                const shopName = c.shop_name || '';
                displayName = sellerName;
                const profilePic = c.participant_profile_picture || c.profile_picture || null;
                return this.renderChatListItem(c, displayName, 'seller', c.order_number, profilePic, null, shopName, 'seller');
              }
            } else {
              // Fallback for other roles
              const sellerName = c.seller_name || 'Seller';
              const shopName = c.shop_name || '';
              displayName = shopName ? `${sellerName} (${shopName})` : sellerName;
              const profilePic = c.participant_profile_picture || c.profile_picture || null;
              return this.renderChatListItem(c, displayName, 'shop', c.order_number, profilePic, null, shopName);
            }
          }
        }).join('');
      } catch (e) {
        chatList.innerHTML = `<div class="text-center py-4 text-danger">${this.escapeHtml(e.message)}</div>`;
      }
    },


    async selectChat(chatId, participantName, orderNumber, shopName='', profilePicture='', riderData=null, participantRole='') {
      this.currentChatId = chatId;
      this.currentOrderNumber = orderNumber || null;
      this.currentOrderId = null; // Will be populated if needed from chat data
      
      // Get current user to determine role
      const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
      const isSeller = currentUser && currentUser.role === 'seller';
      const isRider = currentUser && currentUser.role === 'rider';
      const isAdmin = currentUser && currentUser.role === 'admin';
      
      // Update header
      const header = document.getElementById('chatWindowHeader');
      if (header) {
        // Update avatar
        const avatarEl = header.querySelector('.chat-avatar');
        if (avatarEl && profilePicture) {
          const initials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          avatarEl.innerHTML = `<img src="${this.escapeHtml(profilePicture)}" alt="${this.escapeHtml(participantName)}" class="rounded-circle" style="width: 45px; height: 45px; object-fit: cover; border: 2px solid #e9ecef;" onerror="this.outerHTML='<div class=\\'rounded-circle text-white d-flex align-items-center justify-content-center\\'style=\\'width:45px;height:45px;font-size:16px;border:2px solid #e9ecef;background:#6c757d\\'>${initials}</div>'">`;
        }
        
        // Update name with badge based on user role and participant role
        const nameEl = header.querySelector('.chat-details .chat-name');
        if (nameEl) {
          if (isRider && riderData) {
            // Display ONLY the target person (buyer OR seller), not both
            if (riderData.targetType === 'buyer') {
              const buyerBadge = '<span class="badge bg-primary me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">BUYER</span>';
              nameEl.innerHTML = `${buyerBadge}${this.escapeHtml(riderData.buyerName || 'Buyer')}`;
            } else if (riderData.targetType === 'seller') {
              const sellerBadge = '<span class="badge bg-warning text-dark me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">SELLER</span>';
              nameEl.innerHTML = `${sellerBadge}${this.escapeHtml(riderData.sellerName || 'Seller')}`;
            } else {
              nameEl.textContent = participantName;
            }
          } else if (isAdmin) {
            // For admin: show BUYER, SELLER, or RIDER badge depending on participant
            if (participantRole === 'buyer') {
              const buyerBadge = '<span class="badge bg-primary me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">BUYER</span>';
              nameEl.innerHTML = `${buyerBadge}${this.escapeHtml(participantName)}`;
            } else if (participantRole === 'seller') {
              const sellerBadge = '<span class="badge bg-warning text-dark me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">SELLER</span>';
              nameEl.innerHTML = `${sellerBadge}${this.escapeHtml(participantName)}`;
            } else if (participantRole === 'rider' || riderData?.targetType === 'rider') {
              const riderBadge = '<span class="badge bg-success me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">RIDER</span>';
              nameEl.innerHTML = `${riderBadge}${this.escapeHtml(participantName)}`;
            } else {
              // No specific role detected, just show name
              nameEl.textContent = participantName;
            }
          } else if (isSeller) {
            // For sellers: show BUYER or RIDER badge depending on participant
            if (participantRole === 'rider' || riderData?.targetType === 'rider') {
              const riderBadge = '<span class="badge bg-success me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">RIDER</span>';
              nameEl.innerHTML = `${riderBadge}${this.escapeHtml(participantName)}`;
            } else {
              const buyerBadge = '<span class="badge bg-primary me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">BUYER</span>';
              nameEl.innerHTML = `${buyerBadge}${this.escapeHtml(participantName)}`;
            }
          } else {
            // For buyers: show SELLER, RIDER, or ADMIN badge depending on participant
            if (participantRole === 'admin') {
              const adminBadge = '<span class="badge bg-danger me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">ADMIN</span>';
              nameEl.innerHTML = `${adminBadge}${this.escapeHtml(participantName)}`;
            } else if (participantRole === 'rider' || riderData?.targetType === 'rider') {
              const riderBadge = '<span class="badge bg-success me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">RIDER</span>';
              nameEl.innerHTML = `${riderBadge}${this.escapeHtml(participantName)}`;
            } else if (participantRole === 'seller') {
              const sellerBadge = '<span class="badge bg-warning text-dark me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">SELLER</span>';
              nameEl.innerHTML = `${sellerBadge}${this.escapeHtml(participantName)}`;
            } else {
              // No specific role detected, just show name
              nameEl.textContent = participantName;
            }
          }
        }
        
        // Update status with order info and shop name
        const statusEl = header.querySelector('.chat-details .chat-status');
        if (statusEl) {
          if (orderNumber) {
            // Filter out generic text like 'Customer', 'Buyer', etc.
            const filteredShopName = (shopName && !['Customer', 'Buyer', 'User', 'Shop', 'Rider', 'Seller'].includes(shopName.trim())) ? shopName : '';
            
            // For all users: show "Order: {order_number}" or "Order: {order_number} • {shop_name}"
            if (filteredShopName) {
              statusEl.innerHTML = `<small class="text-muted">Order: ${this.escapeHtml(orderNumber)} • ${this.escapeHtml(filteredShopName)}</small>`;
            } else {
              statusEl.innerHTML = `<small class="text-muted">Order: ${this.escapeHtml(orderNumber)}</small>`;
            }
          } else if (participantRole === 'admin') {
            statusEl.innerHTML = '<small class="text-muted"><i class="fas fa-headset me-1"></i>Admin Support</small>';
          } else if (shopName && !['Customer', 'Buyer', 'User', 'Shop', 'Rider', 'Seller'].includes(shopName.trim())) {
            statusEl.innerHTML = `<small class="text-muted">${this.escapeHtml(shopName)}</small>`;
          } else {
            statusEl.innerHTML = '<small class="text-muted">Messaging</small>';
          }
        }
      }
      // Enable input
      const inputArea = document.getElementById('chatInputArea');
      const input = document.getElementById('chatMessageInput');
      const btn = document.getElementById('sendMessageBtn');
      if (inputArea) inputArea.style.display = 'block';
      if (input) input.disabled = false;
      if (btn) btn.disabled = false;


      await this.loadChatMessagesFallback(chatId);
    },


    async loadChatMessagesFallback(chatId) {
      const container = document.getElementById('chatMessages');
      try {
        const token = this.getToken();
        if (!token) {
          container.innerHTML = '<div class="text-center py-4 text-warning"><i class="fas fa-lock me-2"></i>Authentication required</div>';
          return;
        }
        
        // Get current user to determine if they're a rider
        const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
        const isRider = currentUser && currentUser.role === 'rider';
        
        // DEBUG: Log current user info
        console.log('=== CHAT DEBUG: Current User ===', currentUser);
        
        // Also check localStorage
        try {
          const storedUser = localStorage.getItem('auth_user') || localStorage.getItem('user');
          console.log('=== CHAT DEBUG: localStorage user ===', storedUser ? JSON.parse(storedUser) : 'Not found');
          console.log('=== CHAT DEBUG: All localStorage keys ===', Object.keys(localStorage));
        } catch (e) {
          console.log('=== CHAT DEBUG: localStorage error ===', e);
        }
        
        // Use different endpoint for riders
        const messagesEndpoint = isRider ? `/api/rider/messages/${chatId}` : `/api/chats/${chatId}/messages`;
        
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch(messagesEndpoint, { 
          headers,
          credentials: 'include' // Ensure authentication context is sent
        });
        if (!res.ok) {
          if (res.status === 401) throw new Error('Authentication required. Please log in again.');
          if (res.status === 403) throw new Error('Access denied. This conversation is not available to you.');
          throw new Error('Failed to load messages');
        }
        const data = await res.json();
        // Handle different response formats - rider API returns messages directly or in a messages array
        const msgs = data.messages || (Array.isArray(data) ? data : []);
        
        // DEBUG: Log first message structure
        if (msgs.length > 0) {
          console.log('=== CHAT DEBUG: Sample Message ===', msgs[0]);
        }
        if (msgs.length === 0) {
          container.innerHTML = `
            <div class="empty-chat-state">
              <i class="fas fa-comments fa-3x text-muted mb-3"></i>
              <h6 class="text-muted">No messages yet</h6>
              <p class="text-muted mb-0">Start the conversation by sending a message below.</p>
            </div>`;
          return;
        }
        // Get current user once for the map function
        const currentUserForMap = currentUser;
        
        container.innerHTML = msgs.map(m => {
          // Determine if message is from current user
          const senderType = (m.sender_type || '').toLowerCase();
          const isSystem = senderType === 'system';
          
          // Use the current user from outer scope
          
          // Try multiple ways to get current user ID
          let currentUserId = null;
          if (currentUserForMap) {
            currentUserId = currentUserForMap.id || currentUserForMap.user_id || currentUserForMap.userId;
          }
          
          // Fallback: Try to get from localStorage directly (check auth_user key)
          if (!currentUserId) {
            try {
              const storedUser = localStorage.getItem('auth_user') || localStorage.getItem('user');
              if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                console.log('DEBUG: localStorage user object:', parsedUser);
                currentUserId = parsedUser.id || parsedUser.user_id || parsedUser.userId;
              }
            } catch (e) {
              console.warn('Could not parse user from localStorage');
            }
          }
          
          const messageSenderId = m.sender_id || m.user_id;
          
          // DEBUG: Log the comparison
          console.log('Message alignment check:', {
            currentUser: currentUserForMap,
            currentUserId,
            messageSenderId,
            senderType,
            messageContent: m.content,
            match: currentUserId === messageSenderId
          });
          
          // Determine if message is from current user
          let isCurrentUser = false;
          
          // Method 1: Compare user IDs (most reliable)
          if (currentUserId && messageSenderId) {
            isCurrentUser = String(currentUserId) === String(messageSenderId);
          } 
          // Method 2: Fallback to role-based detection (if sender_id not available)
          else {
            // Try to get user role from AuthManager or localStorage
            let userRole = null;
            if (currentUser && currentUser.role) {
              userRole = currentUser.role.toLowerCase();
            } else {
              // Try localStorage (check auth_user key)
              try {
                const storedUser = localStorage.getItem('auth_user') || localStorage.getItem('user');
                if (storedUser) {
                  const parsedUser = JSON.parse(storedUser);
                  userRole = parsedUser.role ? parsedUser.role.toLowerCase() : null;
                }
              } catch (e) {
                // Ignore error
              }
            }
            
            // Check if page has rider-page class (rider dashboard)
            const isRiderPage = document.body.classList.contains('rider-page');
            
            if (userRole === 'rider' && senderType === 'rider') {
              isCurrentUser = true;
            } else if (isRiderPage && senderType === 'rider') {
              // If on rider page and message is from rider, it's your message
              isCurrentUser = true;
            } else if (userRole === 'seller' && senderType === 'seller') {
              isCurrentUser = true;
            } else if (userRole === 'admin' && senderType === 'admin') {
              isCurrentUser = true;
            } else if ((userRole === 'buyer' || userRole === 'user') && (senderType === 'buyer' || senderType === 'user')) {
              isCurrentUser = true;
            }
          }
          
          // Align right for current user's messages, left for others
          const alignment = isCurrentUser ? 'right' : 'left';
          const time = m.created_at ? this.formatPhilippineTime(m.created_at, true) : '';
          
          if (isSystem) {
            return `
              <div class="chat-message-system">
                <div class="chat-message-system-content">${this.escapeHtml(m.content || '')}</div>
              </div>`;
          }
          
          return `
            <div class="chat-message chat-message-${alignment}">
              <div class="chat-message-bubble">
                <div class="chat-message-text">${this.escapeHtml(m.content || '')}</div>
                <div class="chat-message-time">${time}</div>
              </div>
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
      } catch (e) {
        container.innerHTML = `<div class="text-center py-4 text-danger">${this.escapeHtml(e.message)}</div>`;
      }
    },


    async sendMessage() {
      const input = document.getElementById('chatMessageInput');
      if (!input) return;
      const content = input.value.trim();
      if (!content) return;
      
      try {
        const token = this.getToken();
        if (!token) {
          alert('Please log in to send messages');
          return;
        }
        
        let chatId = this.currentChatId;
        
        // If no chat ID exists, check if we have pending chat info and create chat first
        if (!chatId && window.pendingChatInfo) {
          const pendingInfo = window.pendingChatInfo;
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          };
          
          // Get current user to determine which endpoint to use
          const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
          const isSeller = currentUser && currentUser.role === 'seller';
          
          // Use seller-specific endpoint for sellers, or general endpoint for others
          const createEndpoint = isSeller ? '/api/seller/chats' : '/api/chats';
          
          // Create chat conversation
          const createRes = await fetch(createEndpoint, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              order_number: pendingInfo.orderNumber,
              participant_name: pendingInfo.customerName || 'Buyer'
            })
          });
          
          if (!createRes.ok) {
            const errorData = await createRes.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to create chat conversation');
          }
          
          const createData = await createRes.json();
          if (createData.success && createData.chat) {
            chatId = createData.chat.id;
            this.currentChatId = chatId;
            
            // Clear pending info
            window.pendingChatInfo = null;
            
            // Reload chat list to show the new chat
            await this.loadChatListFallback();
            
            // Update the chat header to reflect the new chat
            if (pendingInfo.customerName) {
              const nameEl = document.querySelector('.chat-details .chat-name');
              if (nameEl) {
                const buyerBadge = '<span class="badge bg-primary me-2" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">BUYER</span>';
                nameEl.innerHTML = buyerBadge + this.escapeHtml(pendingInfo.customerName);
              }
            }
          } else {
            throw new Error('Failed to create chat conversation');
          }
        }
        
        if (!chatId) {
          alert('Please select a conversation or wait for chat to be created');
          return;
        }
        
        // Get current user to determine if they're a rider
        const currentUser = window.AuthManager && window.AuthManager.getAuthUser ? window.AuthManager.getAuthUser() : null;
        const isRider = currentUser && currentUser.role === 'rider';
        
        // Use different endpoint for riders
        const sendEndpoint = isRider ? `/api/rider/messages/${chatId}/send` : `/api/chats/${chatId}/messages`;
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        };
        const res = await fetch(sendEndpoint, {
          method: 'POST', 
          headers, 
          credentials: 'include',
          body: JSON.stringify({ content })
        });
        if (!res.ok) {
          if (res.status === 401) throw new Error('Authentication required. Please log in again.');
          if (res.status === 403) throw new Error('Access denied. You cannot send messages to this conversation.');
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to send message');
        }
        input.value = '';
        await this.loadChatMessagesFallback(chatId);
        await this.loadChatListFallback();
      } catch (e) {
        // Show error to user
        console.error('Error sending message:', e);
        try { alert(e.message || 'Failed to send message'); } catch(_) {}
      }
    },



    escapeHtml(text) {
      if (text === null || text === undefined) return '';
      return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c]));
    },
    
    formatPhilippineTime(dateString, timeOnly = false) {
      if (!dateString) return '';
      
      try {
        const date = new Date(dateString);
        
        // Convert to Philippine time (UTC+8)
        const phDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        
        // Get current date in Philippine time for comparison
        const now = new Date();
        const nowPh = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        
        // Format time in 24-hour format (HH:MM)
        const hours = phDate.getHours().toString().padStart(2, '0');
        const minutes = phDate.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        
        if (timeOnly) {
          return timeStr;
        }
        
        // Compare dates (ignore time)
        const phDateOnly = new Date(phDate.getFullYear(), phDate.getMonth(), phDate.getDate());
        const nowPhDateOnly = new Date(nowPh.getFullYear(), nowPh.getMonth(), nowPh.getDate());
        const yesterdayPh = new Date(nowPhDateOnly);
        yesterdayPh.setDate(yesterdayPh.getDate() - 1);
        
        if (phDateOnly.getTime() === nowPhDateOnly.getTime()) {
          return `Today ${timeStr}`;
        } else if (phDateOnly.getTime() === yesterdayPh.getTime()) {
          return `Yesterday ${timeStr}`;
        } else {
          // Format as DD/MM/YYYY HH:MM
          const day = phDate.getDate().toString().padStart(2, '0');
          const month = (phDate.getMonth() + 1).toString().padStart(2, '0');
          const year = phDate.getFullYear();
          return `${day}/${month}/${year} ${timeStr}`;
        }
      } catch (e) {
        console.error('Error formatting Philippine time:', e);
        // Fallback to simple 24-hour format
        const date = new Date(dateString);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        if (timeOnly) {
          return `${hours}:${minutes}`;
        } else {
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year} ${hours}:${minutes}`;
        }
      }
    }
  };


  window.ChatCenter = ChatCenter;
})();
