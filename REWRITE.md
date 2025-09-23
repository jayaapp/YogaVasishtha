# EPUB Reader Application - Complete Rewrite Specification

## Overview
Create a clean, modern multi-book EPUB reader web application with Sanskrit lexicon integration, designed specifically for reading the Yoga Vasishtha text collection.

## Core Requirements

### 1. Application Architecture
- **Single-page application** with modular JavaScript structure
- **No external frameworks** - vanilla JavaScript, HTML5, CSS3
- **Clean separation of concerns** - separate modules for EPUB handling, UI, settings, lexicon
- **Error-first approach** - robust error handling throughout
- **Progressive loading** - graceful degradation if EPUBs fail to load

### 2. EPUB Integration
- **Library**: Use EPUB.js v0.3.88 from CDN
- **Multi-book support**: Load 7 Yoga Vasishtha EPUB files simultaneously
- **Robust content extraction**: Handle various EPUB document structures
- **TOC integration**: Extract and display native EPUB table of contents
- **Chapter navigation**: Allow jumping to specific sections within EPUBs
- **Error resilience**: Continue working even if some EPUBs fail to load

### 3. User Interface Design

#### Layout Structure
- **Fixed header bar** (50px height) with:
  - Left side: Book selector dropdown + application title
  - Right side: TOC, Help, Settings, Theme toggle buttons
- **Main content area** with responsive design
- **Modal overlays** for TOC, settings, help, and lexicon

#### Visual Design
- **Material Design icons** from Google Fonts
- **CSS custom properties** for theming
- **Light/dark theme support** with smooth transitions
- **Responsive design** for mobile and desktop
- **Clean typography** with configurable fonts

#### Controls
- **Book selector**: Dropdown to switch between EPUB files
- **Theme toggle**: Light/dark mode switcher
- **Settings panel**: Font family and size controls
- **TOC button**: Show table of contents for current book
- **Help button**: Display application information

### 4. Sanskrit Lexicon Features
- **Devanagari text detection**: Automatically identify Sanskrit words using Unicode ranges
- **Clickable words**: Convert Sanskrit text to interactive elements
- **Lexicon lookup**: Display definitions from JSON lexicon file
- **Modal display**: Show definitions in overlay with Markdown rendering
- **Visual highlighting**: Distinctive styling for Sanskrit words

### 5. Data Management
- **Local storage persistence**:
  - Current book selection
  - Reading position per book
  - Theme preference
  - Font settings
- **Lexicon data**: Load from `Yoga-Vasishtha-Lexicon.json`
- **Book content caching**: Store extracted EPUB content in memory

### 6. File Structure
```
/
├── index.html          # Main HTML structure
├── app.css            # Complete styling and themes
├── app.js             # Main application logic
├── epub/              # EPUB files directory
│   ├── Yoga-Vasishtha-V1.epub
│   ├── Yoga-Vasishtha-V2-P1of2.epub
│   ├── Yoga-Vasishtha-V2-P2of2.epub
│   ├── Yoga-Vasishtha-V3-P1of2.epub
│   ├── Yoga-Vasishtha-V3-P2of2.epub
│   ├── Yoga-Vasishtha-V4-P1of2.epub
│   └── Yoga-Vasishtha-V4-P2of2.epub
└── Yoga-Vasishtha-Lexicon.json
```

## Technical Specifications

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yoga Vasishtha EPUB Reader</title>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <link rel="stylesheet" href="app.css">
</head>
<body class="light-theme">
    <!-- Fixed header with controls -->
    <!-- Main scrollable content area -->
    <!-- Modal overlays for TOC, settings, help, lexicon -->
    <!-- External dependencies -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/showdown/1.9.1/showdown.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.88/dist/epub.min.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

### CSS Architecture
- **CSS Reset** with box-sizing border-box
- **CSS Custom Properties** for theming
- **Flexbox layouts** for responsive design
- **Smooth transitions** for theme changes
- **Material Design** button styling
- **Modal system** with backdrop blur
- **Responsive breakpoints** for mobile

