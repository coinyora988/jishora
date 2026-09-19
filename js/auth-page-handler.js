/**
 * Auth Pages Handler - Login & Registration
 * Handles all interactive features: captcha refresh, password toggle, language selector, form validation
 */

// Generate random captcha code (numbers only)
function generateCaptcha() {
    const digits = '0123456789';
    let captcha = '';
    for (let i = 0; i < 4; i++) {
        captcha += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return captcha;
}

// Initialize captcha
let currentCaptcha = generateCaptcha();

// Refresh captcha
function refreshCaptcha(codeElement) {
    currentCaptcha = generateCaptcha();
    codeElement.textContent = currentCaptcha;
    
    // Add animation
    codeElement.style.transform = 'scale(1.1) rotate(5deg)';
    setTimeout(() => {
        codeElement.style.transform = 'scale(1) rotate(0deg)';
    }, 200);
}

// Verify captcha
function verifyCaptcha(userInput) {
    return userInput.toUpperCase() === currentCaptcha.toUpperCase();
}

// Password toggle functionality
function initPasswordToggle(toggleBtn, passwordInput, eyeIcon) {
    if (!toggleBtn || !passwordInput || !eyeIcon) return;
    
    toggleBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        
        // Toggle icon
        if (type === 'text') {
            eyeIcon.classList.remove('fa-eye');
            eyeIcon.classList.add('fa-eye-slash');
        } else {
            eyeIcon.classList.remove('fa-eye-slash');
            eyeIcon.classList.add('fa-eye');
        }
    });
}

// Language selector functionality
function initLanguageSelector() {
    const selector = document.getElementById('langSelector');
    const btn = document.getElementById('langBtn');
    const dropdown = document.getElementById('langDropdown');
    const flagEl = document.getElementById('langFlag');
    const labelEl = document.getElementById('langLabel');

    if (!btn || !dropdown) return;

    // Load saved language
    const savedLang = localStorage.getItem('jishora_lang') || 'en';
    const savedOption = dropdown.querySelector(`[data-lang="${savedLang}"]`);
    if (savedOption) {
        applyLanguage(savedOption);
    }

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = selector.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
    });

    // Language option click
    dropdown.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            applyLanguage(option);
            selector.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        });
    });

    // Close on outside click
    document.addEventListener('click', () => {
        selector.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            selector.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    function applyLanguage(option) {
        const lang = option.dataset.lang;
        const flag = option.dataset.flag;
        const flagAlt = option.dataset.flagAlt;
        const label = option.dataset.label;

        // Update button
        flagEl.src = flag;
        flagEl.alt = flagAlt;
        labelEl.textContent = label;

        // Update active state
        dropdown.querySelectorAll('.lang-option').forEach(opt => {
            opt.classList.remove('active');
        });
        option.classList.add('active');

        // Save to localStorage
        localStorage.setItem('jishora_lang', lang);

        // Apply translations if available
        if (typeof applyTranslations === 'function') {
            applyTranslations(lang);
        }
    }
}

// Password strength checker
function checkPasswordStrength(password) {
    let strength = 0;
    const checks = {
        length: password.length >= 4,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };

    if (checks.length) strength++;
    if (checks.lowercase) strength++;
    if (checks.uppercase) strength++;
    if (checks.number) strength++;
    if (checks.special) strength++;

    return {
        score: strength,
        level: strength <= 1 ? 'weak' : strength === 2 ? 'fair' : strength === 3 ? 'good' : 'strong',
        label: strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'
    };
}

// Update password strength UI
function updatePasswordStrength(password) {
    const strengthBars = document.querySelectorAll('.strength-bar');
    const strengthLabel = document.getElementById('strengthLabel');
    
    if (!strengthBars.length || !strengthLabel) return;

    const result = checkPasswordStrength(password);
    
    // Reset bars
    strengthBars.forEach(bar => {
        bar.classList.remove('weak', 'fair', 'good', 'strong');
    });

    // Fill bars based on strength
    for (let i = 0; i < result.score && i < strengthBars.length; i++) {
        strengthBars[i].classList.add(result.level);
    }

    // Update label
    strengthLabel.textContent = result.label;
    strengthLabel.className = `strength-label ${result.level}`;
}

// Form validation
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showFieldError(fieldId, errorId, message) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(errorId);
    const group = field?.closest('.field-group');
    
    if (group) group.classList.add('error');
    if (error) {
        error.textContent = message;
        error.style.display = 'block';
    }
}

function clearFieldError(fieldId, errorId) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(errorId);
    const group = field?.closest('.field-group');
    
    if (group) group.classList.remove('error');
    if (error) error.style.display = 'none';
}

