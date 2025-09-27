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
    LEXICON_FILE_DEVA: "Yoga-Vasishtha-Devanagari-Lexicon.json",
    LEXICON_FILE_IAST: "Yoga-Vasishtha-IAST-Lexicon.json",
    STORAGE_KEYS: {
        THEME: 'epub-theme',
        FONT_FAMILY: 'epub-font-family',
        FONT_SIZE: 'epub-font-size',
        LINE_HEIGHT: 'epub-line-height',
        CURRENT_BOOK: 'epub-current-book',
        READING_POSITION: 'epub-position-'
    },
    DEVANAGARI_REGEX: /[\u0900-\u097F]+/g,
    SANSKRIT_PATTERN_REGEX: /\[Sanskrit:\s*([^\]]+)\]/g,
    DEFAULTS: {
        THEME: 'light',
        FONT_FAMILY: 'Georgia, serif',
        FONT_SIZE: '16px',
        LINE_HEIGHT: '1.6'
    },
    HELP_TEXT: `# Yoga Vasishtha EPUB Reader

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

Each pattern searches across all books simultaneously, showing results with context and allowing navigation to exact locations in the text.

## Features
- **Multi-volume EPUB library**: Navigate between 7 volumes of Yoga Vasishtha
- **Sanskrit lexicon**: Click on Sanskrit words for instant definitions
- **Advanced search**: Regex-powered search across all volumes with context highlighting
- **Personal annotations**: Add, edit, and manage notes with text selection
- **Bookmark system**: Save reading positions with automatic previews
- **Table of contents**: Native EPUB navigation
- **Customizable reading**: Adjust fonts, sizes, and themes
- **Reading progress**: Automatically saved position per book
- **Google Drive sync**: Cloud backup of bookmarks, notes, and reading positions
- **Export functionality**: Download bookmarks and notes as JSON files`
};

