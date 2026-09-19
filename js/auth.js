/**
 * Authentication Handler for Login and Registration
 */

// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text') || submitBtn;
    const originalText = btnText.textContent;

    // Show loading state
    btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    submitBtn.disabled = true;

    try {
        const data = await API.login(email, password);

        if (data && data.success) {
            // Store auth data
            localStorage.setItem('authToken', data.data.token);
            localStorage.setItem('refreshToken', data.data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.data.user));

            // Update button to show success
            btnText.innerHTML = '<i class="fas fa-check"></i> Success! Redirecting...';

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 1000);
        } else {
            showNotification(data?.message || 'Login failed. Please check your credentials.', 'error');
            btnText.textContent = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        showNotification('Login failed. Please try again.', 'error');
        btnText.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const referralCode = document.getElementById('referralCode')?.value || '';
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text') || submitBtn;
    const originalText = btnText.textContent;

    // Validate passwords match
    if (confirmPassword && password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }

    // A referral code is required to register.
    if (!referralCode || !referralCode.trim()) {
        showNotification('A referral code is required to register.', 'error');
        const el = document.getElementById('referralCode');
        if (el) el.focus();
        return;
    }

    // Show loading state
    btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
    submitBtn.disabled = true;

    try {
        const data = await API.register({
            username,
            email,
            password,
            referralCode
        });

        if (data && data.success) {
            // Update button to show success
            btnText.innerHTML = '<i class="fas fa-check"></i> Account created! Redirecting...';
            
            // Redirect to login page after 1.5 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } else {
            showNotification(data?.message || 'Registration failed. Please try again.', 'error');
            btnText.textContent = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        showNotification('Registration failed. Please try again.', 'error');
        btnText.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Logout
async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await API.logout();
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear local storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        // Redirect to login
        window.location.href = '/login.html';
    }
}

// Initialize login/register forms
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in (for login/register pages)
    if (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html')) {
        if (isAuthenticated()) {
            window.location.href = '/index.html';
        }
    }

    // Note: Form submission is now handled by auth-page-handler.js
    // which calls handleLogin and handleRegister functions

    // Logout buttons
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });
});