// Initialize Login Page
function initLoginPage() {
    console.log('Initializing login page...');

    // Initialize captcha
    const captchaCode = document.getElementById('captchaCode');
    const captchaBox = document.getElementById('captchaBox');
    
    if (captchaCode) {
        currentCaptcha = generateCaptcha();
        captchaCode.textContent = currentCaptcha;
        
        if (captchaBox) {
            captchaBox.addEventListener('click', () => refreshCaptcha(captchaCode));
            captchaBox.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    refreshCaptcha(captchaCode);
                }
            });
        }
    }

    // Initialize password toggle
    const togglePwd = document.getElementById('togglePwd');
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');
    initPasswordToggle(togglePwd, passwordInput, eyeIcon);

    // Initialize language selector
    initLanguageSelector();

    // Form validation
    const emailInput = document.getElementById('email');
    const captchaInput = document.getElementById('captcha');

    if (emailInput) {
        // Login accepts username OR email, so no email-format check here.
        emailInput.addEventListener('input', () => {
            clearFieldError('email', 'emailError');
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            clearFieldError('password', 'passwordError');
        });
    }

    if (captchaInput) {
        captchaInput.addEventListener('input', () => {
            clearFieldError('captcha', 'captchaError');
        });
    }

    // Form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Clear all errors
            clearFieldError('email', 'emailError');
            clearFieldError('password', 'passwordError');
            
            const email = emailInput?.value.trim();
            const password = passwordInput?.value;
            const captcha = captchaInput?.value.trim();

            let hasError = false;

            // Login accepts a username OR an email — only require it to be
            // non-empty (do NOT enforce email format, or usernames get rejected).
            if (!email) {
                showFieldError('email', 'emailError', 'Username or Email is required');
                hasError = true;
            }

            // Validate password
            if (!password) {
                showFieldError('password', 'passwordError', 'Password is required');
                hasError = true;
            }

            // Validate captcha
            if (!captcha) {
                showFieldError('captcha', 'captchaError', 'Verification code is required');
                hasError = true;
            } else if (!verifyCaptcha(captcha)) {
                showFieldError('captcha', 'captchaError', 'Incorrect verification code');
                refreshCaptcha(captchaCode);
                if (captchaInput) captchaInput.value = '';
                hasError = true;
            }

            if (hasError) return;

            // Call the actual login function from auth.js
            if (typeof handleLogin === 'function') {
                await handleLogin(e);
            }
        });
    }

    console.log('Login page initialized successfully');
}

// Initialize Registration Page
function initRegisterPage() {
    console.log('Initializing registration page...');

    // Initialize captcha
    const captchaCode = document.getElementById('regCaptchaCode');
    const captchaBox = document.getElementById('regCaptchaBox');
    
    if (captchaCode) {
        currentCaptcha = generateCaptcha();
        captchaCode.textContent = currentCaptcha;
        
        if (captchaBox) {
            captchaBox.addEventListener('click', () => refreshCaptcha(captchaCode));
            captchaBox.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    refreshCaptcha(captchaCode);
                }
            });
        }
    }

    // Initialize password toggles
    const toggleRegPwd = document.getElementById('toggleRegPwd');
    const regPasswordInput = document.getElementById('password');
    const regEyeIcon = document.getElementById('regEyeIcon');
    initPasswordToggle(toggleRegPwd, regPasswordInput, regEyeIcon);

    const toggleConfirmPwd = document.getElementById('toggleConfirmPwd');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const confirmEyeIcon = document.getElementById('confirmEyeIcon');
    initPasswordToggle(toggleConfirmPwd, confirmPasswordInput, confirmEyeIcon);

    // Initialize language selector
    initLanguageSelector();

    // Password strength checker
    if (regPasswordInput) {
        regPasswordInput.addEventListener('input', () => {
            updatePasswordStrength(regPasswordInput.value);
            clearFieldError('password', 'regPasswordError');
        });
    }

    // Form validation
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const captchaInput = document.getElementById('regCaptcha');

    if (usernameInput) {
        usernameInput.addEventListener('input', () => {
            clearFieldError('username', 'regUsernameError');
        });
    }

    if (emailInput) {
        emailInput.addEventListener('blur', () => {
            if (emailInput.value && !validateEmail(emailInput.value)) {
                showFieldError('email', 'regEmailError', 'Please enter a valid email address');
            } else {
                clearFieldError('email', 'regEmailError');
            }
        });

        emailInput.addEventListener('input', () => {
            clearFieldError('email', 'regEmailError');
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            clearFieldError('confirmPassword', 'confirmPwdError');
        });
    }

    // Form submission
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Clear all errors
            clearFieldError('username', 'regUsernameError');
            clearFieldError('email', 'regEmailError');
            clearFieldError('password', 'regPasswordError');
            clearFieldError('confirmPassword', 'confirmPwdError');
            clearFieldError('referralCode', 'regReferralError');
            
            const username = usernameInput?.value.trim();
            const email = emailInput?.value.trim();
            const password = regPasswordInput?.value;
            const confirmPassword = confirmPasswordInput?.value;
            const captcha = captchaInput?.value.trim();
            const referralCode = (document.getElementById('referralCode')?.value || '').trim();

            let hasError = false;

            // Validate username
            if (!username) {
                showFieldError('username', 'regUsernameError', 'Username is required');
                hasError = true;
            } else if (username.length < 3) {
                showFieldError('username', 'regUsernameError', 'Username must be at least 3 characters');
                hasError = true;
            }

            // Validate email
            if (!email) {
                showFieldError('email', 'regEmailError', 'Email is required');
                hasError = true;
            } else if (!validateEmail(email)) {
                showFieldError('email', 'regEmailError', 'Please enter a valid email address');
                hasError = true;
            }

            // Validate password
            if (!password) {
                showFieldError('password', 'regPasswordError', 'Password is required');
                hasError = true;
            } else if (password.length < 4) {
                showFieldError('password', 'regPasswordError', 'Password must be at least 4 characters');
                hasError = true;
            }

            // Validate confirm password
            if (!confirmPassword) {
                showFieldError('confirmPassword', 'confirmPwdError', 'Please confirm your password');
                hasError = true;
            } else if (password !== confirmPassword) {
                showFieldError('confirmPassword', 'confirmPwdError', 'Passwords do not match');
                hasError = true;
            }

            // Validate referral code (required to register)
            if (!referralCode) {
                showFieldError('referralCode', 'regReferralError', 'Referral code is required');
                hasError = true;
            }

            // Validate captcha
            if (!captcha) {
                showFieldError('regCaptcha', 'regCaptchaError', 'Verification code is required');
                hasError = true;
            } else if (!verifyCaptcha(captcha)) {
                showFieldError('regCaptcha', 'regCaptchaError', 'Incorrect verification code');
                refreshCaptcha(captchaCode);
                if (captchaInput) captchaInput.value = '';
                hasError = true;
            }

            if (hasError) return;

            // Call the actual register function from auth.js
            if (typeof handleRegister === 'function') {
                await handleRegister(e);
            }
        });
    }

    console.log('Registration page initialized successfully');
}

