// Navigation Data Model - defines all sections and subsections
const templates = {
    subsectionHeader: `
        <h2>{{TITLE}}</h2>
        <p>{{RESUME}}</p>
    `,
    link: `
        <div class="article-link">
            <h4><a href="{{LINK}}" target="_blank" rel="noopener noreferrer">{{LINK_TITLE}}</a></h4>
            <p>{{RESUME}}</p>
        </div>
    `
}
const navigationData = {
    "Tools": {
        "k8s": {
            title: "Kubernetes",
            subsectionContent: "Curated collection of essential Kubernetes articles and resources.",
            links: [{
                link: "https://home.robusta.dev/blog/stop-using-cpu-limits",
                title: "For the Love of God, Stop Using CPU Limits on Kubernetes (Updated)",
                resume: "This article discusses the common pitfalls and performance issues that arise from using CPU limits in Kubernetes. The author explains why CPU limits can cause unexpected throttling and degraded performance, even when your pods aren't actually using their full CPU allocation."
            }]
        },
        "grafana": {
            title: "Grafana",
            subsectionContent: "Essential articles and guides for Grafana monitoring and visualization.",
            links: []
        },
        "elk": {
            title: "ELK Stack",
            subsectionContent: "Curated resources for Elasticsearch, Logstash, and Kibana.",
            links: []
        }
    },
    "Languages": {
        "js": {
            title: "JavaScript",
            subsectionContent: "Essential JavaScript articles and modern development practices.",
            links: []
        },
        "java": {
            title: "Java",
            subsectionContent: "Curated Java programming resources and best practices.",
            links: []
        }
    },
    "Frameworks": {
        "springboot": {
            title: "Springboot",
            subsectionContent: "Essential Spring Boot articles and guides for building production-ready applications.",
            links: []
        }
    },
    "DIY": {
        // Placeholder for future subsections
    },
    "Management": {
        // Placeholder for future subsections
    },
    "Craze ideas": {
        // Placeholder for future subsections
    },
    "Cool readings": {
        // Placeholder for future subsections
    },
    "Awesome content sources": {
        "tech": {
            title: "Tech",
            subsectionContent: "Awesome tech sources",
            links: [{
                link: "https://my-uncompiled-thoughts.hashnode.dev",
                title: "My uncompiled thoughts",
                resume: "This is an amazing blog from a fellow develper whom I have the pleasure of work for some year now. Worth the reading."
            }]
        }
    }
};

// Application State Object - tracks active selections and expanded sections
const appState = {
    activeSection: null,
    activeSubsection: null,
    expandedSections: [],
    sidebarCollapsed: false,
    lastViewedSubsections: {} // Remembers last viewed subsection per section
};

// State Management Helper Functions

/**
 * Updates the active section and subsection in the application state
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name (optional)
 */
function updateActiveSelection(section, subsection = null) {
    appState.activeSection = section;
    appState.activeSubsection = subsection;

    // Remember the last viewed subsection for this section
    if (subsection) {
        appState.lastViewedSubsections[section] = subsection;
    }

    // Persist state to sessionStorage
    persistState();

    console.log('Active selection updated:', { section, subsection });
}

/**
 * Toggles the expanded state of a section
 * @param {string} section - The section name to toggle
 */
function toggleSectionExpansion(section) {
    const index = appState.expandedSections.indexOf(section);

    if (index === -1) {
        // Section is not expanded, add it
        appState.expandedSections.push(section);
    } else {
        // Section is expanded, remove it
        appState.expandedSections.splice(index, 1);
    }

    // Persist state to sessionStorage
    persistState();

    console.log('Section expansion toggled:', section, 'Expanded sections:', appState.expandedSections);
}

/**
 * Checks if a section is currently expanded
 * @param {string} section - The section name to check
 * @returns {boolean} True if the section is expanded
 */
function isSectionExpanded(section) {
    return appState.expandedSections.includes(section);
}

