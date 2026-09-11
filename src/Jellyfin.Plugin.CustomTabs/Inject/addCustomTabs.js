// Scope everything in a check to avoid re-declaring the plugin
if (typeof window.customTabsPlugin == 'undefined') {

    // Define the plugin on the window object for universal access
    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        renderedTabs: new Set(),
        tabConfigs: {},

        // Kicks off the process
        init: function() {
            console.log('CustomTabs: Initializing plugin');
            this.waitForUI();
        },

        // Waits for the necessary page elements to be ready before acting
        waitForUI: function() {
            // Check if we are on the home page by looking at the URL hash
            const hash = window.location.hash;
            if (hash !== '' && hash !== '#/home' && hash !== '#/home.html' && !hash.includes('#/home?') && !hash.includes('#/home.html?')) {
                console.debug('CustomTabs: Not on main page, skipping UI check. Hash:', hash);
                return;
            }

            // If the UI is ready, create tabs; otherwise, wait and check again
            if (typeof ApiClient !== 'undefined' && document.querySelector('.emby-tabs-slider')) {
                console.debug('CustomTabs: UI elements available on main page, creating tabs');
                this.createCustomTabs();
            } else {
                console.debug('CustomTabs: Waiting for UI elements on main page...');
                setTimeout(() => this.waitForUI(), 200);
            }
        },

        // Fetches config and creates the tab elements in the DOM
        createCustomTabs: function() {
            console.debug('CustomTabs: Starting tab creation process');

            const tabsSlider = document.querySelector('.emby-tabs-slider');
            if (!tabsSlider) {
                console.debug('CustomTabs: Tabs slider not found');
                return;
            }

            // Prevent creating duplicate tabs if they already exist
            if (tabsSlider.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist in DOM, skipping creation');
                this.renderTabContent();
                return;
            }

            // Fetch tab configuration from the server
            ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs');

                const tabsSlider = document.querySelector('.emby-tabs-slider');
                if (!tabsSlider) {
                    console.error('CustomTabs: Tabs slider disappeared unexpectedly');
                    return;
                }

                // Loop through configs and create a tab for each one
                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;
                    const customTabContentId = `customTab_${i}`;

                    // Final check to ensure this specific tab doesn't already exist
                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return; // 'return' here acts like 'continue' in a forEach loop
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    const title = document.createElement("div");
                    title.classList.add("emby-button-foreground");
                    title.innerText = config.Title;

                    const button = document.createElement("button");
                    button.type = "button";
                    button.setAttribute("is", "empty-button");
                    button.classList.add("emby-tab-button", "emby-button");
                    button.setAttribute("data-index", i + 2);
                    button.setAttribute("id", customTabId);
                    button.appendChild(title);

                    tabsSlider.appendChild(button);
                    console.log(`CustomTabs: Added tab ${customTabId} to tabs slider`);

                    this.tabConfigs[customTabContentId] = config;
                });

                this.renderTabContent();

                console.log('CustomTabs: All custom tabs created successfully');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Render content into tab divs, properly executing <script> tags
        renderTabContent: function() {
            if (!this.tabConfigs) return;

            Object.keys(this.tabConfigs).forEach((tabContentId) => {
                if (this.renderedTabs.has(tabContentId)) return;

                let tabDiv = document.getElementById(tabContentId);
                if (!tabDiv) {
                    tabDiv = this.ensureContentDiv(tabContentId);
                    if (!tabDiv) return;
                }

                const config = this.tabConfigs[tabContentId];
                this.setInnerHTMLWithScripts(tabDiv, config.ContentHtml || '');
                this.renderedTabs.add(tabContentId);
                console.debug(`CustomTabs: Rendered content for ${tabContentId}`);
            });
        },

        // If the serve-time-injected content div is missing (e.g. browser
        // cached an old home-html chunk), create it on the fly.
        ensureContentDiv: function(tabContentId) {
            const index = parseInt(tabContentId.replace('customTab_', ''), 10);
            const contentDiv = document.createElement('div');
            contentDiv.id = tabContentId;
            contentDiv.setAttribute('data-index', index + 2);

            const anchor = document.getElementById('favoritesTab');
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(contentDiv, anchor.nextSibling);
                console.debug(`CustomTabs: Created missing content div ${tabContentId} after favoritesTab`);
                return contentDiv;
            }

            const slider = document.querySelector('.emby-tabs-slider');
            const page = slider ? slider.closest('.page') : null;
            if (page) {
                page.appendChild(contentDiv);
                console.debug(`CustomTabs: Created missing content div ${tabContentId} (fallback to page)`);
                return contentDiv;
            }
            return null;
        },

        // Set innerHTML but properly execute <script> tags
        setInnerHTMLWithScripts: function(element, html) {
            element.innerHTML = html;

            const scripts = element.querySelectorAll('script');
            scripts.forEach((oldScript) => {
                const newScript = document.createElement('script');

                for (let i = 0; i < oldScript.attributes.length; i++) {
                    const attr = oldScript.attributes[i];
                    newScript.setAttribute(attr.name, attr.value);
                }

                if (oldScript.textContent) {
                    newScript.textContent = oldScript.textContent;
                }

                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        }
    };

    // --- Event Listeners to Handle Navigation ---

    // Initial setup when the page is first loaded
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => window.customTabsPlugin.init());
    } else {
        window.customTabsPlugin.init();
    }

    // A single handler for all navigation-style events
    const handleNavigation = () => {
        console.debug('CustomTabs: Navigation detected, re-initializing after delay');
        // Delay helps ensure the DOM has settled after navigation
        setTimeout(() => {
            window.customTabsPlugin.init();
        }, 800);
    };

    // Standard browser navigation (back/forward buttons)
    window.addEventListener("popstate", handleNavigation);

    // Mobile-specific events that can signify a page change
    window.addEventListener("pageshow", handleNavigation);
    window.addEventListener("focus", handleNavigation);

    // Monkey-patch history API to detect navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        handleNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        handleNavigation();
    };

    // Handle tab visibility changes (e.g., user switches to another tab and back)
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            console.debug('CustomTabs: Page became visible, checking for tabs');
            setTimeout(() => window.customTabsPlugin.init(), 300);
        }
    });

    // Handle touch events which can also trigger navigation on mobile
    let touchNavigation = false;
    document.addEventListener("touchstart", () => {
        touchNavigation = true;
    });

    document.addEventListener("touchend", () => {
        if (touchNavigation) {
            setTimeout(() => window.customTabsPlugin.init(), 1000);
            touchNavigation = false;
        }
    });

    console.log('CustomTabs: Plugin setup complete');
}