// ===== APPLICATION STATE =====
const State = {
    currentBookIndex: 0,
    epubBooks: [],
    bookContents: [],
    bookTOCs: [],
    lexicon: {},
    iastLexicon: {},
    iastKeySet: new Set(), // For fast O(1) lookup
    notes: {}, // Book notes storage: { bookIndex: [note1, note2, ...] }
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
     * Save reading position using simplified word-based positioning
     */
    savePosition() {
        const key = CONFIG.STORAGE_KEYS.READING_POSITION + State.currentBookIndex;

        // Find the topmost visible word for robust positioning
        const topWord = this.findTopVisibleWord();

        if (topWord) {
            const wordIndex = VolumePositioning.getWordIndexBeforeRange(topWord.range, State.currentBookIndex);

            const positionData = {
                wordIndex: wordIndex,
                word: topWord.word,
                timestamp: Date.now()
            };

            localStorage.setItem(key, JSON.stringify(positionData));
        } else {
            console.warn('Could not find visible word for reading position - position not saved');
        }
    },

    /**
     * Find the topmost visible word in the viewport (for reading position)
     */
    findTopVisibleWord() {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return null;

        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (!text) continue;

            // Check if this text node is visible in viewport
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();

            // Check if top of text is in viewport (allowing for some margin)
            if (rect.top >= -10 && rect.top <= window.innerHeight) {
                // Find first word in this text node
                const words = text.match(/\S+/g);
                if (words && words.length > 0) {
                    const firstWord = words[0];
                    const wordStartIndex = text.indexOf(firstWord);

                    // Create range for the first word
                    const wordRange = document.createRange();
                    wordRange.setStart(node, wordStartIndex);
                    wordRange.setEnd(node, wordStartIndex + firstWord.length);

                    return {
                        word: firstWord,
                        range: wordRange,
                        textNode: node
                    };
                }
            }
        }

        return null;
    },

    /**
     * Restore reading position using simplified word-based positioning
     */
    restorePosition() {
        const key = CONFIG.STORAGE_KEYS.READING_POSITION + State.currentBookIndex;
        const savedData = localStorage.getItem(key);

        if (!savedData) return;

        try {
            const positionData = JSON.parse(savedData);

            if (positionData.wordIndex !== undefined && positionData.word) {
                // Restore using word-based positioning with scrollIntoView
                const success = this.restoreWordPositionWithScrollIntoView(positionData);
                if (!success) {
                    console.warn('Word-based restoration failed - scrolling to top');
                    window.scrollTo({ top: 0, behavior: 'auto' });
                }
            } else {
                // Legacy format: migrate to new system
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        } catch (e) {
            // Invalid format: scroll to top
            console.warn('Invalid position data - scrolling to top');
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
    },

    /**
     * Restore reading position using word index with scrollIntoView
     */
    restoreWordPositionWithScrollIntoView(positionData) {
        // Create a temporary invisible element at the word position
        const marker = this.createPositionMarker(positionData);
        if (marker) {
            // Use scrollIntoView for robust positioning
            marker.scrollIntoView({
                behavior: 'auto',
                block: 'start',
                inline: 'nearest'
            });

            // Remove the temporary marker
            marker.remove();
            return true;
        }
        return false;
    },

    /**
     * Create invisible position marker at word location
     */
    createPositionMarker(positionData) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return null;

        // Use the same word positioning system as notes/bookmarks
        const domText = bookContent.textContent;
        const words = domText.match(/\S+/g) || [];

        if (positionData.wordIndex >= words.length) {
            console.warn('Reading position word index out of range');
            return null;
        }

        // Calculate character position from word index
        let approximateCharPos = 0;
        const wordPattern = /\S+/g;
        let match;
        let wordCount = 0;

        while ((match = wordPattern.exec(domText)) !== null && wordCount < positionData.wordIndex) {
            wordCount++;
            if (wordCount === positionData.wordIndex) {
                approximateCharPos = match.index;
                break;
            }
        }

        // Find the target word after this position
        const textFromPosition = domText.substring(approximateCharPos);
        const relativeIndex = textFromPosition.indexOf(positionData.word);

        if (relativeIndex === -1) {
            console.warn('Could not find reading position word in DOM');
            return null;
        }

        const absoluteCharPos = approximateCharPos + relativeIndex;

        // Find the DOM node containing this character position
        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let currentOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;

            if (currentOffset + nodeLength > absoluteCharPos) {
                // Found the text node - create invisible marker
                const nodeOffset = absoluteCharPos - currentOffset;
                const marker = document.createElement('span');
                marker.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none;';

                // Split the text node and insert marker
                const range = document.createRange();
                range.setStart(node, nodeOffset);
                range.collapse(true);
                range.insertNode(marker);

                return marker;
            }

            currentOffset += nodeLength;
        }

        return null;
    },

    /**
     * Handle window resize events to maintain reading position
     */
    handleWindowResize() {
        // Save current position before resize effects take place
        const currentPosition = this.getCurrentReadingPosition();
        if (currentPosition) {
            // Use a short delay to allow layout to settle, then restore position
            setTimeout(() => {
                const marker = this.createPositionMarker(currentPosition);
                if (marker) {
                    marker.scrollIntoView({
                        behavior: 'auto',
                        block: 'start',
                        inline: 'nearest'
                    });
                    marker.remove();
                }
            }, 50);
        }
    },

    /**
     * Get current reading position data (for resize handling)
     */
    getCurrentReadingPosition() {
        const key = CONFIG.STORAGE_KEYS.READING_POSITION + State.currentBookIndex;
        const savedData = localStorage.getItem(key);

        if (savedData) {
            try {
                const positionData = JSON.parse(savedData);
                if (positionData.wordIndex !== undefined && positionData.word) {
                    return positionData;
                }
            } catch (e) {
                // Invalid data
            }
        }
        return null;
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
                Elements.bookSelectorMobile.value = originalPos.bookIndex;
                UIManager.displayCurrentBook();
            }

            // Restore original scroll position
            requestAnimationFrame(() => {
                window.scrollTo({
                    top: originalPos.scrollTop,
                    behavior: 'smooth'
                });
            });

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
                Elements.bookSelectorMobile.value = originalPos.bookIndex;
                UIManager.displayCurrentBook();
            }

            requestAnimationFrame(() => {
                window.scrollTo({
                    top: originalPos.scrollTop,
                    behavior: 'smooth'
                });
            });

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


        // Switch book if necessary
        if (result.bookIndex !== State.currentBookIndex) {
            State.currentBookIndex = result.bookIndex;
            Elements.bookSelector.value = result.bookIndex;
            Elements.bookSelectorMobile.value = result.bookIndex;
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


        // Determine scope for highlighting
        let searchScope = Elements.bookContent;
        if (chapterAnchor) {
            const chapterElement = document.getElementById(chapterAnchor);
            if (chapterElement) {
                searchScope = chapterElement;
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

// ===== NOTIFICATION MANAGER =====
const NotificationManager = {
    /**
     * Show a themed notification
     */
    show(message, type = 'info') {
        // Remove any existing notifications
        this.clear();

        const notification = document.createElement('div');
        notification.className = 'notification notification-' + type;
        notification.textContent = message;

        // Add notification to the body
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.classList.add('notification-show');
        }, 10);

        // Auto-remove after 2.5 seconds
        setTimeout(() => {
            this.hide(notification);
        }, 2500);
    },

    /**
     * Hide a notification with animation
     */
    hide(notification) {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    },

    /**
     * Clear all notifications
     */
    clear() {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(n => n.parentNode.removeChild(n));
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
     * Add bookmark for current position using word highlighting
     */
    addBookmark() {
        const topVisibleWord = this.getTopVisibleWord();
        if (!topVisibleWord) {
            console.warn('Could not find top visible word for bookmark');
            return;
        }

        this.createWordBookmark(topVisibleWord);
    },

    /**
     * Find the topmost visible word in the viewport
     */
    getTopVisibleWord() {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return null;

        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (!text) continue;

            // Check if this text node is visible in viewport
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();

            // Check if top of text is in viewport (allowing for some margin)
            if (rect.top >= -10 && rect.top <= window.innerHeight) {
                // Find first word in this text node
                const words = text.match(/\S+/g);
                if (words && words.length > 0) {
                    const firstWord = words[0];
                    const wordStartIndex = text.indexOf(firstWord);

                    // Create range for the first word
                    const wordRange = document.createRange();
                    wordRange.setStart(node, wordStartIndex);
                    wordRange.setEnd(node, wordStartIndex + firstWord.length);

                    return {
                        word: firstWord,
                        range: wordRange,
                        textNode: node
                    };
                }
            }
        }

        return null;
    },

    /**
     * Create word bookmark using notes-like highlighting system
     */
    createWordBookmark(wordInfo) {
        // Create bookmark highlight similar to notes
        const highlight = document.createElement('span');
        highlight.className = 'bookmark-highlight';
        const bookmarkId = this.generateId();
        highlight.setAttribute('data-bookmark-id', bookmarkId);

        // Wrap the selected word
        try {
            wordInfo.range.surroundContents(highlight);
        } catch (e) {
            // If surroundContents fails, use extractContents
            const contents = wordInfo.range.extractContents();
            highlight.appendChild(contents);
            wordInfo.range.insertNode(highlight);
        }

        // Create bookmark icon (similar to note icon)
        const bookmarkIcon = this.createBookmarkIcon(bookmarkId);
        highlight.appendChild(bookmarkIcon);

        // Create bookmark object
        const currentChapter = this.getCurrentChapter();
        const bookmark = {
            id: bookmarkId,
            bookIndex: State.currentBookIndex,
            bookTitle: Utils.getBookTitle(CONFIG.EPUB_FILES[State.currentBookIndex]),
            chapterTitle: currentChapter ? currentChapter.title : 'Unknown Chapter',
            chapterAnchor: currentChapter ? currentChapter.anchor : '',
            word: wordInfo.word,
            timestamp: new Date().toISOString(),
            // Store positioning data using the same system as notes
            previousWordIndex: VolumePositioning.getWordIndexBeforeRange(wordInfo.range, State.currentBookIndex),
            displayText: this.formatWordBookmarkDisplay(
                Utils.getBookTitle(CONFIG.EPUB_FILES[State.currentBookIndex]),
                currentChapter ? currentChapter.title : 'Unknown Chapter',
                wordInfo.word
            )
        };

        // Save bookmark
        this.addBookmarkToStorage(bookmark);
    },

    /**
     * Create bookmark icon (similar to note icon)
     */
    createBookmarkIcon(bookmarkId) {
        const icon = document.createElement('span');
        icon.className = 'bookmark-icon';
        icon.setAttribute('data-bookmark-id', bookmarkId);
        icon.innerHTML = '<span class="material-icons">bookmark</span>';

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            // Open bookmarks modal when clicked
            ModalManager.open('bookmarks');
        });

        return icon;
    },

    /**
     * Add bookmark to storage (similar to notes storage)
     */
    addBookmarkToStorage(bookmark) {
        // Initialize bookmarks array for this book if needed
        if (!State.bookmarks[bookmark.bookIndex]) {
            State.bookmarks[bookmark.bookIndex] = [];
        }

        const bookBookmarks = State.bookmarks[bookmark.bookIndex];

        // Check if we already have a bookmark close to this position
        const existingIndex = bookBookmarks.findIndex(b =>
            b.previousWordIndex !== undefined &&
            Math.abs(b.previousWordIndex - bookmark.previousWordIndex) < 10
        );

        if (existingIndex >= 0) {
            // Update existing bookmark
            bookBookmarks[existingIndex] = bookmark;
        } else {
            // Add new bookmark to beginning of array (most recent first)
            bookBookmarks.unshift(bookmark);

            // Keep only the 10 most recent bookmarks
            if (bookBookmarks.length > this.MAX_BOOKMARKS_PER_BOOK) {
                bookBookmarks.splice(this.MAX_BOOKMARKS_PER_BOOK);
            }

        }

        this.saveToStorage();
        this.renderBookmarks();
    },

    /**
     * Format display text for word-based bookmarks
     */
    formatWordBookmarkDisplay(bookTitle, chapterTitle, word) {
        const shortTitle = bookTitle.replace(/^(Vol\.|Volume)\s*\d+\s*[-:]?\s*/i, '').substring(0, 30);
        const shortChapter = chapterTitle.length > 40 ? chapterTitle.substring(0, 40) + '...' : chapterTitle;
        return `"${word}" in ${shortChapter}`;
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
        } else {
            // Add new bookmark to beginning of array (most recent first)
            bookBookmarks.unshift(bookmark);

            // Keep only the 10 most recent bookmarks
            if (bookBookmarks.length > this.MAX_BOOKMARKS_PER_BOOK) {
                bookBookmarks.splice(this.MAX_BOOKMARKS_PER_BOOK);
            }

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

        // Switch book if necessary
        if (bookmark.bookIndex !== State.currentBookIndex) {
            State.currentBookIndex = bookmark.bookIndex;
            Elements.bookSelector.value = bookmark.bookIndex;
            Elements.bookSelectorMobile.value = bookmark.bookIndex;
            UIManager.displayCurrentBook();
        }

        // Navigate to bookmark position
        requestAnimationFrame(() => {
            if (bookmark.previousWordIndex !== undefined) {
                // Use word-index positioning for new word bookmarks
                this.navigateToWordBookmark(bookmark);
            } else {
                // Fallback to scroll position for legacy bookmarks
                window.scrollTo({
                    top: bookmark.scrollPosition,
                    behavior: 'smooth'
                });
            }
        });

        ModalManager.close('bookmarks');
    },

    /**
     * Navigate to word bookmark using notes-like restoration
     */
    navigateToWordBookmark(bookmark) {
        // Check if bookmark highlight already exists
        const existingHighlight = document.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
        if (existingHighlight) {
            // Scroll to existing highlight
            existingHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // Restore bookmark using same system as notes
        const success = VolumePositioning.restoreBookmarkHighlight(bookmark, State.currentBookIndex);
        if (!success) {
            console.warn('Word bookmark navigation failed, using fallback');
            // Fallback: scroll to top if no scroll position available
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    /**
     * Remove bookmark
     */
    removeBookmark(bookmarkId) {
        // Remove bookmark highlight from DOM if it exists
        const bookmarkHighlight = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
        if (bookmarkHighlight) {
            // If it's a highlight, unwrap it (similar to notes removal)
            if (bookmarkHighlight.classList.contains('bookmark-highlight')) {
                const parent = bookmarkHighlight.parentNode;
                while (bookmarkHighlight.firstChild) {
                    parent.insertBefore(bookmarkHighlight.firstChild, bookmarkHighlight);
                }
                parent.removeChild(bookmarkHighlight);
            }
        }

        // Remove bookmark from storage
        Object.keys(State.bookmarks).forEach(bookIndex => {
            State.bookmarks[bookIndex] = State.bookmarks[bookIndex].filter(
                bookmark => bookmark.id !== bookmarkId
            );
        });

        this.saveToStorage();
        this.renderBookmarks();
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
    },

    /**
     * Restore bookmark highlights for current book (similar to notes restoration)
     */
    restoreBookmarkHighlights() {
        const currentBookmarks = State.bookmarks[State.currentBookIndex];
        if (!currentBookmarks) {
            return;
        }

        // Filter for word-based bookmarks (new system)
        const wordBookmarks = currentBookmarks.filter(b =>
            b.previousWordIndex !== undefined && b.word
        );


        wordBookmarks.forEach(bookmark => {

            // Check if bookmark highlight already exists
            const existingHighlight = document.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
            if (existingHighlight) {
                return;
            }

            // Restore bookmark highlight
            const success = VolumePositioning.restoreBookmarkHighlight(bookmark, State.currentBookIndex);
            if (!success) {
                console.warn('Failed to restore bookmark highlight:', bookmark.word);
            }
        });

    },

    /**
     * Export bookmarks to JSON file
     */
    async exportToJSON() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `Yoga-Vasishtha-Bookmarks-${timestamp}.json`;

            const data = {
                type: 'bookmarks',
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: State.bookmarks
            };

            const jsonContent = JSON.stringify(data, null, 2);

            // Check if we're on mobile with Capacitor
            if (window.Capacitor?.isNativePlatform && window.Capacitor.Plugins?.Filesystem) {
                try {
                    const { Filesystem } = window.Capacitor.Plugins;

                    await Filesystem.writeFile({
                        path: filename,
                        data: jsonContent,
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });

                    NotificationManager.show('Bookmarks exported to Documents folder', 'info');
                } catch (capacitorError) {
                    // Fall back to web download
                    const blob = new Blob([jsonContent], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                }
            } else {
                // Web browser - use blob download
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

            }
        } catch (error) {
            console.error('Failed to export bookmarks:', error);
            NotificationManager.show('Export failed: ' + error.message, 'error');
        }
    },

    /**
     * Import bookmarks from JSON file
     */
    importFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);

                    // Validate JSON structure
                    if (!importedData.type || importedData.type !== 'bookmarks' || !importedData.data) {
                        throw new Error('Invalid bookmark file format');
                    }

                    this.mergeBookmarks(importedData.data);
                } catch (error) {
                    console.error('❌ Import failed:', error);
                    NotificationManager.show('Import failed: Invalid bookmark file', 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    },

    /**
     * Merge imported bookmarks with existing ones
     */
    mergeBookmarks(importedBookmarks) {
        let mergeCount = 0;

        Object.keys(importedBookmarks).forEach(bookIndex => {
            const importedBookmarkList = importedBookmarks[bookIndex] || [];
            const existingBookmarks = State.bookmarks[bookIndex] || [];

            importedBookmarkList.forEach(importedBookmark => {
                // Check for exact duplicates
                const isDuplicate = existingBookmarks.some(existing =>
                    existing.bookIndex === importedBookmark.bookIndex &&
                    existing.chapterAnchor === importedBookmark.chapterAnchor &&
                    Math.abs(existing.scrollPosition - importedBookmark.scrollPosition) < 10
                );

                if (!isDuplicate) {
                    if (!State.bookmarks[bookIndex]) {
                        State.bookmarks[bookIndex] = [];
                    }
                    State.bookmarks[bookIndex].push(importedBookmark);
                    mergeCount++;
                }
            });
        });

        this.saveToStorage();
        this.renderBookmarks();

        if (mergeCount > 0) {
            NotificationManager.show(`Imported ${mergeCount} bookmarks`, 'info');
        }
    }
};

