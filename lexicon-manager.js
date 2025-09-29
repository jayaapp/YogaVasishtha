#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exit } = require('process');

const WORDS_FILE_DEVA = 'Yoga-Vasishtha-Devanagari-Words.txt';
const WORDS_FILE_IAST = 'Yoga-Vasishtha-IAST-Words.txt';
const LEXICON_FILE_DEVA = 'Yoga-Vasishtha-Devanagari-Lexicon.json';
const LEXICON_FILE_IAST = 'Yoga-Vasishtha-IAST-Lexicon.json';
const PROMPT_FILE = 'lexicon-prompt.txt';
const ISSUES_FILE = 'IAST_Lexicon_Issues.txt';
const REFINE_STATE_FILE = 'lexicon-manager-refine-state.json';
const DELIMITER = '\n--- WORD DELIMITER ---\n';

function showUsage() {
    console.log(`
Usage: node lexicon-manager.js [options]

Options:
  -b <number>    Batch size (default: 100)
  -i <file>      Import batch analysis results from file into Devanagari lexicon
  -j <file>      Import batch analysis results from file into IAST lexicon
  -m <mode>      Mode: 'deva' for Devanagari (default), 'iast' for IAST
  -r, --refine   Refine mode: pick next unrefined entry for detailed analysis
  -h, --help     Show this help message

Examples:
  node lexicon-manager.js -b 50        # Get next 50 words to analyze
  node lexicon-manager.js -i batch-output.txt  # Import analysis results
  node lexicon-manager.js -m iast -r   # Refine next IAST lexicon entry
  node lexicon-manager.js -m deva -r   # Refine next Devanagari lexicon entry
`);
}

function loadLexicon(LEXICON_FILE) {
    if (fs.existsSync(LEXICON_FILE)) {
        try {
            const content = fs.readFileSync(LEXICON_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading lexicon file:', error.message);
            return {};
        }
    }
    return {};
}

function saveLexicon(lexicon, LEXICON_FILE) {
    try {
        fs.writeFileSync(LEXICON_FILE, JSON.stringify(lexicon, null, 2), 'utf8');
        console.log(`Lexicon saved to ${LEXICON_FILE}`);
    } catch (error) {
        console.error('Error saving lexicon:', error.message);
    }
}

function loadWords(WORDS_FILE) {
    try {
        const content = fs.readFileSync(WORDS_FILE, 'utf8');
        return content.trim().split('\n').filter(word => word.trim());
    } catch (error) {
        console.error(`Error reading words file: ${error.message}`);
        process.exit(1);
    }
}

function logIssue(transliteration, reason, analysis) {
    const timestamp = new Date().toISOString();
    const issueEntry = `\n[${timestamp}] UNMATCHED WORD\n` +
                      `Transliteration: ${transliteration}\n` +
                      `Reason: ${reason}\n` +
                      `Analysis snippet: ${analysis.substring(0, 200)}...\n` +
                      `${'='.repeat(80)}\n`;

    try {
        fs.appendFileSync(ISSUES_FILE, issueEntry, 'utf8');
    } catch (error) {
        console.error(`Warning: Could not log issue to ${ISSUES_FILE}:`, error.message);
    }
}

function createIastCharMap() {
    return {
        // Long vowels
        'ā': 'á', 'ī': 'í', 'ū': 'ú',
        // Nasals
        'ṃ': 'm', 'ṅ': 'n', 'ñ': 'n', 'ṇ': 'n',
        // Retroflexes
        'ṭ': 't', 'ḍ': 'd', 'ṛ': 'r', 'ṝ': 'r', 'ḷ': 'l', 'ḹ': 'l',
        // Sibilants
        'ś': 'sh', 'ṣ': 'sh',
        // Visarga
        'ḥ': 'h',
        // Other diacriticals that might appear
        'ē': 'e', 'ō': 'o'
    };
}

function normalizeForComparison(text, charMap) {
    let normalized = text.toLowerCase();

    // Apply character mapping
    for (const [iast, source] of Object.entries(charMap)) {
        normalized = normalized.replace(new RegExp(iast, 'g'), source);
    }

    // Remove common punctuation and separators
    normalized = normalized.replace(/[-\s]/g, '');

    return normalized;
}

function calculateEditDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    // Fill the matrix
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j - 1][i] + 1,      // deletion
                matrix[j][i - 1] + 1,      // insertion
                matrix[j - 1][i - 1] + cost // substitution
            );
        }
    }

    return matrix[str2.length][str1.length];
}

