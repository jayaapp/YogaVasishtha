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

## Usage
- Use the dropdown to switch between books
- Click the book icon to view table of contents
- Click on Sanskrit words to see definitions
- Use settings to customize your reading experience
- Toggle between light and dark themes

## Keyboard Shortcuts
- **Escape**: Close any open modal
- **Tab**: Navigate through interface elements`
};

// ===== APPLICATION STATE =====
const State = {
    currentBookIndex: 0,
    epubBooks: [],
    bookContents: [],
    bookTOCs: [],
    lexicon: {},
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
        console.log(`🟢 Utils.show() called on:`, element?.id || element?.tagName);
        console.log(`  Before: hidden=${element?.hidden}, display=${window.getComputedStyle(element).display}`);
        element.hidden = false;
        element.classList.add(animationClass);
        console.log(`  After: hidden=${element?.hidden}, display=${window.getComputedStyle(element).display}`);
        setTimeout(() => element.classList.remove(animationClass), 300);
    },

    /**
     * Hide element
     */
    hide(element) {
        console.log(`🔴 Utils.hide() called on:`, element?.id || element?.tagName);
        console.log(`  Before: hidden=${element?.hidden}, display=${window.getComputedStyle(element).display}`);
        element.hidden = true;
        console.log(`  After: hidden=${element?.hidden}, display=${window.getComputedStyle(element).display}`);
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

// ===== EPUB MANAGER =====
const EPUBManager = {
    /**
     * Load all EPUB files
     */
    async loadAll() {
        console.log('Loading EPUB files with custom EPUB3 reader...');

        for (let i = 0; i < CONFIG.EPUB_FILES.length; i++) {
            const fileName = CONFIG.EPUB_FILES[i];
            console.log(`📚 Loading ${i + 1}/${CONFIG.EPUB_FILES.length}: ${fileName}`);

            try {
                await this.loadSingle(fileName, i);
                console.log(`✓ Loaded: ${fileName}`);
            } catch (error) {
                console.error(`✗ Failed: ${fileName}`, error);
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

        console.log(`🎉 All EPUBs loaded: ${State.epubBooks.filter(book => book).length}/${CONFIG.EPUB_FILES.length} books`);
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
        console.log(`EPUB file size: ${arrayBuffer.byteLength} bytes`);

        // Load EPUB with JSZip
        const zip = await JSZip.loadAsync(arrayBuffer);
        console.log(`EPUB archive loaded with ${Object.keys(zip.files).length} files`);

        // Parse EPUB structure
        const epubData = await this.parseEPUB(zip);
        console.log(`EPUB parsed: version ${epubData.version}, ${epubData.spine.length} spine items`);

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

        console.log(`OPF file path: ${opfPath}`);

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

        console.log(`Extracting content from ${epubData.spine.length} spine items`);

        for (let i = 0; i < epubData.spine.length; i++) {
            const spineItem = epubData.spine[i];
            const filePath = basePath + spineItem.href;

            // Processing chapter silently

            try {
                // Get file from ZIP
                const file = zip.file(filePath);
                if (!file) {
                    console.warn(`File not found in ZIP: ${filePath}`);
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
                        console.log(`🗑️ Skipping section: ${spineItem.href}`);
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
                console.error(`Error processing chapter ${i + 1}:`, error);
                chapters.push(`<p><em>Chapter ${i + 1}: Error loading - ${error.message}</em></p>`);
            }
        }

        const fullContent = chapters.join('\n<div class="chapter-separator"></div>\n');
        console.log(`📖 Extracted ${chapters.length} chapters (${filteredSpine.length} after filtering), ${fullContent.length} chars total`);
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
            console.log(`🔗 Fixed ${linkCount} internal links`);
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
                console.log(`🗑️ Skipping empty section: ${href}`);
                return pgSections;
            }
            console.log(`📖 Detected PG section: "${pgSections}" from ${href}`);
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

                    console.log(`📖 Extracted title: "${title}" from ${href}`);
                    return title;
                }
            }
        }

        // Last resort: use filename but make it more readable
        const fileName = href.split('/').pop().replace(/\.(x?html?)$/, '');
        console.log(`⚠️ Using filename fallback for ${href}: ${fileName}`);
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

        console.log(`Generated TOC with ${toc.length} items (filtered: ${!!filteredSpine})`);
        return toc;
    },

    /**
     * Update TOC with actual chapter titles after content is loaded
     */
    updateTOCWithTitles() {
        const toc = State.bookTOCs[State.currentBookIndex];
        if (!toc) return;

        console.log('🔄 Updating TOC with extracted chapter titles...');

        // Find all chapter content divs and extract titles from actual content
        document.querySelectorAll('.chapter-content').forEach((chapterDiv, index) => {
            let title = null;

            // First check if this is a Project Gutenberg section
            const pgSection = this.detectProjectGutenbergSection(chapterDiv.innerHTML, '');
            if (pgSection) {
                if (pgSection === '__SKIP_SECTION__') {
                    console.log(`🗑️ Skipping section in TOC update: ${index}`);
                    return; // Skip this section in TOC
                }
                title = pgSection;
                console.log(`📖 Detected PG section for chapter ${index}: "${title}"`);
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

                    console.log(`📖 Found title for chapter ${index}: "${title}"`);
                } else {
                    // Fallback to data-title attribute
                    title = chapterDiv.getAttribute('data-title');
                    console.log(`📖 Using data-title for chapter ${index}: "${title}"`);
                }
            }

            if (title && toc[index]) {
                toc[index].label = title;
            }
        });

        console.log('✅ TOC titles updated');
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
                console.warn(`TOC file not found: ${tocPath}`);
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
            console.warn('Failed to parse detailed TOC:', error);
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
            console.log('Loading lexicon...');
            const response = await fetch(CONFIG.LEXICON_FILE);
            if (response.ok) {
                State.lexicon = await response.json();
                console.log(`✓ Loaded lexicon with ${Object.keys(State.lexicon).length} entries`);
            } else {
                console.warn('Lexicon file not found');
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
        console.log(`Displaying book ${State.currentBookIndex}`);
        console.log(`Available books: ${State.bookContents.length}`);
        console.log(`Book contents lengths:`, State.bookContents.map(c => c ? c.length : 'null'));

        const content = State.bookContents[State.currentBookIndex];

        if (!content) {
            console.error(`No content for book ${State.currentBookIndex}`);
            ErrorHandler.showError('Book content not available');
            return;
        }

        console.log(`Content length: ${content.length}`);

        // Pre-display DOM state
        console.log('🔍 BEFORE Display:');
        console.log('  Loading indicator hidden:', Elements.loadingIndicator?.hidden);
        console.log('  Loading indicator display:', window.getComputedStyle(Elements.loadingIndicator).display);
        console.log('  Book content hidden:', Elements.bookContent?.hidden);
        console.log('  Book content display:', window.getComputedStyle(Elements.bookContent).display);

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

        // Post-display DOM state
        console.log('🔍 AFTER Display:');
        console.log('  Loading indicator hidden:', Elements.loadingIndicator?.hidden);
        console.log('  Loading indicator display:', window.getComputedStyle(Elements.loadingIndicator).display);
        console.log('  Book content hidden:', Elements.bookContent?.hidden);
        console.log('  Book content display:', window.getComputedStyle(Elements.bookContent).display);
        console.log('  Book content innerHTML length:', Elements.bookContent.innerHTML.length);
        console.log('  Book content first 100 chars:', Elements.bookContent.innerHTML.substring(0, 100));

        console.log('📋 Element References:');
        console.log('  loadingIndicator exists:', !!Elements.loadingIndicator);
        console.log('  bookContent exists:', !!Elements.bookContent);
        console.log('  loadingIndicator ID:', Elements.loadingIndicator?.id);
        console.log('  bookContent ID:', Elements.bookContent?.id);

        console.log('✅ Book content display process completed');
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

        const createTOCList = (items) => {
            const ul = document.createElement('ul');
            ul.className = 'toc-list';

            items.forEach(item => {
                const li = document.createElement('li');
                li.className = 'toc-item';

                const a = document.createElement('a');
                a.className = 'toc-link';
                a.href = '#';
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
        Elements.helpBtn.addEventListener('click', () => ModalManager.open('help'));

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
     * Handle global keyboard shortcuts
     */
    onGlobalKeydown(e) {
        if (e.key === 'Escape') {
            ModalManager.closeAll();
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
        Elements.helpBtn = document.getElementById('help-btn');

        // Content areas
        Elements.loadingIndicator = document.getElementById('loading-indicator');
        Elements.bookContent = document.getElementById('book-content');
        Elements.errorMessage = document.getElementById('error-message');
        Elements.errorText = document.getElementById('error-text');

        // Modals
        Elements.tocModal = document.getElementById('toc-modal');
        Elements.settingsModal = document.getElementById('settings-modal');
        Elements.helpModal = document.getElementById('help-modal');
        Elements.lexiconModal = document.getElementById('lexicon-modal');

        // Modal content
        Elements.tocContent = document.getElementById('toc-content');
        Elements.helpContent = document.getElementById('help-content');
        Elements.lexiconContent = document.getElementById('lexicon-content');

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
            console.log('Initializing Yoga Vasishtha EPUB Reader...');

            // Initialize DOM elements
            this.initElements();

            // Load settings
            SettingsManager.load();
            SettingsManager.apply();

            // Initialize UI components
            UIManager.initBookSelector();
            UIManager.initHelp();
            UIManager.showLoading();

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

            console.log('✓ Application initialized successfully');

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

                    console.log(`🎯 Scrolled to anchor: #${targetId}`);
                } else {
                    console.warn(`❌ Anchor not found: #${targetId}`);
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