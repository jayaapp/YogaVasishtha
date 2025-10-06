const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const crypto = require('crypto');

/**
 * Create mapping between lexicon words and passages they appear in
 * Uses linear algorithm - single pass through EPUBs extracting passages
 * and capturing CFI locations simultaneously
 */

// Configuration
const DEVA_LEXICON_FILE = 'Yoga-Vasishtha-Devanagari-Lexicon.json';
const IAST_LEXICON_FILE = 'Yoga-Vasishtha-IAST-Lexicon.json';
const OUTPUT_FILE = 'Words-Passages-Mapping.json';
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
    const normalized = passage.trim().replace(/\s+/g, ' ');
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

// Generate CFI for a text position
function generateCFIForNode(textNode, offset, body, chapterIndex) {
    // Build path from text node to body
    const path = [];
    let currentNode = textNode.parentNode;

    while (currentNode && currentNode !== body) {
        // Count position among siblings
        let position = 0;
        let sibling = currentNode.parentNode.firstChild;
        while (sibling) {
            if (sibling.nodeType === 1) { // Element node
                position += 2;
            }
            if (sibling === currentNode) break;
            sibling = sibling.nextSibling;
        }

        path.unshift(position);
        currentNode = currentNode.parentNode;
    }

    // Build CFI string
    const chapterPart = (chapterIndex + 1) * 2;
    const pathPart = path.length > 0 ? '/' + path.join('/') : '';
    const cfi = `/6/${chapterPart}!/4${pathPart}/1:${offset}`;

    return cfi;
}

// Extract passages from chapter with CFI tracking
function extractPassagesWithCFI(chapter, epubFile, devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors) {
    const body = chapter.doc.getElementsByTagName('body')[0];
    if (!body) return;

    // Get all text nodes with their positions
    const textNodes = [];
    function collectTextNodes(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.nodeValue || '';
            if (text.trim().length > 0) {
                textNodes.push({
                    node: node,
                    text: text
                });
            }
        } else if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                collectTextNodes(node.childNodes[i]);
            }
        }
    }
    collectTextNodes(body);

    // Concatenate all text with node position tracking
    let fullText = '';
    const nodePositions = [];

    for (let i = 0; i < textNodes.length; i++) {
        const startPos = fullText.length;
        fullText += textNodes[i].text;
        nodePositions.push({
            startPos: startPos,
            endPos: fullText.length,
            node: textNodes[i].node
        });
    }

    // Apply same passage extraction algorithm as extract-sanskrit-passages.js
    const devanagariOrWhitespaceOrDash = /[\u0900-\u097F\s\-]/;
    const SANSKRIT_PATTERN_REGEX = /\[Sanskrit:\s*([^\]]+)\]/g;

    // Extract Devanagari passages
    let currentPassage = '';
    let passageStartPos = -1;

    for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];

        if (devanagariOrWhitespaceOrDash.test(char)) {
            if (passageStartPos === -1) {
                passageStartPos = i;
            }
            currentPassage += char;
        } else {
            // Non-Devanagari boundary
            if (currentPassage.trim().length > 0) {
                const passage = currentPassage.trim();
                // Check if passage contains whitespace (multiple words)
                if (/\s/.test(passage)) {
                    processPassage(passage, passageStartPos, nodePositions, body, chapter, epubFile,
                                   devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
                }
            }
            currentPassage = '';
            passageStartPos = -1;
        }
    }

    // Handle remaining passage at end
    if (currentPassage.trim().length > 0) {
        const passage = currentPassage.trim();
        if (/\s/.test(passage)) {
            processPassage(passage, passageStartPos, nodePositions, body, chapter, epubFile,
                           devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
        }
    }

    // Extract IAST passages
    let match;
    SANSKRIT_PATTERN_REGEX.lastIndex = 0;
    while ((match = SANSKRIT_PATTERN_REGEX.exec(fullText)) !== null) {
        const sanskritContent = match[1].trim();

        if (/\s/.test(sanskritContent) && !sanskritContent.includes('illegible')) {
            const passageStartPos = match.index;
            processPassage(sanskritContent, passageStartPos, nodePositions, body, chapter, epubFile,
                           devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors);
        }
    }
}

// Process a single passage - check for lexicon words and add to mapping
function processPassage(passage, startPos, nodePositions, body, chapter, epubFile,
                        devaLexiconSet, iastLexiconSet, mapping, processedPassages, errors) {
    const hash = generatePassageHash(passage);

    // Skip if we've already processed this exact passage
    if (processedPassages.has(hash)) {
        return;
    }

    // Find CFI for passage start
    let cfi = null;
    for (let i = 0; i < nodePositions.length; i++) {
        const pos = nodePositions[i];
        if (startPos >= pos.startPos && startPos < pos.endPos) {
            const offset = startPos - pos.startPos;
            cfi = generateCFIForNode(pos.node, offset, body, chapter.index);
            break;
        }
    }

    if (!cfi) {
        errors.push(`No CFI found for passage ${hash}: ${passage.substring(0, 50)}...`);
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

        // Check if we already have this passage for this word (different CFI)
        const existing = mapping[word].find(p => p.hash === hash);
        if (existing) {
            // Add CFI if not already present
            if (!existing.cfis.includes(cfi)) {
                existing.cfis.push(cfi);
            }
        } else {
            // New passage for this word
            mapping[word].push({
                hash: hash,
                cfis: [cfi],
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
                extractPassagesWithCFI(chapter, epubFile, devaLexiconSet, iastLexiconSet,
                                       mapping, processedPassages, errors);
            }
        }

        console.log('\n\n✅ Processing complete\n');

        // Write mapping file
        console.log(`💾 Writing mapping to ${OUTPUT_FILE}...`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2), 'utf8');
        console.log('   Done!\n');

        // Write errors if any
        if (errors.length > 0) {
            console.log(`⚠️  ${errors.length} passages without CFI locations`);
            fs.writeFileSync(ERROR_FILE, errors.join('\n'), 'utf8');
            console.log(`   See ${ERROR_FILE} for details\n`);
        } else {
            console.log('✅ No errors - all passages found!\n');
        }

        // Statistics
        console.log('📊 STATISTICS');
        console.log('=============');
        console.log(`Total lexicon words: ${devaLexiconSet.size + iastLexiconSet.size}`);
        console.log(`Words with passages: ${Object.keys(mapping).length}`);
        console.log(`Total passage-word associations: ${Object.values(mapping).reduce((sum, arr) => sum + arr.length, 0)}`);
        console.log(`Unique passages found: ${processedPassages.size}`);
        console.log(`Passages without CFI: ${errors.length}\n`);

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`⏱️  Total time: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s\n`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run
createMapping();
