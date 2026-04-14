/**
 * Dashboard Utilities
 * Shared utility functions for both rider and seller dashboards
 */

class DashboardUtils {
    // Utility functions for consistent behavior across dashboards
    
    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: 2
        }).format(amount || 0);
    }

    static formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static formatDateOnly(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    static formatTimeOnly(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static getStatusBadge(status) {
        const statusMap = {
            'pending': { class: 'bg-warning text-dark', text: 'Pending' },
            'ready': { class: 'bg-info text-white', text: 'Ready for Pickup' },
            'assigned': { class: 'bg-primary text-white', text: 'Assigned to Rider' },
            'shipped': { class: 'bg-success text-white', text: 'Out for Delivery' },
            'delivered': { class: 'bg-success text-white', text: 'Delivered' },
            'cancelled': { class: 'bg-danger text-white', text: 'Cancelled' },
            'accepted': { class: 'bg-primary text-white', text: 'Accepted' },
            'picked_up': { class: 'bg-warning text-dark', text: 'Picked Up' },
            'in_transit': { class: 'bg-info text-white', text: 'In Transit' }
        };

        const statusInfo = statusMap[status] || { class: 'bg-secondary text-white', text: status };
        return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
    }

    static showLoadingState(elementId, isLoading = true) {
        const element = document.getElementById(elementId);
        if (!element) return;

        if (isLoading) {
            element.innerHTML = `
                <div class="d-flex justify-content-center align-items-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Loading...</span>
                </div>
            `;
        }
    }

    static showEmptyState(elementId, title, message, iconClass = 'fas fa-inbox') {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = `
            <div class="text-center py-5">
                <i class="${iconClass} fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">${title}</h5>
                <p class="text-muted">${message}</p>
            </div>
        `;
    }

    static showError(elementId, message = 'An error occurred while loading data.') {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <div>${message}</div>
            </div>
        `;
    }

    static showSuccess(message, duration = 3000) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-success border-0';
        toast.role = 'alert';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-check-circle me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        // Add to toast container
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        container.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast, { delay: duration });
        bsToast.show();

        // Remove after shown
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    static showErrorToast(message, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-danger border-0';
        toast.role = 'alert';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-exclamation-circle me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        container.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast, { delay: duration });
        bsToast.show();

        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    static escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, m => map[m]);
    }

    static async makeApiCall(url, options = {}) {
        try {
            console.log(`Making API call to: ${url}`, options);
            
            // Get auth token
            const token = AuthManager.getAuthToken();
            if (!token) {
                throw new Error('No authentication token found');
            }

            // Default options
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };

            // Merge options
            const finalOptions = {
                ...defaultOptions,
                ...options,
                headers: {
                    ...defaultOptions.headers,
                    ...options.headers
                }
            };

            const response = await fetch(url, finalOptions);
            console.log(`API Response status: ${response.status}`);

            if (response.status === 401) {
                console.warn('Authentication failed, redirecting to login');
                AuthManager.logout();
                return null;
            }

            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type') || '';
            let data;
            
            // Try to parse as JSON, but handle cases where it might be HTML
            try {
                const text = await response.text();
                
                // Check if response looks like HTML (starts with <)
                if (text.trim().startsWith('<')) {
                    console.error('HTML response received instead of JSON:', text.substring(0, 200));
                    throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. This usually means the API endpoint doesn't exist or there's a server error.`);
                }
                
                // Try to parse as JSON
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    console.error('Failed to parse JSON response:', parseError);
                    console.error('Response text:', text.substring(0, 200));
                    throw new Error(`Invalid JSON response from server. Status: ${response.status}. Response: ${text.substring(0, 100)}`);
                }
            } catch (error) {
                // Re-throw if it's already our custom error
                if (error.message.includes('Server returned') || error.message.includes('Invalid JSON')) {
                    throw error;
                }
                // Otherwise, it's an unexpected error
                throw new Error(`Failed to read response: ${error.message}`);
            }

            console.log('API Response data:', data);

            if (!response.ok) {
                const errorMsg = data.error || data.message || `API call failed with status ${response.status}`;
                throw new Error(errorMsg);
            }

            return data;
        } catch (error) {
            console.error(`API call error for ${url}:`, error);
            throw error;
        }
    }

    static updateBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = count || 0;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    static initializeNavigation(currentPage) {
        // Set active navigation item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === currentPage) {
                item.classList.add('active');
            }
        });

        // Mobile menu toggle
        const mobileToggle = document.getElementById('mobileToggle');
        const sidebar = document.getElementById('adminSidebar');
        
        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', function() {
                sidebar.classList.toggle('show');
            });
        }

        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', function() {
                sidebar.classList.toggle('collapsed');
            });
        }
    }

    static setupAutoRefresh(callback, interval = 30000) {
        // Auto refresh every 30 seconds by default
        return setInterval(callback, interval);
    }

    static setupSearch(searchInputId, callback, delay = 500) {
        const searchInput = document.getElementById(searchInputId);
        if (!searchInput) return;

        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                callback(this.value.trim());
            }, delay);
        });
    }

    static setupFilters(filterContainerId, callback) {
        const container = document.getElementById(filterContainerId);
        if (!container) return;

        container.addEventListener('change', function(e) {
            if (e.target.matches('select, input[type="radio"], input[type="checkbox"]')) {
                const filters = {};
                
                // Collect all filter values
                container.querySelectorAll('select, input[type="radio"]:checked, input[type="checkbox"]:checked').forEach(input => {
                    if (input.value) {
                        filters[input.name] = input.value;
                    }
                });

                callback(filters);
            }
        });
    }

    static truncateText(text, maxLength = 50) {
        if (!text || text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    static capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static getTimeAgo(dateString) {
        if (!dateString) return 'Unknown';
        
        const now = new Date();
        const date = new Date(dateString);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }
}

// Make available globally
window.DashboardUtils = DashboardUtils;