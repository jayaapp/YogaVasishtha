const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const crypto = require('crypto');

/**
 * Create mapping between lexicon words and passages they appear in
 * Uses linear algorithm - single pass through EPUBs extracting passages
 *
 * Output format
 * {
 *   "word": [
 *     { "hash": "abc123...", "passage": "passage text..." },
 *     ...
 *   ]
 * }
 */

// Configuration
const DEVA_LEXICON_FILE = 'Yoga-Vasishtha-Devanagari-Lexicon.json';
const IAST_LEXICON_FILE = 'Yoga-Vasishtha-IAST-Lexicon.json';
const OUTPUT_FILE = 'Yoga-Vasishtha-Words-Passages-Mapping.json';
const ERROR_FILE = 'Words-Passages-Mapping-Errors.txt';
const EPUB_DIR = 'epub';

const EPUB_FILES = [
    'Yoga-Vasishtha-V1.epub',
    'Yoga-Vasishtha-V2-P1of2.epub',
    'Yoga-Vasishtha-V2-P2of2.epub',
    'Yoga-Vasishtha-V3-P1of2.epub',
    'Yoga-Vasishtha-V3-P2of2.epub',
    'Yoga-Vasishtha-V4-P1of2.epub',
    'Yoga-Vasishtha-V4-P2of2.epub'
];

// Generate passage hash (same as passage-manager.js)
function generatePassageHash(passage) {
    // HYBRID HASHING APPROACH:
    // - For passages with Devanagari: use Devanagari-only hashing (immune to whitespace)
    // - For pure IAST/romanized: use full-text normalization (original working method)

    const hasDevanagari = /[\u0900-\u097F]/.test(passage);

    let normalized;
    if (hasDevanagari) {
        // Extract only Devanagari characters (U+0900 to U+097F)
        // This makes hashing immune to whitespace and punctuation variations
        const devanagariOnly = passage.match(/[\u0900-\u097F]/g);
        normalized = devanagariOnly ? devanagariOnly.join('') : '';
    } else {
        // Pure IAST/romanized passage - use full-text normalization
        // Normalize: remove extra whitespace, trim (original working method)
        normalized = passage.trim().replace(/\s+/g, ' ');
    }

    // Generate SHA256 hash and take first 12 characters
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 12);
}

// Progress tracking
let totalOperations = 0;
let completedOperations = 0;
let startTime = Date.now();

function updateProgress(message) {
    completedOperations++;
    const percent = ((completedOperations / totalOperations) * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const estimatedTotal = (elapsed / completedOperations) * totalOperations;
    const remaining = Math.max(0, estimatedTotal - elapsed);

    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);

    process.stdout.write(`\r[${percent}%] ${message} (ETA: ${mins}m ${secs}s)     `);
}

// Extract text content from EPUB
async function extractTextFromEPUB(zip) {
    try {
        const containerXML = await zip.file('META-INF/container.xml').async('string');
        const containerDoc = new DOMParser().parseFromString(containerXML, 'text/xml');
        const rootfilePath = containerDoc.getElementsByTagName('rootfile')[0].getAttribute('full-path');

        const contentOPF = await zip.file(rootfilePath).async('string');
        const opfDoc = new DOMParser().parseFromString(contentOPF, 'text/xml');

        const basePath = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);

        const spineItems = opfDoc.getElementsByTagName('itemref');
        const manifest = opfDoc.getElementsByTagName('item');

        // Build manifest map
        const manifestMap = {};
        for (let i = 0; i < manifest.length; i++) {
            const item = manifest[i];
            manifestMap[item.getAttribute('id')] = item.getAttribute('href');
        }

        // Extract content with structure
        const chapters = [];

        for (let i = 0; i < spineItems.length; i++) {
            const idref = spineItems[i].getAttribute('idref');
            const href = manifestMap[idref];

            if (href && (href.endsWith('.html') || href.endsWith('.xhtml') || href.endsWith('.htm'))) {
                const filePath = basePath + href;
                const fileContent = await zip.file(filePath).async('string');
                const htmlDoc = new DOMParser().parseFromString(fileContent, 'text/html');

                chapters.push({
                    index: i,
                    href: href,
                    doc: htmlDoc,
                    basePath: basePath
                });
            }
        }

        return chapters;

    } catch (error) {
        console.error('\nError extracting EPUB structure:', error.message);
        return [];
    }
}

