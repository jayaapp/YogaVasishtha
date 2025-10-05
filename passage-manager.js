#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');

// ============================================================================
// PASSAGE HASH FUNCTION - Copy this to app.js for lookup functionality
// ============================================================================
/**
 * Generate a unique hash key for a Sanskrit passage
 * @param {string} passage - The Sanskrit passage text
 * @returns {string} - 12-character hash key
 *
 * Usage in app.js:
 *   const passageKey = generatePassageHash(sanskritText);
 *   const translation = State.passages[passageKey];
 */
function generatePassageHash(passage) {
    // Normalize: remove extra whitespace, trim
    const normalized = passage.trim().replace(/\s+/g, ' ');
    // Generate SHA256 hash and take first 12 characters
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 12);
}
// ============================================================================

const PASSAGES_FILE_DEVA = 'Yoga-Vasishtha-Devanagari-Passages.txt';
const PASSAGES_FILE_IAST = 'Yoga-Vasishtha-IAST-Passages.txt';
const TRANSLATIONS_FILE = 'Yoga-Vasishtha-Sanskrit-Passages.json';
const STATE_FILE = 'passage-manager-state.json';
const PROMPT_FILE = 'passage-prompt.txt';

function showUsage() {
    console.log(`
Usage: ./passage-manager.js [options]

Options:
  -n, --next         Get next passage to translate
  -m <mode>          Mode: 'deva' for Devanagari (default), 'iast' for IAST
  -i <file>          Import translation from markdown file
  -s <hash>          Skip passage with given hash (mark as invalid)
  -p, --progress     Show translation progress statistics
  -h, --help         Show this help message

Examples:
  ./passage-manager.js -n              # Get next Devanagari passage
  ./passage-manager.js -n -m iast      # Get next IAST passage
  ./passage-manager.js -i translation-temp.txt
  ./passage-manager.js -s a1b2c3d4     # Skip passage
  ./passage-manager.js -p              # Show progress
`);
}

function loadPassages(filename) {
    if (!fs.existsSync(filename)) {
        console.error(`Error: Passages file ${filename} not found!`);
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(filename, 'utf8');
        // Split by delimiter, filter empty
        return content.split('\n---\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);
    } catch (error) {
        console.error(`Error reading passages file: ${error.message}`);
        process.exit(1);
    }
}

function loadTranslations() {
    if (fs.existsSync(TRANSLATIONS_FILE)) {
        try {
            const content = fs.readFileSync(TRANSLATIONS_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading translations file:', error.message);
            return {};
        }
    }
    return {};
}

function saveTranslations(translations) {
    try {
        fs.writeFileSync(TRANSLATIONS_FILE, JSON.stringify(translations, null, 2), 'utf8');
        console.log(`✅ Translations saved to ${TRANSLATIONS_FILE}`);
    } catch (error) {
        console.error('Error saving translations:', error.message);
    }
}

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        try {
            const content = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading state file:', error.message);
            return initializeState();
        }
    }
    return initializeState();
}

function initializeState() {
    return {
        devanagari: {
            translated: [],
            skipped: []
        },
        iast: {
            translated: [],
            skipped: []
        }
    };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving state:', error.message);
    }
}

function getNextPassage(mode) {
    const passagesFile = mode === 'deva' ? PASSAGES_FILE_DEVA : PASSAGES_FILE_IAST;
    const passages = loadPassages(passagesFile);
    const state = loadState();
    const stateKey = mode === 'deva' ? 'devanagari' : 'iast';

    const translatedSet = new Set(state[stateKey].translated);
    const skippedSet = new Set(state[stateKey].skipped);

    // Find first passage that hasn't been translated or skipped
    for (const passage of passages) {
        const hash = generatePassageHash(passage);
        if (!translatedSet.has(hash) && !skippedSet.has(hash)) {
            displayPassageForTranslation(passage, hash, mode, translatedSet.size, skippedSet.size, passages.length);
            return;
        }
    }

    // All passages processed
    console.log(`\n🎉 All ${mode === 'deva' ? 'Devanagari' : 'IAST'} passages have been processed!`);
    console.log(`Total passages: ${passages.length}`);
    console.log(`Translated: ${translatedSet.size}`);
    console.log(`Skipped: ${skippedSet.size}`);
}

