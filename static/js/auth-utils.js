/**
 * Authentication Utilities
 * Handles form validation, password strength checking, and real-time error display
 */

class AuthUtils {
    constructor() {
        this.passwordRequirements = {
            minLength: 8,
            hasUppercase: /[A-Z]/,
            hasLowercase: /[a-z]/,
            hasNumbers: /\d/,
            hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/
        };
        
        this.init();
    }

    init() {
        // Initialize event listeners when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        // Email validation
        const emailInputs = document.querySelectorAll('input[type="email"]');
        emailInputs.forEach(input => {
            input.addEventListener('input', (e) => this.validateEmail(e.target));
            input.addEventListener('blur', (e) => this.validateEmail(e.target));
        });

        // Password validation and strength checking
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
            if (input.dataset.skipPasswordValidation === 'true') {
                return;
            }
            input.addEventListener('input', (e) => {
                const form = e.target.closest('form');
                const isLoginForm = form && form.id === 'loginForm';
                
                // For login form, only validate on blur, not while typing
                if (isLoginForm) {
                    // Just clear error if user is typing
                    if (e.target.value) {
                        this.clearMessages(e.target);
                    } else {
                        this.validatePassword(e.target);
                    }
                } else {
                    // For registration, validate while typing
                    this.validatePassword(e.target);
                    if (e.target.id === 'password') {
                        this.checkPasswordStrength(e.target);
                    }
                }
            });
            // Validate on blur for login form
            input.addEventListener('blur', (e) => {
                this.validatePassword(e.target);
            });
        });

        // Confirm password validation
        const confirmPasswordInput = document.getElementById('confirmPassword');
        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', (e) => this.validatePasswordMatch(e.target));
        }

        // Name validation
        const nameInput = document.getElementById('name');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => this.validateName(e.target));
            nameInput.addEventListener('blur', (e) => this.validateName(e.target));
        }

        // Password visibility toggles (only on login/register pages to avoid conflicts with page-specific handlers)
        const passwordToggles = document.querySelectorAll('#loginForm .password-toggle, #registerForm .password-toggle, .password-toggle');
        passwordToggles.forEach(toggle => {
            // Remove any existing onclick handlers to avoid conflicts
            if (toggle.hasAttribute('onclick')) {
                toggle.removeAttribute('onclick');
            }
            // Add event listener (use capture phase to ensure it runs before any other handlers)
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePasswordVisibility(toggle);
            }, true);
        });

        // Form submissions (only for login/register forms)
        const forms = Array.from(document.querySelectorAll('.auth-form'))
            .filter(f => ['loginForm', 'registerForm'].includes(f.id));
        forms.forEach(form => {
            form.addEventListener('submit', (e) => this.handleFormSubmission(e));
        });

        // Real-time form validation only for login/register forms
        this.setupRealTimeValidation();
    }

    setupRealTimeValidation() {
        const inputs = document.querySelectorAll('#loginForm .form-control, #registerForm .form-control');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.validateFormInRealTime());
            input.addEventListener('blur', () => this.validateFormInRealTime());
        });
    }

    validateEmail(input) {
        const email = input.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        this.clearMessages(input);
        
        if (!email) {
            this.showError(input, 'Email is required');
            return false;
        }
        
        if (!emailRegex.test(email)) {
            this.showError(input, 'Please enter a valid email address.');
            return false;
        }
        
        this.showSuccess(input, 'Valid email address');
        return true;
    }

    validatePassword(input) {
        const password = input.value;
        const form = input.closest('form');
        const isLoginForm = form && form.id === 'loginForm';
        
        this.clearMessages(input);
        
        if (!password) {
            this.showError(input, 'Password is required.');
            return false;
        }
        
        // For login form, only check if password exists (no complexity requirements)
        if (isLoginForm) {
            // Don't show success message, just clear any errors
            this.clearMessages(input);
            return true;
        }
        
        // For registration form, check password complexity
        const { minLength, hasUppercase, hasLowercase, hasNumbers, hasSpecialChars } = this.passwordRequirements;
        const errors = [];
        
        if (password.length < minLength) {
            errors.push('At least 8 characters');
        }
        
        if (!hasUppercase.test(password)) {
            errors.push('One uppercase letter');
        }
        
        if (!hasLowercase.test(password)) {
            errors.push('One lowercase letter');
        }
        
        if (!hasNumbers.test(password)) {
            errors.push('One number');
        }
        
        if (!hasSpecialChars.test(password)) {
            errors.push('One special character');
        }
        
        if (errors.length > 0) {
            this.showError(input, `Password must contain: ${errors.join(', ')}`);
            return false;
        }
        
        this.showSuccess(input, 'Strong password');
        return true;
    }

    validatePasswordMatch(input) {
        const password = document.getElementById('password')?.value;
        const confirmPassword = input.value;
        
        this.clearMessages(input);
        
        if (!confirmPassword) {
            this.showError(input, 'Please confirm your password');
            return false;
        }
        
        if (password !== confirmPassword) {
            this.showError(input, 'Passwords do not match');
            return false;
        }
        
        this.showSuccess(input, 'Passwords match');
        return true;
    }

    validateName(input) {
        const name = input.value.trim();
        
        this.clearMessages(input);
        
        if (!name) {
            this.showError(input, 'Name is required');
            return false;
        }
        
        if (name.length < 2) {
            this.showError(input, 'Name must be at least 2 characters');
            return false;
        }
        
        if (!/^[a-zA-Z\s'-]+$/.test(name)) {
            this.showError(input, 'Name can only contain letters, spaces, hyphens, and apostrophes');
            return false;
        }
        
        this.showSuccess(input, 'Valid name');
        return true;
    }

    checkPasswordStrength(input) {
        const password = input.value;
        const strengthIndicator = document.querySelector('.password-strength');
        
        if (!strengthIndicator) return;
        
        const strengthFill = strengthIndicator.querySelector('.strength-fill');
        const strengthLabel = strengthIndicator.querySelector('.strength-label');
        const requirements = strengthIndicator.querySelectorAll('.requirement');
        
        if (!password) {
            strengthFill.className = 'strength-fill';
            strengthLabel.textContent = 'Password Strength';
            requirements.forEach(req => req.classList.remove('met'));
            return;
        }
        
        // Check individual requirements
        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            numbers: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        
        // Update requirement indicators
        requirements.forEach((req, index) => {
            const checkKey = Object.keys(checks)[index];
            if (checks[checkKey]) {
                req.classList.add('met');
                req.querySelector('i').className = 'fas fa-check';
            } else {
                req.classList.remove('met');
                req.querySelector('i').className = 'fas fa-times';
            }
        });
        
        // Calculate strength
        const metRequirements = Object.values(checks).filter(Boolean).length;
        let strength, strengthClass, strengthText;
        
        if (metRequirements <= 2) {
            strength = 'weak';
            strengthClass = 'weak';
            strengthText = 'Weak';
        } else if (metRequirements === 3) {
            strength = 'fair';
            strengthClass = 'fair';
            strengthText = 'Fair';
        } else if (metRequirements === 4) {
            strength = 'good';
            strengthClass = 'good';
            strengthText = 'Good';
        } else {
            strength = 'strong';
            strengthClass = 'strong';
            strengthText = 'Strong';
        }
        
        strengthFill.className = `strength-fill ${strengthClass}`;
        strengthLabel.textContent = `Password Strength: ${strengthText}`;
    }

    togglePasswordVisibility(button) {
        const formGroup = button.closest('.form-group') || button.parentElement;
        const passwordInput = formGroup ? formGroup.querySelector('input[type="password"], input[type="text"]') : null;
        if (!passwordInput) return;
        const icon = button.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
            button.setAttribute('title', 'Hide password');
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
            button.setAttribute('title', 'Show password');
        }
    }

    showError(input, message) {
        input.classList.remove('success');
        input.classList.add('error');
        
        const formGroup = input.closest('.form-group') || input.parentElement || input;
        if (!formGroup) return;
        let errorElement = formGroup.querySelector('.error-message');
        
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.innerHTML = '<i class="fas fa-exclamation-circle"></i><span></span>';
            formGroup.appendChild(errorElement);
        }
        
        // Ensure a <span> exists for text; create if missing (page may include bare .error-message)
        let span = errorElement.querySelector('span');
        if (!span) {
            span = document.createElement('span');
            errorElement.appendChild(span);
        }
        span.textContent = message;
        errorElement.classList.add('show');
        
        // Hide success message if it exists
        const successElement = formGroup.querySelector('.success-message');
        if (successElement) {
            successElement.classList.remove('show');
        }
    }

    showSuccess(input, message) {
        input.classList.remove('error');
        input.classList.add('success');
        
        const formGroup = input.closest('.form-group') || input.parentElement || input;
        if (!formGroup) return;
        let successElement = formGroup.querySelector('.success-message');
        
        if (!successElement) {
            successElement = document.createElement('div');
            successElement.className = 'success-message';
            successElement.innerHTML = '<i class="fas fa-check-circle"></i><span></span>';
            formGroup.appendChild(successElement);
        }
        
        // Ensure a <span> exists for text; create if missing
        let span = successElement.querySelector('span');
        if (!span) {
            span = document.createElement('span');
            successElement.appendChild(span);
        }
        span.textContent = message;
        successElement.classList.add('show');
        
        // Hide error message if it exists
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.classList.remove('show');
        }
    }

    clearMessages(input) {
        if (!input) return;
        input.classList.remove('error', 'success');
        
        const formGroup = input.closest ? input.closest('.form-group') : null;
        if (!formGroup) {
            return;
        }

        const errorElement = formGroup.querySelector('.error-message');
        const successElement = formGroup.querySelector('.success-message');
        
        if (errorElement) {
            errorElement.classList.remove('show');
        }
        
        if (successElement) {
            successElement.classList.remove('show');
        }
    }

    validateFormInRealTime() {
        // Only manage login/register buttons
        const submitButton = document.querySelector('#loginForm .btn-submit, #registerForm .btn-submit');
        if (!submitButton) return;
        
        const form = submitButton.closest('form');
        if (!form || !['loginForm','registerForm'].includes(form.id)) return;
        
        const inputs = form.querySelectorAll('.form-control');
        let allValid = true;
        
        inputs.forEach(input => {
            if (!this.shouldValidateInput(input)) {
                return;
            }
            const isRequired = input.hasAttribute('required');
            const valueEmpty = !String(input.value || '').trim();
            const hasError = input.classList.contains('error');
            // Only require non-empty if the field is marked required
            if (hasError || (isRequired && valueEmpty)) {
                allValid = false;
            }
        });
        
        // Enable/disable submit button based on validation
        submitButton.disabled = !allValid;
        submitButton.style.opacity = allValid ? '1' : '0.6';
    }

    async handleFormSubmission(event) {
        event.preventDefault();
        
        const form = event.target;
        // Ignore non-auth forms like forgot/reset; let page scripts handle those
        if (!['loginForm','registerForm'].includes(form.id)) {
            return;
        }
        const submitButton = form.querySelector('.btn-submit');
        const formData = new FormData(form);
        
        // Show loading state
        this.setLoadingState(submitButton, true);
        
        // Clear any existing alerts
        this.clearAlerts();
        
        try {
            // Validate all fields before submission
            if (!this.validateAllFields(form)) {
                this.setLoadingState(submitButton, false);
                this.showAlert('Please fix the errors below before submitting.', 'error');
                return;
            }
            
            // For registration, ensure file inputs are explicitly included in FormData
            const isLogin = form.id === 'loginForm';
            if (!isLogin) {
                // Check for buyer ID documents and explicitly append them
                const idFrontInput = document.getElementById('idFront');
                const idBackInput = document.getElementById('idBack');
                
                if (idFrontInput && idFrontInput.files && idFrontInput.files.length > 0) {
                    // Remove existing entry if any and add the file explicitly
                    formData.delete('id_front');
                    formData.append('id_front', idFrontInput.files[0]);
                    console.log('[AUTH-UTILS] Added ID front file:', idFrontInput.files[0].name);
                }
                
                if (idBackInput && idBackInput.files && idBackInput.files.length > 0) {
                    // Remove existing entry if any and add the file explicitly
                    formData.delete('id_back');
                    formData.append('id_back', idBackInput.files[0]);
                    console.log('[AUTH-UTILS] Added ID back file:', idBackInput.files[0].name);
                }
            }
            
            // Convert FormData to JSON
            const data = {};
            formData.forEach((value, key) => {
                data[key] = value;
            });
            
// Determine endpoint based on form
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            
            
// Make API request
            let response;
            let result;
            if (isLogin) {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else {
                // Submit registration with multipart/form-data to support file upload (idUpload)
                response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });
            }

            result = await response.json();
            
            if (response.ok && result.success) {
                if (isLogin && result.user && result.token) {
                    this.showAlert('Login successful! Redirecting...', 'success');
                    
                    // Save auth data if AuthManager is available
                    if (window.AuthManager) {
                        window.AuthManager.saveAuthState(result.user, result.token);
                    }
                    
                    // Redirect based on role
                    setTimeout(() => {
                        const role = (result.user && result.user.role) || '';
                        if (role === 'admin') {
                            window.location.href = '/admin/dashboard';
                        } else if (role === 'seller') {
                            window.location.href = '/templates/SellerDashboard/sellerdashboard.html';
                        } else if (role === 'rider') {
                            window.location.href = '/templates/RiderDashboard/rider-dashboard.html';
                        } else {
                            window.location.href = '/';
                        }
                    }, 1500);
                } else if (!isLogin) {
                    // New flow: no email verification, pending admin approval
                    this.showAlert(
                        (result.message) || 'Registration successful! Your account is pending admin approval. You will receive an email once reviewed.',
                        'success'
                    );
                    setTimeout(() => {
                        window.location.href = '/templates/Authenticator/login.html';
                    }, 2000);
                }
            } else {
                    if (isLogin && result && result.pending_approval) {
                        this.showAlert(result.error || 'Your account is pending admin approval. Please wait for approval before logging in.', 'info');
                    } else {
                        if (isLogin) {
                            this.showAlert(result && result.error ? result.error : 'Incorrect email or password.', 'error');
                        } else {
                            this.showAlert(result && result.error ? result.error : 'Registration failed', 'error');
                        }
                    }
            }
        } catch (error) {
            console.error('Form submission error:', error);
            if (form.id === 'loginForm') {
                this.showAlert('Incorrect email or password.', 'error');
            } else {
                this.showAlert(`Registration failed: ${error.message}`, 'error');
            }
        } finally {
            this.setLoadingState(submitButton, false);
        }
    }

    validateAllFields(form) {
        const inputs = form.querySelectorAll('.form-control');
        let allValid = true;
        
        inputs.forEach(input => {
            if (!this.shouldValidateInput(input)) {
                return;
            }
            let isValid = true;
            
            switch (input.type) {
                case 'email':
                    isValid = this.validateEmail(input);
                    break;
                case 'password':
                    if (input.id === 'confirmPassword') {
                        isValid = this.validatePasswordMatch(input);
                    } else {
                        isValid = this.validatePassword(input);
                    }
                    break;
                case 'text':
                    if (input.id === 'name') {
                        isValid = this.validateName(input);
                    }
                    break;
            }
            
            if (!isValid) {
                allValid = false;
            }
        });
        
        return allValid;
    }

    shouldValidateInput(input) {
        if (!input) return false;
        if (input.disabled) return false;
        if (input.type === 'hidden') return false;
        if (this.isElementHidden(input)) return false;

        const roleSection = input.closest('.role-registration');
        if (roleSection && this.isElementHidden(roleSection)) {
            return false;
        }

        const stepContainer = input.closest('.form-step');
        if (stepContainer && this.isElementHidden(stepContainer)) {
            return false;
        }

        return true;
    }

    isElementHidden(element) {
        if (!element) return false;
        if (element.hidden) return true;
        if (element.classList && element.classList.contains('d-none')) return true;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return true;
        }

        if (style.opacity === '0') {
            return true;
        }

        const hasLayoutBox = element.offsetParent !== null || element.getClientRects().length > 0;
        return !hasLayoutBox;
    }

    setLoadingState(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
            button.querySelector('span').textContent = 'Please wait...';
        } else {
            button.classList.remove('loading');
            button.disabled = false;
            button.querySelector('span').textContent = button.dataset.originalText || 'Submit';
        }
    }

    showAlert(message, type = 'info') {
        // Remove existing alerts
        this.clearAlerts();
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        
        const icon = this.getAlertIcon(type);
        alert.innerHTML = `
            <i class="${icon}"></i>
            <span>${message}</span>
        `;
        
        const container = document.querySelector('.auth-container');
        const form = container.querySelector('.auth-form');
        container.insertBefore(alert, form);
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.clearAlerts();
            }, 5000);
        }
    }

    clearAlerts() {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => alert.remove());
    }

    getAlertIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle',
            warning: 'fas fa-exclamation-triangle'
        };
        return icons[type] || icons.info;
    }

    // Utility method to debounce function calls
    debounce(func, wait) {
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

    // Method to check if passwords meet complexity requirements
    meetsPasswordComplexity(password) {
        const { minLength, hasUppercase, hasLowercase, hasNumbers, hasSpecialChars } = this.passwordRequirements;
        
        return password.length >= minLength &&
               hasUppercase.test(password) &&
               hasLowercase.test(password) &&
               hasNumbers.test(password) &&
               hasSpecialChars.test(password);
    }
}