// ===== VOLUME POSITIONING MANAGER =====
const VolumePositioning = {
    /**
     * Get word index before a DOM range using consistent DOM-level positioning
     */
    getWordIndexBeforeRange(range, bookIndex) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) {
            console.warn('No book content DOM available');
            return 0;
        }


        // Get the character position of the selection start in the processed DOM
        const selectionStart = this.getRangeOffsetInDOM(range.startContainer, range.startOffset);

        // Get the full processed DOM text content
        const domText = bookContent.textContent;

        // Get text before the selection
        const textBeforeSelection = domText.substring(0, selectionStart);

        // Split into words and count them
        const words = textBeforeSelection.match(/\S+/g) || [];
        const wordIndex = words.length;


        return wordIndex;
    },


    /**
     * Get character offset of range in DOM content
     */
    getRangeOffsetInDOM(container, offset) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) {
            return 0;
        }

        // Handle element nodes by finding the correct text node
        let targetNode = container;
        let targetOffset = offset;

        if (container.nodeType === Node.ELEMENT_NODE) {

            // For element nodes, offset refers to child nodes
            const childNodes = Array.from(container.childNodes);
            let currentOffset = 0;

            for (let i = 0; i < childNodes.length; i++) {
                const child = childNodes[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    if (currentOffset === offset) {
                        targetNode = child;
                        targetOffset = 0;
                        break;
                    }
                    currentOffset++;
                }
            }
        }


        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let totalOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            if (node === targetNode) {
                return totalOffset + targetOffset;
            }
            totalOffset += node.textContent.length;
        }

        return 0; // Return 0 instead of totalOffset when not found
    },

    /**
     * Restore highlight at specific word index using consistent DOM-level positioning
     */
    restoreHighlightAtWordIndex(note, bookIndex) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) {
            console.warn('No book content DOM for restoration');
            return false;
        }

        // Use the same processed DOM content for restoration
        const domText = bookContent.textContent;
        const words = domText.match(/\S+/g) || [];


        if (note.previousWordIndex >= words.length) {
            console.warn('Word index out of range in DOM');
            return false;
        }

        // Calculate exact character position from word index
        let approximateCharPos = 0;

        // Walk through DOM text and count words until we reach target word index
        const wordPattern = /\S+/g;
        let match;
        let wordCount = 0;

        while ((match = wordPattern.exec(domText)) !== null && wordCount < note.previousWordIndex) {
            wordCount++;
            if (wordCount === note.previousWordIndex) {
                approximateCharPos = match.index; // Position of the word after our target position
                break;
            }
        }


        // Find selected text after this approximate position
        const textFromPosition = domText.substring(approximateCharPos);
        const relativeIndex = textFromPosition.indexOf(note.selectedText);

        if (relativeIndex === -1) {
            console.warn('Could not find selected text after word position in DOM');
            return false;
        }

        const absoluteCharPos = approximateCharPos + relativeIndex;

        // Create highlight at this DOM position
        return this.createHighlightAtDOMPosition(note, absoluteCharPos);
    },

    /**
     * Restore bookmark highlight using same system as notes
     */
    restoreBookmarkHighlight(bookmark, bookIndex) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) {
            console.warn('No book content DOM for bookmark restoration');
            return false;
        }

        // Use the same processed DOM content for restoration
        const domText = bookContent.textContent;
        const words = domText.match(/\S+/g) || [];


        if (bookmark.previousWordIndex >= words.length) {
            console.warn('Bookmark word index out of range in DOM');
            return false;
        }

        // Calculate exact character position from word index
        let approximateCharPos = 0;

        // Walk through DOM text and count words until we reach target word index
        const wordPattern = /\S+/g;
        let match;
        let wordCount = 0;

        while ((match = wordPattern.exec(domText)) !== null && wordCount < bookmark.previousWordIndex) {
            wordCount++;
            if (wordCount === bookmark.previousWordIndex) {
                approximateCharPos = match.index; // Position of the word after our target position
                break;
            }
        }


        // Find the bookmark word after this approximate position
        const textFromPosition = domText.substring(approximateCharPos);
        const relativeIndex = textFromPosition.indexOf(bookmark.word);

        if (relativeIndex === -1) {
            console.warn('Could not find bookmark word after word position in DOM');
            return false;
        }

        const absoluteCharPos = approximateCharPos + relativeIndex;

        // Create bookmark highlight at this DOM position
        return this.createBookmarkHighlightAtDOMPosition(bookmark, absoluteCharPos);
    },

    /**
     * Create bookmark highlight at character position in DOM
     */
    createBookmarkHighlightAtDOMPosition(bookmark, characterPosition) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return false;

        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let currentOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;

            if (currentOffset + nodeLength > characterPosition) {
                const nodeOffset = characterPosition - currentOffset;
                const endOffset = nodeOffset + bookmark.word.length;

                // Verify text matches
                const foundText = node.textContent.substring(nodeOffset, endOffset);
                if (foundText === bookmark.word) {
                    // Create range for the bookmark word
                    const range = document.createRange();
                    range.setStart(node, nodeOffset);
                    range.setEnd(node, endOffset);

                    // Create bookmark highlight
                    const highlight = document.createElement('span');
                    highlight.className = 'bookmark-highlight';
                    highlight.setAttribute('data-bookmark-id', bookmark.id);

                    try {
                        range.surroundContents(highlight);
                    } catch (e) {
                        const contents = range.extractContents();
                        highlight.appendChild(contents);
                        range.insertNode(highlight);
                    }

                    // Create bookmark icon
                    const bookmarkIcon = document.createElement('span');
                    bookmarkIcon.className = 'bookmark-icon';
                    bookmarkIcon.setAttribute('data-bookmark-id', bookmark.id);
                    bookmarkIcon.innerHTML = '<span class="material-icons">bookmark</span>';

                    bookmarkIcon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        ModalManager.open('bookmarks');
                    });

                    highlight.appendChild(bookmarkIcon);

                    // Scroll to the restored bookmark
                    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    return true;
                }
            }

            currentOffset += nodeLength;
        }

        return false;
    },


    /**
     * Create highlight at character position in DOM
     */
    createHighlightAtDOMPosition(note, characterPosition) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return false;

        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let currentOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;

            if (currentOffset + nodeLength > characterPosition) {
                const nodeOffset = characterPosition - currentOffset;
                const endOffset = nodeOffset + note.selectedText.length;

                // Verify text matches
                const foundText = node.textContent.substring(nodeOffset, endOffset);
                if (foundText === note.selectedText) {
                    const range = document.createRange();
                    range.setStart(node, nodeOffset);
                    range.setEnd(node, endOffset);

                    const highlight = document.createElement('span');
                    highlight.className = 'note-highlight';
                    highlight.setAttribute('data-note-id', note.id);

                    try {
                        range.surroundContents(highlight);
                        const noteIcon = NotesManager.createNoteIcon(note.id);
                        highlight.appendChild(noteIcon);
                        return true;
                    } catch (e) {
                        console.warn('Could not surround contents:', e);
                    }
                }
                break;
            }

            currentOffset += nodeLength;
        }

        return false;
    }
};

