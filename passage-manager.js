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
const PROMPT_FILE_BATCH = 'passage-prompt-batch-translation.txt';
const SESSION_GAP_MINUTES = 5;

function showUsage() {
    console.log(`
Usage: ./passage-manager.js [options]

Options:
  -n, --next         Get next passage to translate (full analysis mode)
  -t <batch_size>    Get batch of passages for quick translation only
  -m <mode>          Mode: 'deva' for Devanagari (default), 'iast' for IAST
  -f, --full-prompt  Force full prompt display (otherwise shows brief after warmup)
  -i <file>          Import translation from markdown file (full analysis)
  -j <file>          Import batch translations from delimited file
  -s <hash>          Skip passage with given hash (mark as invalid/corrupt)
  -p, --progress     Show translation progress statistics
  -h, --help         Show this help message

Examples:
  ./passage-manager.js -n              # Get next Devanagari passage (full)
  ./passage-manager.js -n -f           # Get next with full prompt
  ./passage-manager.js -n -m iast      # Get next IAST passage
  ./passage-manager.js -t 10           # Get 10 Devanagari passages for batch
  ./passage-manager.js -t 5 -m iast    # Get 5 IAST passages for batch
  ./passage-manager.js -i translation-temp-deva-123456.txt
  ./passage-manager.js -j translation-batch-deva-1234567890.txt
  ./passage-manager.js -s a1b2c3d4     # Skip corrupt passage
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
        },
        devanagari_translation_only: {
            translated: [],
            skipped: []
        },
        iast_translation_only: {
            translated: [],
            skipped: []
        },
        lastRunTimestamp: null,
        consecutiveRuns: 0,
        passagesSinceFullPrompt: 0
    };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving state:', error.message);
    }
}

function shouldShowFullPrompt(state, forceFullPrompt) {
    // Always show if explicitly requested
    if (forceFullPrompt) {
        return true;
    }

    const now = new Date();
    const lastRun = state.lastRunTimestamp ? new Date(state.lastRunTimestamp) : null;

    // Check if this is a new session (gap > 5 minutes)
    if (!lastRun || (now - lastRun) > (SESSION_GAP_MINUTES * 60 * 1000)) {
        // New session - reset counters
        state.consecutiveRuns = 0;
        state.passagesSinceFullPrompt = 0;
        return true; // Always show full for new session
    }

    // Within session
    state.consecutiveRuns++;

    // First 3 runs in a session: always show full
    if (state.consecutiveRuns <= 3) {
        state.passagesSinceFullPrompt = 0;
        return true;
    }

    // After warmup: every 5th passage
    state.passagesSinceFullPrompt++;
    if (state.passagesSinceFullPrompt >= 5) {
        state.passagesSinceFullPrompt = 0;
        return true;
    }

    return false;
}

function getRunsUntilFullPrompt(state) {
    if (state.consecutiveRuns <= 3) {
        return 0; // In warmup phase
    }
    return 5 - state.passagesSinceFullPrompt;
}

function getNextPassage(mode, forceFullPrompt) {
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
            const showFull = shouldShowFullPrompt(state, forceFullPrompt);

            // Update timestamp
            state.lastRunTimestamp = new Date().toISOString();
            saveState(state);

            displayPassageForTranslation(
                passage,
                hash,
                mode,
                translatedSet.size,
                skippedSet.size,
                passages.length,
                showFull,
                getRunsUntilFullPrompt(state)
            );
            return;
        }
    }

    // All passages processed
    console.log(`\n🎉 All ${mode === 'deva' ? 'Devanagari' : 'IAST'} passages have been processed!`);
    console.log(`Total passages: ${passages.length}`);
    console.log(`Translated: ${translatedSet.size}`);
    console.log(`Skipped: ${skippedSet.size}`);
}

function displayBriefPrompt(passage, hash, mode, translatedCount, skippedCount, totalCount, runsUntilFull, tempFile) {
    console.log(`\n📜 PASSAGE:`);
    console.log(`-----------`);
    console.log(passage);
    console.log();

    console.log(`📊 STATUS`);
    console.log(`=========`);
    console.log(`Hash: ${hash}`);
    console.log(`Progress: ${translatedCount} translated, ${skippedCount} skipped, ${totalCount - translatedCount - skippedCount} remaining`);
    console.log(`Completion: ${((translatedCount / totalCount) * 100).toFixed(1)}%\n`);

    console.log(`📝 QUICK CHECKLIST`);
    console.log(`==================`);
    console.log(`✓ Scale commentary to passage depth:`);
    console.log(`  - Short terms (1-5 words): 4-6 paragraphs`);
    console.log(`  - Medium passages (6-20 words): 6-10 paragraphs`);
    console.log(`  - Long passages (20+ words): 10-15 paragraphs`);
    console.log(`✓ Required sections: Context, Key Terms, Philosophical Notes, Practical Application, Cross-References`);
    console.log(`✓ Only skip if corrupt/illegible (NOT if short!)\n`);

    console.log(`💡 Full prompt: ./passage-manager.js -n -f`);
    if (runsUntilFull > 0) {
        console.log(`   (${runsUntilFull} -n run${runsUntilFull > 1 ? 's' : ''} left until automatic full prompt refresh)\n`);
    } else {
        console.log(`   (Next run will show full prompt automatically)\n`);
    }

    console.log(`🔄 WORKFLOW`);
    console.log(`===========`);
    console.log(`1. Translate and analyze following the format`);
    console.log(`2. 📝 Save markdown to EXACT filename: '${tempFile}'`);
    console.log(`   ⚠️  Hash (${hash}) is pre-calculated - do not change filename!`);
    console.log(`3. Run: ./passage-manager.js -i ${tempFile}`);
    console.log(`4. Run: ./passage-manager.js -n -m ${mode}  # next passage`);
    console.log();
    console.log(`⚠️  To skip (ONLY if corrupt/illegible): ./passage-manager.js -s ${hash}`);
}

function displayPassageForTranslation(passage, hash, mode, translatedCount, skippedCount, totalCount, showFullPrompt, runsUntilFull) {
    console.log(`\n📖 NEXT ${mode === 'deva' ? 'DEVANAGARI' : 'IAST'} PASSAGE TO TRANSLATE`);
    console.log(`==========================================================`);
    console.log(`Passage Hash: ${hash}`);
    console.log(`Progress: ${translatedCount} translated, ${skippedCount} skipped, ${totalCount - translatedCount - skippedCount} remaining`);
    console.log(`Completion: ${((translatedCount / totalCount) * 100).toFixed(1)}%\n`);

    const tempFile = `translation-temp-${mode}-${hash}.txt`;

    if (showFullPrompt) {
        console.log(`📜 PASSAGE:`);
        console.log(`-----------`);
        console.log(passage);
        console.log();

        // Display full translation instructions
        if (fs.existsSync(PROMPT_FILE)) {
            const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
            console.log(`📝 TRANSLATION INSTRUCTIONS`);
            console.log(`===========================`);
            console.log(prompt);
        } else {
            console.error('⚠️  Warning: passage-prompt.txt not found!');
        }

        console.log(`\n🔄 WORKFLOW`);
        console.log(`===========`);
        console.log(`1. Translate and analyze the passage following the format above`);
        console.log(`2. Scale commentary depth to match passage significance`);
        console.log(`3. 📝 IMPORTANT: Save your markdown to EXACT filename below:`);
        console.log(`   '${tempFile}'`);
        console.log(`   ⚠️  Do not change the filename! The hash (${hash}) is pre-calculated.`);
        console.log(`4. Run: ./passage-manager.js -i ${tempFile}`);
        console.log(`5. The translation will be imported and temp file auto-deleted`);
        console.log(`6. Run: ./passage-manager.js -n -m ${mode}  # to get next passage`);
        console.log();
        console.log(`💡 To skip this passage (ONLY if corrupt/illegible):`);
        console.log(`   ./passage-manager.js -s ${hash}`);
    } else {
        // Display brief version
        displayBriefPrompt(passage, hash, mode, translatedCount, skippedCount, totalCount, runsUntilFull, tempFile);
    }
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

        // Extract hash and mode from filename
        // Expected format: translation-temp-{mode}-{hash}.txt
        const filenameMatch = inputFile.match(/translation-temp-(deva|iast)-([a-f0-9]{12})\.txt$/);

        if (!filenameMatch) {
            console.error('Error: Invalid filename format.');
            console.error('Expected format: translation-temp-{mode}-{hash}.txt');
            console.error('Example: translation-temp-deva-10bc4c2c5525.txt');
            console.error('');
            console.error('The hash is provided by the tool when you run: ./passage-manager.js -n');
            console.error('Please use the exact filename suggested by the tool.');
            return;
        }

        const mode = filenameMatch[1];
        const hash = filenameMatch[2];
        const stateKey = mode === 'deva' ? 'devanagari' : 'iast';

        // Load and update translations
        const translations = loadTranslations();
        translations[hash] = markdown;
        saveTranslations(translations);

        // Update state
        const state = loadState();
        const stateKeyTransOnly = mode === 'deva' ? 'devanagari_translation_only' : 'iast_translation_only';

        // Remove from translation_only arrays if present (refinement workflow)
        if (state[stateKeyTransOnly]) {
            const transOnlyIndex = state[stateKeyTransOnly].translated.indexOf(hash);
            if (transOnlyIndex !== -1) {
                state[stateKeyTransOnly].translated.splice(transOnlyIndex, 1);
            }
            const skippedOnlyIndex = state[stateKeyTransOnly].skipped.indexOf(hash);
            if (skippedOnlyIndex !== -1) {
                state[stateKeyTransOnly].skipped.splice(skippedOnlyIndex, 1);
            }
        }

        // Add to full analysis translated array
        if (!state[stateKey].translated.includes(hash)) {
            state[stateKey].translated.push(hash);
        }

        saveState(state);

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
    console.log(`   Full analysis: ${state.devanagari.translated.length} translated, ${state.devanagari.skipped.length} skipped`);

    const devaTransOnlyCount = state.devanagari_translation_only ? state.devanagari_translation_only.translated.length : 0;
    const devaSkippedOnlyCount = state.devanagari_translation_only ? state.devanagari_translation_only.skipped.length : 0;
    if (devaTransOnlyCount > 0 || devaSkippedOnlyCount > 0) {
        console.log(`   Batch translations: ${devaTransOnlyCount} translated, ${devaSkippedOnlyCount} skipped`);
    }

    const devaTotal = state.devanagari.translated.length + devaTransOnlyCount;
    console.log(`   Completion: ${((devaTotal / devaPassages.length) * 100).toFixed(1)}%`);
    console.log(`   Remaining: ${devaPassages.length - state.devanagari.translated.length - state.devanagari.skipped.length - devaTransOnlyCount - devaSkippedOnlyCount}\n`);

    console.log(`📖 IAST PASSAGES`);
    console.log(`   Total: ${iastPassages.length}`);
    console.log(`   Full analysis: ${state.iast.translated.length} translated, ${state.iast.skipped.length} skipped`);

    const iastTransOnlyCount = state.iast_translation_only ? state.iast_translation_only.translated.length : 0;
    const iastSkippedOnlyCount = state.iast_translation_only ? state.iast_translation_only.skipped.length : 0;
    if (iastTransOnlyCount > 0 || iastSkippedOnlyCount > 0) {
        console.log(`   Batch translations: ${iastTransOnlyCount} translated, ${iastSkippedOnlyCount} skipped`);
    }

    const iastTotal = state.iast.translated.length + iastTransOnlyCount;
    console.log(`   Completion: ${((iastTotal / iastPassages.length) * 100).toFixed(1)}%`);
    console.log(`   Remaining: ${iastPassages.length - state.iast.translated.length - state.iast.skipped.length - iastTransOnlyCount - iastSkippedOnlyCount}\n`);

    console.log(`📚 TOTAL TRANSLATIONS`);
    console.log(`   Combined passages in JSON: ${Object.keys(translations).length}`);

    const totalPassages = devaPassages.length + iastPassages.length;
    const totalTranslated = state.devanagari.translated.length + state.iast.translated.length;
    const totalSkipped = state.devanagari.skipped.length + state.iast.skipped.length;
    const totalBatchTrans = devaTransOnlyCount + iastTransOnlyCount;

    console.log(`   Full analysis: ${totalTranslated} (${((totalTranslated / totalPassages) * 100).toFixed(1)}%)`);
    console.log(`   Batch only: ${totalBatchTrans} (${((totalBatchTrans / totalPassages) * 100).toFixed(1)}%)`);
    console.log(`   Overall completion: ${(((totalTranslated + totalBatchTrans) / totalPassages) * 100).toFixed(1)}%`);
    console.log(`   Total processed: ${totalTranslated + totalSkipped + totalBatchTrans}/${totalPassages}\n`);

    // Session info
    if (state.lastRunTimestamp) {
        console.log(`🕒 SESSION INFO`);
        console.log(`   Last run: ${new Date(state.lastRunTimestamp).toLocaleString()}`);
        console.log(`   Consecutive runs in session: ${state.consecutiveRuns}`);
        if (state.consecutiveRuns > 3) {
            const runsUntilFull = 5 - state.passagesSinceFullPrompt;
            console.log(`   Runs until full prompt: ${runsUntilFull}\n`);
        } else {
            console.log(`   Status: In warmup phase (full prompts)\n`);
        }
    }
}

function getBatchPassages(batchSize, mode) {
    const passagesFile = mode === 'deva' ? PASSAGES_FILE_DEVA : PASSAGES_FILE_IAST;
    const passages = loadPassages(passagesFile);
    const state = loadState();
    const stateKey = mode === 'deva' ? 'devanagari' : 'iast';
    const stateKeyTransOnly = mode === 'deva' ? 'devanagari_translation_only' : 'iast_translation_only';

    // Ensure translation_only sections exist
    if (!state[stateKeyTransOnly]) {
        state[stateKeyTransOnly] = { translated: [], skipped: [] };
    }

    // Combine all processed hashes
    const processedSet = new Set([
        ...state[stateKey].translated,
        ...state[stateKey].skipped,
        ...state[stateKeyTransOnly].translated,
        ...state[stateKeyTransOnly].skipped
    ]);

    // Find unprocessed passages
    const unprocessedPassages = [];
    const passageHashes = [];

    for (const passage of passages) {
        const hash = generatePassageHash(passage);
        if (!processedSet.has(hash)) {
            unprocessedPassages.push(passage);
            passageHashes.push(hash);
            if (unprocessedPassages.length >= batchSize) {
                break;
            }
        }
    }

    if (unprocessedPassages.length === 0) {
        console.log(`\n🎉 All ${mode === 'deva' ? 'Devanagari' : 'IAST'} passages have been processed!`);
        console.log(`No unprocessed passages available for batch translation.`);
        return;
    }

    // Generate timestamp for filenames
    const timestamp = Date.now();
    const txtFile = `translation-batch-${mode}-${timestamp}.txt`;
    const hashkeysFile = `translation-batch-${mode}-${timestamp}.hashkeys`;

    // Display batch prompt
    console.log(`\n📦 BATCH TRANSLATION MODE`);
    console.log(`=========================`);
    console.log(`Mode: ${mode === 'deva' ? 'Devanagari' : 'IAST'}`);
    console.log(`Batch size: ${unprocessedPassages.length} passage${unprocessedPassages.length > 1 ? 's' : ''}`);
    console.log(`\nOutput files:`);
    console.log(`  📝 ${txtFile}`);
    console.log(`  🔑 ${hashkeysFile}\n`);

    // Display passages
    console.log(`📜 PASSAGES TO TRANSLATE:`);
    console.log(`=========================\n`);

    for (let i = 0; i < unprocessedPassages.length; i++) {
        console.log(`[${i + 1}/${unprocessedPassages.length}] Hash: ${passageHashes[i]}`);
        console.log(unprocessedPassages[i]);
        console.log();
    }

    // Display batch translation instructions
    if (fs.existsSync(PROMPT_FILE_BATCH)) {
        const prompt = fs.readFileSync(PROMPT_FILE_BATCH, 'utf8');
        console.log(`📝 BATCH TRANSLATION INSTRUCTIONS`);
        console.log(`=================================`);
        console.log(prompt);
    } else {
        console.error('⚠️  Warning: passage-prompt-batch-translation.txt not found!');
    }

    console.log(`\n🔄 WORKFLOW`);
    console.log(`===========`);
    console.log(`1. Translate all ${unprocessedPassages.length} passages following the format above`);
    console.log(`2. Maintain the ORDER of passages (critical for hash mapping)`);
    console.log(`3. Separate each passage with exactly: --- DELIMITER ---`);
    console.log(`4. 📝 Save your translations to: '${txtFile}'`);
    console.log(`5. Run: ./passage-manager.js -j ${txtFile}`);
    console.log(`6. Batch will be imported and temp files auto-deleted\n`);

    // Write hashkeys file
    try {
        fs.writeFileSync(hashkeysFile, passageHashes.join('\n'), 'utf8');
        console.log(`✅ Hash keys file created: ${hashkeysFile}`);
        console.log(`   (This file maps the order of passages to their hash identifiers)\n`);
    } catch (error) {
        console.error(`Error writing hashkeys file: ${error.message}`);
    }
}

function importBatchTranslations(inputFile) {
    // Determine if input is .txt or .hashkeys, find the matching pair
    let txtFile, hashkeysFile;

    if (inputFile.endsWith('.txt')) {
        txtFile = inputFile;
        hashkeysFile = inputFile.replace(/\.txt$/, '.hashkeys');
    } else if (inputFile.endsWith('.hashkeys')) {
        hashkeysFile = inputFile;
        txtFile = inputFile.replace(/\.hashkeys$/, '.txt');
    } else {
        console.error('Error: File must be either .txt or .hashkeys');
        console.error('Expected format: translation-batch-{mode}-{timestamp}.txt');
        return;
    }

    // Check both files exist
    if (!fs.existsSync(txtFile)) {
        console.error(`Error: Translation file not found: ${txtFile}`);
        return;
    }
    if (!fs.existsSync(hashkeysFile)) {
        console.error(`Error: Hashkeys file not found: ${hashkeysFile}`);
        return;
    }

    // Extract mode from filename
    const filenameMatch = txtFile.match(/translation-batch-(deva|iast)-(\d+)\.txt$/);
    if (!filenameMatch) {
        console.error('Error: Invalid filename format.');
        console.error('Expected format: translation-batch-{mode}-{timestamp}.txt');
        console.error('Example: translation-batch-deva-1234567890.txt');
        return;
    }

    const mode = filenameMatch[1];
    const stateKeyTransOnly = mode === 'deva' ? 'devanagari_translation_only' : 'iast_translation_only';

    try {
        // Read files
        const hashkeysContent = fs.readFileSync(hashkeysFile, 'utf8').trim();
        const hashes = hashkeysContent.split('\n').map(h => h.trim()).filter(h => h.length > 0);

        const txtContent = fs.readFileSync(txtFile, 'utf8').trim();
        const passageSections = txtContent.split('--- DELIMITER ---').map(s => s.trim()).filter(s => s.length > 0);

        // Validate counts match
        if (hashes.length !== passageSections.length) {
            console.error(`Error: Mismatch between hashkeys (${hashes.length}) and passages (${passageSections.length})`);
            console.error('The number of hash keys must match the number of passages.');
            return;
        }

        console.log(`\n📥 IMPORTING BATCH TRANSLATIONS`);
        console.log(`================================`);
        console.log(`Mode: ${mode === 'deva' ? 'Devanagari' : 'IAST'}`);
        console.log(`Passages to import: ${hashes.length}\n`);

        // Load existing data
        const translations = loadTranslations();
        const state = loadState();

        // Ensure translation_only section exists
        if (!state[stateKeyTransOnly]) {
            state[stateKeyTransOnly] = { translated: [], skipped: [] };
        }

        let importedCount = 0;
        let skippedCount = 0;

        // Import each passage
        for (let i = 0; i < hashes.length; i++) {
            const hash = hashes[i];
            const passageContent = passageSections[i];

            // Check if hash already exists
            if (translations[hash]) {
                console.log(`ℹ️  INFO: Skipping hash ${hash} - already exists (passage ${i + 1}/${hashes.length})`);
                skippedCount++;
                continue;
            }

            // Import the translation
            translations[hash] = passageContent;

            // Update state
            if (!state[stateKeyTransOnly].translated.includes(hash)) {
                state[stateKeyTransOnly].translated.push(hash);
            }

            importedCount++;
        }

        // Save translations and state
        saveTranslations(translations);
        saveState(state);

        console.log(`\n✅ Batch import complete!`);
        console.log(`   Imported: ${importedCount} passage${importedCount !== 1 ? 's' : ''}`);
        console.log(`   Skipped (already exist): ${skippedCount}`);
        console.log(`   Total translations in JSON: ${Object.keys(translations).length}`);

        // Auto-delete temp files
        try {
            fs.unlinkSync(txtFile);
            fs.unlinkSync(hashkeysFile);
            console.log(`\n🗑️  Auto-deleted temporary files:`);
            console.log(`   ${txtFile}`);
            console.log(`   ${hashkeysFile}`);
        } catch (error) {
            console.log(`\n⚠️  Could not delete temp files: ${error.message}`);
        }

    } catch (error) {
        console.error(`Error importing batch translations: ${error.message}`);
    }
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

// Handle batch import
const batchImportIndex = args.indexOf('-j');
if (batchImportIndex !== -1) {
    const inputFile = args[batchImportIndex + 1];
    if (!inputFile) {
        console.error('Error: Please specify a file after -j');
        showUsage();
        process.exit(1);
    }
    importBatchTranslations(inputFile);
    process.exit(0);
}

// Handle batch translation
const batchIndex = args.indexOf('-t');
if (batchIndex !== -1) {
    const batchSizeStr = args[batchIndex + 1];
    if (!batchSizeStr) {
        console.error('Error: Please specify a batch size after -t');
        showUsage();
        process.exit(1);
    }
    const batchSize = parseInt(batchSizeStr);
    if (isNaN(batchSize) || batchSize < 1) {
        console.error('Error: Batch size must be a positive number');
        showUsage();
        process.exit(1);
    }

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

    getBatchPassages(batchSize, mode);
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

    const forceFullPrompt = args.includes('-f') || args.includes('--full-prompt');
    getNextPassage(mode, forceFullPrompt);
    process.exit(0);
}

console.error('Error: Unknown command');
showUsage();
process.exit(1);