function calculateSimilarity(transliteration, sourceWord, charMap) {
    const normalized1 = normalizeForComparison(transliteration, charMap);
    const normalized2 = normalizeForComparison(sourceWord, charMap);

    // Handle empty strings
    if (!normalized1 || !normalized2) return 0;

    // Calculate edit distance
    const distance = calculateEditDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    // Convert to similarity score (0-1)
    const similarity = 1 - (distance / maxLength);

    // Apply length penalty for very different lengths
    const lengthRatio = Math.min(normalized1.length, normalized2.length) /
                       Math.max(normalized1.length, normalized2.length);
    const lengthPenalty = lengthRatio < 0.5 ? 0.5 : 1;

    return similarity * lengthPenalty;
}

function findBestSourceMatch(transliteration, sourceWords) {
    const charMap = createIastCharMap();
    const threshold = 0.8; // 80% similarity threshold

    // Remove hyphens from transliteration for comparison
    const cleanTransliteration = transliteration.replace(/-/g, '');

    // Calculate similarity scores for all source words
    const candidates = sourceWords.map(word => ({
        word,
        score: calculateSimilarity(cleanTransliteration, word, charMap)
    }));

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    // Return best match if above threshold
    if (candidates.length > 0 && candidates[0].score >= threshold) {
        return {
            match: candidates[0].word,
            score: candidates[0].score
        };
    }

    return null;
}

function getNextBatch(batchSize, LEXICON_FILE, WORDS_FILE) {
    const words = loadWords(WORDS_FILE);
    const lexicon = loadLexicon(LEXICON_FILE);

    const processedWords = new Set(Object.keys(lexicon));
    const remainingWords = words.filter(word => !processedWords.has(word));

    if (remainingWords.length === 0) {
        console.log('🎉 All words have been processed!');
        console.log(`Total words in lexicon: ${Object.keys(lexicon).length}`);
        return;
    }

    const batch = remainingWords.slice(0, batchSize);

    console.log(`\n📚 NEXT BATCH OF SANSKRIT WORDS TO ANALYZE`);
    console.log(`==========================================`);
    console.log(`Batch size: ${batch.length}`);
    console.log(`Remaining words: ${remainingWords.length}`);
    console.log(`Progress: ${processedWords.size}/${words.length} (${((processedWords.size/words.length)*100).toFixed(1)}%)`);
    console.log(`\nWords to analyze:`);

    batch.forEach((word, index) => {
        console.log(`${index + 1}. ${word}`);
    });

    // Display the prompt
    console.log(`\n📝 ANALYSIS INSTRUCTIONS`);
    console.log(`========================`);

    if (fs.existsSync(PROMPT_FILE)) {
        const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
        console.log(prompt);
    } else {
        console.log('Error: lexicon-prompt.txt not found!');
        return;
    }

    const import_switch = LEXICON_FILE === LEXICON_FILE_DEVA ? '-i' : '-j';

    const BATCH_OUTPUT_FILE = 'batch-output' + (LEXICON_FILE === LEXICON_FILE_DEVA ? '-deva.txt' : '-iast.txt');

    console.log(`\n🔄 WORKFLOW INSTRUCTIONS`);
    console.log(`========================`);
    console.log(`1. Apply the above analysis format to EACH word in the batch`);
    console.log(`2. Save all analyses to '${BATCH_OUTPUT_FILE}'`);
    console.log(`3. Use this delimiter between each word analysis:`);
    console.log(`   ${DELIMITER.trim()}`);
    console.log(`4. Run: node lexicon-manager.js ${import_switch} ${BATCH_OUTPUT_FILE}`);
    console.log(`5. Repeat until all words are processed`);
}