/**
 * Gets the last viewed subsection for a given section
 * @param {string} section - The section name
 * @returns {string|null} The last viewed subsection or null
 */
function getLastViewedSubsection(section) {
    return appState.lastViewedSubsections[section] || null;
}

/**
 * Toggles the sidebar collapsed state (for mobile)
 */
function toggleSidebar() {
    appState.sidebarCollapsed = !appState.sidebarCollapsed;
    persistState();

    console.log('Sidebar toggled:', appState.sidebarCollapsed ? 'collapsed' : 'expanded');
}

/**
 * Resets the application state to initial values
 */
function resetState() {
    appState.activeSection = null;
    appState.activeSubsection = null;
    appState.expandedSections = [];
    appState.sidebarCollapsed = false;
    appState.lastViewedSubsections = {};

    // Clear persisted state
    sessionStorage.removeItem('knowledgeHubState');

    console.log('Application state reset');
}

/**
 * Persists the current application state to sessionStorage
 */
function persistState() {
    try {
        const stateToSave = {
            activeSection: appState.activeSection,
            activeSubsection: appState.activeSubsection,
            expandedSections: [...appState.expandedSections],
            sidebarCollapsed: appState.sidebarCollapsed,
            lastViewedSubsections: { ...appState.lastViewedSubsections }
        };

        sessionStorage.setItem('knowledgeHubState', JSON.stringify(stateToSave));
    } catch (error) {
        console.warn('Failed to persist state to sessionStorage:', error);
    }
}

/**
 * Restores the application state from sessionStorage
 */
function restoreState() {
    try {
        const savedState = sessionStorage.getItem('knowledgeHubState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);

            // Restore state properties with validation
            appState.activeSection = parsedState.activeSection || null;
            appState.activeSubsection = parsedState.activeSubsection || null;
            appState.expandedSections = Array.isArray(parsedState.expandedSections)
                ? parsedState.expandedSections
                : [];
            appState.sidebarCollapsed = Boolean(parsedState.sidebarCollapsed);
            appState.lastViewedSubsections = parsedState.lastViewedSubsections || {};

            console.log('Application state restored from sessionStorage');
            return true;
        }
    } catch (error) {
        console.warn('Failed to restore state from sessionStorage:', error);
    }
    return false;
}

/**
 * Gets content for a specific section and subsection
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name
 * @returns {object|null} The content object or null if not found
 */
function getContent(section, subsection) {
    if (navigationData[section] && navigationData[section][subsection]) {
        return navigationData[section][subsection];
    }
    return null;
}

/**
 * Gets all subsections for a given section
 * @param {string} section - The main section name
 * @returns {array} Array of subsection keys
 */
function getSubsections(section) {
    if (navigationData[section]) {
        return Object.keys(navigationData[section]);
    }
    return [];
}

/**
 * Validates if a section exists in the navigation data
 * @param {string} section - The section name to validate
 * @returns {boolean} True if the section exists
 */
function isValidSection(section) {
    return navigationData.hasOwnProperty(section);
}

/**
 * Validates if a subsection exists within a section
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name to validate
 * @returns {boolean} True if the subsection exists
 */
function isValidSubsection(section, subsection) {
    return isValidSection(section) &&
        navigationData[section].hasOwnProperty(subsection);
}// Dynamic Content Display System

function templateLink(link){
    return templates.link.replace("{{LINK}}", link.link)
        .replace("{{LINK_TITLE}}", link.title)
        .replace("{{RESUME}}", link.resume);
}

/**
 * Updates the main content area based on navigation selection with enhanced animations
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name
 */
