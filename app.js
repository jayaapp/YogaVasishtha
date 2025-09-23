/**
 * Yoga Vasishtha EPUB Reader - Complete Rewrite
 * A modern, robust multi-book EPUB reader with Sanskrit lexicon integration
 */

// ===== CONFIGURATION =====
const CONFIG = {
    APP_TITLE: "Yoga Vasishtha EPUB Reader",
    EPUB_FILES: [
        "epub/Yoga-Vasishtha-V1.epub",
        "epub/Yoga-Vasishtha-V2-P1of2.epub",
        "epub/Yoga-Vasishtha-V2-P2of2.epub",
        "epub/Yoga-Vasishtha-V3-P1of2.epub",
        "epub/Yoga-Vasishtha-V3-P2of2.epub",
        "epub/Yoga-Vasishtha-V4-P1of2.epub",
        "epub/Yoga-Vasishtha-V4-P2of2.epub"
    ],
    LEXICON_FILE: "Yoga-Vasishtha-Lexicon.json",
    STORAGE_KEYS: {
        THEME: 'epub-theme',
        FONT_FAMILY: 'epub-font-family',
        FONT_SIZE: 'epub-font-size',
        LINE_HEIGHT: 'epub-line-height',
        CURRENT_BOOK: 'epub-current-book',
        READING_POSITION: 'epub-position-'
    },
    DEVANAGARI_REGEX: /[\u0900-\u097F]+/g,
    DEFAULTS: {
        THEME: 'light',
        FONT_FAMILY: 'Georgia, serif',
        FONT_SIZE: '16px',
        LINE_HEIGHT: '1.6'
    },
    HELP_TEXT: `# Yoga Vasishtha EPUB Reader

## Features
- **Multiple EPUB files**: Navigate between different volumes
- **Sanskrit lexicon**: Click on Devanagari words for definitions
- **Table of contents**: Native EPUB navigation
- **Customizable reading**: Adjust fonts, sizes, and themes
- **Reading progress**: Automatically saved position per book

## Keyboard Shortcuts
- **Escape**: Close any open modal
- **Tab**: Navigate through interface elements

## Search

The search functionality supports regex patterns with automatic fallback to literal search. Regex Test Examples:

  1. Basic Pattern Matching

  **\\bword\\b**        - Find exact word boundaries <br>
  **chapter.*content**  - "chapter" followed by "content" <br>
  **^Beginning**        - Lines starting with "Beginning" <br>
  **ending$**           - Lines ending with "ending" <br>

  2. Character Classes & Quantifiers

  **\\d+**             - One or more digits <br>
  **[Vv]asishtha**     - "Vasishtha" or "vasishtha" <br>
  **\\w{5,10}**        - Words 5-10 characters long <br>
  **colou?r**          - "color" or "colour" <br>

  3. Advanced Patterns

  **(yoga|meditation)** - Either "yoga" OR "meditation" <br>
  **Chapter\\s+[IVX]+** - "Chapter" + Roman numerals <br>
  **\\b[A-Z]{2,}\\b**   - All-caps words (2+ letters) <br>
  **(?i)brahma**        - Case-insensitive "brahma" <br>

  4. Content-Specific Examples

  **\\bVol\.\\s*\\d+**    - Volume references (Vol. 1, Vol.2) <br>
  **\\bBook\\s+[IVX]+**   - Book with Roman numerals <br>
  **[Ss]elf.*[Rr]eali**   - "Self" to "realization" variations <br>
  **\\bChapter\\s+\\w+**  - Chapter followed by any word <br>

Each pattern searches across all books simultaneously, showing results with context and allowing navigation to exact locations in the text.`
};

// ===== APPLICATION STATE =====
const State = {
    currentBookIndex: 0,
    epubBooks: [],
    bookContents: [],
    bookTOCs: [],
    lexicon: {},
    search: {
        isOpen: false,
        query: '',
        results: [],
        currentIndex: -1,
        originalPosition: null // Store original position when search opens
    },
    bookmarks: {}, // Structure: { bookIndex: [bookmark1, bookmark2, ...] }
    isLoading: true,
    isInitialized: false,
    settings: {
        theme: CONFIG.DEFAULTS.THEME,
        fontFamily: CONFIG.DEFAULTS.FONT_FAMILY,
        fontSize: CONFIG.DEFAULTS.FONT_SIZE,
        lineHeight: CONFIG.DEFAULTS.LINE_HEIGHT
    }
};

// ===== DOM ELEMENTS =====
const Elements = {
    // Main elements
    bookSelector: null,
    themeBtn: null,
    settingsBtn: null,
    tocBtn: null,
    helpBtn: null,

    // Content areas
    loadingIndicator: null,
    bookContent: null,
    errorMessage: null,
    errorText: null,

    // Modals
    tocModal: null,
    settingsModal: null,
    helpModal: null,
    lexiconModal: null,

    // Modal content
    tocContent: null,
    helpContent: null,
    lexiconContent: null,

    // Settings controls
    fontFamilySelect: null,
    fontSizeSelect: null,
    lineHeightSelect: null,

    // Close buttons
    closeButtons: []
};

// ===== UTILITY FUNCTIONS =====
const Utils = {
    /**
     * Create a debounced function
     */
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
    },

    /**
     * Show element with animation
     */
    show(element, animationClass = 'fade-in') {
        element.hidden = false;
        element.classList.add(animationClass);
        setTimeout(() => element.classList.remove(animationClass), 300);
    },

    /**
     * Hide element
     */
    hide(element) {
        element.hidden = true;
    },

    /**
     * Create safe HTML content
     */
    createSafeHTML(content) {
        const div = document.createElement('div');
        div.innerHTML = content;
        return div.innerHTML;
    },

    /**
     * Get clean book title from filename
     */
    getBookTitle(filename) {
        let title = filename
            .replace(/^epub\//, '')
            .replace('.epub', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());

        // Convert "Yoga Vasishtha V1" to "Volume 1", "Yoga Vasishtha V2 P1of2" to "Volume 2 Part 1 of 2", etc.
        title = title
            .replace(/^Yoga Vasishtha\s+/i, '') // Remove "Yoga Vasishtha" prefix
            .replace(/V(\d+)/g, 'Volume $1') // "V1" -> "Volume 1"
            .replace(/P(\d+)of(\d+)/g, 'Part $1 of $2') // "P1of2" -> "Part 1 of 2"
            .trim();

        return title;
    }
};

// ===== ERROR HANDLING =====
const ErrorHandler = {
    /**
     * Log error and show user message
     */
    handle(error, context = 'Application') {
        console.error(`[${context}]`, error);

        // Show user-friendly error in UI if critical
        if (context === 'EPUB Loading' || context === 'Initialization') {
            this.showError(`Failed to load content: ${error.message}`);
        }
    },

    /**
     * Show error message to user
     */
    showError(message) {
        Elements.errorText.textContent = message;
        Utils.hide(Elements.loadingIndicator);
        Utils.hide(Elements.bookContent);
        Utils.show(Elements.errorMessage);
    },

    /**
     * Clear error state
     */
    clearError() {
        Utils.hide(Elements.errorMessage);
    }
};

// ===== SETTINGS MANAGER =====
const SettingsManager = {
    /**
     * Load settings from localStorage
     */
    load() {
        State.settings.theme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || CONFIG.DEFAULTS.THEME;
        State.settings.fontFamily = localStorage.getItem(CONFIG.STORAGE_KEYS.FONT_FAMILY) || CONFIG.DEFAULTS.FONT_FAMILY;
        State.settings.fontSize = localStorage.getItem(CONFIG.STORAGE_KEYS.FONT_SIZE) || CONFIG.DEFAULTS.FONT_SIZE;
        State.settings.lineHeight = localStorage.getItem(CONFIG.STORAGE_KEYS.LINE_HEIGHT) || CONFIG.DEFAULTS.LINE_HEIGHT;

        const savedBook = localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_BOOK);
        if (savedBook !== null) {
            State.currentBookIndex = parseInt(savedBook, 10);
        }
    },

    /**
     * Save individual setting
     */
    save(key, value) {
        localStorage.setItem(key, value);
    },

    /**
     * Apply current settings to DOM
     */
    apply() {
        // Apply theme
        document.body.className = `${State.settings.theme}-theme`;
        Elements.themeBtn.querySelector('.material-icons').textContent =
            State.settings.theme === 'light' ? 'dark_mode' : 'light_mode';

        // Apply font settings
        document.documentElement.style.setProperty('--font-family', State.settings.fontFamily);
        document.documentElement.style.setProperty('--font-size', State.settings.fontSize);
        document.documentElement.style.setProperty('--line-height', State.settings.lineHeight);

        // Update settings UI
        if (Elements.fontFamilySelect) Elements.fontFamilySelect.value = State.settings.fontFamily;
        if (Elements.fontSizeSelect) Elements.fontSizeSelect.value = State.settings.fontSize;
        if (Elements.lineHeightSelect) Elements.lineHeightSelect.value = State.settings.lineHeight;
    },

    /**
     * Save reading position
     */
    savePosition() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const key = CONFIG.STORAGE_KEYS.READING_POSITION + State.currentBookIndex;
        localStorage.setItem(key, scrollTop.toString());
        console.log(`💾 Saved scroll position ${scrollTop} for book ${State.currentBookIndex}`);
    },

    /**
     * Restore reading position
     */
    restorePosition() {
        const key = CONFIG.STORAGE_KEYS.READING_POSITION + State.currentBookIndex;
        const savedPosition = localStorage.getItem(key);
        if (savedPosition) {
            const position = parseInt(savedPosition, 10);
            window.scrollTo({ top: position, behavior: 'auto' });
            console.log(`📖 Restored scroll position ${position} for book ${State.currentBookIndex}`);
        }
    }
};