function displayPassageForTranslation(passage, hash, mode, translatedCount, skippedCount, totalCount) {
    console.log(`\n📖 NEXT ${mode === 'deva' ? 'DEVANAGARI' : 'IAST'} PASSAGE TO TRANSLATE`);
    console.log(`==========================================================`);
    console.log(`Passage Hash: ${hash}`);
    console.log(`Progress: ${translatedCount} translated, ${skippedCount} skipped, ${totalCount - translatedCount - skippedCount} remaining`);
    console.log(`Completion: ${((translatedCount / totalCount) * 100).toFixed(1)}%\n`);

    console.log(`📜 PASSAGE:`);
    console.log(`-----------`);
    console.log(passage);
    console.log();

    // Display translation instructions
    if (fs.existsSync(PROMPT_FILE)) {
        const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
        console.log(`\n📝 TRANSLATION INSTRUCTIONS`);
        console.log(`===========================`);
        console.log(prompt);
    } else {
        console.error('⚠️  Warning: passage-prompt.txt not found!');
    }

    const tempFile = `translation-temp-${mode}-${Date.now()}.txt`;

    console.log(`\n🔄 WORKFLOW`);
    console.log(`===========`);
    console.log(`1. Translate and analyze the passage following the format above`);
    console.log(`2. Save your markdown to '${tempFile}'`);
    console.log(`3. Run: ./passage-manager.js -i ${tempFile}`);
    console.log(`4. The translation will be imported and temp file auto-deleted`);
    console.log(`5. Run: ./passage-manager.js -n -m ${mode}  # to get next passage`);
    console.log();
    console.log(`💡 To skip this passage (if invalid):`);
    console.log(`   ./passage-manager.js -s ${hash}`);
}