function importBatchResults(inputFile, LEXICON_FILE, WORDS_FILE) {
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File ${inputFile} not found!`);
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(inputFile, 'utf8');
        const analyses = content.split(DELIMITER).filter(analysis => analysis.trim());

        const lexicon = loadLexicon(LEXICON_FILE);
        const sourceWords = LEXICON_FILE === LEXICON_FILE_IAST ? loadWords(WORDS_FILE) : null;
        let importCount = 0;
        let skippedCount = 0;
        let omittedCount = 0;

        analyses.forEach(analysis => {
            const trimmed = analysis.trim();
            if (!trimmed) return;

            let word = null;
            let transliteration = null;

            if (LEXICON_FILE === LEXICON_FILE_DEVA) {
                // Extract word from the first line (# word format)
                const lines = trimmed.split('\n');
                const firstLine = lines[0];
                if (firstLine.startsWith('# ')) {
                    word = firstLine.substring(2).trim();
                }
            }
            else { // IAST mode - use fuzzy matching
                // Extract IAST transliteration from the second line
                const lines = trimmed.split('\n');
                const secondLine = lines[1];
                if (secondLine.startsWith('**Transliteration**: ')) {
                    transliteration = secondLine.substring(21).trim();

                    // Use fuzzy matching to find best source word match
                    const matchResult = findBestSourceMatch(transliteration, sourceWords);

                    if (matchResult) {
                        word = matchResult.match;
                        if (matchResult.score < 0.95) {
                            console.log(`Fuzzy matched: ${transliteration} → ${word} (${(matchResult.score * 100).toFixed(1)}%)`);
                        }
                    } else {
                        // No good match found - omit and log
                        const reason = `No source word found with >80% similarity to transliteration`;
                        logIssue(transliteration, reason, trimmed);
                        console.log(`Omitted (no match): ${transliteration}`);
                        omittedCount++;
                        return;
                    }
                }
            }

            if (!word) {
                console.log(`Warning: Could not extract word from analysis`);
                return;
            }

            // Check if word already exists in lexicon
            if (lexicon[word]) {
                // In refine mode, overwrite existing entries; otherwise skip
                if (args.includes('-r') || args.includes('--refine')) {
                    lexicon[word] = trimmed;
                    importCount++;
                    console.log(`Refined (overwritten): ${word}`);
                } else {
                    console.log(`Skipped (already exists): ${word}`);
                    skippedCount++;
                }
            } else {
                lexicon[word] = trimmed;
                importCount++;
                console.log(`Imported: ${word}`);
            }
        });

        if (importCount > 0 || skippedCount > 0 || omittedCount > 0) {
            if (importCount > 0) {
                saveLexicon(lexicon, LEXICON_FILE);
            }
            console.log(`\n✅ Import completed: ${importCount} new word analyses imported`);
            if (skippedCount > 0) {
                console.log(`⏭️  Skipped: ${skippedCount} words (already exist in lexicon)`);
            }
            if (omittedCount > 0) {
                console.log(`⚠️  Omitted: ${omittedCount} words (no source match found, logged to ${ISSUES_FILE})`);
            }
            console.log(`Total words in lexicon: ${Object.keys(lexicon).length}`);

            // Show next batch info
            const words = loadWords(WORDS_FILE);
            const remaining = words.length - Object.keys(lexicon).length;
            if (remaining > 0) {
                console.log(`\n📊 PROGRESS UPDATE`);
                console.log(`==================`);
                console.log(`Remaining words: ${remaining}`);
                console.log(`Run 'node lexicon-manager.js' to get the next batch`);
            } else {
                console.log(`\n🎉 CONGRATULATIONS! All ${words.length} words have been analyzed!`);
            }
        } else {
            console.log('⚠️  No valid word analyses found in the input file');
        }

    } catch (error) {
        console.error('Error importing batch results:', error.message);
    }
}

// ===== REFINE MODE FUNCTIONS =====

function loadRefineState() {
    if (fs.existsSync(REFINE_STATE_FILE)) {
        try {
            const content = fs.readFileSync(REFINE_STATE_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading refine state file:', error.message);
            return initializeRefineState();
        }
    }
    return initializeRefineState();
}

function initializeRefineState() {
    // Only initialize with keys that actually exist in each respective lexicon
    const devaLexicon = loadLexicon(LEXICON_FILE_DEVA);
    const iastLexicon = loadLexicon(LEXICON_FILE_IAST);

    const state = {
        devanagari: [], // Initialize empty - hridaya doesn't exist in Devanagari lexicon
        iast: iastLexicon.hasOwnProperty('hridaya') ? ['hridaya'] : [] // Only add if it exists
    };
    saveRefineState(state);
    return state;
}

function saveRefineState(state) {
    try {
        fs.writeFileSync(REFINE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving refine state:', error.message);
    }
}

function refineNextEntry(mode) {
    const LEXICON_FILE = mode === 'deva' ? LEXICON_FILE_DEVA : LEXICON_FILE_IAST;
    const lexicon = loadLexicon(LEXICON_FILE);
    const refineState = loadRefineState();

    const allKeys = Object.keys(lexicon);
    const refinedKeys = new Set(refineState[mode === 'deva' ? 'devanagari' : 'iast'] || []);
    const unrefinedKeys = allKeys.filter(key => !refinedKeys.has(key));

    if (unrefinedKeys.length === 0) {
        console.log(`🎉 All ${mode === 'deva' ? 'Devanagari' : 'IAST'} lexicon entries have been refined!`);
        console.log(`Total refined entries: ${allKeys.length}`);
        return;
    }

    const nextKey = unrefinedKeys[0];
    const currentEntry = lexicon[nextKey];

    console.log(`\n🔍 REFINING ${mode === 'deva' ? 'DEVANAGARI' : 'IAST'} LEXICON ENTRY`);
    console.log(`===============================================`);
    console.log(`Word: ${nextKey}`);
    console.log(`Progress: ${refinedKeys.size}/${allKeys.length} refined (${((refinedKeys.size/allKeys.length)*100).toFixed(1)}%)`);
    console.log(`Remaining: ${unrefinedKeys.length} entries`);

    console.log(`\n📖 CURRENT ENTRY:`);
    console.log(`================`);
    console.log(currentEntry);

    const tempFileName = `refine-temp-${mode}-${Date.now()}.txt`;

    console.log(`\n📝 REFINEMENT INSTRUCTIONS`);
    console.log(`==========================`);

    if (fs.existsSync(PROMPT_FILE)) {
        const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
        console.log(prompt);
    } else {
        console.log('Error: lexicon-prompt.txt not found!');
        return;
    }

    const import_switch = mode === 'deva' ? '-i' : '-j';

    console.log(`\n🔄 REFINEMENT WORKFLOW`);
    console.log(`======================`);
    console.log(`1. Analyze the word "${nextKey}" using the above format`);
    console.log(`2. Create a comprehensive, detailed analysis (like the hridaya example)`);
    console.log(`3. Save your analysis to '${tempFileName}'`);
    console.log(`4. Run: node lexicon-manager.js ${import_switch} ${tempFileName} -r`);
    console.log(`5. The entry will be updated and temp file auto-deleted`);
    console.log(`6. Run: node lexicon-manager.js -m ${mode} -r  # to continue with next word`);

    console.log(`\n💡 TIP: Focus on enriching the Metaphysics section with detailed information!`);
}