### JavaScript Architecture

#### Core Modules
1. **Configuration**: Constants and settings
2. **State Management**: Global application state
3. **EPUB Loader**: Robust EPUB parsing and content extraction
4. **UI Controller**: DOM manipulation and event handling
5. **Settings Manager**: Persistence and theme management
6. **Lexicon Handler**: Sanskrit word processing and lookup
7. **Navigation**: TOC and section jumping

#### Key Functions
```javascript
// Core initialization
async function initializeApp()

// EPUB handling
async function loadEpubFiles()
async function loadSingleEpub(filePath)
async function extractEpubContent(book)
async function extractEpubTOC(book)

// Content display
async function displayCurrentBook()
function processContentForSanskrit(element)
function generateEpubTOC()

// UI management
function setupEventListeners()
function toggleTheme()
function showModal(modalId)
function hideModal(modalId)

// Settings persistence
function loadSettings()
function saveSettings()
function applyFontSettings()

// Lexicon functionality
async function loadLexicon()
function handleSanskritWordClick(event)
function showLexiconEntry(word)
```

### Error Handling Strategy
- **Graceful degradation**: App works even if some EPUBs fail
- **User feedback**: Clear error messages in UI
- **Console logging**: Detailed debugging information
- **Fallback content**: Show helpful messages when content unavailable
- **Network resilience**: Handle CORS and file access issues

### Performance Considerations
- **Lazy loading**: Load EPUB content progressively
- **Memory management**: Efficient content caching
- **Smooth scrolling**: Optimized position saving/restoration
- **Minimal DOM manipulation**: Efficient content updates
- **CSS animations**: Hardware-accelerated transitions

### Accessibility Features
- **Semantic HTML**: Proper heading structure and landmarks
- **Keyboard navigation**: Full keyboard accessibility
- **Screen reader support**: ARIA labels and descriptions
- **High contrast**: Theme support for accessibility
- **Focus management**: Proper modal focus handling

## Implementation Requirements

### Phase 1: Core Structure
1. Create clean HTML skeleton with proper semantic structure
2. Implement CSS theme system with custom properties
3. Set up basic JavaScript module structure
4. Implement modal system with keyboard/click handling

### Phase 2: EPUB Integration
1. Implement robust EPUB loading with error handling
2. Create content extraction that handles various document formats
3. Build TOC extraction and display system
4. Add book switching functionality

### Phase 3: Sanskrit Features
1. Implement Devanagari text detection and wrapping
2. Create lexicon loading and lookup system
3. Add modal display for word definitions
4. Style Sanskrit words with hover effects

### Phase 4: Settings & Persistence
1. Implement settings UI with font controls
2. Add local storage for all preferences
3. Create reading position saving/restoration
4. Add theme toggle functionality

### Phase 5: Polish & Testing
1. Add loading states and progress indicators
2. Implement comprehensive error handling
3. Add responsive design refinements
4. Performance optimization and testing

## Configuration Constants
```javascript
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
        CURRENT_BOOK: 'epub-current-book',
        READING_POSITION: 'epub-position-'
    },
    DEVANAGARI_REGEX: /[\u0900-\u097F]+/g
};
```

## Success Criteria
- ✅ All 7 EPUB files load and display correctly
- ✅ TOC navigation works for each book
- ✅ Sanskrit words are clickable and show definitions
- ✅ Theme switching works smoothly
- ✅ Reading positions are saved and restored
- ✅ Settings persist across sessions
- ✅ Responsive design works on mobile and desktop
- ✅ App handles network errors gracefully
- ✅ Performance is smooth with large EPUB files

## Notes for Implementation
- **Use async/await** throughout for cleaner asynchronous code
- **Implement loading states** for better user experience
- **Test with large EPUB files** to ensure performance
- **Validate with screen readers** for accessibility
- **Test theme switching** in various lighting conditions
- **Verify CORS handling** when served from different origins