function updateContentDisplay(section, subsection) {
    const contentContainer = document.getElementById('content-container');
    if (!contentContainer) {
        console.error('Content container not found');
        return;
    }

    // Add loading state
    contentContainer.style.pointerEvents = 'none';

    // Start fade out transition with enhanced animation
    contentContainer.classList.add('fade-out');

    // Wait for fade out to complete, then update content
    setTimeout(() => {
        const content = getContent(section, subsection);

        if (content && content.title) {
            // Display actual content with staggered animation
            contentContainer.innerHTML = `
                <div class="content-section">
                    ${templates.subsectionHeader
                        .replace("{{TITLE}}", content.title)
                        .replace("{{RESUME}}", content.subsectionContent)}
                    ${content.links.map(templateLink).reduce((a,b) => a+b, "")}
                </div>
            `;
        } else {
            // Display "Coming Soon" placeholder
            contentContainer.innerHTML = createComingSoonPlaceholder(section, subsection);
        }

        // Start fade in transition with enhanced animation
        contentContainer.classList.remove('fade-out');
        contentContainer.classList.add('fade-in');

        // Re-enable interactions
        setTimeout(() => {
            contentContainer.style.pointerEvents = 'auto';
        }, 100);

        // Remove fade-in class after animation completes
        setTimeout(() => {
            contentContainer.classList.remove('fade-in');
        }, 350);

        // Smooth scroll to top of content area
        if (contentContainer.scrollTop > 0) {
            contentContainer.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

    }, 175); // Adjusted timing for smoother transitions
}

/**
 * Creates a "Coming Soon" placeholder for undefined subsections
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name
 * @returns {string} HTML string for the placeholder
 */
function createComingSoonPlaceholder(section, subsection) {
    const sectionTitle = section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Section';
    const subsectionTitle = subsection ? subsection.toUpperCase() : 'Subsection';

    return `
        <div class="coming-soon-placeholder">
            <div class="icon">🚧</div>
            <h3>${sectionTitle} - ${subsectionTitle}</h3>
            <p>This section is currently under development. Content will be added soon!</p>
            <p>Check back later for updates on this topic.</p>
        </div>
    `;
}

/**
 * Displays the welcome content when no specific section is selected with enhanced animations
 */
function displayWelcomeContent() {
    const contentContainer = document.getElementById('content-container');
    if (!contentContainer) {
        console.error('Content container not found');
        return;
    }

    // Add loading state
    contentContainer.style.pointerEvents = 'none';

    // Start fade out transition
    contentContainer.classList.add('fade-out');

    setTimeout(() => {
        contentContainer.innerHTML = `
            <div class="welcome-content">
                <h2>Welcome to the Interactive Knowledge Hub</h2>
                <p>Your curated collection of essential technical articles and resources. Browse through organized sections to discover valuable content with previews and direct links to the original sources.</p>
                
                <div class="welcome-features">
                    <div class="welcome-feature">
                        <h4>🛠️ Tools</h4>
                        <p>Curated articles on Kubernetes, Grafana, ELK Stack and more</p>
                    </div>
                    <div class="welcome-feature">
                        <h4>💻 Languages</h4>
                        <p>Essential resources for JavaScript, Java and other languages</p>
                    </div>
                    <div class="welcome-feature">
                        <h4>🚀 Frameworks</h4>
                        <p>Handpicked articles on popular frameworks and libraries</p>
                    </div>
                    <div class="welcome-feature">
                        <h4>📚 More</h4>
                        <p>DIY guides, management articles, and interesting reads</p>
                    </div>
                </div>
            </div>
        `;

        // Start fade in transition with enhanced animation
        contentContainer.classList.remove('fade-out');
        contentContainer.classList.add('fade-in');

        // Re-enable interactions
        setTimeout(() => {
            contentContainer.style.pointerEvents = 'auto';
        }, 100);

        // Remove fade-in class after animation completes
        setTimeout(() => {
            contentContainer.classList.remove('fade-in');
        }, 350);

        // Smooth scroll to top of content area
        if (contentContainer.scrollTop > 0) {
            contentContainer.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

    }, 175);
}

/**
 * Handles content switching with smooth transitions
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name (optional)
 */
function switchContent(section, subsection = null) {
    if (section && subsection) {
        updateContentDisplay(section, subsection);
        console.log(`Content switched to: ${section}/${subsection}`);
    } else if (section) {
        // If only section is provided, show the first available subsection or coming soon
        const subsections = getSubsections(section);
        if (subsections.length > 0) {
            updateContentDisplay(section, subsections[0]);
            console.log(`Content switched to: ${section}/${subsections[0]} (first available)`);
        } else {
            updateContentDisplay(section, 'overview');
            console.log(`Content switched to: ${section}/overview (placeholder)`);
        }
    } else {
        // No section selected, show welcome content
        displayWelcomeContent();
        console.log('Content switched to welcome screen');
    }
}

/**
 * Restores content display based on current application state
 */
function restoreContentDisplay() {
    if (appState.activeSection && appState.activeSubsection) {
        updateContentDisplay(appState.activeSection, appState.activeSubsection);
        console.log(`Content display restored: ${appState.activeSection}/${appState.activeSubsection}`);
    } else {
        displayWelcomeContent();
        console.log('Content display restored: welcome screen');
    }
}

// Tree Navigation Functionality

/**
 * Handles expand/collapse behavior for main sections
 * @param {string} section - The section name to toggle
 */
function handleSectionToggle(section) {
    const sectionName = section.toLowerCase().replace(/\s+/g, '-');
    const sectionElement = document.querySelector(`[aria-controls="${sectionName}-subsections"]`);
    const subsectionsElement = document.getElementById(`${sectionName}-subsections`);
    const expandIcon = sectionElement?.querySelector('.nav-expand-icon');

    if (!sectionElement || !subsectionsElement || !expandIcon) {
        console.warn(`Section elements not found for: ${section}`);
        return;
    }

    // Toggle the expansion state
    toggleSectionExpansion(section);
    const isExpanded = isSectionExpanded(section);

    // Update visual states
    if (isExpanded) {
        // Expand the section
        subsectionsElement.classList.add('expanded');
        expandIcon.classList.add('expanded');
        expandIcon.textContent = '▼';
        sectionElement.setAttribute('aria-expanded', 'true');

        // When expanding, navigate to the last viewed subsection or first available
        const lastViewed = getLastViewedSubsection(section);
        const subsections = getSubsections(section);

        if (lastViewed && subsections.includes(lastViewed)) {
            handleSubsectionNavigation(section, lastViewed);
        } else if (subsections.length > 0) {
            handleSubsectionNavigation(section, subsections[0]);
        } else {
            // No subsections available, show coming soon for the section
            switchContent(section);
        }
    } else {
        // Collapse the section
        subsectionsElement.classList.remove('expanded');
        expandIcon.classList.remove('expanded');
        expandIcon.textContent = '▶';
        sectionElement.setAttribute('aria-expanded', 'false');

        // When collapsing, return to welcome screen if this was the active section
        if (appState.activeSection === section) {
            updateActiveSelection(null, null);
            updateActiveStateHighlighting();
            displayWelcomeContent();
        }
    }

    console.log(`Section ${section} ${isExpanded ? 'expanded' : 'collapsed'}`);
}

/**
 * Handles navigation to a specific subsection
 * @param {string} section - The main section name
 * @param {string} subsection - The subsection name
 */
function handleSubsectionNavigation(section, subsection) {
    // Validate the navigation target
    if (!isValidSubsection(section, subsection)) {
        console.warn(`Invalid navigation target: ${section}/${subsection}`);
        // Still show coming soon placeholder for invalid targets
        updateContentDisplay(section, subsection);
        return;
    }

    // Update application state
    updateActiveSelection(section, subsection);

    // Update visual feedback
    updateActiveStateHighlighting();

    // Update content display
    switchContent(section, subsection);

    // Ensure the parent section is expanded
    if (!isSectionExpanded(section)) {
        handleSectionToggle(section);
    }

    console.log(`Navigated to: ${section}/${subsection}`);
}

/**
 * Updates active state highlighting for navigation elements
 */
function updateActiveStateHighlighting() {
    // Clear all active states
    document.querySelectorAll('.nav-section-header.active').forEach(header => {
        header.classList.remove('active');
    });

    document.querySelectorAll('.nav-subsection-link.active').forEach(link => {
        link.classList.remove('active');
    });

    // Apply active state to current selection
    if (appState.activeSection && appState.activeSubsection) {
        // Highlight the active subsection
        const activeSubsectionLink = document.querySelector(
            `[data-section="${appState.activeSection.toLowerCase()}"][data-subsection="${appState.activeSubsection}"]`
        );

        if (activeSubsectionLink) {
            activeSubsectionLink.classList.add('active');
        }
    }
}

// Mobile Navigation Functionality

/**
 * Handles mobile menu toggle
 */
function handleMobileMenuToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (!sidebar || !overlay) {
        console.error('Mobile navigation elements not found');
        return;
    }

    // Toggle sidebar visibility
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');

    // Update application state
    toggleSidebar();

    console.log('Mobile menu toggled');
}

/**
 * Closes mobile menu
 */
function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');

        // Update state to not collapsed
        if (appState.sidebarCollapsed) {
            toggleSidebar();
        }
    }
}