// ===== NOTES MANAGER =====
const NotesManager = {
    MAX_NOTES_PER_BOOK: 50,
    activeTab: 'current',
    isTextSelectionMode: false,
    currentSelection: null,

    /**
     * Initialize notes manager
     */
    init() {
        this.loadFromStorage();
        this.initEventListeners();
    },

    /**
     * Initialize event listeners for text selection
     */
    initEventListeners() {
        // Listen for text selection events (both mouse and touch)
        document.addEventListener('mouseup', (e) => {
            if (this.isTextSelectionMode) {
                this.handleTextSelection(e);
            }
        });

        // Mobile touch events - capture selection immediately on touch end
        document.addEventListener('touchend', (e) => {
            if (this.isTextSelectionMode) {

                // Capture selection IMMEDIATELY (before it disappears)
                const selection = window.getSelection();
                if (selection.rangeCount && !selection.isCollapsed) {
                    const range = selection.getRangeAt(0);
                    const selectedText = range.toString().trim();

                    // Store the selection data immediately
                    this.capturedMobileSelection = {
                        range: range.cloneRange(),
                        text: selectedText
                    };

                    // Process it after a small delay to avoid conflicts with browser
                    setTimeout(() => {
                        this.processCapturedMobileSelection();
                    }, 50);
                } else {
                }
            }
        });

        // Selection change event (fires when text selection changes)
        // Only used to store the selection, not to immediately process it
        document.addEventListener('selectionchange', (e) => {
            if (this.isTextSelectionMode) {
                // Just store the current selection without processing it yet
                this.storeCurrentSelection();
            }
        });

        // Prevent default context menu on mobile only during selection mode
        document.addEventListener('contextmenu', (e) => {
            if (this.isTextSelectionMode) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            // Allow normal context menu when not in selection mode
        });

        // Listen for escape key to exit selection mode
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isTextSelectionMode && !ModalManager.activeModal) {
                this.exitTextSelectionMode();
            }
        });
    },

    /**
     * Switch between current book and other books tabs
     */
    switchTab(tab) {
        this.activeTab = tab;
        // Update tab UI
        document.getElementById('current-book-notes-tab').classList.toggle('active', tab === 'current');
        document.getElementById('other-books-notes-tab').classList.toggle('active', tab === 'other');
        // Re-render notes for the selected tab
        this.renderNotes();
    },

    /**
     * Enter text selection mode
     */
    enterTextSelectionMode() {
        this.isTextSelectionMode = true;
        document.body.classList.add('text-selection-mode');

        // Mobile-specific: Initialize properties to handle touch events
        this.pendingMobileSelection = null;
        this.capturedMobileSelection = null;
        this.selectionTimeout = null;

        ModalManager.close('notes');
    },

    /**
     * Exit text selection mode
     */
    exitTextSelectionMode() {
        this.isTextSelectionMode = false;
        document.body.classList.remove('text-selection-mode');
        this.currentSelection = null;

        // Clean up mobile-specific properties
        this.pendingMobileSelection = null;
        this.capturedMobileSelection = null;
        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = null;
        }

    },

    /**
     * Store current selection without processing it
     */
    storeCurrentSelection() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            this.pendingMobileSelection = null;
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        // Only store if it's within book content
        const bookContent = document.getElementById('book-content');
        if (!bookContent || !bookContent.contains(range.commonAncestorContainer)) {
            this.pendingMobileSelection = null;
            return;
        }

        // Store the selection (but don't process it yet)
        this.pendingMobileSelection = {
            range: range.cloneRange(),
            text: selectedText
        };
    },

    /**
     * Handle mobile selection end (when user stops touching)
     */
    handleMobileSelectionEnd(e) {

        // Check if selection is still active
        const currentSelection = window.getSelection();

        if (!currentSelection.rangeCount || currentSelection.isCollapsed) {
            this.pendingMobileSelection = null;
            return;
        }

        const selectedText = currentSelection.toString().trim();
        if (selectedText.length < 3) {
            this.pendingMobileSelection = null;
            return;
        }

        // Check if selection is within book content
        const range = currentSelection.getRangeAt(0);
        const bookContent = document.getElementById('book-content');
        if (!bookContent || !bookContent.contains(range.commonAncestorContainer)) {
            return;
        }


        // Create the note directly with current selection
        this.createNoteFromSelection(range, selectedText);
    },

    /**
     * Process captured mobile selection and create note
     */
    processCapturedMobileSelection() {
        if (!this.capturedMobileSelection || !this.isTextSelectionMode) {
            return;
        }

        const { range, text } = this.capturedMobileSelection;
        this.capturedMobileSelection = null;


        // Validate the captured selection
        if (text.length < 3) {
            return;
        }

        // Check if selection is within book content
        const bookContent = document.getElementById('book-content');
        if (!bookContent || !bookContent.contains(range.commonAncestorContainer)) {
            return;
        }

        // Create the note with the captured selection
        this.createNoteFromSelection(range, text);
    },

    /**
     * Process mobile selection and create note (legacy method)
     */
    processMobileSelection() {
        if (!this.pendingMobileSelection || !this.isTextSelectionMode) return;

        const { range, text } = this.pendingMobileSelection;
        this.pendingMobileSelection = null;

        // Create the note with the stored selection
        this.createNoteFromSelection(range, text);
    },

    /**
     * Create note from selection (used by both desktop and mobile)
     */
    createNoteFromSelection(range, selectedText) {
        // Check for overlapping highlights
        const existingHighlight = this.findOverlappingHighlight(range);
        if (existingHighlight) {
            // Merge with existing highlight
            this.mergeWithExistingHighlight(existingHighlight, range);
        } else {
            // Create new highlight
            this.createNewHighlight(range, selectedText);
        }

        // Clear selection and exit selection mode
        window.getSelection().removeAllRanges();
        this.exitTextSelectionMode();
    },

    /**
     * Handle text selection
     */
    handleTextSelection(e) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        if (selectedText.length < 3) return; // Ignore very short selections

        // Check if selection is within book content
        const bookContent = document.getElementById('book-content');
        if (!bookContent.contains(range.commonAncestorContainer)) return;

        // Create the note
        this.createNoteFromSelection(range, selectedText);
    },

    /**
     * Find overlapping highlight
     */
    findOverlappingHighlight(range) {
        const highlights = document.querySelectorAll('.note-highlight');
        for (let highlight of highlights) {
            if (this.rangesOverlap(range, highlight)) {
                return highlight;
            }
        }
        return null;
    },

    /**
     * Check if ranges overlap
     */
    rangesOverlap(range, element) {
        try {
            const elementRange = document.createRange();
            elementRange.selectNodeContents(element);

            const startComparison = range.compareBoundaryPoints(Range.END_TO_START, elementRange);
            const endComparison = range.compareBoundaryPoints(Range.START_TO_END, elementRange);

            return startComparison <= 0 && endComparison >= 0;
        } catch (e) {
            return false;
        }
    },

    /**
     * Merge with existing highlight
     */
    mergeWithExistingHighlight(existingHighlight, newRange) {
        const noteId = existingHighlight.getAttribute('data-note-id');
        const note = this.findNoteById(noteId);
        if (!note) return;

        // Open note editor for existing note
        this.openNoteEditor(note);
    },

    /**
     * Create new highlight
     */
    createNewHighlight(range, selectedText) {
        // Create highlight element
        const highlight = document.createElement('span');
        highlight.className = 'note-highlight';
        const noteId = this.generateId();
        highlight.setAttribute('data-note-id', noteId);

        // Wrap the selected content
        try {
            range.surroundContents(highlight);
        } catch (e) {
            // If surroundContents fails (complex selection), use extractContents
            const contents = range.extractContents();
            highlight.appendChild(contents);
            range.insertNode(highlight);
        }

        // Create note icon
        const noteIcon = this.createNoteIcon(noteId);
        highlight.appendChild(noteIcon);

        // Create note object
        const position = this.getCurrentPosition();
        const currentChapter = BookmarkManager.getCurrentChapter();

        // Get word index before selection for robust positioning
        const previousWordIndex = this.getPreviousWordIndex(range);

        const note = {
            id: noteId,
            bookIndex: State.currentBookIndex,
            bookTitle: Utils.getBookTitle(CONFIG.EPUB_FILES[State.currentBookIndex]),
            chapterTitle: currentChapter ? currentChapter.title : 'Unknown Chapter',
            chapterAnchor: currentChapter ? currentChapter.anchor : '',
            selectedText: selectedText,
            noteText: '',
            timestamp: new Date().toISOString(),
            scrollPosition: window.pageYOffset || document.documentElement.scrollTop,
            previousWordIndex: previousWordIndex
        };

        // Save note
        this.addNoteToStorage(note);

        // Open note editor
        this.openNoteEditor(note);

    },

    /**
     * Create note icon
     */
    createNoteIcon(noteId) {
        const icon = document.createElement('span');
        icon.className = 'note-icon';
        icon.setAttribute('data-note-id', noteId);
        icon.innerHTML = '<span class="material-icons">sticky_note_2</span>';

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const note = this.findNoteById(noteId);
            if (note) {
                this.openNoteEditor(note);
            }
        });

        return icon;
    },

    /**
     * Open note editor
     */
    openNoteEditor(note) {
        const textarea = document.getElementById('note-editor-textarea');
        textarea.value = note.noteText || '';
        textarea.setAttribute('data-note-id', note.id);

        ModalManager.open('noteEditor');

        // Focus the textarea
        setTimeout(() => textarea.focus(), 100);

    },

    /**
     * Save note content
     */
    saveNoteContent(noteId, content) {
        const note = this.findNoteById(noteId);
        if (!note) return;

        note.noteText = content;
        note.timestamp = new Date().toISOString();

        this.saveToStorage();
        this.renderNotes();

    },

    /**
     * Delete note
     */
    deleteNote(noteId) {
        // Remove from storage
        for (let bookIndex in State.notes) {
            const bookNotes = State.notes[bookIndex];
            const noteIndex = bookNotes.findIndex(n => n.id === noteId);
            if (noteIndex >= 0) {
                bookNotes.splice(noteIndex, 1);
                break;
            }
        }

        // Remove highlight from DOM
        const highlight = document.querySelector(`[data-note-id="${noteId}"]`);
        if (highlight) {
            const parent = highlight.parentNode;
            while (highlight.firstChild) {
                parent.insertBefore(highlight.firstChild, highlight);
            }
            parent.removeChild(highlight);
        }

        this.saveToStorage();
        this.renderNotes();
        ModalManager.close('noteEditor');

    },

    /**
     * Navigate to note
     */
    navigateToNote(noteId) {
        const note = this.findNoteById(noteId);
        if (!note) return;

        // Switch to the correct book if needed
        if (note.bookIndex !== State.currentBookIndex) {
            State.currentBookIndex = note.bookIndex;
            UIManager.displayCurrentBook();
        }

        // Scroll to the note position
        setTimeout(() => {
            const highlight = document.querySelector(`[data-note-id="${noteId}"]`);
            if (highlight) {
                highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Briefly highlight the note
                highlight.style.backgroundColor = 'rgba(255, 193, 7, 0.6)';
                setTimeout(() => {
                    highlight.style.backgroundColor = '';
                }, 2000);
            } else {
                // Fallback to scroll position
                window.scrollTo({
                    top: note.scrollPosition,
                    behavior: 'smooth'
                });
            }
            ModalManager.close('notes');
        }, 100);
    },

    /**
     * Find note by ID
     */
    findNoteById(noteId) {
        for (let bookIndex in State.notes) {
            const bookNotes = State.notes[bookIndex];
            const note = bookNotes.find(n => n.id === noteId);
            if (note) return note;
        }
        return null;
    },

    /**
     * Add note to storage
     */
    addNoteToStorage(note) {
        if (!State.notes[note.bookIndex]) {
            State.notes[note.bookIndex] = [];
        }

        State.notes[note.bookIndex].unshift(note);

        // Keep only the most recent notes
        if (State.notes[note.bookIndex].length > this.MAX_NOTES_PER_BOOK) {
            State.notes[note.bookIndex].splice(this.MAX_NOTES_PER_BOOK);
        }

        this.saveToStorage();
    },

    /**
     * Get current position
     */
    getCurrentPosition() {
        return {
            bookIndex: State.currentBookIndex,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop
        };
    },

    /**
     * Render notes in the modal
     */
    renderNotes() {
        const content = document.getElementById('notes-content');
        const currentTab = document.getElementById('current-book-notes-tab');
        const otherTab = document.getElementById('other-books-notes-tab');

        // Update tab titles
        currentTab.textContent = Utils.getBookTitle(CONFIG.EPUB_FILES[State.currentBookIndex]);

        if (this.activeTab === 'current') {
            this.renderCurrentBookNotes(content);
        } else {
            this.renderOtherBooksNotes(content);
        }
    },

    /**
     * Render current book notes
     */
    renderCurrentBookNotes(container) {
        const notes = State.notes[State.currentBookIndex] || [];

        if (notes.length === 0) {
            container.innerHTML = '<div class="no-notes">No notes in this book yet.</div>';
            return;
        }

        const notesList = document.createElement('div');
        notesList.className = 'notes-list';

        notes.forEach(note => {
            const noteItem = this.createNoteItem(note);
            notesList.appendChild(noteItem);
        });

        container.innerHTML = '';
        container.appendChild(notesList);
    },

    /**
     * Render other books notes
     */
    renderOtherBooksNotes(container) {
        container.innerHTML = '';
        let hasNotes = false;

        CONFIG.EPUB_FILES.forEach((fileName, bookIndex) => {
            if (bookIndex === State.currentBookIndex) return;

            const bookNotes = State.notes[bookIndex] || [];
            if (bookNotes.length === 0) return;

            hasNotes = true;
            const bookSection = document.createElement('div');
            bookSection.className = 'note-book-section';

            const bookTitle = document.createElement('h3');
            bookTitle.className = 'note-book-title';
            bookTitle.textContent = Utils.getBookTitle(fileName);
            bookSection.appendChild(bookTitle);

            const notesList = document.createElement('div');
            notesList.className = 'notes-list';

            bookNotes.forEach(note => {
                const noteItem = this.createNoteItem(note);
                notesList.appendChild(noteItem);
            });

            bookSection.appendChild(notesList);
            container.appendChild(bookSection);
        });

        if (!hasNotes) {
            container.innerHTML = '<div class="no-notes">No notes in other books yet.</div>';
        }
    },

    /**
     * Create note item element
     */
    createNoteItem(note) {
        const item = document.createElement('div');
        item.className = 'note-item';

        const noteInfo = document.createElement('div');
        noteInfo.className = 'note-info';
        noteInfo.addEventListener('click', () => this.navigateToNote(note.id));

        const notePreview = document.createElement('div');
        notePreview.className = 'note-preview';
        const previewText = note.noteText.trim() || note.selectedText;
        const firstLine = previewText.split('\n')[0];
        notePreview.textContent = firstLine.substring(0, 60) + (firstLine.length > 60 ? '...' : '');

        const noteMeta = document.createElement('div');
        noteMeta.className = 'note-meta';
        const timestamp = new Date(note.timestamp).toLocaleDateString();
        noteMeta.textContent = `${note.chapterTitle} • ${timestamp}`;

        noteInfo.appendChild(notePreview);
        noteInfo.appendChild(noteMeta);

        const noteActions = document.createElement('div');
        noteActions.className = 'note-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'note-action-btn';
        deleteBtn.setAttribute('data-action', 'remove');
        deleteBtn.setAttribute('aria-label', 'Delete note');
        deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNote(note.id);
        });

        noteActions.appendChild(deleteBtn);

        item.appendChild(noteInfo);
        item.appendChild(noteActions);

        return item;
    },

    /**
     * Load notes from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('yoga-vasishtha-notes');
            if (stored) {
                State.notes = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load notes:', error);
            State.notes = {};
        }
    },

    /**
     * Save notes to localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('yoga-vasishtha-notes', JSON.stringify(State.notes));
        } catch (error) {
            console.error('Failed to save notes:', error);
        }
    },

    /**
     * Get the word index before the selection for robust volume-level positioning
     */
    getPreviousWordIndex(range) {
        // Use volume-level positioning based on raw content
        return VolumePositioning.getWordIndexBeforeRange(range, State.currentBookIndex);
    },

    /**
     * Get the character offset of a range position within the document
     */
    getRangeOffsetInDocument(container, offset) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return 0;

        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let totalOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            if (node === container) {
                return totalOffset + offset;
            }
            totalOffset += node.textContent.length;
        }

        return totalOffset;
    },

    /**
     * Generate unique ID for note
     */
    generateId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Restore notes highlights after content load
     */
    restoreHighlights() {
        const currentBookNotes = State.notes[State.currentBookIndex] || [];

        currentBookNotes.forEach(note => {
            // Try to find and restore highlight based on text content
            // This is a simplified restoration - in a production app you'd want more robust text anchoring
            this.restoreHighlight(note);
        });
    },

    /**
     * Restore individual highlight using word-index-based positioning
     */
    restoreHighlight(note) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return;


        // Check if note has word index data (new format)
        if (note.previousWordIndex !== undefined) {
            // Use word-index-based restoration
            this.restoreHighlightWithWordIndex(note);
        } else {
            // Fallback to old method for backward compatibility
            console.warn('Note missing word index, using fallback method:', note.id);
            this.restoreHighlightFallback(note);
        }
    },

    /**
     * Restore highlight using volume-level word index positioning
     */
    restoreHighlightWithWordIndex(note) {

        // Use the new volume-level positioning system
        const success = VolumePositioning.restoreHighlightAtWordIndex(note, State.currentBookIndex);

        if (!success) {
            console.warn('Volume-level positioning failed, using fallback');
            this.restoreHighlightFallback(note);
        }
    },


    /**
     * Fallback restoration method for old notes or when word index fails
     */
    restoreHighlightFallback(note) {
        const bookContent = document.getElementById('book-content');
        if (!bookContent) return;


        // Original method: find first occurrence
        const walker = document.createTreeWalker(
            bookContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            const index = text.indexOf(note.selectedText);
            if (index >= 0) {
                // Found matching text, create highlight
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + note.selectedText.length);

                const highlight = document.createElement('span');
                highlight.className = 'note-highlight';
                highlight.setAttribute('data-note-id', note.id);

                try {
                    range.surroundContents(highlight);
                    const noteIcon = this.createNoteIcon(note.id);
                    highlight.appendChild(noteIcon);
                    break; // Only restore first match
                } catch (e) {
                    console.warn('Could not restore highlight for note:', note.id);
                }
            }
        }
    },

    /**
     * Export notes to JSON file
     */
    async exportToJSON() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `Yoga-Vasishtha-Notes-${timestamp}.json`;

            const data = {
                type: 'notes',
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: State.notes
            };

            const jsonContent = JSON.stringify(data, null, 2);

            // Check if we're on mobile with Capacitor
            if (window.Capacitor?.isNativePlatform && window.Capacitor.Plugins?.Filesystem) {
                try {
                    const { Filesystem } = window.Capacitor.Plugins;

                    await Filesystem.writeFile({
                        path: filename,
                        data: jsonContent,
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });

                    NotificationManager.show('Notes exported to Documents folder', 'info');
                } catch (capacitorError) {
                    // Fall back to web download
                    const blob = new Blob([jsonContent], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                }
            } else {
                // Web browser - use blob download
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

            }
        } catch (error) {
            console.error('Failed to export notes:', error);
            NotificationManager.show('Export failed: ' + error.message, 'error');
        }
    },

    /**
     * Import notes from JSON file
     */
    importFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onerror = () => {
                NotificationManager.show('Import failed: Cannot read file', 'error');
            };
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);

                    // Validate JSON structure
                    if (!importedData.data || importedData.type !== 'notes') {
                        NotificationManager.show('Import failed: Invalid notes file', 'error');
                        return;
                    }

                    const importedNotes = importedData.data;
                    let mergedCount = 0;
                    let newCount = 0;
                    let ignoredCount = 0;

                    // Merge notes for each book
                    for (const [bookIndex, bookNotes] of Object.entries(importedNotes)) {
                        if (!State.notes[bookIndex]) {
                            State.notes[bookIndex] = [];
                        }

                        for (const importedNote of bookNotes) {
                            const result = this.mergeNote(State.notes[bookIndex], importedNote);
                            if (result === 'merged') mergedCount++;
                            else if (result === 'new') newCount++;
                            else if (result === 'ignored') ignoredCount++;
                        }
                    }

                    this.saveToStorage();
                    this.renderNotes();

                    const totalImported = newCount + mergedCount;
                    NotificationManager.show(`Imported ${totalImported} notes`, 'info');
                } catch (error) {
                    console.error('Import error:', error);
                    NotificationManager.show('Import failed: Invalid notes file', 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
        document.body.removeChild(input);
    },

    /**
     * Merge a single note into the existing notes array
     * Returns 'ignored' for exact duplicates, 'merged' for location conflicts, 'new' for new notes
     */
    mergeNote(existingNotes, importedNote) {
        // Find notes at the same location
        const sameLocationNotes = existingNotes.filter(note =>
            note.bookIndex === importedNote.bookIndex &&
            note.chapterAnchor === importedNote.chapterAnchor &&
            note.scrollPosition === importedNote.scrollPosition &&
            note.selectedText === importedNote.selectedText
        );

        // Check for exact duplicate
        const exactDuplicate = sameLocationNotes.find(note =>
            note.noteText === importedNote.noteText
        );

        if (exactDuplicate) {
            return 'ignored'; // Ignore exact duplicates
        }

        // Check if there are conflicting notes at the same location
        if (sameLocationNotes.length > 0) {
            // Merge notes at the same location
            const allNotes = [...sameLocationNotes, importedNote];

            // Sort by timestamp (chronological order)
            allNotes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Create merged note text
            const mergedText = 'Merged Notes\n\n' + allNotes.map(note => {
                const timestamp = new Date(note.timestamp).toLocaleString();
                return `-- Note From ${timestamp} --\n\n${note.noteText}`;
            }).join('\n\n');

            // Remove existing notes at this location
            for (let i = existingNotes.length - 1; i >= 0; i--) {
                if (sameLocationNotes.includes(existingNotes[i])) {
                    existingNotes.splice(i, 1);
                }
            }

            // Add the merged note (use the earliest timestamp for the merged note)
            const mergedNote = {
                ...importedNote,
                noteText: mergedText,
                timestamp: allNotes[0].timestamp // Use earliest timestamp
            };
            existingNotes.push(mergedNote);

            return 'merged';
        } else {
            // New note at a different location
            existingNotes.push(importedNote);
            return 'new';
        }
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
            // Load Devanagari lexicon
            const devaResponse = await fetch(CONFIG.LEXICON_FILE_DEVA);
            if (devaResponse.ok) {
                State.lexicon = await devaResponse.json();
            } else {
                console.warn('Devanagari lexicon file not found');
            }
        } catch (error) {
            console.error('Failed to load Devanagari lexicon:', error);
        }

        try {
            // Load IAST lexicon
            const iastResponse = await fetch(CONFIG.LEXICON_FILE_IAST);
            if (iastResponse.ok) {
                State.iastLexicon = await iastResponse.json();
                // Create fast lookup set for IAST keys
                State.iastKeySet = new Set(Object.keys(State.iastLexicon));
            } else {
                console.warn('IAST lexicon file not found');
            }
        } catch (error) {
            console.error('Failed to load IAST lexicon:', error);
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
            const matches = [];

            // Find all Devanagari matches that exist in lexicon
            CONFIG.DEVANAGARI_REGEX.lastIndex = 0;
            let match;
            while ((match = CONFIG.DEVANAGARI_REGEX.exec(text)) !== null) {
                if (State.lexicon[match[0]]) {
                    matches.push({
                        index: match.index,
                        length: match[0].length,
                        text: match[0],
                        type: 'devanagari'
                    });
                }
            }

            // Find all [Sanskrit: ...] patterns and process words within them
            CONFIG.SANSKRIT_PATTERN_REGEX.lastIndex = 0;
            while ((match = CONFIG.SANSKRIT_PATTERN_REGEX.exec(text)) !== null) {
                const patternStart = match.index;
                const patternEnd = match.index + match[0].length;
                const sanskritContent = match[1]; // Content inside [Sanskrit: ...]

                // Skip if this pattern overlaps with any Devanagari match
                const patternOverlaps = matches.some(existing =>
                    patternStart < existing.index + existing.length &&
                    patternEnd > existing.index
                );

                if (patternOverlaps) continue;

                // Extract individual words from the Sanskrit pattern content
                const words = sanskritContent
                    .split(/[,;]/) // Split on comma or semicolon
                    .map(word => word.trim())
                    .filter(word => word.length > 0)
                    .map(word => word.replace(/\s+and\s+/g, ', ')) // Handle "and" between words
                    .flatMap(word => word.split(/,\s*/)) // Split on remaining commas
                    .map(word => word.trim())
                    .filter(word => word.length > 0)
                    .filter(word => !word.includes('|')) // Filter out long passages with |
                    .filter(word => word.length < 100) // Filter out very long entries
                    .flatMap(phrase => {
                        // Split each phrase into individual words
                        return phrase.split(/\s+/)
                            .map(w => w.trim())
                            .filter(w => w.length > 0)
                            .filter(w => w.length > 1) // At least 2 characters
                            .filter(w => !/^[.,:;!?()[\]{}]$/.test(w)); // Filter out punctuation
                    });

                // For each word, check if it exists in IAST lexicon and find its position in the pattern
                words.forEach(word => {
                    if (State.iastKeySet.has(word)) {
                        // Find the word's position within the Sanskrit pattern content
                        const wordIndex = sanskritContent.indexOf(word);
                        if (wordIndex !== -1) {
                            const absoluteIndex = patternStart + '[Sanskrit: '.length + wordIndex;

                            matches.push({
                                index: absoluteIndex,
                                length: word.length,
                                text: word,
                                type: 'iast',
                                patternStart: patternStart,
                                patternEnd: patternEnd
                            });
                        }
                    }
                });
            }

            // If no matches found, skip processing
            if (matches.length === 0) return;

            // Sort matches by index
            matches.sort((a, b) => a.index - b.index);

            // Build fragment with clickable words
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            matches.forEach(match => {
                // Add text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex, match.index))
                    );
                }

                // Create clickable Sanskrit word
                const span = document.createElement('span');
                span.className = 'sanskrit-word';
                span.textContent = match.text;
                span.setAttribute('data-word', match.text);
                span.setAttribute('data-type', match.type);
                span.setAttribute('role', 'button');
                span.setAttribute('tabindex', '0');
                span.setAttribute('aria-label', `Sanskrit word: ${match.text}`);
                fragment.appendChild(span);

                lastIndex = match.index + match.length;
            });

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
        let entry = null;
        let lexiconType = '';

        // First check Devanagari lexicon
        if (State.lexicon[word]) {
            entry = State.lexicon[word];
            lexiconType = 'Devanagari';
        }
        // Then check IAST lexicon
        else if (State.iastLexicon[word]) {
            entry = State.iastLexicon[word];
            lexiconType = 'IAST';
        }

        const content = entry
            ? new showdown.Converter().makeHtml(entry)
            : `<h2>${word}</h2><p>Definition not found in lexicon.</p><p><em>Searched in both Devanagari and IAST lexicons.</em></p>`;

        Elements.lexiconContent.innerHTML = Utils.createSafeHTML(content);
        ModalManager.open('lexicon');

        if (entry) {
        }
    }
};