// Auto-initialize based on page
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('login.html')) {
        initLoginPage();
    } else if (path.includes('register.html')) {
        initRegisterPage();
    }
});


// Enhanced Language Selector with LanguageSystem Integration
function initLanguageSelectorEnhanced() {
    const selector = document.getElementById('langSelector');
    const btn = document.getElementById('langBtn');
    const dropdown = document.getElementById('langDropdown');
    const flagEl = document.getElementById('langFlag');
    const labelEl = document.getElementById('langLabel');

    if (!btn || !dropdown) return;

    // Language data
    const languages = {
        'en': { flag: 'https://flagcdn.com/w40/us.png', label: 'English', alt: 'US flag' },
        'es': { flag: 'https://flagcdn.com/w40/es.png', label: 'Español', alt: 'Spain flag' },
        'fr': { flag: 'https://flagcdn.com/w40/fr.png', label: 'Français', alt: 'France flag' },
        'de': { flag: 'https://flagcdn.com/w40/de.png', label: 'Deutsch', alt: 'Germany flag' },
        'ar': { flag: 'https://flagcdn.com/w40/sa.png', label: 'العربية', alt: 'Saudi Arabia flag' },
        'tr': { flag: 'https://flagcdn.com/w40/tr.png', label: 'Türkçe', alt: 'Turkey flag' }
    };

    // Load current language
    const currentLang = window.LanguageSystem?.getCurrentLanguage() || localStorage.getItem('jishora_language') || 'en';
    updateLanguageDisplay(currentLang);

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = selector.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
    });

    // Language option click
    dropdown.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const lang = option.dataset.lang;
            
            // Change language globally
            if (window.LanguageSystem) {
                window.LanguageSystem.changeLanguage(lang);
            } else {
                localStorage.setItem('jishora_language', lang);
            }
            
            updateLanguageDisplay(lang);
            selector.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        });
    });

    // Close on outside click
    document.addEventListener('click', () => {
        selector.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selector.classList.contains('open')) {
            selector.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    function updateLanguageDisplay(lang) {
        const langData = languages[lang];
        if (langData && flagEl && labelEl) {
            flagEl.src = langData.flag;
            flagEl.alt = langData.alt;
            labelEl.textContent = langData.label;

            // Update active state in dropdown
            dropdown.querySelectorAll('.lang-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.lang === lang);
            });
        }
    }
}

// Override initLanguageSelector
const originalInit = typeof initLanguageSelector !== 'undefined' ? initLanguageSelector : null;
function initLanguageSelector() {
    initLanguageSelectorEnhanced();
}