// Event Listeners and Initialization

/**
 * Sets up all event listeners for the navigation system
 */
function setupEventListeners() {
    // Mobile menu button
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', handleMobileMenuToggle);
    }

    // Mobile overlay (close menu when clicked)
    const mobileOverlay = document.getElementById('mobile-overlay');
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', closeMobileMenu);
    }

    // Section headers (expand/collapse)
    document.querySelectorAll('.nav-section-header').forEach(header => {
        header.addEventListener('click', (e) => {
            const sectionTitle = header.querySelector('.nav-section-title').textContent;
            handleSectionToggle(sectionTitle);
        });

        // Keyboard support
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const sectionTitle = header.querySelector('.nav-section-title').textContent;
                handleSectionToggle(sectionTitle);
            }
        });
    });

    // Subsection links
    document.querySelectorAll('.nav-subsection-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            const subsection = link.getAttribute('data-subsection');

            if (section && subsection) {
                handleSubsectionNavigation(section, subsection);

                // Close mobile menu if open
                if (window.innerWidth <= 767) {
                    closeMobileMenu();
                }
            }
        });
    });

    // Close mobile menu on window resize if screen becomes large
    window.addEventListener('resize', () => {
        if (window.innerWidth > 767) {
            closeMobileMenu();
        }
    });

    console.log('Event listeners set up successfully');
}