// Extract passages from chapter
function extractPassages(chapter, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors) {
    const body = chapter.doc.getElementsByTagName('body')[0];
    if (!body) return;

    // Get all text nodes
    const textNodes = [];
    function collectTextNodes(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.nodeValue || '';
            if (text.trim().length > 0) {
                textNodes.push(text);
            }
        } else if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                collectTextNodes(node.childNodes[i]);
            }
        }
    }
    collectTextNodes(body);

    // Concatenate all text
    const fullText = textNodes.join('');

    // Apply same passage extraction algorithm as extract-sanskrit-passages.js
    // Stop only at Roman letters (a-z, A-Z)
    // Include: Devanagari, whitespace, numbers, ALL punctuation
    const romanLetterPattern = /[a-zA-Z]/;
    const hasDevanagariPattern = /[\u0900-\u097F]/;
    const SANSKRIT_PATTERN_REGEX = /\[Sanskrit:\s*([^\]]+)\]/g;

    // Extract Devanagari passages
    let currentPassage = '';

    for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];

        if (romanLetterPattern.test(char)) {
            // Roman letter - passage boundary
            if (currentPassage.trim().length > 0) {
                // Clean leading/trailing non-Devanagari characters (including numbers, punctuation)
                let passage = currentPassage
                    .replace(/^[^\u0900-\u097F]+/, '')  // Remove ALL leading non-Devanagari
                    .replace(/[^\u0900-\u097F]+$/, '')  // Remove ALL trailing non-Devanagari
                    .trim();
                // Check if passage contains whitespace AND has at least 2 Devanagari characters
                const devanagariChars = (passage.match(/[\u0900-\u097F]/g) || []);
                if (/\s/.test(passage) && devanagariChars.length >= 2) {
                    processPassage(passage, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
                }
            }
            currentPassage = '';
        } else {
            // Include everything else: Devanagari, numbers, punctuation, whitespace
            currentPassage += char;
        }
    }

    // Handle remaining passage at end
    if (currentPassage.trim().length > 0) {
        let passage = currentPassage
            .replace(/^[^\u0900-\u097F]+/, '')  // Remove ALL leading non-Devanagari
            .replace(/[^\u0900-\u097F]+$/, '')  // Remove ALL trailing non-Devanagari
            .trim();
        const devanagariChars = (passage.match(/[\u0900-\u097F]/g) || []);
        if (/\s/.test(passage) && devanagariChars.length >= 2) {
            processPassage(passage, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
        }
    }

    // Extract IAST passages
    let match;
    SANSKRIT_PATTERN_REGEX.lastIndex = 0;
    while ((match = SANSKRIT_PATTERN_REGEX.exec(fullText)) !== null) {
        const sanskritContent = match[1].trim();

        if (/\s/.test(sanskritContent) && !sanskritContent.includes('illegible')) {
            processPassage(sanskritContent, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
        }
    }
}

// Process a single passage - check for lexicon words and add to mapping
function processPassage(passage, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors) {
    const hash = generatePassageHash(passage);

    // Skip if we've already processed this exact passage
    if (processedPassages.has(hash)) {
        return;
    }

    processedPassages.add(hash);

    // Check which lexicon words appear in this passage
    // For substring matching, check each lexicon word against passage
    const matchedWords = new Set();

    // Check Devanagari lexicon
    for (const word of devaLexiconSet) {
        if (passage.includes(word)) {
            matchedWords.add(word);
        }
    }

    // Check IAST lexicon (case-sensitive)
    for (const word of iastLexiconSet) {
        if (passage.includes(word)) {
            matchedWords.add(word);
        }
    }

    // Add passage to mapping for each matched word
    for (const word of matchedWords) {
        if (!mapping[word]) {
            mapping[word] = [];
        }

        // Check if we already have this passage for this word
        const existing = mapping[word].find(p => p.hash === hash);
        if (!existing) {
            // New passage for this word
            mapping[word].push({
                hash: hash,
                passage: passage
            });
        }
    }
}

// Main processing function
async function createMapping() {
    console.log('🔍 Creating Words-Passages Mapping...\n');

    try {
        // Load lexicons
        console.log('📖 Loading lexicons...');
        const devaLexicon = JSON.parse(fs.readFileSync(DEVA_LEXICON_FILE, 'utf8'));
        const iastLexicon = JSON.parse(fs.readFileSync(IAST_LEXICON_FILE, 'utf8'));

        // Create Sets for O(1) lookup
        const devaLexiconSet = new Set(Object.keys(devaLexicon));
        const iastLexiconSet = new Set(Object.keys(iastLexicon));

        console.log(`   Devanagari: ${devaLexiconSet.size} words`);
        console.log(`   IAST: ${iastLexiconSet.size} words\n`);

        // Initialize data structures
        const mapping = {};
        const processedPassages = new Set(); // Track by hash to avoid duplicates
        const errors = [];

        // Calculate total operations for progress tracking
        totalOperations = EPUB_FILES.length;
        startTime = Date.now();

        // Process all EPUBs
        console.log('📚 Processing EPUBs to extract passages and build mapping...\n');

        for (const epubFile of EPUB_FILES) {
            const epubPath = `${EPUB_DIR}/${epubFile}`;

            if (!fs.existsSync(epubPath)) {
                updateProgress(`⚠️  Skipping ${epubFile} (not found)`);
                continue;
            }

            updateProgress(`Processing ${epubFile}`);

            const epubData = fs.readFileSync(epubPath);
            const zip = await JSZip.loadAsync(epubData);
            const chapters = await extractTextFromEPUB(zip);

            // Extract passages from each chapter
            for (const chapter of chapters) {
                extractPassages(chapter, epubFile, devaLexiconSet, iastLexiconSet,
                               mapping, processedPassages, errors);
            }
        }

        console.log('\n\n✅ Processing complete!\n');

        // Generate statistics
        const totalWords = Object.keys(mapping).length;
        const totalPassages = processedPassages.size;
        let totalAssociations = 0;
        for (const word in mapping) {
            totalAssociations += mapping[word].length;
        }

        console.log('📊 Statistics:');
        console.log(`   Total unique passages: ${totalPassages}`);
        console.log(`   Words with passages: ${totalWords}`);
        console.log(`   Total word-passage associations: ${totalAssociations}`);
        console.log(`   Average passages per word: ${(totalAssociations / totalWords).toFixed(1)}`);

        // Save mapping
        console.log(`\n💾 Saving mapping to ${OUTPUT_FILE}...`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2));

        const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(2);
        console.log(`   File size: ${fileSizeMB} MB`);

        // Save errors if any
        if (errors.length > 0) {
            console.log(`\n⚠️  ${errors.length} errors occurred. Saving to ${ERROR_FILE}...`);
            fs.writeFileSync(ERROR_FILE, errors.join('\n'));
        }

        console.log('\n✨ Done!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run
createMapping();