function importTranslation(inputFile) {
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File ${inputFile} not found!`);
        process.exit(1);
    }

    try {
        const markdown = fs.readFileSync(inputFile, 'utf8').trim();

        // Check if passage is marked as invalid
        if (markdown.includes('# INVALID PASSAGE')) {
            console.log('⚠️  Passage marked as INVALID - use -s <hash> to skip it instead');
            return;
        }

        // Extract the original Sanskrit passage from the markdown
        const passageMatch = markdown.match(/# Sanskrit Passage\s*\n\s*\n([\s\S]+?)\n\n## Translation/);

        if (!passageMatch) {
            console.error('Error: Could not extract Sanskrit passage from markdown.');
            console.error('Make sure your markdown starts with:');
            console.error('# Sanskrit Passage\n\n[sanskrit text]\n\n## Translation');
            return;
        }

        const sanskritPassage = passageMatch[1].trim();
        const hash = generatePassageHash(sanskritPassage);

        // Determine mode from passage content
        const isDevanagari = /[\u0900-\u097F]/.test(sanskritPassage);
        const mode = isDevanagari ? 'deva' : 'iast';
        const stateKey = mode === 'deva' ? 'devanagari' : 'iast';

        // Load and update translations
        const translations = loadTranslations();
        translations[hash] = markdown;
        saveTranslations(translations);

        // Update state
        const state = loadState();
        if (!state[stateKey].translated.includes(hash)) {
            state[stateKey].translated.push(hash);
            saveState(state);
        }

        console.log(`✅ Translation imported successfully!`);
        console.log(`   Hash: ${hash}`);
        console.log(`   Mode: ${mode === 'deva' ? 'Devanagari' : 'IAST'}`);
        console.log(`   Total translations: ${Object.keys(translations).length}`);

        // Auto-delete temp file
        try {
            fs.unlinkSync(inputFile);
            console.log(`🗑️  Auto-deleted temporary file: ${inputFile}`);
        } catch (error) {
            console.log(`⚠️  Could not delete temp file: ${inputFile}`);
        }

    } catch (error) {
        console.error('Error importing translation:', error.message);
    }
}

function skipPassage(hash) {
    const state = loadState();

    // Determine which mode by checking if hash exists in either passage set
    let mode = null;
    const devaPassages = loadPassages(PASSAGES_FILE_DEVA);
    const iastPassages = loadPassages(PASSAGES_FILE_IAST);

    for (const passage of devaPassages) {
        if (generatePassageHash(passage) === hash) {
            mode = 'deva';
            break;
        }
    }

    if (!mode) {
        for (const passage of iastPassages) {
            if (generatePassageHash(passage) === hash) {
                mode = 'iast';
                break;
            }
        }
    }

    if (!mode) {
        console.error(`Error: No passage found with hash ${hash}`);
        return;
    }

    const stateKey = mode === 'deva' ? 'devanagari' : 'iast';

    if (!state[stateKey].skipped.includes(hash)) {
        state[stateKey].skipped.push(hash);
        saveState(state);
        console.log(`✅ Passage ${hash} marked as skipped (${mode === 'deva' ? 'Devanagari' : 'IAST'})`);
    } else {
        console.log(`⚠️  Passage ${hash} was already marked as skipped`);
    }
}

function showProgress() {
    const devaPassages = loadPassages(PASSAGES_FILE_DEVA);
    const iastPassages = loadPassages(PASSAGES_FILE_IAST);
    const state = loadState();
    const translations = loadTranslations();

    console.log(`\n📊 PASSAGE TRANSLATION PROGRESS`);
    console.log(`================================\n`);

    console.log(`📖 DEVANAGARI PASSAGES`);
    console.log(`   Total: ${devaPassages.length}`);
    console.log(`   Translated: ${state.devanagari.translated.length} (${((state.devanagari.translated.length / devaPassages.length) * 100).toFixed(1)}%)`);
    console.log(`   Skipped: ${state.devanagari.skipped.length}`);
    console.log(`   Remaining: ${devaPassages.length - state.devanagari.translated.length - state.devanagari.skipped.length}\n`);

    console.log(`📖 IAST PASSAGES`);
    console.log(`   Total: ${iastPassages.length}`);
    console.log(`   Translated: ${state.iast.translated.length} (${((state.iast.translated.length / iastPassages.length) * 100).toFixed(1)}%)`);
    console.log(`   Skipped: ${state.iast.skipped.length}`);
    console.log(`   Remaining: ${iastPassages.length - state.iast.translated.length - state.iast.skipped.length}\n`);

    console.log(`📚 TOTAL TRANSLATIONS`);
    console.log(`   Combined passages in JSON: ${Object.keys(translations).length}`);

    const totalPassages = devaPassages.length + iastPassages.length;
    const totalTranslated = state.devanagari.translated.length + state.iast.translated.length;
    const totalSkipped = state.devanagari.skipped.length + state.iast.skipped.length;

    console.log(`   Overall completion: ${((totalTranslated / totalPassages) * 100).toFixed(1)}%`);
    console.log(`   Total processed: ${totalTranslated + totalSkipped}/${totalPassages}\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showUsage();
    process.exit(0);
}

// Handle progress display
if (args.includes('-p') || args.includes('--progress')) {
    showProgress();
    process.exit(0);
}

// Handle import
const importIndex = args.indexOf('-i');
if (importIndex !== -1) {
    const inputFile = args[importIndex + 1];
    if (!inputFile) {
        console.error('Error: Please specify a file after -i');
        showUsage();
        process.exit(1);
    }
    importTranslation(inputFile);
    process.exit(0);
}

// Handle skip
const skipIndex = args.indexOf('-s');
if (skipIndex !== -1) {
    const hash = args[skipIndex + 1];
    if (!hash) {
        console.error('Error: Please specify a hash after -s');
        showUsage();
        process.exit(1);
    }
    skipPassage(hash);
    process.exit(0);
}

// Handle next passage
if (args.includes('-n') || args.includes('--next')) {
    let mode = 'deva'; // default
    const modeIndex = args.indexOf('-m');
    if (modeIndex !== -1) {
        mode = args[modeIndex + 1];
        if (!mode || (mode !== 'deva' && mode !== 'iast')) {
            console.error('Error: Please specify a valid mode after -m (deva or iast)');
            showUsage();
            process.exit(1);
        }
    }
    getNextPassage(mode);
    process.exit(0);
}

console.error('Error: Unknown command');
showUsage();
process.exit(1);
