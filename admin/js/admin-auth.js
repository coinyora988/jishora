// Admin Authentication Handler
// API base URL resolved centrally in js/config.js (loaded before this file).
const API_URL = window.API_URL
  || `${window.location.protocol}//${window.location.hostname}:5000/api`;

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.classList.remove('fa-eye');
        toggleBtn.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleBtn.classList.remove('fa-eye-slash');
        toggleBtn.classList.add('fa-eye');
    }
}

// Handle login form submission
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    const errorMessage = document.getElementById('errorMessage');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');
    const submitBtn = document.querySelector('.btn-login');

    // Show loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    submitBtn.disabled = true;
    errorMessage.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            // Check if user is admin
            if (data.data.user.role !== 'admin') {
                throw new Error('Access denied. Admin privileges required.');
            }

            // Store tokens
            localStorage.setItem('adminToken', data.data.token);
            localStorage.setItem('adminRefreshToken', data.data.refreshToken);
            localStorage.setItem('adminUser', JSON.stringify(data.data.user));

            if (remember) {
                localStorage.setItem('rememberAdmin', 'true');
            }

            // Redirect to dashboard
            window.location.href = 'index.html';
        } else {
            throw new Error(data.message || 'Login failed');
        }
    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        
        // Reset button state
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        submitBtn.disabled = false;
    }
});

// Check if already logged in
if (window.location.pathname.includes('login.html')) {
    const token = localStorage.getItem('adminToken');
    if (token) {
        // Verify token is still valid
        fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data.user.role === 'admin') {
                window.location.href = 'index.html';
            }
        })
        .catch(() => {
            // Token invalid, clear storage
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminRefreshToken');
            localStorage.removeItem('adminUser');
        });
    }
}