// ===== UI MANAGER =====
const UIManager = {
    /**
     * Initialize book selector (both desktop and mobile)
     */
    initBookSelector() {
        // Clear both selectors
        Elements.bookSelector.innerHTML = '';
        Elements.bookSelectorMobile.innerHTML = '';

        CONFIG.EPUB_FILES.forEach((fileName, index) => {
            // Create option for desktop selector
            const option = document.createElement('option');
            option.value = index;
            option.textContent = Utils.getBookTitle(fileName);
            Elements.bookSelector.appendChild(option);

            // Create option for mobile selector
            const mobileOption = document.createElement('option');
            mobileOption.value = index;
            mobileOption.textContent = Utils.getBookTitle(fileName);
            Elements.bookSelectorMobile.appendChild(mobileOption);
        });

        // Set current book for both selectors
        Elements.bookSelector.value = State.currentBookIndex;
        Elements.bookSelectorMobile.value = State.currentBookIndex;
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

        // Restore note highlights and bookmark highlights after content is processed
        setTimeout(() => {
            NotesManager.restoreHighlights();
            BookmarkManager.restoreBookmarkHighlights();
        }, 100);

        Utils.show(Elements.bookContent);

        // Restore position after DOM has had time to render
        requestAnimationFrame(() => {
            SettingsManager.restorePosition();
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
        } else if (modalName === 'notes') {
            // Default to current book tab when opening notes
            NotesManager.activeTab = 'current';
            document.getElementById('current-book-notes-tab').classList.add('active');
            document.getElementById('other-books-notes-tab').classList.remove('active');
            NotesManager.renderNotes();
        } else if (modalName === 'noteEditor') {
            // Note editor modal handled by NotesManager directly
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
        ['toc', 'settings', 'help', 'lexicon', 'bookmarks', 'notes', 'noteEditor'].forEach(name => {
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
        // Book selectors (both desktop and mobile)
        Elements.bookSelector.addEventListener('change', this.onBookChange.bind(this));
        Elements.bookSelectorMobile.addEventListener('change', this.onBookChange.bind(this));

        // Desktop header buttons
        Elements.themeBtn.addEventListener('click', this.onThemeToggle.bind(this));
        Elements.settingsBtn.addEventListener('click', () => ModalManager.open('settings'));
        Elements.tocBtn.addEventListener('click', () => ModalManager.open('toc'));
        Elements.searchBtn.addEventListener('click', () => SearchManager.togglePanel());
        Elements.bookmarksBtn.addEventListener('click', () => ModalManager.open('bookmarks'));
        Elements.notesBtn.addEventListener('click', () => ModalManager.open('notes'));
        Elements.helpBtn.addEventListener('click', () => ModalManager.open('help'));

        // Mobile header buttons (same functionality)
        Elements.themeBtnMobile.addEventListener('click', this.onThemeToggle.bind(this));
        Elements.settingsBtnMobile.addEventListener('click', () => ModalManager.open('settings'));
        Elements.tocBtnMobile.addEventListener('click', () => ModalManager.open('toc'));
        Elements.searchBtnMobile.addEventListener('click', () => SearchManager.togglePanel());
        Elements.bookmarksBtnMobile.addEventListener('click', () => ModalManager.open('bookmarks'));
        Elements.notesBtnMobile.addEventListener('click', () => ModalManager.open('notes'));
        Elements.helpBtnMobile.addEventListener('click', () => ModalManager.open('help'));

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
        Elements.exportBookmarksBtn.addEventListener('click', () => BookmarkManager.exportToJSON());
        Elements.importBookmarksBtn.addEventListener('click', () => BookmarkManager.importFromJSON());
        Elements.currentBookTab.addEventListener('click', () => BookmarkManager.switchTab('current'));
        Elements.otherBooksTab.addEventListener('click', () => BookmarkManager.switchTab('other'));

        // Notes controls
        document.getElementById('add-note-btn').addEventListener('click', () => NotesManager.enterTextSelectionMode());
        Elements.exportNotesBtn.addEventListener('click', () => NotesManager.exportToJSON());
        Elements.importNotesBtn.addEventListener('click', () => NotesManager.importFromJSON());
        document.getElementById('current-book-notes-tab').addEventListener('click', () => NotesManager.switchTab('current'));
        document.getElementById('other-books-notes-tab').addEventListener('click', () => NotesManager.switchTab('other'));

        // Note Editor controls
        document.getElementById('delete-note-btn').addEventListener('click', () => {
            const textarea = document.getElementById('note-editor-textarea');
            const noteId = textarea.getAttribute('data-note-id');
            if (noteId) {
                NotesManager.deleteNote(noteId);
            }
        });

        // Auto-save note content on input
        document.getElementById('note-editor-textarea').addEventListener('input', Utils.debounce((e) => {
            const noteId = e.target.getAttribute('data-note-id');
            if (noteId) {
                NotesManager.saveNoteContent(noteId, e.target.value);
            }
        }, 500));

        // Settings controls
        Elements.fontFamilySelect.addEventListener('change', this.onFontFamilyChange.bind(this));
        Elements.fontSizeSelect.addEventListener('change', this.onFontSizeChange.bind(this));
        Elements.lineHeightSelect.addEventListener('change', this.onLineHeightChange.bind(this));

        // Modal close buttons
        Elements.closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) {
                    let modalName = modal.id.replace('-modal', '');
                    // Convert kebab-case to camelCase for compound modal names
                    modalName = modalName.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
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

        // Handle window resize to maintain reading position
        window.addEventListener('resize',
            Utils.debounce(SettingsManager.handleWindowResize.bind(SettingsManager), 250)
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
            // First try to close any open modal
            if (ModalManager.activeModal) {
                ModalManager.closeAll();
            }
            // If no modal is open, close search panel if it's open
            else if (State.search.isOpen) {
                SearchManager.closePanel(true);
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
        Elements.bookSelectorMobile = document.getElementById('book-selector-mobile');
        // Desktop buttons
        Elements.themeBtn = document.getElementById('theme-btn');
        Elements.settingsBtn = document.getElementById('settings-btn');
        Elements.tocBtn = document.getElementById('toc-btn');
        Elements.searchBtn = document.getElementById('search-btn');
        Elements.bookmarksBtn = document.getElementById('bookmarks-btn');
        Elements.notesBtn = document.getElementById('notes-btn');
        Elements.helpBtn = document.getElementById('help-btn');

        // Mobile buttons
        Elements.themeBtnMobile = document.getElementById('theme-btn-mobile');
        Elements.settingsBtnMobile = document.getElementById('settings-btn-mobile');
        Elements.tocBtnMobile = document.getElementById('toc-btn-mobile');
        Elements.searchBtnMobile = document.getElementById('search-btn-mobile');
        Elements.bookmarksBtnMobile = document.getElementById('bookmarks-btn-mobile');
        Elements.notesBtnMobile = document.getElementById('notes-btn-mobile');
        Elements.helpBtnMobile = document.getElementById('help-btn-mobile');

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
        Elements.notesModal = document.getElementById('notes-modal');
        Elements.noteEditorModal = document.getElementById('note-editor-modal');

        // Modal content
        Elements.tocContent = document.getElementById('toc-content');
        Elements.helpContent = document.getElementById('help-content');
        Elements.lexiconContent = document.getElementById('lexicon-content');
        Elements.bookmarksContent = document.getElementById('bookmarks-content');
        Elements.addBookmarkBtn = document.getElementById('add-bookmark-btn');
        Elements.exportBookmarksBtn = document.getElementById('export-bookmarks-btn');
        Elements.importBookmarksBtn = document.getElementById('import-bookmarks-btn');
        Elements.exportNotesBtn = document.getElementById('export-notes-btn');
        Elements.importNotesBtn = document.getElementById('import-notes-btn');
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
            NotesManager.init();

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
        ModalManager,
        BookmarkManager,
        NotesManager
    };
}