/**
 * Initializes the navigation system with restored state
 */
function initializeNavigationSystem() {
    // Set up event listeners
    setupEventListeners();

    // Restore expanded sections
    appState.expandedSections.forEach(section => {
        const sectionName = section.toLowerCase().replace(/\s+/g, '-');
        const sectionElement = document.querySelector(`[aria-controls="${sectionName}-subsections"]`);
        const subsectionsElement = document.getElementById(`${sectionName}-subsections`);
        const expandIcon = sectionElement?.querySelector('.nav-expand-icon');

        if (sectionElement && subsectionsElement && expandIcon) {
            subsectionsElement.classList.add('expanded');
            expandIcon.classList.add('expanded');
            expandIcon.textContent = '▼';
            sectionElement.setAttribute('aria-expanded', 'true');
        }
    });

    // Update active state highlighting
    updateActiveStateHighlighting();

    console.log('Navigation system initialized');
}

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('Interactive Knowledge Hub initialized');
    console.log('Navigation data loaded:', Object.keys(navigationData));

    // Restore previous state if available
    const stateRestored = restoreState();
    if (stateRestored) {
        console.log('Previous session state restored');
        // Restore content display based on restored state
        restoreContentDisplay();
    } else {
        // Show welcome content by default
        displayWelcomeContent();
    }

    // Log current state for debugging
    console.log('Current application state:', appState);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeNavigationSystem();
});