// Initialize AuthUtils when the script loads
const authUtils = new AuthUtils();

// Make it available globally for other scripts
window.AuthUtils = AuthUtils;
window.authUtils = authUtils;

// Lightweight global helpers for pages that expect simple functions
// These avoid coupling to class methods and match existing page scripts
window.validateEmail = function(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email || '').trim());
};

// Validate password complexity by string (used by reset/forgot pages)
window.validatePassword = function(password) {
    if (typeof password !== 'string') return false;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= 8 && hasUppercase && hasLowercase && hasNumbers && hasSpecial;
};

window.showFieldError = function(input, errorId, message) {
    try {
        if (input) {
            input.classList.add('error');
            input.classList.remove('success');
        }
        const el = document.getElementById(errorId);
        if (el) {
            el.classList.add('show');
            // Ensure a span exists so CSS/icons remain intact if present
            let span = el.querySelector('span');
            if (!span) {
                span = document.createElement('span');
                el.appendChild(span);
            }
            span.textContent = message || '';
        }
    } catch (_) {}
};

window.showFieldSuccess = function(input, errorId, message) {
    try {
        if (input) {
            input.classList.add('success');
            input.classList.remove('error');
        }
        const el = document.getElementById(errorId);
        if (el) {
            // Show success text but keep styling minimal for hint
            let span = el.querySelector('span');
            if (!span) {
                span = document.createElement('span');
                el.appendChild(span);
            }
            span.textContent = message || '';
            el.classList.add('show');
        }
    } catch (_) {}
};

window.clearFieldValidation = function(input, errorId) {
    try {
        if (input) input.classList.remove('error','success');
        const el = document.getElementById(errorId);
        if (el) el.classList.remove('show');
    } catch (_) {}
};
