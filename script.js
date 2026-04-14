// Enhanced E-commerce Script with Session & Cart Management
// Global Variables
let cartCount = 0;
let countdownTimer;

// Session Management Utility
class SessionManager {
    static isAuthenticated() {
        const userKeys = ['user_info', 'loggedInUser', 'logged_in_user', 'user', 'auth_user'];
        const tokenKeys = ['jwt_token', 'token', 'auth_token', 'authToken'];
        
        // Check for user data
        for (const key of userKeys) {
            if (localStorage.getItem(key)) return true;
        }
        
        // Check for tokens
        for (const key of tokenKeys) {
            if (localStorage.getItem(key)) return true;
        }
        
        return false;
    }
    
    static getUserInfo() {
        const userKeys = ['user_info', 'loggedInUser', 'logged_in_user', 'user', 'auth_user'];
        
        for (const key of userKeys) {
            const userData = localStorage.getItem(key);
            if (userData) {
                try {
                    return typeof userData === 'string' ? JSON.parse(userData) : userData;
                } catch (e) {
                    return {
                        email: userData,
                        name: userData.split('@')[0]
                    };
                }
            }
        }
        
        return null;
    }
    
    static clearSession() {
        const keysToRemove = [
            'user_info', 'loggedInUser', 'logged_in_user', 'user', 'auth_user',
            'jwt_token', 'token', 'auth_token', 'authToken'
        ];
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

// Enhanced Cart Management
class EnhancedCartManager {
    constructor() {
        this.cartItems = [];
        this.isInitialized = false;
        this.pendingSync = false;
        
        // DOM elements
        this.cartCountElement = document.querySelector('.cart-count');
        this.cartDropdown = document.getElementById('cartDropdown');
        this.cartDropdownItems = document.getElementById('cartDropdownItems');
        this.cartTotal = document.getElementById('cartTotal');
        
        this.init();
    }
    
    init() {
        this.loadCartFromStorage();
        this.setupEventListeners();
        this.updateCartDisplay();
        this.isInitialized = true;
    }
    
    loadCartFromStorage() {
        const isAuthenticated = SessionManager.isAuthenticated();
        const userInfo = SessionManager.getUserInfo();
        
        if (isAuthenticated && userInfo) {
            // Load user-specific cart
            const userCartKey = `cart_${userInfo.email || userInfo.id || 'user'}`;
            const savedCart = localStorage.getItem(userCartKey);
            
            if (savedCart) {
                try {
                    this.cartItems = JSON.parse(savedCart);
                } catch (e) {
                    console.error('Error loading user cart:', e);
                    this.cartItems = [];
                }
            }
            
            // Check for guest cart to merge
            this.mergeGuestCart();
        } else {
            // Load guest cart
            const guestCart = localStorage.getItem('guest_cart');
            if (guestCart) {
                try {
                    this.cartItems = JSON.parse(guestCart);
                } catch (e) {
                    console.error('Error loading guest cart:', e);
                    this.cartItems = [];
                }
            }
        }
    }
    
    mergeGuestCart() {
        const guestCart = localStorage.getItem('guest_cart');
        if (guestCart) {
            try {
                const guestItems = JSON.parse(guestCart);
                
                // Merge guest items with user cart
                guestItems.forEach(guestItem => {
                    const existingItem = this.cartItems.find(item => item.id === guestItem.id);
                    if (existingItem) {
                        existingItem.quantity += guestItem.quantity;
                    } else {
                        this.cartItems.push(guestItem);
                    }
                });
                
                // Save merged cart and remove guest cart
                this.saveCartToStorage();
                localStorage.removeItem('guest_cart');
                
                if (guestItems.length > 0) {
                    this.showNotification(`${guestItems.length} item(s) merged from your previous session`, 'success');
                }
            } catch (e) {
                console.error('Error merging guest cart:', e);
            }
        }
    }
    
    saveCartToStorage() {
        const isAuthenticated = SessionManager.isAuthenticated();
        const userInfo = SessionManager.getUserInfo();
        
        if (isAuthenticated && userInfo) {
            // Save user-specific cart
            const userCartKey = `cart_${userInfo.email || userInfo.id || 'user'}`;
            localStorage.setItem(userCartKey, JSON.stringify(this.cartItems));
            
            // In a real application, sync with backend
            this.syncWithBackend();
        } else {
            // Save as guest cart
            localStorage.setItem('guest_cart', JSON.stringify(this.cartItems));
        }
    }
    
    syncWithBackend() {
        if (!SessionManager.isAuthenticated() || this.pendingSync) return;
        
        // Simulate backend sync (replace with actual API call)
        this.pendingSync = true;
        
        // Example API call structure:
        /*
        fetch('/api/cart/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${typeof AuthManager !== 'undefined' ? AuthManager.getAuthToken() : (localStorage.getItem('auth_token') || localStorage.getItem('jwt_token'))}`
            },
            body: JSON.stringify({
                items: this.cartItems,
                timestamp: Date.now()
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Handle successful sync
                console.log('Cart synced successfully');
            }
        })
        .catch(error => {
            console.error('Cart sync failed:', error);
        })
        .finally(() => {
            this.pendingSync = false;
        });
        */
        
        // Simulate async operation
        setTimeout(() => {
            this.pendingSync = false;
        }, 1000);
    }
    
    addItem(product) {
        // Validate product data
        if (!product.id || !product.name || !product.price) {
            console.error('Invalid product data:', product);
            return false;
        }
        
        const existingItem = this.cartItems.find(item => item.id === product.id);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.cartItems.push({
                id: product.id,
                name: product.name,
                price: parseFloat(product.price),
                originalPrice: product.originalPrice ? parseFloat(product.originalPrice) : null,
                image: product.image,
                quantity: 1,
                addedAt: Date.now()
            });
        }
        
        this.saveCartToStorage();
        this.updateCartDisplay();
        
        return true;
    }
    
    removeItem(productId) {
        const itemIndex = this.cartItems.findIndex(item => item.id === productId);
        
        if (itemIndex > -1) {
            const removedItem = this.cartItems[itemIndex];
            this.cartItems.splice(itemIndex, 1);
            this.saveCartToStorage();
            this.updateCartDisplay();
            
            this.showNotification(`${removedItem.name} removed from cart`, 'info');
            return true;
        }
        
        return false;
    }
    
    updateQuantity(productId, newQuantity) {
        const item = this.cartItems.find(item => item.id === productId);
        
        if (item) {
            if (newQuantity <= 0) {
                this.removeItem(productId);
            } else {
                item.quantity = newQuantity;
                this.saveCartToStorage();
                this.updateCartDisplay();
            }
            return true;
        }
        
        return false;
    }
    
    clearCart() {
        this.cartItems = [];
        this.saveCartToStorage();
        this.updateCartDisplay();
        this.showNotification('Cart cleared', 'info');
    }
    
    getItemCount() {
        return this.cartItems.reduce((total, item) => total + item.quantity, 0);
    }
    
    getTotal() {
        return this.cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
    }
    
    updateCartDisplay() {
        if (!this.isInitialized) return;
        
        // Update cart count badge
        const itemCount = this.getItemCount();
        if (this.cartCountElement) {
            this.cartCountElement.textContent = itemCount;
            
            if (itemCount > 0) {
                this.cartCountElement.classList.add('bounce');
                setTimeout(() => {
                    this.cartCountElement.classList.remove('bounce');
                }, 600);
            }
        }
        
        // Update dropdown content
        this.updateCartDropdown();
    }
    
    updateCartDropdown() {
        if (!this.cartDropdownItems) return;
        
        if (this.cartItems.length === 0) {
            this.cartDropdownItems.innerHTML = `
                <div class="cart-empty-message">
                    <i class="fas fa-shopping-bag"></i>
                    <p>Your cart is empty</p>
                    <a href="#categories" class="btn btn-primary-custom">Start Shopping</a>
                </div>
            `;
            
            if (document.getElementById('cartDropdownFooter')) {
                document.getElementById('cartDropdownFooter').style.display = 'none';
            }
        } else {
            this.cartDropdownItems.innerHTML = this.cartItems.map(item => `
                <div class="cart-item" data-id="${item.id}">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image" 
                         onerror="this.src='https://via.placeholder.com/60x60/f0f0f0/666?text=IMG'">
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">₱${item.price.toFixed(2)}</div>
                        <div class="cart-item-quantity">Qty: ${item.quantity}</div>
                    </div>
                    <button class="cart-item-remove" onclick="cartManager.removeItem('${item.id}')" 
                            title="Remove item">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
            
            // Update total
            if (this.cartTotal) {
                this.cartTotal.textContent = `₱${this.getTotal().toFixed(2)}`;
            }
            
            if (document.getElementById('cartDropdownFooter')) {
                document.getElementById('cartDropdownFooter').style.display = 'block';
            }
        }
    }
    
    setupEventListeners() {
        const cartBtn = document.getElementById('cartBtn');
        if (!cartBtn || !this.cartDropdown) return;
        
        let hoverTimeout;
        
        // Desktop hover behavior
        if (window.innerWidth > 768) {
            cartBtn.addEventListener('mouseenter', () => {
                clearTimeout(hoverTimeout);
                this.showCartDropdown();
            });
            
            cartBtn.addEventListener('mouseleave', () => {
                hoverTimeout = setTimeout(() => {
                    this.hideCartDropdown();
                }, 300);
            });
            
            this.cartDropdown.addEventListener('mouseenter', () => {
                clearTimeout(hoverTimeout);
            });
            
            this.cartDropdown.addEventListener('mouseleave', () => {
                hoverTimeout = setTimeout(() => {
                    this.hideCartDropdown();
                }, 300);
            });
        } else {
            // Mobile tap behavior
            cartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                if (this.cartDropdown.style.display === 'block') {
                    this.hideCartDropdown();
                } else {
                    this.showCartDropdown();
                }
            });
            
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!cartBtn.contains(e.target) && !this.cartDropdown.contains(e.target)) {
                    this.hideCartDropdown();
                }
            });
        }
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 768) {
                // Mobile mode
                this.cartDropdown.style.position = 'fixed';
            } else {
                // Desktop mode
                this.cartDropdown.style.position = 'absolute';
            }
        });
        
        // Notification dropdown handling
        const notificationBtn = document.getElementById('notificationBtn');
        const notificationDropdown = document.getElementById('notificationDropdown');

        if (notificationBtn && notificationDropdown) {
            // Remove existing click listener
            notificationBtn.replaceWith(notificationBtn.cloneNode(true));
            const newNotificationBtn = document.getElementById('notificationBtn');

            // Add hover events for desktop
            if (window.innerWidth > 768) {
                let hoverTimeout;

                newNotificationBtn.addEventListener('mouseenter', () => {
                    clearTimeout(hoverTimeout);
                    notificationDropdown.style.display = 'block';
                });

                notificationDropdown.addEventListener('mouseenter', () => {
                    clearTimeout(hoverTimeout);
                });

                newNotificationBtn.addEventListener('mouseleave', () => {
                    hoverTimeout = setTimeout(() => {
                        if (!notificationDropdown.matches(':hover')) {
                            notificationDropdown.style.display = 'none';
                        }
                    }, 100);
                });

                notificationDropdown.addEventListener('mouseleave', () => {
                    hoverTimeout = setTimeout(() => {
                        notificationDropdown.style.display = 'none';
                    }, 100);
                });
            } else {
                // Mobile click behavior
                newNotificationBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isVisible = notificationDropdown.style.display === 'block';
                    notificationDropdown.style.display = isVisible ? 'none' : 'block';
                });

                // Close on outside click for mobile
                document.addEventListener('click', (e) => {
                    if (!newNotificationBtn.contains(e.target) && 
                        !notificationDropdown.contains(e.target)) {
                        notificationDropdown.style.display = 'none';
                    }
                });
            }
        }
    }
    
    showCartDropdown() {
        if (this.cartDropdown) {
            this.cartDropdown.style.display = 'block';
            this.updateCartDropdown();
        }
    }
    
    hideCartDropdown() {
        if (this.cartDropdown) {
            this.cartDropdown.style.display = 'none';
        }
    }
    
    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.toast').forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle', 
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas ${icons[type] || icons.info}"></i>
                <span>${message}</span>
            </div>
            <button onclick="this.parentElement.remove()" 
                    style="background: none; border: none; color: inherit; font-size: 1.2rem; cursor: pointer; margin-left: auto;">&times;</button>
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 4000);
    }
}

// Initialize cart manager globally
let cartManager;

// Main initialization function
function initializeApp() {
    setupEventListeners();
    startCountdownTimer();
    initializeAnimations();
    handleMobileMenu();
    
    // Initialize enhanced cart manager
    cartManager = new EnhancedCartManager();
    
    // Setup authentication-dependent features
    setupAuthenticationFeatures();
}

// Authentication features setup
function setupAuthenticationFeatures() {
    const isAuthenticated = SessionManager.isAuthenticated();
    const userInfo = SessionManager.getUserInfo();
    
    // Setup protected links
    setupProtectedLinks();
    
    // Handle pending cart items after login
    handlePendingCartItems();
    
    // Update UI based on auth status
    updateAuthUI(isAuthenticated, userInfo);
}

// Setup protected links that require authentication
function setupProtectedLinks() {
    const protectedSelectors = [
        'a[href*="cart.html"]',
        'a[href*="checkout.html"]',
        'a[href*="profile.html"]',
        'a[href*="orders.html"]',
        'a[href*="wishlist.html"]',
        'a[href*="become-seller.html"]',
        'a[href*="become-rider.html"]',
        '.btn-checkout',
        '.btn-view-cart'
    ];
    
    protectedSelectors.forEach(selector => {
        document.addEventListener('click', (e) => {
            const element = e.target.closest(selector);
            if (element && !SessionManager.isAuthenticated()) {
                e.preventDefault();
                
                const message = getProtectedLinkMessage(element.href || element.className);
                const proceed = confirm(message + ' Do you want to login now?');
                
                if (proceed) {
                    // Store intended destination
                    sessionStorage.setItem('redirect_after_login', window.location.href);
                    window.location.href = '/templates/Authenticator/login.html';
                }
            }
        });
    });
}

function getProtectedLinkMessage(linkInfo) {
    if (linkInfo.includes('cart') || linkInfo.includes('checkout')) {
        return 'Please login to access your cart.';
    } else if (linkInfo.includes('profile') || linkInfo.includes('orders') || linkInfo.includes('wishlist')) {
        return 'Please login to access your account.';
    } else if (linkInfo.includes('seller')) {
        return 'Please login to apply as a seller.';
    } else if (linkInfo.includes('rider')) {
        return 'Please login to apply as a rider.';
    }
    return 'Please login to access this feature.';
}

// Handle cart items that were pending during login
function handlePendingCartItems() {
    const pendingItem = sessionStorage.getItem('pending_cart_item');
    if (pendingItem && SessionManager.isAuthenticated()) {
        try {
            const product = JSON.parse(pendingItem);
            if (cartManager.addItem(product)) {
                cartManager.showNotification(`${product.name} added to your cart!`, 'success');
            }
            sessionStorage.removeItem('pending_cart_item');
        } catch (e) {
            console.error('Error processing pending cart item:', e);
        }
    }
}

// Update authentication UI
function updateAuthUI(isAuthenticated, userInfo) {
    const authLinks = document.getElementById('authLinks');
    const roleDropdownMenu = document.getElementById('roleDropdownMenu');
    
    if (!authLinks) return;
    
    if (isAuthenticated && userInfo) {
        const userName = userInfo.name || userInfo.email?.split('@')[0] || 'User';
        const userEmail = userInfo.email || '';
        
        authLinks.innerHTML = `
            <div class="dropdown">
                <a class="action-btn user-btn dropdown-toggle" href="#" id="userDropdown" 
                   role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
                </a>
                <ul class="dropdown-menu dropdown-menu-end user-dropdown" aria-labelledby="userDropdown">
                    <li class="user-info">
                        <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <h6>${userName}</h6>
                            <small>${userEmail}</small>
                        </div>
                    </li>
                    <li><a class="dropdown-item" href="/templates/Public/profile.html">
                        <i class="fas fa-user-circle me-2"></i>My Profile</a></li>
                    <li><a class="dropdown-item" href="/templates/Public/orders.html">
                        <i class="fas fa-box me-2"></i>My Orders</a></li>
                    <li><a class="dropdown-item" href="/templates/Public/wishlist.html">
                        <i class="fas fa-heart me-2"></i>Wishlist</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-danger" href="#" id="logoutBtn">
                        <i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
                </ul>
            </div>
        `;
        
        // Setup logout handler
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
        
        // Setup role-based menu
        if (roleDropdownMenu) {
            updateRoleDropdown(roleDropdownMenu, userInfo.role);
        }
    } else {
        // User not logged in
        authLinks.innerHTML = `
            <a href="/templates/Authenticator/login.html" class="action-btn user-btn" id="userIcon">
                <i class="fas fa-user"></i>
            </a>
        `;
        
        if (roleDropdownMenu) {
            roleDropdownMenu.innerHTML = `
                <li><a class="dropdown-item" href="/templates/Public/become-seller.html">
                    <i class="fas fa-user-plus me-2"></i>Become a Seller</a></li>
                <li><a class="dropdown-item" href="/templates/Public/become-rider.html">
                    <i class="fas fa-motorcycle me-2"></i>Become a Rider</a></li>
            `;
        }
    }
}

function updateRoleDropdown(roleDropdownMenu, userRole) {
    if (userRole === 'seller') {
        roleDropdownMenu.innerHTML = `
            <li><a class="dropdown-item" href="/templates/SellerDashboard/sellerdashboard.html">
                <i class="fas fa-store me-2"></i>Seller Dashboard</a></li>
        `;
    } else if (userRole === 'rider') {
        roleDropdownMenu.innerHTML = `
            <li><a class="dropdown-item" href="/templates/RiderDashboard/rider-dashboard.html">
                <i class="fas fa-bicycle me-2"></i>Rider Dashboard</a></li>
        `;
    } else {
        roleDropdownMenu.innerHTML = `
            <li><a class="dropdown-item" href="/templates/Public/become-seller.html">
                <i class="fas fa-user-plus me-2"></i>Become a Seller</a></li>
            <li><a class="dropdown-item" href="/templates/Public/become-rider.html">
                <i class="fas fa-motorcycle me-2"></i>Become a Rider</a></li>
        `;
    }
}

// Handle logout
function handleLogout(e) {
    e.preventDefault();
    
    if (confirm('Are you sure you want to logout?')) {
        // Clear session data
        SessionManager.clearSession();
        
        // Clear cart data
        if (cartManager) {
            cartManager.clearCart();
        }
        
        // Show notification
        showNotification('Logged out successfully', 'success');
        
        // Reload page to reset UI
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Add to cart buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.add-to-cart')) {
            e.preventDefault();
            e.stopPropagation();
            
            const button = e.target.closest('.add-to-cart');
            const product = {
                id: button.dataset.id,
                name: button.dataset.name,
                price: button.dataset.price,
                originalPrice: button.dataset.originalPrice,
                image: button.dataset.image
            };
            
            handleAddToCart(product, button);
        }
    });
    
    // Notification and message buttons
    document.getElementById('notificationBtn')?.addEventListener('click', () => {
        showNotification('Notifications feature coming soon!', 'info');
    });
    
    document.getElementById('messageBtn')?.addEventListener('click', () => {
        showNotification('Messages feature coming soon!', 'info');
    });
    
    // Newsletter form
    setupNewsletterForm();
    
    // Product actions (wishlist, quick view)
    setupProductActions();
    
    // Smooth scrolling
    setupSmoothScrolling();
    
    // Scroll handling
    window.addEventListener('scroll', handleScroll);
    
    // Mobile menu
    handleMobileMenu();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleAddToCart(product, button) {
    // Validate product data
    if (!product.id || !product.name || !product.price) {
        showNotification('Invalid product data', 'error');
        return;
    }
    
    // Check authentication for cart access
    if (!SessionManager.isAuthenticated()) {
        const proceed = confirm('Please login to add items to your cart. Do you want to login now?');
        if (proceed) {
            // Store product for after login
            sessionStorage.setItem('pending_cart_item', JSON.stringify(product));
            window.location.href = '/templates/Authenticator/login.html';
        }
        return;
    }
    
    // Add to cart
    if (cartManager && cartManager.addItem(product)) {
        animateAddToCart(button);
        cartManager.showNotification(`${product.name} added to cart!`, 'success');
    } else {
        showNotification('Failed to add item to cart', 'error');
    }
}

function animateAddToCart(button) {
    const originalContent = button.innerHTML;
    const originalStyle = {
        background: button.style.background,
        color: button.style.color,
        transform: button.style.transform
    };
    
    // Success animation
    button.innerHTML = '<i class="fas fa-check"></i>';
    button.style.background = 'var(--accent-coral)';
    button.style.color = 'white';
    button.style.transform = 'scale(1.1)';
    
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.style.background = originalStyle.background;
        button.style.color = originalStyle.color;
        button.style.transform = originalStyle.transform;
    }, 1200);
}

// Newsletter form setup
function setupNewsletterForm() {
    const newsletterForm = document.querySelector('.newsletter-form');
    if (!newsletterForm) return;
    
    const submitBtn = newsletterForm.querySelector('.btn-newsletter');
    const emailInput = newsletterForm.querySelector('input[type="email"]');
    
    if (submitBtn && emailInput) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            if (validateEmail(email)) {
                // Simulate newsletter subscription
                showNotification('Thank you for subscribing to our newsletter!', 'success');
                emailInput.value = '';
            } else {
                showNotification('Please enter a valid email address.', 'error');
            }
        });
        
        // Enter key support
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
    }
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Product actions (wishlist, quick view)
function setupProductActions() {
    document.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.product-actions .action-btn:not(.add-to-cart)');
        if (!actionBtn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const icon = actionBtn.querySelector('i');
        
        if (icon.classList.contains('fa-heart')) {
            // Toggle wishlist
            if (!SessionManager.isAuthenticated()) {
                const proceed = confirm('Please login to manage your wishlist. Do you want to login now?');
                if (proceed) {
                    window.location.href = '/templates/Authenticator/login.html';
                }
                return;
            }
            
            if (icon.classList.contains('fas')) {
                icon.classList.replace('fas', 'far');
                showNotification('Removed from wishlist', 'info');
            } else {
                icon.classList.replace('far', 'fas');
                showNotification('Added to wishlist', 'success');
            }
        } else if (icon.classList.contains('fa-eye')) {
            // Quick view
            showNotification('Quick view feature coming soon!', 'info');
        }
    });
}

// Smooth scrolling setup
function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            
            const targetId = anchor.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const offsetTop = targetElement.offsetTop - 80; // Account for fixed header
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Countdown timer
function startCountdownTimer() {
    const days = document.getElementById('days');
    const hours = document.getElementById('hours');
    const minutes = document.getElementById('minutes');
    const seconds = document.getElementById('seconds');
    
    if (!days || !hours || !minutes || !seconds) return;
    
    // Set target date (2 days from now plus current time)
    const targetDate = new Date().getTime() + (2 * 24 * 60 * 60 * 1000) + (14 * 60 * 60 * 1000) + (28 * 60 * 1000) + (45 * 1000);
    
    countdownTimer = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;
        
        if (distance < 0) {
            clearInterval(countdownTimer);
            // Sale ended
            document.querySelector('.flash-sale-section')?.classList.add('sale-ended');
            return;
        }
        
        const d = Math.floor(distance / (1000 * 60 * 60 * 24));
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        
        days.textContent = String(d).padStart(2, '0');
        hours.textContent = String(h).padStart(2, '0');
        minutes.textContent = String(m).padStart(2, '0');
        seconds.textContent = String(s).padStart(2, '0');
    }, 1000);
}

// Animation initialization
function initializeAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    document.querySelectorAll('.sale-product-card, .category-card, .section-header').forEach(el => {
        observer.observe(el);
    });
}

// Mobile menu handling
function handleMobileMenu() {
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    
    if (navbarToggler && navbarCollapse) {
        // Close mobile menu when clicking on links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navbarCollapse.classList.remove('show');
            });
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 992 && navbarCollapse) {
            navbarCollapse.classList.remove('show');
        }
    });
}

// Scroll handling
function handleScroll() {
    const scrollTop = window.pageYOffset;
    const navbar = document.querySelector('.main-header');
    
    if (navbar) {
        if (scrollTop > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    // Escape key handling
    if (e.key === 'Escape') {
        // Close cart dropdown
        if (cartManager && cartManager.cartDropdown.style.display === 'block') {
            cartManager.hideCartDropdown();
        }
        
        // Close mobile menu
        const navbarCollapse = document.querySelector('.navbar-collapse.show');
        if (navbarCollapse) {
            navbarCollapse.classList.remove('show');
        }
    }
    
    // Ctrl/Cmd + K for search (if implemented)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.focus();
        }
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        </div>
        <button onclick="this.parentElement.remove()" 
                style="background: none; border: none; color: inherit; font-size: 1.2rem; cursor: pointer; margin-left: auto;">&times;</button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 4000);
}

// Utility functions
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

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Performance optimization
function optimizeImages() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
        // Add loading lazy for better performance
        if (!img.hasAttribute('loading')) {
            img.setAttribute('loading', 'lazy');
        }
        
        // Handle image load errors
        img.addEventListener('error', function() {
            if (!this.hasAttribute('data-error-handled')) {
                this.setAttribute('data-error-handled', 'true');
                this.src = 'https://via.placeholder.com/400x400/f0f0f0/666?text=Image+Not+Found';
            }
        });
    });
}

// Local storage cleanup
function cleanupLocalStorage() {
    const keysToCheck = [
        'guest_cart',
        'cart_user',
        'old_cart_data',
        'temp_session'
    ];
    
    keysToCheck.forEach(key => {
        const data = localStorage.getItem(key);
        if (data) {
            try {
                const parsedData = JSON.parse(data);
                // Remove old data (older than 30 days)
                if (parsedData.timestamp && Date.now() - parsedData.timestamp > 30 * 24 * 60 * 60 * 1000) {
                    localStorage.removeItem(key);
                }
            } catch (e) {
                // Invalid data, remove it
                localStorage.removeItem(key);
            }
        }
    });
}

// Page visibility handling
function handleVisibilityChange() {
    if (document.hidden) {
        // Page is hidden, pause timers
        if (countdownTimer) {
            clearInterval(countdownTimer);
        }
    } else {
        // Page is visible, resume timers
        startCountdownTimer();
    }
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript Error:', e.error);
    
    // Don't show error notifications to users in production
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
        showNotification('A JavaScript error occurred. Check console for details.', 'error');
    }
});

// Unhandled promise rejection handling
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    e.preventDefault(); // Prevent default browser behavior
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Initialize main application
        initializeApp();
        
        // Optimize images
        optimizeImages();
        
        // Cleanup old data
        cleanupLocalStorage();
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Handle storage events (for multi-tab sync)
        window.addEventListener('storage', function(e) {
            if (e.key && e.key.includes('cart') && cartManager) {
                // Cart was updated in another tab, reload
                cartManager.loadCartFromStorage();
                cartManager.updateCartDisplay();
            }
        });
        
        // Check for redirect after login
        const redirectUrl = sessionStorage.getItem('redirect_after_login');
        if (redirectUrl && SessionManager.isAuthenticated()) {
            sessionStorage.removeItem('redirect_after_login');
            // Optional: redirect to intended page
            // window.location.href = redirectUrl;
        }
        
        console.log('Enhanced e-commerce app initialized successfully');
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showNotification('Application initialization failed. Please refresh the page.', 'error');
    }
});

// Service Worker Registration (for PWA capabilities)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Uncomment when you have a service worker file
        /*
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
        */
    });
}

// Export for global access
window.EcommerceApp = {
    cartManager: () => cartManager,
    SessionManager,
    showNotification,
    initializeApp
};

// Legacy support for existing code
window.openCart = () => cartManager?.showCartDropdown();
window.closeCart = () => cartManager?.hideCartDropdown();
window.addItemToCart = (product) => cartManager?.addItem(product);