// ===== SEARCH MANAGER =====
const SearchManager = {
    /**
     * Toggle search panel visibility
     */
    togglePanel() {
        if (State.search.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    },

    /**
     * Open search panel and save current position
     */
    openPanel() {
        // Save current reading position
        State.search.originalPosition = {
            bookIndex: State.currentBookIndex,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop
        };

        State.search.isOpen = true;
        Elements.searchPanel.removeAttribute('hidden');
        Elements.searchPanel.classList.add('active');
        Elements.searchInput.focus();

        console.log('🔍 Search panel opened, saved position:', State.search.originalPosition);
    },

    /**
     * Close search panel and optionally return to original position
     */
    closePanel(returnToOriginal = true) {
        State.search.isOpen = false;
        Elements.searchPanel.classList.remove('active');

        // Add hidden attribute back after animation completes
        setTimeout(() => {
            Elements.searchPanel.setAttribute('hidden', '');
        }, 300); // Match the CSS transition duration

        if (returnToOriginal && State.search.originalPosition) {
            // Return to original book and position
            const originalPos = State.search.originalPosition;

            if (originalPos.bookIndex !== State.currentBookIndex) {
                State.currentBookIndex = originalPos.bookIndex;
                Elements.bookSelector.value = originalPos.bookIndex;
                UIManager.displayCurrentBook();
            }

            // Restore original scroll position
            requestAnimationFrame(() => {
                window.scrollTo({
                    top: originalPos.scrollTop,
                    behavior: 'smooth'
                });
            });

            console.log('🏠 Returned to original position:', originalPos);
        }

        // Clear search state
        State.search.originalPosition = null;
        State.search.currentIndex = -1;
        this.clearHighlights();
    },

    /**
     * Return to original reading position
     */
    returnToOriginal() {
        if (State.search.originalPosition) {
            const originalPos = State.search.originalPosition;

            if (originalPos.bookIndex !== State.currentBookIndex) {
                State.currentBookIndex = originalPos.bookIndex;
                Elements.bookSelector.value = originalPos.bookIndex;
                UIManager.displayCurrentBook();
            }

            requestAnimationFrame(() => {
                window.scrollTo({
                    top: originalPos.scrollTop,
                    behavior: 'smooth'
                });
            });

            console.log('🏠 Returned to original reading position');
        }
    },

    /**
     * Perform search across all books
     */
    async performSearch(query) {
        if (!query || query.trim().length < 2) {
            State.search.results = [];
            State.search.query = '';
            this.renderResults();
            return;
        }

        const cleanQuery = query.trim();
        State.search.query = cleanQuery;
        State.search.results = [];

        try {
            // Search across all books
            const allResults = [];

            for (let bookIndex = 0; bookIndex < State.bookContents.length; bookIndex++) {
                const content = State.bookContents[bookIndex];
                if (!content) continue;

                const bookResults = await this.searchInBook(content, bookIndex, cleanQuery);
                allResults.push(...bookResults);
            }

            // Sort results by relevance (exact matches first, then by position)
            allResults.sort((a, b) => {
                if (a.exactMatch && !b.exactMatch) return -1;
                if (!a.exactMatch && b.exactMatch) return 1;
                if (a.bookIndex !== b.bookIndex) return a.bookIndex - b.bookIndex;
                return a.position - b.position;
            });

            // Add simplified display labels with counters per book
            const bookCounters = {};
            allResults.forEach(result => {
                if (!bookCounters[result.bookIndex]) {
                    bookCounters[result.bookIndex] = 0;
                }
                bookCounters[result.bookIndex]++;
                result.displayText = this.formatSimpleResultDisplay(result.bookTitle, bookCounters[result.bookIndex]);
            });

            State.search.results = allResults.slice(0, 100); // Limit to 100 results
            State.search.currentIndex = -1;
            this.renderResults();

            console.log(`🔍 Found ${State.search.results.length} results for "${cleanQuery}"`);

        } catch (error) {
            console.error('Search error:', error);
            State.search.results = [];
            this.renderResults();
        }
    },

    /**
     * Search within a single book
     */
    async searchInBook(content, bookIndex, query) {
        const results = [];
        const bookTitle = Utils.getBookTitle(CONFIG.EPUB_FILES[bookIndex]);

        // Create temporary DOM to search through
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // Remove script and style elements
        tempDiv.querySelectorAll('script, style').forEach(el => el.remove());

        // Get all chapter divs
        const chapters = tempDiv.querySelectorAll('.chapter-content');

        // Prepare search pattern (support simple regex)
        let searchPattern;
        let isRegex = false;
        try {
            // Check if query contains regex special characters
            if (/[.*+?^${}()|[\]\\]/.test(query) && query.length > 1) {
                searchPattern = new RegExp(query, 'gi');
                isRegex = true;
            } else {
                searchPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            }
        } catch (e) {
            // Fallback to literal search if regex is invalid
            searchPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        }

        chapters.forEach((chapter, chapterIndex) => {
            const chapterAnchor = chapter.id;
            const text = chapter.textContent;

            // Get proper chapter title using TOC mapping (same logic as bookmarks)
            const chapterTitle = this.getChapterTitleFromTOC(chapter, bookIndex) ||
                                BookmarkManager.extractBestChapterTitle(chapter);

            // Find all matches in this chapter
            let match;
            const matches = [];

            while ((match = searchPattern.exec(text)) !== null) {
                matches.push({
                    index: match.index,
                    matchText: match[0],
                    exactMatch: match[0].toLowerCase() === query.toLowerCase()
                });

                // Prevent infinite loop for zero-length matches
                if (match.index === searchPattern.lastIndex) {
                    searchPattern.lastIndex++;
                }
            }

            // Process matches to create result objects
            matches.forEach((match, matchIndex) => {
                const contextStart = Math.max(0, match.index - 80);
                const contextEnd = Math.min(text.length, match.index + match.matchText.length + 80);
                const context = text.substring(contextStart, contextEnd).trim();

                // Calculate position percentage in chapter
                const chapterLength = text.length;
                const positionPercent = Math.round((match.index / chapterLength) * 100);

                results.push({
                    bookIndex,
                    bookTitle,
                    chapterIndex,
                    chapterTitle,
                    chapterAnchor,
                    matchText: match.matchText,
                    context,
                    position: match.index,
                    positionPercent,
                    exactMatch: match.exactMatch,
                    resultId: `${bookIndex}_${chapterIndex}_${matchIndex}`,
                    displayText: '' // Will be set later with counter
                });
            });
        });

        return results;
    },

    /**
     * Format result display text
     */
    /**
     * Get chapter title from TOC mapping for search results
     */
    getChapterTitleFromTOC(chapterElement, bookIndex) {
        const toc = State.bookTOCs[bookIndex];
        if (!toc || !toc.length) return null;

        const chapterId = chapterElement.id;
        if (!chapterId) return null;

        // Find matching TOC entry by anchor
        const findTOCEntry = (items) => {
            for (let item of items) {
                if (item.anchor === chapterId) {
                    return item.label;
                }
                // Check subitems recursively
                if (item.subitems && item.subitems.length > 0) {
                    const subResult = findTOCEntry(item.subitems);
                    if (subResult) return subResult;
                }
            }
            return null;
        };

        return findTOCEntry(toc);
    },

    formatSimpleResultDisplay(bookTitle, resultNumber) {
        // Convert "Volume 3 Part 1 of 2" to "V3P1"
        const volumeMatch = bookTitle.match(/Volume (\d+)/);
        const partMatch = bookTitle.match(/Part (\d+)/);

        let shortTitle = '';
        if (volumeMatch) {
            shortTitle += `V${volumeMatch[1]}`;
        }
        if (partMatch) {
            shortTitle += `P${partMatch[1]}`;
        }

        // Fallback if pattern doesn't match
        if (!shortTitle) {
            shortTitle = bookTitle.substring(0, 3).toUpperCase();
        }

        return `${shortTitle}@${resultNumber}`;
    },

    formatResultDisplay(bookTitle, chapterTitle, positionPercent) {
        // Format like "Volume 1, 62% in Chapter XIII" (kept for compatibility)
        return `${bookTitle}, ${positionPercent}% in ${chapterTitle}`;
    },

    /**
     * Navigate to search result
     */
    navigateToResult(resultIndex) {
        if (resultIndex < 0 || resultIndex >= State.search.results.length) return;

        const result = State.search.results[resultIndex];
        State.search.currentIndex = resultIndex;

        console.log(`🎯 Navigating to result ${resultIndex + 1}/${State.search.results.length}:`, result.displayText);

        // Switch book if necessary
        if (result.bookIndex !== State.currentBookIndex) {
            State.currentBookIndex = result.bookIndex;
            Elements.bookSelector.value = result.bookIndex;
            UIManager.displayCurrentBook();
        }

        // Navigate to chapter and highlight match
        requestAnimationFrame(() => {
            const targetElement = document.getElementById(result.chapterAnchor);
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.offsetTop;
                const offsetPosition = elementPosition - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });

                // Highlight the search term and scroll to the specific match
                setTimeout(() => {
                    this.highlightSearchTerm(result.matchText, result.position, result.chapterAnchor);
                    this.updateResultsDisplay();
                }, 500);
            }
        });
    },

    /**
     * Navigate to previous result
     */
    navigatePrevious() {
        if (State.search.results.length === 0) return;

        let newIndex = State.search.currentIndex - 1;
        if (newIndex < 0) newIndex = State.search.results.length - 1;

        this.navigateToResult(newIndex);
    },

    /**
     * Navigate to next result
     */
    navigateNext() {
        if (State.search.results.length === 0) return;

        let newIndex = State.search.currentIndex + 1;
        if (newIndex >= State.search.results.length) newIndex = 0;

        this.navigateToResult(newIndex);
    },

    /**
     * Highlight search term in current view
     */
    highlightSearchTerm(searchTerm, targetPosition = null, chapterAnchor = null) {
        // Clear previous highlights
        this.clearHighlights();

        if (!searchTerm) return;

        console.log('🎨 Highlighting search term:', searchTerm, 'at position:', targetPosition, 'in chapter:', chapterAnchor);

        // Determine scope for highlighting
        let searchScope = Elements.bookContent;
        if (chapterAnchor) {
            const chapterElement = document.getElementById(chapterAnchor);
            if (chapterElement) {
                searchScope = chapterElement;
                console.log('🎯 Limiting search to chapter:', chapterAnchor);
            }
        }

        // Find and highlight all instances in the search scope
        const walker = document.createTreeWalker(
            searchScope,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        // Use the same pattern logic as the search to ensure consistency
        let searchPattern;
        try {
            // Check if searchTerm contains regex special characters
            if (/[.*+?^${}()|[\]\\]/.test(searchTerm) && searchTerm.length > 1) {
                searchPattern = new RegExp(`(${searchTerm})`, 'gi');
            } else {
                searchPattern = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            }
        } catch (e) {
            // Fallback to literal search if regex is invalid
            searchPattern = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        }

        let highlightCount = 0;
        let allHighlights = [];
        let currentTextPosition = 0;

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const nodeStartPosition = currentTextPosition;

            if (searchPattern.test(text)) {
                searchPattern.lastIndex = 0; // Reset for replace
                const highlightedHTML = text.replace(searchPattern, '<span class="search-highlight">$1</span>');

                if (highlightedHTML !== text) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = highlightedHTML;

                    const parent = textNode.parentNode;
                    while (tempDiv.firstChild) {
                        const child = tempDiv.firstChild;
                        parent.insertBefore(child, textNode);

                        // Track highlight elements with their position within the scope
                        if (child.classList && child.classList.contains('search-highlight')) {
                            allHighlights.push({
                                element: child,
                                textPosition: nodeStartPosition
                            });
                        }
                    }
                    parent.removeChild(textNode);
                    highlightCount++;
                }
            }

            currentTextPosition += text.length;
        });

        console.log(`🎨 Applied ${highlightCount} highlight instances in scope`);

        // Scroll to the targeted highlight or first one
        setTimeout(() => {
            let highlightToScrollTo = null;

            if (targetPosition !== null && allHighlights.length > 0) {
                // Find the highlight closest to our target position within the chapter
                let closestHighlight = allHighlights[0];
                let closestDistance = Math.abs(allHighlights[0].textPosition - targetPosition);

                for (let highlight of allHighlights) {
                    const distance = Math.abs(highlight.textPosition - targetPosition);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestHighlight = highlight;
                    }
                }

                highlightToScrollTo = closestHighlight;
                console.log(`📍 Found closest highlight at distance ${closestDistance} from target position ${targetPosition} within chapter`);
            } else {
                // No specific target, use first highlight
                highlightToScrollTo = allHighlights[0];
            }

            if (highlightToScrollTo && highlightToScrollTo.element) {
                highlightToScrollTo.element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
                console.log('📍 Scrolled to targeted highlighted instance');
            }
        }, 100);
    },

    /**
     * Clear search highlights
     */
    clearHighlights() {
        const highlights = Elements.bookContent.querySelectorAll('.search-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize(); // Merge adjacent text nodes
        });
    },

    /**
     * Clear search input and results
     */
    clearSearch() {
        Elements.searchInput.value = '';
        State.search.query = '';
        State.search.results = [];
        State.search.currentIndex = -1;
        this.renderResults();
        this.clearHighlights();
    },

    /**
     * Render search results in the UI
     */
    renderResults() {
        const container = Elements.searchResults;
        container.innerHTML = '';

        if (State.search.results.length === 0) {
            const message = State.search.query
                ? `No results found for "${State.search.query}"`
                : 'Enter a search term to find matches across all books';

            container.innerHTML = `<div class="search-no-results">${message}</div>`;

            // Disable navigation buttons
            Elements.searchPrev.disabled = true;
            Elements.searchNext.disabled = true;
            return;
        }

        // Enable navigation buttons
        Elements.searchPrev.disabled = false;
        Elements.searchNext.disabled = false;

        // Create result items
        State.search.results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            if (index === State.search.currentIndex) {
                item.classList.add('active');
            }

            item.textContent = result.displayText;
            item.title = result.context;

            item.addEventListener('click', () => {
                this.navigateToResult(index);
            });

            container.appendChild(item);
        });

        this.updateResultsDisplay();
    },

    /**
     * Update results display (scroll to current result)
     */
    updateResultsDisplay() {
        const resultItems = Elements.searchResults.querySelectorAll('.search-result-item');

        // Remove active class from all items
        resultItems.forEach(item => item.classList.remove('active'));

        // Add active class to current item and scroll to it
        if (State.search.currentIndex >= 0 && State.search.currentIndex < resultItems.length) {
            const currentItem = resultItems[State.search.currentIndex];
            currentItem.classList.add('active');
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
};

// ===== BOOKMARK MANAGER =====
const BookmarkManager = {
    MAX_BOOKMARKS_PER_BOOK: 10,
    activeTab: 'current',

    /**
     * Initialize bookmark manager
     */
    init() {
        this.loadFromStorage();
    },

    /**
     * Switch between current book and other books tabs
     */
    switchTab(tab) {
        this.activeTab = tab;

        // Update tab UI
        Elements.currentBookTab.classList.toggle('active', tab === 'current');
        Elements.otherBooksTab.classList.toggle('active', tab === 'other');

        // Re-render bookmarks for the selected tab
        this.renderBookmarks();
    },

    /**
     * Add bookmark for current position
     */
    addBookmark() {
        const position = this.getCurrentPosition();
        if (!position) return;

        this.addBookmarkAtPosition({
            bookIndex: State.currentBookIndex,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop
        });
    },

    /**
     * Add bookmark at specific position
     */
    addBookmarkAtPosition(position) {
        const currentChapter = this.getCurrentChapter(position.scrollTop);
        if (!currentChapter) return;

        const bookmark = {
            id: this.generateId(),
            bookIndex: position.bookIndex,
            bookTitle: Utils.getBookTitle(CONFIG.EPUB_FILES[position.bookIndex]),
            chapterTitle: currentChapter.title,
            chapterAnchor: currentChapter.anchor,
            scrollPosition: position.scrollTop,
            positionPercent: currentChapter.positionPercent,
            timestamp: new Date().toISOString(),
            displayText: this.formatBookmarkDisplay(
                Utils.getBookTitle(CONFIG.EPUB_FILES[position.bookIndex]),
                currentChapter.title,
                currentChapter.positionPercent
            )
        };

        // Initialize bookmarks array for this book if needed
        if (!State.bookmarks[position.bookIndex]) {
            State.bookmarks[position.bookIndex] = [];
        }

        const bookBookmarks = State.bookmarks[position.bookIndex];

        // Check if we already have a bookmark very close to this position (within 5% of chapter)
        const existingIndex = bookBookmarks.findIndex(b =>
            b.chapterAnchor === bookmark.chapterAnchor &&
            Math.abs(b.positionPercent - bookmark.positionPercent) < 5
        );

        if (existingIndex >= 0) {
            // Update existing bookmark
            bookBookmarks[existingIndex] = bookmark;
            console.log('📖 Updated existing bookmark:', bookmark.displayText);
        } else {
            // Add new bookmark to beginning of array (most recent first)
            bookBookmarks.unshift(bookmark);

            // Keep only the 10 most recent bookmarks
            if (bookBookmarks.length > this.MAX_BOOKMARKS_PER_BOOK) {
                bookBookmarks.splice(this.MAX_BOOKMARKS_PER_BOOK);
            }

            console.log('📖 Added new bookmark:', bookmark.displayText);
        }

        this.saveToStorage();
        this.renderBookmarks();

        return bookmark;
    },

    /**
     * Get current position info
     */
    getCurrentPosition() {
        return {
            bookIndex: State.currentBookIndex,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop
        };
    },

    /**
     * Get current chapter info with position percentage
     */
    getCurrentChapter(scrollTop = null) {
        if (scrollTop === null) {
            scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        }

        const chapters = document.querySelectorAll('.chapter-content');
        if (!chapters.length) return null;

        const viewportHeight = window.innerHeight;
        const viewportCenter = scrollTop + viewportHeight / 2;
        const headerOffset = 80; // Account for fixed header

        let bestChapter = chapters[0]; // Fallback to first chapter
        let maxVisibleArea = 0;

        // Find the chapter with the most visible area in the current viewport
        chapters.forEach(chapter => {
            const rect = chapter.getBoundingClientRect();
            const chapterTop = scrollTop + rect.top;
            const chapterBottom = chapterTop + rect.height;

            // Calculate visible area of this chapter in the current viewport
            const visibleTop = Math.max(chapterTop, scrollTop + headerOffset);
            const visibleBottom = Math.min(chapterBottom, scrollTop + viewportHeight);
            const visibleArea = Math.max(0, visibleBottom - visibleTop);

            // Prefer the chapter with the most visible area
            if (visibleArea > maxVisibleArea) {
                maxVisibleArea = visibleArea;
                bestChapter = chapter;
            }
            // If visible areas are close, prefer the chapter containing the viewport center
            else if (Math.abs(visibleArea - maxVisibleArea) < 100) {
                if (viewportCenter >= chapterTop && viewportCenter <= chapterBottom) {
                    bestChapter = chapter;
                    maxVisibleArea = visibleArea;
                }
            }
        });

        // Calculate position percentage within the chapter
        const chapterRect = bestChapter.getBoundingClientRect();
        const chapterTop = scrollTop + chapterRect.top;
        const chapterHeight = chapterRect.height;
        const relativePosition = Math.max(0, scrollTop + headerOffset - chapterTop);
        const positionPercent = Math.max(0, Math.min(100, Math.round((relativePosition / chapterHeight) * 100)));

        // Get the title using TOC mapping first, fallback to chapter extraction
        let chapterTitle = this.getTitleFromTOC(bestChapter) || this.extractBestChapterTitle(bestChapter);

        return {
            title: chapterTitle,
            anchor: bestChapter.id,
            positionPercent
        };
    },

    /**
     * Get chapter title from TOC mapping for accurate naming
     */
    getTitleFromTOC(chapterElement) {
        const toc = State.bookTOCs[State.currentBookIndex];
        if (!toc || !toc.length) return null;

        const chapterId = chapterElement.id;
        if (!chapterId) return null;

        // Find matching TOC entry by anchor
        const findTOCEntry = (items) => {
            for (let item of items) {
                if (item.anchor === chapterId) {
                    return item.label;
                }
                // Check subitems recursively
                if (item.subitems && item.subitems.length > 0) {
                    const subResult = findTOCEntry(item.subitems);
                    if (subResult) return subResult;
                }
            }
            return null;
        };

        return findTOCEntry(toc);
    },

    /**
     * Extract the best available chapter title from a chapter element
     */
    extractBestChapterTitle(chapterElement) {
        // First, try to find actual chapter headings in the content
        const chapterText = this.findChapterHeading(chapterElement);
        if (chapterText) {
            return chapterText;
        }

        // Try to get title from headings, but filter out Project Gutenberg titles
        const headings = chapterElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (let heading of headings) {
            let title = heading.textContent
                .replace(/\[[^\]]*\]/g, '') // Remove footnote references like [22]
                .replace(/\s+/g, ' ')
                .trim();

            // Skip Project Gutenberg titles
            if (title.includes('Project Gutenberg') || title.includes('eBook') || title.length > 100) {
                continue;
            }

            if (title && title.length > 3 && title.length < 200) {
                return title
                    .replace(/:$/, '') // Remove trailing colon
                    .replace(/\.$/, '') // Remove trailing dot
                    .trim();
            }
        }

        // Fallback to data-title, but clean it up
        let dataTitle = chapterElement.getAttribute('data-title');
        if (dataTitle) {
            // Check if it's a Project Gutenberg section or filename fallback
            if (dataTitle.startsWith('Section: ') && dataTitle.includes('.htm')) {
                // This is a filename fallback, try to find something better
                const alternativeTitle = this.findAlternativeTitle(chapterElement);
                if (alternativeTitle) {
                    return alternativeTitle;
                }
                // If no alternative found, at least clean up the section name
                return dataTitle.replace('Section: ', '').replace(/[_\d\-\.htm]+/g, '').trim() || 'Unknown Chapter';
            }

            // Skip Project Gutenberg titles in data-title too
            if (!dataTitle.includes('Project Gutenberg') && !dataTitle.includes('eBook')) {
                dataTitle = dataTitle
                    .replace(/\[[^\]]*\]/g, '') // Remove footnote references
                    .replace(/:$/, '') // Remove trailing colon
                    .replace(/\.$/, '') // Remove trailing dot
                    .trim();

                if (dataTitle.length > 0) {
                    return dataTitle;
                }
            }
        }

        return 'Unknown Chapter';
    },

    /**
     * Find chapter heading text in the content
     */
    findChapterHeading(chapterElement) {
        // Look for chapter patterns in the text content
        const textContent = chapterElement.textContent;

        // Pattern 1: "CHAPTER I." or "CHAPTER 1." followed by title
        const chapterMatch = textContent.match(/CHAPTER\s+[IVXLCDM\d]+\.?\s*([^\n\r.]*\.?)/i);
        if (chapterMatch) {
            let fullTitle = chapterMatch[0].trim();
            // Clean up the title
            fullTitle = fullTitle
                .replace(/\[[^\]]*\]/g, '') // Remove footnote references
                .replace(/\s+/g, ' ')
                .trim();

            if (fullTitle.length > 5 && fullTitle.length < 200) {
                return fullTitle;
            }
        }

        // Pattern 2: Look for any bold or emphasized text that contains "CHAPTER"
        const strongElements = chapterElement.querySelectorAll('strong, b, em, i');
        for (let element of strongElements) {
            const text = element.textContent.trim();
            if (text.match(/CHAPTER\s+[IVXLCDM\d]+/i) && text.length > 5 && text.length < 200) {
                return text
                    .replace(/\[[^\]]*\]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }
        }

        // Pattern 3: Look in paragraph text at the beginning of the chapter
        const paragraphs = chapterElement.querySelectorAll('p');
        for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
            const pText = paragraphs[i].textContent;
            const match = pText.match(/CHAPTER\s+[IVXLCDM\d]+\.?\s*([^\n\r.]*\.?)/i);
            if (match) {
                let title = match[0].trim();
                title = title
                    .replace(/\[[^\]]*\]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (title.length > 5 && title.length < 200) {
                    return title;
                }
            }
        }

        return null;
    },

    /**
     * Find alternative title by looking at content structure
     */
    findAlternativeTitle(chapterElement) {
        // Look for any bold or emphasized text that might be a chapter title
        const strongElements = chapterElement.querySelectorAll('strong, b, em, i');
        for (let element of strongElements) {
            const text = element.textContent.trim();
            if (text.match(/^CHAPTER\s+[IVXLCDM\d]+/i) || text.length > 10) {
                return text
                    .replace(/\[[^\]]*\]/g, '')
                    .replace(/:$/, '')
                    .replace(/\.$/, '')
                    .trim();
            }
        }

        // Look for any text that looks like a chapter heading
        const textContent = chapterElement.textContent;
        const chapterMatch = textContent.match(/CHAPTER\s+[IVXLCDM\d]+[^.]*\.?/i);
        if (chapterMatch) {
            return chapterMatch[0]
                .replace(/\[[^\]]*\]/g, '')
                .replace(/:$/, '')
                .replace(/\.$/, '')
                .trim();
        }

        return null;
    },

    /**
     * Format bookmark display text
     */
    formatBookmarkDisplay(bookTitle, chapterTitle, positionPercent) {
        // Format like "Volume 1, 62% in Chapter XIII"
        return `${bookTitle}, ${positionPercent}% in ${chapterTitle}`;
    },

    /**
     * Navigate to bookmark
     */
    navigateToBookmark(bookmark) {
        console.log('🎯 Navigating to bookmark:', bookmark.displayText);

        // Switch book if necessary
        if (bookmark.bookIndex !== State.currentBookIndex) {
            State.currentBookIndex = bookmark.bookIndex;
            Elements.bookSelector.value = bookmark.bookIndex;
            UIManager.displayCurrentBook();
        }

        // Navigate to saved position
        requestAnimationFrame(() => {
            window.scrollTo({
                top: bookmark.scrollPosition,
                behavior: 'smooth'
            });
        });

        ModalManager.close('bookmarks');
    },

    /**
     * Remove bookmark
     */
    removeBookmark(bookmarkId) {
        Object.keys(State.bookmarks).forEach(bookIndex => {
            State.bookmarks[bookIndex] = State.bookmarks[bookIndex].filter(
                bookmark => bookmark.id !== bookmarkId
            );
        });

        this.saveToStorage();
        this.renderBookmarks();
        console.log('🗑️ Removed bookmark:', bookmarkId);
    },

    /**
     * Save bookmarks to localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('epub-bookmarks', JSON.stringify(State.bookmarks));
        } catch (error) {
            console.error('Failed to save bookmarks:', error);
        }
    },

    /**
     * Load bookmarks from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('epub-bookmarks');
            State.bookmarks = saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Failed to load bookmarks:', error);
            State.bookmarks = {};
        }
    },

    /**
     * Render bookmarks in modal
     */
    renderBookmarks() {
        // Update tab title for current book
        const currentBookTitle = Utils.getBookTitle(CONFIG.EPUB_FILES[State.currentBookIndex]);
        Elements.currentBookTab.textContent = currentBookTitle;

        const container = Elements.bookmarksContent;
        container.innerHTML = '';

        if (this.activeTab === 'current') {
            this.renderCurrentBookBookmarks(container);
        } else {
            this.renderOtherBooksBookmarks(container);
        }
    },

    /**
     * Render bookmarks for current book
     */
    renderCurrentBookBookmarks(container) {
        const currentBookmarks = State.bookmarks[State.currentBookIndex];

        if (!currentBookmarks || currentBookmarks.length === 0) {
            container.innerHTML = '<div class="no-bookmarks">No bookmarks in current book yet.</div>';
            return;
        }

        const bookmarksList = document.createElement('div');
        bookmarksList.className = 'bookmarks-list';

        currentBookmarks.forEach(bookmark => {
            const item = this.createBookmarkItem(bookmark);
            bookmarksList.appendChild(item);
        });

        container.appendChild(bookmarksList);
    },

    /**
     * Render bookmarks for other books
     */
    renderOtherBooksBookmarks(container) {
        const currentBookIndex = State.currentBookIndex;
        const otherBooksWithBookmarks = Object.keys(State.bookmarks)
            .filter(bookIndex =>
                parseInt(bookIndex) !== currentBookIndex &&
                State.bookmarks[bookIndex] &&
                State.bookmarks[bookIndex].length > 0
            )
            .sort((a, b) => parseInt(a) - parseInt(b)); // Sort by book index

        if (otherBooksWithBookmarks.length === 0) {
            container.innerHTML = '<div class="no-bookmarks">No bookmarks in other volumes yet.</div>';
            return;
        }

        // Create a single list for all bookmarks from other books
        const bookmarksList = document.createElement('div');
        bookmarksList.className = 'bookmarks-list';

        // Collect all bookmarks from other books and sort by book order
        otherBooksWithBookmarks.forEach(bookIndex => {
            const bookmarks = State.bookmarks[bookIndex];
            bookmarks.forEach(bookmark => {
                const item = this.createBookmarkItem(bookmark);
                bookmarksList.appendChild(item);
            });
        });

        container.appendChild(bookmarksList);
    },

    /**
     * Create bookmark item element
     */
    createBookmarkItem(bookmark) {
        const item = document.createElement('div');
        item.className = 'bookmark-item';

        const date = new Date(bookmark.timestamp);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        item.innerHTML = `
            <div class="bookmark-info" title="Go to bookmark">
                <div class="bookmark-chapter">${bookmark.displayText}</div>
                <div class="bookmark-meta">${formattedDate}</div>
            </div>
            <div class="bookmark-actions">
                <button class="bookmark-action-btn" data-action="remove" data-id="${bookmark.id}"
                        aria-label="Remove bookmark" title="Remove bookmark">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        `;

        // Add event listeners
        item.querySelector('.bookmark-info').addEventListener('click', () => {
            this.navigateToBookmark(bookmark);
        });

        item.querySelector('[data-action="remove"]').addEventListener('click', () => {
            this.removeBookmark(bookmark.id);
        });

        return item;
    },

    /**
     * Generate unique ID for bookmark
     */
    generateId() {
        return 'bookmark_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
};

