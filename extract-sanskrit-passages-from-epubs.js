const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

/**
 * Extract Sanskrit passages directly from EPUBs
 * Uses same logic as extract-sanskrit-passages.js but works with EPUBs directly
 */

const OUTPUT_DEVA_FILE = 'Yoga-Vasishtha-Devanagari-Passages-from-EPUBs.txt';
const OUTPUT_IAST_FILE = 'Yoga-Vasishtha-IAST-Passages-from-EPUBs.txt';
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
                    doc: htmlDoc
                });
            }
        }

        return chapters;

    } catch (error) {
        console.error('\nError extracting EPUB structure:', error.message);
        return [];
    }
}

// Get all text from chapter
function getChapterText(chapter) {
    const body = chapter.doc.getElementsByTagName('body')[0];
    if (!body) return '';

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

    return textNodes.join('');
}

// Extract Devanagari passages using same logic as extract-sanskrit-passages.js
function extractDevanagariPassages(content) {
    const passages = [];
    let currentPassage = '';
    const devanagariOrWhitespaceOrDash = /[\u0900-\u097F\s\-]/;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        // Check if character is Devanagari, whitespace (space/newline), or dash
        if (devanagariOrWhitespaceOrDash.test(char)) {
            currentPassage += char;
        } else {
            // Non-Devanagari, non-whitespace character encountered
            if (currentPassage.trim().length > 0) {
                // Save the accumulated passage if it contains multiple words or newlines
                const passage = currentPassage.trim();
                // Check if passage contains whitespace (space or newline) indicating multiple words/lines
                if (/\s/.test(passage) && !passages.includes(passage)) {
                    passages.push(passage);
                }
            }
            currentPassage = '';
        }
    }

    // Handle any remaining passage at end of content
    if (currentPassage.trim().length > 0) {
        const passage = currentPassage.trim();
        // Check if passage contains whitespace (space or newline) indicating multiple words/lines
        if (/\s/.test(passage) && !passages.includes(passage)) {
            passages.push(passage);
        }
    }

    return passages;
}

// Extract IAST passages using same logic as extract-sanskrit-passages.js
function extractIASTPassages(content) {
    const SANSKRIT_PATTERN_REGEX = /\[Sanskrit:\s*([^\]]+)\]/g;
    const passages = [];
    let match;

    while ((match = SANSKRIT_PATTERN_REGEX.exec(content)) !== null) {
        const sanskritContent = match[1].trim(); // Content inside [Sanskrit: ...]

        // Only include passages that have whitespace (multiple words)
        if (/\s/.test(sanskritContent) && !passages.includes(sanskritContent) &&
            !sanskritContent.includes('illegible')) { // Exclude 'illegible' entries
            passages.push(sanskritContent);
        }
    }

    return passages;
}

// Main processing function
async function extractPassagesFromEPUBs() {
    console.log('🔍 Extracting Sanskrit passages from EPUBs...\n');

    try {
        const allDevaPassages = [];
        const allIASTPassages = [];

        // Process all EPUBs
        for (const epubFile of EPUB_FILES) {
            const epubPath = `${EPUB_DIR}/${epubFile}`;

            if (!fs.existsSync(epubPath)) {
                console.log(`⚠️  Skipping ${epubFile} (not found)`);
                continue;
            }

            console.log(`Processing ${epubFile}...`);

            const epubData = fs.readFileSync(epubPath);
            const zip = await JSZip.loadAsync(epubData);
            const chapters = await extractTextFromEPUB(zip);

            // Extract text from each chapter and find passages
            for (const chapter of chapters) {
                const chapterText = getChapterText(chapter);

                // Extract Devanagari passages
                const devaPassages = extractDevanagariPassages(chapterText);
                for (const passage of devaPassages) {
                    if (!allDevaPassages.includes(passage)) {
                        allDevaPassages.push(passage);
                    }
                }

                // Extract IAST passages
                const iastPassages = extractIASTPassages(chapterText);
                for (const passage of iastPassages) {
                    if (!allIASTPassages.includes(passage)) {
                        allIASTPassages.push(passage);
                    }
                }
            }
        }

        console.log('\n✅ Processing complete\n');

        // Write Devanagari passages to output file
        const devaOutput = allDevaPassages.join('\n---\n');
        fs.writeFileSync(OUTPUT_DEVA_FILE, devaOutput, 'utf8');

        console.log(`Extracted ${allDevaPassages.length} unique Devanagari passages.`);
        console.log(`Output written to: ${OUTPUT_DEVA_FILE}`);

        // Show sample of first few passages
        if (allDevaPassages.length > 0) {
            console.log('\nSample passages:');
            const sampleCount = Math.min(3, allDevaPassages.length);
            for (let i = 0; i < sampleCount; i++) {
                const preview = allDevaPassages[i].length > 80
                    ? allDevaPassages[i].substring(0, 80) + '...'
                    : allDevaPassages[i];
                console.log(`${i + 1}. ${preview}`);
            }
        }

        // Write IAST passages to output file
        const iastOutput = allIASTPassages.join('\n---\n');
        fs.writeFileSync(OUTPUT_IAST_FILE, iastOutput, 'utf8');

        console.log(`\nExtracted ${allIASTPassages.length} unique IAST passages.`);
        console.log(`Output written to: ${OUTPUT_IAST_FILE}`);

        // Show sample of first few passages
        if (allIASTPassages.length > 0) {
            console.log('\nSample IAST passages:');
            const sampleCount = Math.min(3, allIASTPassages.length);
            for (let i = 0; i < sampleCount; i++) {
                const preview = allIASTPassages[i].length > 80
                    ? allIASTPassages[i].substring(0, 80) + '...'
                    : allIASTPassages[i];
                console.log(`${i + 1}. ${preview}`);
            }
        }

        console.log(`\n📊 TOTAL: ${allDevaPassages.length + allIASTPassages.length} passages extracted\n`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run
extractPassagesFromEPUBs();
