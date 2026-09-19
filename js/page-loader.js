// Page Loader JavaScript

class PageLoader {
    constructor() {
        this.loader = null;
        this.init();
    }

    // Initialize page loader
    init() {
        // Create loader element if it doesn't exist
        if (!document.getElementById('pageLoader')) {
            this.createLoader();
        } else {
            this.loader = document.getElementById('pageLoader');
        }

        // Show loader immediately
        this.show();

        // Hide loader when page is fully loaded
        if (document.readyState === 'complete') {
            this.hide();
        } else {
            window.addEventListener('load', () => {
                this.hide();
            });
        }

        // Also hide after maximum 3 seconds (fallback)
        setTimeout(() => {
            this.hide();
        }, 3000);
    }

    // Create loader HTML
    createLoader() {
        const loaderHTML = `
            <div id="pageLoader" class="page-loader">
                <div class="loader-content">
                    <!-- Logo -->
                    <div class="loader-logo">
                        <img src="images/logo/logo.png" alt="Jishora Logo">
                    </div>
                    
                    <!-- Spinner -->
                    <div class="loader-spinner">
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring"></div>
                    </div>
                    
                    <!-- Text -->
                    <div class="loader-text">
                        <span class="loading-dots">Loading</span>
                    </div>
                    <div class="loader-subtext">Please wait...</div>
                    
                    <!-- Progress Bar -->
                    <div class="loader-progress">
                        <div class="loader-progress-bar"></div>
                    </div>
                </div>
            </div>
        `;

        // Insert at the beginning of body
        document.body.insertAdjacentHTML('afterbegin', loaderHTML);
        this.loader = document.getElementById('pageLoader');
    }

    // Show loader
    show() {
        if (this.loader) {
            this.loader.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    // Hide loader
    hide() {
        if (this.loader) {
            this.loader.classList.add('hidden');
            document.body.style.overflow = '';
            
            // Remove from DOM after animation completes
            setTimeout(() => {
                if (this.loader && this.loader.classList.contains('hidden')) {
                    // Don't remove, just keep hidden for potential reuse
                }
            }, 500);
        }
    }

    // Update loader text
    updateText(text, subtext = '') {
        if (this.loader) {
            const textElement = this.loader.querySelector('.loader-text');
            const subtextElement = this.loader.querySelector('.loader-subtext');
            
            if (textElement) {
                textElement.innerHTML = `<span class="loading-dots">${text}</span>`;
            }
            
            if (subtextElement && subtext) {
                subtextElement.textContent = subtext;
            }
        }
    }

    // Change loader style
    setStyle(style) {
        if (this.loader) {
            this.loader.className = 'page-loader';
            if (style) {
                this.loader.classList.add(style);
            }
        }
    }
}

// Create global instance
window.PageLoader = new PageLoader();

// Utility functions for easy access
window.showLoader = function(text = 'Loading', subtext = 'Please wait...') {
    if (window.PageLoader) {
        window.PageLoader.updateText(text, subtext);
        window.PageLoader.show();
    }
};

window.hideLoader = function() {
    if (window.PageLoader) {
        window.PageLoader.hide();
    }
};

window.updateLoader = function(text, subtext = '') {
    if (window.PageLoader) {
        window.PageLoader.updateText(text, subtext);
    }
};

// Auto-hide loader on critical errors
window.addEventListener('error', () => {
    setTimeout(() => {
        if (window.PageLoader) {
            window.PageLoader.hide();
        }
    }, 1000);
});