// ===== EPUB MANAGER =====
const EPUBManager = {
    /**
     * Load all EPUB files
     */
    async loadAll() {
        for (let i = 0; i < CONFIG.EPUB_FILES.length; i++) {
            const fileName = CONFIG.EPUB_FILES[i];

            try {
                await this.loadSingle(fileName, i);
            } catch (error) {
                console.error(`Failed to load EPUB: ${fileName}`, error);
                // Add placeholder for failed book
                State.epubBooks[i] = null;
                State.bookContents[i] = `<div class="error-content">
                    <h2>Failed to Load Book</h2>
                    <p>Could not load "${Utils.getBookTitle(fileName)}"</p>
                    <p>Error: ${error.message}</p>
                </div>`;
                State.bookTOCs[i] = [];
            }
        }

    },

    /**
     * Load single EPUB file using custom JSZip implementation
     */
    async loadSingle(fileName, index) {
        // Fetch the EPUB file
        const response = await fetch(fileName);
        if (!response.ok) {
            throw new Error(`File not found (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        // Load EPUB with JSZip
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Parse EPUB structure
        const epubData = await this.parseEPUB(zip);

        // Extract content and get filtered spine
        const { content, filteredSpine } = await this.extractContentFromZip(zip, epubData);
        const toc = this.extractTOCFromManifest(epubData, filteredSpine);

        // Store in state
        State.epubBooks[index] = epubData;
        State.bookContents[index] = content;
        State.bookTOCs[index] = toc;

        return epubData;
    },

    /**
     * Parse EPUB structure from ZIP
     */
    async parseEPUB(zip) {
        // Read container.xml to find OPF file
        const containerXML = await zip.file('META-INF/container.xml').async('text');
        const containerDoc = new DOMParser().parseFromString(containerXML, 'application/xml');
        const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');


        // Read OPF file
        const opfXML = await zip.file(opfPath).async('text');
        const opfDoc = new DOMParser().parseFromString(opfXML, 'application/xml');

        // Extract metadata
        const metadata = {
            title: opfDoc.querySelector('title')?.textContent || 'Unknown Title',
            creator: opfDoc.querySelector('creator')?.textContent || 'Unknown Author',
            version: opfDoc.documentElement.getAttribute('version') || '2.0'
        };

        // Extract manifest (list of files)
        const manifest = {};
        opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = {
                href: item.getAttribute('href'),
                mediaType: item.getAttribute('media-type')
            };
        });

        // Extract spine (reading order)
        const spine = [];
        opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
            const idref = itemref.getAttribute('idref');
            if (manifest[idref]) {
                spine.push({
                    id: idref,
                    href: manifest[idref].href,
                    mediaType: manifest[idref].mediaType
                });
            }
        });

        // Extract TOC (try NCX first, then navigation document)
        let tocHref = null;
        const tocItem = opfDoc.querySelector('spine').getAttribute('toc');
        if (tocItem && manifest[tocItem]) {
            tocHref = manifest[tocItem].href;
        } else {
            // Look for navigation document in EPUB3
            const navItem = opfDoc.querySelector('item[properties*="nav"]');
            if (navItem) {
                tocHref = navItem.getAttribute('href');
            }
        }

        return {
            opfPath,
            metadata,
            manifest,
            spine,
            tocHref,
            version: metadata.version
        };
    },

    /**
     * Extract content from ZIP using parsed EPUB data
     */
    async extractContentFromZip(zip, epubData) {
        const chapters = [];
        const filteredSpine = [];
        const basePath = epubData.opfPath.replace(/[^/]*$/, ''); // Get directory path


        for (let i = 0; i < epubData.spine.length; i++) {
            const spineItem = epubData.spine[i];
            const filePath = basePath + spineItem.href;

            // Processing chapter silently

            try {
                // Get file from ZIP
                const file = zip.file(filePath);
                if (!file) {
                    chapters.push(`<p><em>Chapter ${i + 1}: File not found</em></p>`);
                    continue;
                }

                // Read file content
                const fileContent = await file.async('text');
                // File loaded

                // Parse XHTML content
                let doc;
                try {
                    // Try XML parser first for XHTML
                    const parser = new DOMParser();
                    doc = parser.parseFromString(fileContent, 'application/xhtml+xml');

                    // Check if parsing failed
                    const parserError = doc.querySelector('parsererror');
                    if (parserError) {
                        throw new Error('XML parsing failed');
                    }
                } catch (xmlError) {
                    // Fallback to HTML parser
                    // XML->HTML fallback
                    const parser = new DOMParser();
                    doc = parser.parseFromString(fileContent, 'text/html');
                }

                // Extract body content
                let html = '';
                const body = doc.querySelector('body');
                if (body) {
                    html = body.innerHTML;
                } else {
                    // No body tag, try to get meaningful content
                    const content = doc.documentElement;
                    if (content) {
                        html = content.innerHTML;
                    } else {
                        html = fileContent;
                    }
                }

                // Clean up XHTML/XML artifacts
                if (html) {
                    html = this.cleanXHTMLContent(html);
                    // Fix links and images
                    html = this.fixContentLinks(html, epubData, zip);

                    // Extract chapter title from content
                    const chapterTitle = this.extractChapterTitle(html, spineItem.href);

                    // Skip sections marked for removal
                    if (chapterTitle === '__SKIP_SECTION__') {
                        continue; // Skip this iteration entirely
                    }

                    // Add to filtered spine for TOC generation
                    filteredSpine.push(spineItem);

                    // Add chapter anchor for navigation
                    const chapterAnchor = spineItem.href.replace(/[^a-zA-Z0-9]/g, '_');
                    html = `<div id="chapter_${chapterAnchor}" class="chapter-content" data-title="${chapterTitle}">${html}</div>`;
                }

                if (html && html.length > 0) {
                    chapters.push(html);
                    // Chapter processed
                } else {
                    // No content warning
                    chapters.push(`<p><em>Chapter ${i + 1}: No content available</em></p>`);
                }

            } catch (error) {
                chapters.push(`<p><em>Chapter ${i + 1}: Error loading - ${error.message}</em></p>`);
            }
        }

        const fullContent = chapters.join('\n<div class="chapter-separator"></div>\n');
        return { content: fullContent, filteredSpine };
    },

    /**
     * Clean XHTML content for display
     */
    cleanXHTMLContent(html) {
        return html
            .replace(/xmlns[^=]*="[^"]*"/g, '') // Remove xmlns attributes
            .replace(/<\?xml[^>]*\?>/g, '') // Remove XML declarations
            .replace(/epub:type="[^"]*"/g, '') // Remove epub:type attributes
            .replace(/xml:lang="[^"]*"/g, '') // Remove xml:lang attributes
            .replace(/<head>[\s\S]*?<\/head>/gi, '') // Remove head sections
            .replace(/<html[^>]*>/gi, '') // Remove html tags
            .replace(/<\/html>/gi, '')
            .replace(/<body[^>]*>/gi, '') // Remove body opening tags
            .replace(/<\/body>/gi, '') // Remove body closing tags
            .trim();
    },

    /**
     * Fix internal links and images in content
     */
    fixContentLinks(html, epubData, zip) {
        const basePath = epubData.opfPath.replace(/[^/]*$/, '');

        // Images are hidden via CSS, skip processing for now
        // html = html.replace(/src="([^"]+\.(jpg|jpeg|png|gif|svg))"/gi, ...);

        // Fix internal links to work as anchors within the same page
        let linkCount = 0;
        html = html.replace(/href="([^"]+\.xhtml?)(?:#([^"]+))?"/gi, (match, filePath, anchor) => {
            linkCount++;
            if (anchor) {
                // Convert to internal anchor link
                return `href="#${anchor}"`;
            } else {
                // Link to another chapter - convert to anchor based on file name
                const chapterAnchor = filePath.replace(/[^a-zA-Z0-9]/g, '_');
                return `href="#chapter_${chapterAnchor}"`;
            }
        });

        if (linkCount > 0) {
        }

        return html;
    },

    /**
     * Detect common Project Gutenberg metadata sections
     */
    detectProjectGutenbergSection(html, href) {
        const cleanText = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

        // Check for empty or minimal content sections that should be filtered out
        if (cleanText.length < 50 ||
            cleanText.match(/^\s*$/) ||
            href.includes('wrapooo') ||
            cleanText.match(/^\s*[\w\d\-_]+\s*$/)) {
            return '__SKIP_SECTION__'; // Special marker for sections to skip
        }

        // Project Gutenberg title page detection
        if (cleanText.includes('The Project Gutenberg eBook') ||
            cleanText.includes('This ebook is for the use of anyone anywhere')) {
            return 'Project Gutenberg Information';
        }

        // Publisher/distributor information detection
        if (cleanText.includes('Distributed By:') && cleanText.includes('D K Publishers') ||
            cleanText.includes('Published By:') && cleanText.includes('Low Price Publications') ||
            cleanText.includes('ISBN') && cleanText.includes('Reprinted')) {
            return 'Publisher Information';
        }

        // Table of Contents detection
        if (cleanText.includes('TABLE OF CONTENTS') || cleanText.includes('CONTENTS')) {
            return 'Table of Contents';
        }

        // Preface/Introduction detection - only for standalone preface sections, not chapter introductions
        if (cleanText.includes('PREFACE') ||
            (cleanText.includes('INTRODUCTION') && !cleanText.includes('CHAPTER'))) {
            return 'Preface';
        }

        return null;
    },

    /**
     * Extract chapter title from HTML content
     */
    extractChapterTitle(html, href) {
        // Check for common Project Gutenberg sections first
        const pgSections = this.detectProjectGutenbergSection(html, href);
        if (pgSections) {
            if (pgSections === '__SKIP_SECTION__') {
                return pgSections;
            }
            return pgSections;
        }

        // Try multiple patterns to find chapter titles
        const patterns = [
            // Pattern 1: CHAPTER IX. Title
            /<h[1-6][^>]*>(\s*CHAPTER\s+[IVX\d]+\.?\s*[^<]*?)<\/h[1-6]>/i,
            // Pattern 2: Any heading with "CHAPTER"
            /<h[1-6][^>]*>([^<]*CHAPTER[^<]*)<\/h[1-6]>/i,
            // Pattern 3: First substantial heading (more than 10 chars)
            /<h[1-6][^>]*>([^<]{10,})<\/h[1-6]>/i,
            // Pattern 4: Any first heading
            /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                let title = match[1]
                    .replace(/<[^>]*>/g, '') // Remove HTML tags
                    .replace(/\[[^\]]*\]/g, '') // Remove footnote references like [22]
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .replace(/^\s*\d+\.\s*/, '') // Remove leading numbers like "1. "
                    .replace(/:$/, '') // Remove trailing colon
                    .replace(/\.$/, '') // Remove trailing dot
                    .trim();

                // If we found a chapter title, clean it up nicely
                if (title && title.length > 3 && title.length < 200) {
                    // Fix common formatting issues
                    title = title
                        .replace(/\.\s*\.\s*\./g, '...') // Fix multiple dots
                        .replace(/\s*\.\s*$/, '.') // Ensure single dot at end
                        .replace(/([A-Z])\s+([A-Z])/g, '$1 $2'); // Fix spacing

                    return title;
                }
            }
        }

        // Last resort: use filename but make it more readable
        const fileName = href.split('/').pop().replace(/\.(x?html?)$/, '');
        return `Section: ${fileName}`;
    },

    /**
     * Extract TOC from parsed EPUB manifest
     */
    extractTOCFromManifest(epubData, filteredSpine = null) {
        // Use filtered spine if provided, otherwise fall back to full spine
        const spineItems = filteredSpine || epubData.spine;

        // Generate TOC from spine items with better titles
        const toc = spineItems.map((item, index) => {
            // Generate chapter anchor that matches our content
            const chapterAnchor = item.href.replace(/[^a-zA-Z0-9]/g, '_');

            return {
                label: `Chapter ${index + 1}`, // Will be updated after content loads
                href: item.href,
                id: item.id,
                anchor: `chapter_${chapterAnchor}`
            };
        });

        return toc;
    },

    /**
     * Update TOC with actual chapter titles after content is loaded
     */
    updateTOCWithTitles() {
        const toc = State.bookTOCs[State.currentBookIndex];
        if (!toc) return;


        // Find all chapter content divs and extract titles from actual content
        document.querySelectorAll('.chapter-content').forEach((chapterDiv, index) => {
            let title = null;

            // First check if this is a Project Gutenberg section
            const pgSection = this.detectProjectGutenbergSection(chapterDiv.innerHTML, '');
            if (pgSection) {
                if (pgSection === '__SKIP_SECTION__') {
                    return; // Skip this section in TOC
                }
                title = pgSection;
            } else {
                // Try to extract title from the actual rendered content
                const heading = chapterDiv.querySelector('h1, h2, h3, h4, h5, h6');

                if (heading) {
                    title = heading.textContent
                        .replace(/\[[^\]]*\]/g, '') // Remove footnote references like [22]
                        .replace(/\s+/g, ' ')
                        .replace(/:$/, '') // Remove trailing colon
                        .replace(/\.$/, '') // Remove trailing dot
                        .trim();

                    // If title is too long, truncate it
                    if (title.length > 80) {
                        title = title.substring(0, 80) + '...';
                    }

                } else {
                    // Fallback to data-title attribute
                    title = chapterDiv.getAttribute('data-title');
                }
            }

            if (title && toc[index]) {
                toc[index].label = title;
            }
        });

    },

    /**
     * Parse NCX or navigation document for detailed TOC (future enhancement)
     */
    async extractDetailedTOC(zip, epubData) {
        if (!epubData.tocHref) {
            return this.extractTOCFromManifest(epubData);
        }

        try {
            const basePath = epubData.opfPath.replace(/[^/]*$/, '');
            const tocPath = basePath + epubData.tocHref;
            const tocFile = zip.file(tocPath);

            if (!tocFile) {
                return this.extractTOCFromManifest(epubData);
            }

            const tocContent = await tocFile.async('text');
            const tocDoc = new DOMParser().parseFromString(tocContent, 'application/xml');

            // Parse NCX format
            if (tocContent.includes('ncx')) {
                return this.parseNCXTOC(tocDoc);
            }

            // Parse EPUB3 navigation document
            if (tocContent.includes('nav')) {
                return this.parseNavTOC(tocDoc);
            }

            return this.extractTOCFromManifest(epubData);
        } catch (error) {
            return this.extractTOCFromManifest(epubData);
        }
    },

    /**
     * Parse NCX TOC format
     */
    parseNCXTOC(doc) {
        const navPoints = doc.querySelectorAll('navPoint');
        const toc = [];

        navPoints.forEach(navPoint => {
            const navLabel = navPoint.querySelector('navLabel text');
            const content = navPoint.querySelector('content');

            if (navLabel && content) {
                toc.push({
                    label: navLabel.textContent.trim(),
                    href: content.getAttribute('src'),
                    id: navPoint.getAttribute('id')
                });
            }
        });

        return toc;
    },

    /**
     * Parse EPUB3 navigation document
     */
    parseNavTOC(doc) {
        const tocNav = doc.querySelector('nav[*|type="toc"]') || doc.querySelector('nav');
        if (!tocNav) return [];

        const links = tocNav.querySelectorAll('a');
        const toc = [];

        links.forEach(link => {
            toc.push({
                label: link.textContent.trim(),
                href: link.getAttribute('href'),
                id: link.getAttribute('href')
            });
        });

        return toc;
    }
};

// ===== LEXICON MANAGER =====
const LexiconManager = {
    /**
     * Load lexicon data
     */
    async load() {
        try {
            const response = await fetch(CONFIG.LEXICON_FILE);
            if (response.ok) {
                State.lexicon = await response.json();
            } else {
                // Lexicon file not found
            }
        } catch (error) {
            console.error('Failed to load lexicon:', error);
        }
    },

    /**
     * Process content to make Sanskrit words clickable
     */
    processContent(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip script and style elements
                    const parent = node.parentElement;
                    return parent && !['SCRIPT', 'STYLE'].includes(parent.tagName)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            if (!CONFIG.DEVANAGARI_REGEX.test(text)) return;

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            CONFIG.DEVANAGARI_REGEX.lastIndex = 0; // Reset regex
            while ((match = CONFIG.DEVANAGARI_REGEX.exec(text)) !== null) {
                // Add text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex, match.index))
                    );
                }

                // Create clickable Sanskrit word
                const span = document.createElement('span');
                span.className = 'sanskrit-word';
                span.textContent = match[0];
                span.setAttribute('data-word', match[0]);
                span.setAttribute('role', 'button');
                span.setAttribute('tabindex', '0');
                span.setAttribute('aria-label', `Sanskrit word: ${match[0]}`);
                fragment.appendChild(span);

                lastIndex = match.index + match[0].length;
            }

            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(
                    document.createTextNode(text.slice(lastIndex))
                );
            }

            if (fragment.childNodes.length > 0) {
                textNode.parentNode.replaceChild(fragment, textNode);
            }
        });
    },

    /**
     * Show lexicon entry for word
     */
    showEntry(word) {
        const entry = State.lexicon[word];
        const content = entry
            ? new showdown.Converter().makeHtml(entry)
            : `<h2>${word}</h2><p>Definition not found in lexicon.</p>`;

        Elements.lexiconContent.innerHTML = Utils.createSafeHTML(content);
        ModalManager.open('lexicon');
    }
};

// ===== UI MANAGER =====
const UIManager = {
    /**
     * Initialize book selector
     */
    initBookSelector() {
        Elements.bookSelector.innerHTML = '';

        CONFIG.EPUB_FILES.forEach((fileName, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = Utils.getBookTitle(fileName);
            Elements.bookSelector.appendChild(option);
        });

        Elements.bookSelector.value = State.currentBookIndex;
    },

    /**
     * Display current book content
     */
    displayCurrentBook() {
        const content = State.bookContents[State.currentBookIndex];

        if (!content) {
            console.error(`No content for book ${State.currentBookIndex}`);
            ErrorHandler.showError('Book content not available');
            return;
        }


        ErrorHandler.clearError();
        Utils.hide(Elements.loadingIndicator);

        Elements.bookContent.innerHTML = Utils.createSafeHTML(content);
        LexiconManager.processContent(Elements.bookContent);

        Utils.show(Elements.bookContent);

        // Restore position after DOM has had time to render
        requestAnimationFrame(() => {
            SettingsManager.restorePosition();
            console.log(`📖 Restored position for book ${State.currentBookIndex}`);
        });

        // Update TOC with extracted chapter titles
        EPUBManager.updateTOCWithTitles();
    },

    /**
     * Generate and display table of contents
     */
    generateTOC() {
        const toc = State.bookTOCs[State.currentBookIndex];

        if (!toc || toc.length === 0) {
            Elements.tocContent.innerHTML = '<p>No table of contents available for this book.</p>';
            return;
        }

        // Special handling for V3P2 - extract and render the existing TOC table
        if (this.isV3P2Book()) {
            const tocTableHTML = this.extractV3P2TOCTable();
            if (tocTableHTML) {
                Elements.tocContent.innerHTML = tocTableHTML;
                return;
            }
        }

        const createTOCList = (items) => {
            const ul = document.createElement('ul');
            ul.className = 'toc-list';

            items.forEach(item => {
                const li = document.createElement('li');
                li.className = 'toc-item';

                const a = document.createElement('a');
                a.className = 'toc-link';
                a.href = `#${item.anchor}`;
                a.textContent = item.label;
                a.setAttribute('data-href', item.href);
                a.setAttribute('role', 'button');

                a.addEventListener('click', (e) => {
                    e.preventDefault();

                    // Use the anchor from our TOC item
                    const targetId = item.anchor || `chapter_${item.href.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const targetElement = document.getElementById(targetId);

                    if (targetElement) {
                        // Calculate offset for fixed header
                        const headerOffset = 80;
                        const elementPosition = targetElement.offsetTop;
                        const offsetPosition = elementPosition - headerOffset;

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });

                        console.log(`📖 TOC navigation to: ${targetId} (${item.label})`);
                    } else {
                        console.warn(`❌ TOC target not found: ${targetId}`);
                    }

                    ModalManager.close('toc');
                });

                li.appendChild(a);

                if (item.subitems && item.subitems.length > 0) {
                    const subList = createTOCList(item.subitems);
                    subList.className = 'toc-sublist';
                    li.appendChild(subList);
                }

                ul.appendChild(li);
            });

            return ul;
        };

        Elements.tocContent.innerHTML = '';
        Elements.tocContent.appendChild(createTOCList(toc));
    },

    /**
     * Check if current book is V3P2
     */
    isV3P2Book() {
        const currentBook = State.epubBooks[State.currentBookIndex];
        const title = currentBook?.metadata?.title || '';

        // Check for Vol. 3, Part 2 pattern
        return title.includes('Vol. 3') && title.includes('Part 2');
    },

    /**
     * Extract and process V3P2's TOC table for display
     */
    extractV3P2TOCTable() {
        // Get the current book content
        const content = State.bookContents[State.currentBookIndex];
        if (!content) return null;

        // Find the TOC table
        const tocTableMatch = content.match(/<table[^>]*data-summary="toc"[^>]*>[\s\S]*?<\/table>/i);
        if (!tocTableMatch) return null;

        // Parse the table and extract chapter data
        const tableHTML = tocTableMatch[0];
        const chapters = [];

        // Extract chapter links and descriptions
        const rows = tableHTML.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

        let currentChapter = null;

        for (let row of rows) {
            // Check for chapter link
            const chapterMatch = row.match(/<a[^>]*href="[^"]*#([^"]*)"[^>]*>(CHAPTER[^<]*)<\/a>/i);
            if (chapterMatch) {
                currentChapter = {
                    anchor: chapterMatch[1],
                    title: chapterMatch[2].trim().replace(/\.$/, ''),
                    description: ''
                };
            }
            // Check for description in next row
            else if (currentChapter && row.includes('class="tdl"')) {
                const descMatch = row.match(/<td[^>]*class="tdl"[^>]*>([^<]*)<\/td>/i);
                if (descMatch) {
                    currentChapter.description = descMatch[1].trim();
                    chapters.push(currentChapter);
                    currentChapter = null;
                }
            }
        }

        // Generate TOC list HTML in the same style as original
        const tocListHTML = chapters.map(chapter => {
            const fullTitle = chapter.description ?
                `${chapter.title}. ${chapter.description}` :
                chapter.title;

            return `
                <li class="toc-item">
                    <a class="toc-link" href="#" onclick="UIManager.navigateToV3P2Chapter('${chapter.anchor}'); ModalManager.close('toc'); return false;" role="button">
                        ${fullTitle}
                    </a>
                </li>
            `;
        }).join('');

        return `<ul class="toc-list">${tocListHTML}</ul>`;
    },

    /**
     * Navigate to a specific chapter in V3P2
     */
    navigateToV3P2Chapter(anchor) {
        // Navigate to the anchor
        const targetElement = document.getElementById(anchor);
        if (targetElement) {
            const headerOffset = 80;
            const elementPosition = targetElement.offsetTop;
            const offsetPosition = elementPosition - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    },

    // navigateToSection removed - using direct anchor navigation now

    /**
     * Show loading state
     */
    showLoading() {
        Utils.show(Elements.loadingIndicator);
        Utils.hide(Elements.bookContent);
        Utils.hide(Elements.errorMessage);
    },

    /**
     * Initialize help content
     */
    initHelp() {
        const converter = new showdown.Converter();
        Elements.helpContent.innerHTML = converter.makeHtml(CONFIG.HELP_TEXT);
    }
};

// ===== MODAL MANAGER =====
const ModalManager = {
    activeModal: null,

    /**
     * Open modal
     */
    open(modalName) {
        const modal = Elements[`${modalName}Modal`];
        if (!modal) return;

        // Close any open modal first
        this.closeAll();

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.activeModal = modalName;

        // Focus first focusable element
        const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();

        // Generate content for specific modals
        if (modalName === 'toc') {
            UIManager.generateTOC();
        } else if (modalName === 'bookmarks') {
            // Default to current book tab when opening bookmarks
            BookmarkManager.activeTab = 'current';
            Elements.currentBookTab.classList.add('active');
            Elements.otherBooksTab.classList.remove('active');
            BookmarkManager.renderBookmarks();
        }
    },

    /**
     * Close specific modal
     */
    close(modalName) {
        const modal = Elements[`${modalName}Modal`];
        if (!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');

        if (this.activeModal === modalName) {
            this.activeModal = null;
        }
    },

    /**
     * Close all modals
     */
    closeAll() {
        ['toc', 'settings', 'help', 'lexicon'].forEach(name => {
            this.close(name);
        });
    }
};

// ===== EVENT HANDLERS =====
const EventHandlers = {
    /**
     * Initialize all event listeners
     */
    init() {
        // Book selector
        Elements.bookSelector.addEventListener('change', this.onBookChange.bind(this));

        // Header buttons
        Elements.themeBtn.addEventListener('click', this.onThemeToggle.bind(this));
        Elements.settingsBtn.addEventListener('click', () => ModalManager.open('settings'));
        Elements.tocBtn.addEventListener('click', () => ModalManager.open('toc'));
        Elements.searchBtn.addEventListener('click', () => SearchManager.togglePanel());
        Elements.bookmarksBtn.addEventListener('click', () => ModalManager.open('bookmarks'));
        Elements.helpBtn.addEventListener('click', () => ModalManager.open('help'));

        // Search panel controls
        Elements.searchInput.addEventListener('input', Utils.debounce((e) => {
            SearchManager.performSearch(e.target.value);
        }, 300));
        Elements.searchInput.addEventListener('keydown', this.onSearchKeydown.bind(this));
        Elements.searchClear.addEventListener('click', () => SearchManager.clearSearch());
        Elements.searchClose.addEventListener('click', () => SearchManager.closePanel(true));
        Elements.searchBack.addEventListener('click', () => SearchManager.returnToOriginal());
        Elements.searchPrev.addEventListener('click', () => SearchManager.navigatePrevious());
        Elements.searchNext.addEventListener('click', () => SearchManager.navigateNext());

        // Bookmark controls
        Elements.addBookmarkBtn.addEventListener('click', () => BookmarkManager.addBookmark());
        Elements.currentBookTab.addEventListener('click', () => BookmarkManager.switchTab('current'));
        Elements.otherBooksTab.addEventListener('click', () => BookmarkManager.switchTab('other'));

        // Settings controls
        Elements.fontFamilySelect.addEventListener('change', this.onFontFamilyChange.bind(this));
        Elements.fontSizeSelect.addEventListener('change', this.onFontSizeChange.bind(this));
        Elements.lineHeightSelect.addEventListener('change', this.onLineHeightChange.bind(this));

        // Modal close buttons
        Elements.closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) {
                    const modalName = modal.id.replace('-modal', '');
                    ModalManager.close(modalName);
                }
            });
        });

        // Modal overlay clicks
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    const modalName = overlay.id.replace('-modal', '');
                    ModalManager.close(modalName);
                }
            });
        });

        // Sanskrit word clicks
        document.addEventListener('click', this.onSanskritWordClick.bind(this));
        document.addEventListener('keydown', this.onSanskritWordKeydown.bind(this));

        // Reading position saving - listen to window scroll events
        window.addEventListener('scroll',
            Utils.debounce(SettingsManager.savePosition.bind(SettingsManager), 500)
        );

        // Global keyboard shortcuts
        document.addEventListener('keydown', this.onGlobalKeydown.bind(this));
    },

    /**
     * Handle book selection change
     */
    async onBookChange(e) {
        const newIndex = parseInt(e.target.value, 10);
        if (newIndex === State.currentBookIndex) return;

        // Save current reading position before switching books
        SettingsManager.savePosition();

        console.log(`💾 Saved position for book ${State.currentBookIndex} before switching`);

        State.currentBookIndex = newIndex;
        SettingsManager.save(CONFIG.STORAGE_KEYS.CURRENT_BOOK, newIndex);
        UIManager.displayCurrentBook();
    },

    /**
     * Handle theme toggle
     */
    onThemeToggle() {
        State.settings.theme = State.settings.theme === 'light' ? 'dark' : 'light';
        SettingsManager.save(CONFIG.STORAGE_KEYS.THEME, State.settings.theme);
        SettingsManager.apply();
    },

    /**
     * Handle font family change
     */
    onFontFamilyChange(e) {
        State.settings.fontFamily = e.target.value;
        SettingsManager.save(CONFIG.STORAGE_KEYS.FONT_FAMILY, State.settings.fontFamily);
        SettingsManager.apply();
    },

    /**
     * Handle font size change
     */
    onFontSizeChange(e) {
        State.settings.fontSize = e.target.value;
        SettingsManager.save(CONFIG.STORAGE_KEYS.FONT_SIZE, State.settings.fontSize);
        SettingsManager.apply();
    },

    /**
     * Handle line height change
     */
    onLineHeightChange(e) {
        State.settings.lineHeight = e.target.value;
        SettingsManager.save(CONFIG.STORAGE_KEYS.LINE_HEIGHT, State.settings.lineHeight);
        SettingsManager.apply();
    },

    /**
     * Handle Sanskrit word clicks
     */
    onSanskritWordClick(e) {
        if (e.target.classList.contains('sanskrit-word')) {
            const word = e.target.getAttribute('data-word');
            if (word) {
                LexiconManager.showEntry(word);
            }
        }
    },

    /**
     * Handle Sanskrit word keyboard activation
     */
    onSanskritWordKeydown(e) {
        if ((e.key === 'Enter' || e.key === ' ') &&
            e.target.classList.contains('sanskrit-word')) {
            e.preventDefault();
            const word = e.target.getAttribute('data-word');
            if (word) {
                LexiconManager.showEntry(word);
            }
        }
    },

    /**
     * Handle search input keyboard shortcuts
     */
    onSearchKeydown(e) {
        switch (e.key) {
            case 'Escape':
                SearchManager.closePanel(true);
                break;
            case 'ArrowUp':
                e.preventDefault();
                SearchManager.navigatePrevious();
                break;
            case 'ArrowDown':
                e.preventDefault();
                SearchManager.navigateNext();
                break;
            case 'Enter':
                e.preventDefault();
                if (State.search.results.length > 0) {
                    if (State.search.currentIndex < 0) {
                        SearchManager.navigateToResult(0);
                    }
                }
                break;
        }
    },

    /**
     * Handle global keyboard shortcuts
     */
    onGlobalKeydown(e) {
        if (e.key === 'Escape') {
            if (State.search.isOpen) {
                SearchManager.closePanel(true);
            } else {
                ModalManager.closeAll();
            }
        }

        // Ctrl+F to open search
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            SearchManager.openPanel();
        }

        // Ctrl+B to open bookmarks
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            ModalManager.open('bookmarks');
        }
    }
};

// ===== INITIALIZATION =====
const App = {
    /**
     * Initialize DOM elements
     */
    initElements() {
        // Main elements
        Elements.bookSelector = document.getElementById('book-selector');
        Elements.themeBtn = document.getElementById('theme-btn');
        Elements.settingsBtn = document.getElementById('settings-btn');
        Elements.tocBtn = document.getElementById('toc-btn');
        Elements.searchBtn = document.getElementById('search-btn');
        Elements.bookmarksBtn = document.getElementById('bookmarks-btn');
        Elements.helpBtn = document.getElementById('help-btn');

        // Content areas
        Elements.loadingIndicator = document.getElementById('loading-indicator');
        Elements.bookContent = document.getElementById('book-content');
        Elements.errorMessage = document.getElementById('error-message');
        Elements.errorText = document.getElementById('error-text');

        // Search panel
        Elements.searchPanel = document.getElementById('search-panel');
        Elements.searchInput = document.getElementById('search-input');
        Elements.searchResults = document.getElementById('search-results');
        Elements.searchBack = document.getElementById('search-back');
        Elements.searchPrev = document.getElementById('search-prev');
        Elements.searchNext = document.getElementById('search-next');
        Elements.searchClear = document.getElementById('search-clear');
        Elements.searchClose = document.getElementById('search-close');

        // Modals
        Elements.tocModal = document.getElementById('toc-modal');
        Elements.settingsModal = document.getElementById('settings-modal');
        Elements.helpModal = document.getElementById('help-modal');
        Elements.lexiconModal = document.getElementById('lexicon-modal');
        Elements.bookmarksModal = document.getElementById('bookmarks-modal');

        // Modal content
        Elements.tocContent = document.getElementById('toc-content');
        Elements.helpContent = document.getElementById('help-content');
        Elements.lexiconContent = document.getElementById('lexicon-content');
        Elements.bookmarksContent = document.getElementById('bookmarks-content');
        Elements.addBookmarkBtn = document.getElementById('add-bookmark-btn');
        Elements.currentBookTab = document.getElementById('current-book-tab');
        Elements.otherBooksTab = document.getElementById('other-books-tab');

        // Settings controls
        Elements.fontFamilySelect = document.getElementById('font-family');
        Elements.fontSizeSelect = document.getElementById('font-size');
        Elements.lineHeightSelect = document.getElementById('line-height');

        // Close buttons
        Elements.closeButtons = Array.from(document.querySelectorAll('.close-btn'));
    },

    /**
     * Main initialization function
     */
    async init() {
        try {

            // Initialize DOM elements
            this.initElements();

            // Load settings
            SettingsManager.load();
            SettingsManager.apply();

            // Initialize UI components
            UIManager.initBookSelector();
            UIManager.initHelp();
            UIManager.showLoading();

            // Initialize managers
            BookmarkManager.init();

            // Load external data
            await Promise.all([
                EPUBManager.loadAll(),
                LexiconManager.load()
            ]);

            // Display initial content
            UIManager.displayCurrentBook();

            // Initialize event handlers
            EventHandlers.init();

            // Setup smooth scrolling for internal links
            App.setupSmoothScrolling();

            State.isInitialized = true;
            State.isLoading = false;


        } catch (error) {
            ErrorHandler.handle(error, 'Initialization');
        }
    },

    /**
     * Setup smooth scrolling for internal anchor links
     */
    setupSmoothScrolling() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    // Calculate offset for fixed header (60px header + 20px padding)
                    const headerOffset = 80;
                    const elementPosition = targetElement.offsetTop;
                    const offsetPosition = elementPosition - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });

                } else {
                    console.error(`Anchor not found: #${targetId}`);
                }
            }
        });
    }
};

// ===== APPLICATION STARTUP =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// ===== ERROR HANDLING FOR UNHANDLED PROMISES =====
window.addEventListener('unhandledrejection', (event) => {
    ErrorHandler.handle(event.reason, 'Unhandled Promise');
});

// ===== EXPORT FOR DEBUGGING =====
if (typeof window !== 'undefined') {
    window.YogaVasishthaReader = {
        App,
        State,
        Config: CONFIG,
        Utils,
        EPUBManager,
        LexiconManager,
        SettingsManager,
        UIManager,
        ModalManager
    };
}