function updateRefineState(mode, key) {
    const refineState = loadRefineState();
    const stateKey = mode === 'deva' ? 'devanagari' : 'iast';

    if (!refineState[stateKey]) {
        refineState[stateKey] = [];
    }

    if (!refineState[stateKey].includes(key)) {
        refineState[stateKey].push(key);
        saveRefineState(refineState);
        console.log(`✅ Marked "${key}" as refined in ${mode} lexicon`);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
    showUsage();
    process.exit(0);
}

const batchSizeIndex = args.indexOf('-b');

const isRefineMode = args.includes('-r') || args.includes('--refine');

let importFileIndex = args.indexOf('-i');
if (importFileIndex !== -1) {
    const inputFile = args[importFileIndex + 1];
    if (!inputFile) {
        console.error('Error: Please specify a file after -i');
        showUsage();
        process.exit(1);
    }
    importBatchResults(inputFile, LEXICON_FILE_DEVA, WORDS_FILE_DEVA);

    if (isRefineMode) {
        // Extract the word key from the first line for Devanagari mode
        const tempContent = fs.readFileSync(inputFile, 'utf8');
        const lines = tempContent.trim().split('\n');
        const firstLine = lines[0];

        if (firstLine.startsWith('# ')) {
            const word = firstLine.substring(2).trim();
            updateRefineState('deva', word);
        }

        // Auto-delete temp file
        try {
            fs.unlinkSync(inputFile);
            console.log(`🗑️  Auto-deleted temporary file: ${inputFile}`);
        } catch (error) {
            console.log(`⚠️  Could not delete temp file: ${inputFile}`);
        }
    }

    process.exit(0);
}

importFileIndex = args.indexOf('-j');
if (importFileIndex !== -1) {
    const inputFile = args[importFileIndex + 1];
    if (!inputFile) {
        console.error('Error: Please specify a file after -j');
        showUsage();
        process.exit(1);
    }
    importBatchResults(inputFile, LEXICON_FILE_IAST, WORDS_FILE_IAST);

    if (isRefineMode) {
        // Extract the word key by looking at the transliteration line and using fuzzy matching
        const tempContent = fs.readFileSync(inputFile, 'utf8');
        const transliterationMatch = tempContent.match(/\*\*Transliteration\*\*:\s*([^\n]+)/);

        if (transliterationMatch) {
            const transliteration = transliterationMatch[1].trim();

            // Use the same fuzzy matching logic as the import
            const sourceWords = loadWords(WORDS_FILE_IAST);
            const matchResult = findBestSourceMatch(transliteration, sourceWords);

            if (matchResult) {
                updateRefineState('iast', matchResult.match);
            }
        }

        // Auto-delete temp file
        try {
            fs.unlinkSync(inputFile);
            console.log(`🗑️  Auto-deleted temporary file: ${inputFile}`);
        } catch (error) {
            console.log(`⚠️  Could not delete temp file: ${inputFile}`);
        }
    }

    process.exit(0);
}

let batchMode = 'deva'; // default mode

const batchModeIndex = args.indexOf('-m');
if (batchModeIndex !== -1) {
    batchMode = args[batchModeIndex + 1];
    if (!batchMode || (batchMode !== 'deva' && batchMode !== 'iast')) {
        console.error('Error: Please specify a valid batch mode after -m (deva or iast)');
        showUsage();
        process.exit(1);
    }
}

// Handle refine mode
if (isRefineMode) {
    refineNextEntry(batchMode);
    process.exit(0);
}

const batchSize = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1]) || 100 : 100;

if (batchMode === 'deva') {
    getNextBatch(batchSize, LEXICON_FILE_DEVA, WORDS_FILE_DEVA);
} else {
    getNextBatch(batchSize, LEXICON_FILE_IAST, WORDS_FILE_IAST);
}