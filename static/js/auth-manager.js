// Authentication Manager - Unified Version
(function(global) {
  // Prevent double declaration
  if (global.AuthManager) {
    console.warn('⚠️ AuthManager already defined - skipping redefinition');
    return;
  }

  // Storage key aliases for compatibility
  const STORAGE_KEYS = {
    user: ['auth_user', 'user_info', 'loggedInUser', 'logged_in_user'],
    token: ['auth_token', 'jwt_token', 'token']
  };

  // Helper to read first available key
  function readFirst(keys, parser) {
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          return parser ? parser(value) : value;
        } catch (e) {
          console.warn(`Failed to parse ${key}:`, e);
        }
      }
    }
    return null;
  }

  // AuthManager object
  const AuthManager = {
    // Check if user is logged in
    isLoggedIn() {
      return !!(this.getAuthUser() && this.getAuthToken());
    },

    // Get authenticated user
    getAuthUser() {
      return readFirst(STORAGE_KEYS.user, (v) => JSON.parse(v));
    },

    // Get authentication token
    getAuthToken() {
      return readFirst(STORAGE_KEYS.token);
    },

    // Set authentication token
    setAuthToken(token) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('jwt_token', token); // Compatibility
      localStorage.setItem('token', token); // Legacy compatibility for admin pages
    },

    // Set user info
    setUserInfo(user) {
      const userStr = JSON.stringify(user);
      localStorage.setItem('auth_user', userStr);
      localStorage.setItem('user_info', userStr); // Compatibility
    },

    // Logout
    logout() {
      // Remove all known keys
      [...STORAGE_KEYS.user, ...STORAGE_KEYS.token].forEach(k => localStorage.removeItem(k));
      window.location.href = '../Authenticator/login.html';
    },

    // Check if user has role
    hasRole(role) {
      const user = this.getAuthUser();
      return user && user.role === role;
    },

    // Get user info (alias for compatibility)
    getUserInfo() {
      return this.getAuthUser();
    },

    // Is authenticated (alias for compatibility)
    isAuthenticated() {
      return this.isLoggedIn();
    }
  };

  // Expose to global scope
  global.AuthManager = AuthManager;
  console.log('✅ AuthManager loaded successfully');
})(window);
