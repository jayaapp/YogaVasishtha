const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

/**
 * Extract Sanskrit words from EPUB files and append new ones to existing word lists
 * This tool complements extract-sanskrit-words.js by processing EPUB files directly
 * to avoid whitespace issues in the plain text version.
 */

/**
 * Extract component words from a long compound
 * Strategy: Look for words that already exist in the lexicon within the compound
 */
function extractComponentWords(compound, existingWords) {
    const components = [];
    const minWordLength = 3; // Minimum length for a valid component word

    // Convert Set to Array for easier searching
    const wordList = Array.from(existingWords);

    // Find all existing words that appear in this compound
    for (let word of wordList) {
        if (word.length >= minWordLength && compound.includes(word)) {
            components.push(word);
        }
    }

    // Also try to split on common Sanskrit endings/boundaries
    // Common word endings in Devanagari
    const boundaries = [
        'ः', // visarga
        'ं', // anusvara
        'म्', // m with virama
        'न्', // n with virama
        'त्', // t with virama
        'ा', // aa matra
        'ी', // ii matra
        'ौ', // au matra
        'े', // e matra
    ];

    // Try splitting at these boundaries
    for (let boundary of boundaries) {
        if (compound.includes(boundary)) {
            const parts = compound.split(boundary);
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i] + boundary;
                if (part.length >= minWordLength && part.length <= 20) {
                    components.push(part);
                }
            }
        }
    }

    // Remove duplicates and sort by length (longer words first, as they're more likely to be meaningful)
    return [...new Set(components)].sort((a, b) => b.length - a.length);
}

async function extractFromEPUBs() {
    try {
        const epubDir = 'epub';
        const devanagariOutputFile = 'Yoga-Vasishtha-Devanagari-Words.txt';
        const iastOutputFile = 'Yoga-Vasishtha-IAST-Words.txt';
        const devanagariLexiconFile = 'Yoga-Vasishtha-Devanagari-Lexicon.json';

        // EPUB files to process
        const epubFiles = [
            'Yoga-Vasishtha-V1.epub',
            'Yoga-Vasishtha-V2-P1of2.epub',
            'Yoga-Vasishtha-V2-P2of2.epub',
            'Yoga-Vasishtha-V3-P1of2.epub',
            'Yoga-Vasishtha-V3-P2of2.epub',
            'Yoga-Vasishtha-V4-P1of2.epub',
            'Yoga-Vasishtha-V4-P2of2.epub'
        ];

        // Load existing lexicon to check which words are already defined
        let existingLexicon = {};
        try {
            const lexiconContent = fs.readFileSync(devanagariLexiconFile, 'utf8');
            existingLexicon = JSON.parse(lexiconContent);
            console.log(`Found ${Object.keys(existingLexicon).length} existing Devanagari words in lexicon.`);
        } catch (error) {
            console.log('Could not load Devanagari lexicon file.');
        }

        // Load existing word lists
        let existingDevanagariWords = [];
        try {
            const existingContent = fs.readFileSync(devanagariOutputFile, 'utf8');
            existingDevanagariWords = existingContent.split('\n').filter(word => word.trim().length > 0);
            console.log(`Found ${existingDevanagariWords.length} existing Devanagari words in word list.`);
        } catch (error) {
            console.log('No existing Devanagari words file found, will create new one.');
        }

        let existingIASTWords = [];
        try {
            const existingIASTContent = fs.readFileSync(iastOutputFile, 'utf8');
            existingIASTWords = existingIASTContent.split('\n').filter(word => word.trim().length > 0);
            console.log(`Found ${existingIASTWords.length} existing IAST words in word list.`);
        } catch (error) {
            console.log('No existing IAST words file found, will create new one.');
        }

        // Create sets for fast lookup
        const existingDevaSet = new Set(existingDevanagariWords);
        const existingIASTSet = new Set(existingIASTWords);
        const lexiconSet = new Set(Object.keys(existingLexicon));

        // Process each EPUB file
        const newDevanagariWords = [];
        const newIASTWords = [];

        for (const epubFile of epubFiles) {
            const epubPath = `${epubDir}/${epubFile}`;

            console.log(`\nProcessing ${epubFile}...`);

            if (!fs.existsSync(epubPath)) {
                console.log(`  ⚠️  File not found: ${epubPath}`);
                continue;
            }

            try {
                // Read EPUB file
                const epubData = fs.readFileSync(epubPath);
                const zip = await JSZip.loadAsync(epubData);

                // Extract text content from EPUB
                let textContent = await extractTextFromEPUB(zip);

                // Remove only zero-width characters from full text
                textContent = textContent.replace(/[\u200B-\u200D\uFEFF]/g, '');

                // Extract Devanagari words
                const devanagariRange = /[\u0900-\u097F]+/g;
                const devanagariMatches = textContent.match(devanagariRange) || [];

                // Clean each individual word to remove internal spaces
                const cleanedMatches = devanagariMatches.map(word => cleanDevanagariWord(word));
                const uniqueDevaWords = [...new Set(cleanedMatches)];

                // Filter and add new Devanagari words
                // Prioritize words that:
                // 1. Are NOT in the lexicon (these need definitions!)
                // 2. Are NOT in the word list
                // 3. Are valid entries
                // 4. Are reasonable length (< 50 chars to avoid run-together phrases)
                const newFromThisEPUB = uniqueDevaWords.filter(word =>
                    !existingDevaSet.has(word) &&
                    !lexiconSet.has(word) &&
                    isValidDevanagariEntry(word) &&
                    word.length <= 50 // Limit to avoid long phrases
                );

                newFromThisEPUB.forEach(word => {
                    if (!existingDevaSet.has(word)) {
                        newDevanagariWords.push(word);
                        existingDevaSet.add(word);
                    }
                });

                // Extract IAST words from [Sanskrit: ...] patterns
                const sanskritPatternRegex = /\[Sanskrit:\s*([^\]]+)\]/g;
                const romanizedMatches = [];
                let match;

                while ((match = sanskritPatternRegex.exec(textContent)) !== null) {
                    const words = match[1]
                        .split(/[,;]/)
                        .map(word => word.trim())
                        .filter(word => word.length > 0)
                        .map(word => word.replace(/\s+and\s+/g, ', '))
                        .flatMap(word => word.split(/,\s*/))
                        .map(word => word.trim())
                        .filter(word => word.length > 0)
                        .filter(word => !word.includes('|'))
                        .filter(word => word.length < 100)
                        .flatMap(phrase => {
                            return phrase.split(/\s+/)
                                .map(w => w.trim())
                                .filter(w => w.length > 0)
                                .filter(w => w.length > 1)
                                .filter(w => !/^[.,:;!?()\[\]{}]$/.test(w));
                        });

                    romanizedMatches.push(...words);
                }

                // Filter and add new IAST words
                const uniqueIASTWords = [...new Set(romanizedMatches)];
                const newIASTFromThisEPUB = uniqueIASTWords
                    .filter(word => !existingIASTSet.has(word))
                    .filter(word => !word.startsWith('['))  // Remove words starting with [

                newIASTFromThisEPUB.forEach(word => {
                    if (!existingIASTSet.has(word)) {
                        newIASTWords.push(word);
                        existingIASTSet.add(word);
                    }
                });

                console.log(`  ✓ Found ${newFromThisEPUB.length} new Devanagari words, ${newIASTFromThisEPUB.length} new IAST words`);

            } catch (error) {
                console.error(`  ✗ Error processing ${epubFile}:`, error.message);
            }
        }

        // Sort new words
        newDevanagariWords.sort();
        newIASTWords.sort();

        // Append new words to files
        if (newDevanagariWords.length > 0) {
            const allDevanagariWords = [...existingDevanagariWords, ...newDevanagariWords];
            fs.writeFileSync(devanagariOutputFile, allDevanagariWords.join('\n'), 'utf8');
            console.log(`\n✓ Appended ${newDevanagariWords.length} new Devanagari words`);
            console.log(`  Total Devanagari words: ${allDevanagariWords.length}`);
        } else {
            console.log(`\n✓ No new Devanagari words found`);
        }

        if (newIASTWords.length > 0) {
            const allIASTWords = [...existingIASTWords, ...newIASTWords];
            fs.writeFileSync(iastOutputFile, allIASTWords.join('\n'), 'utf8');
            console.log(`✓ Appended ${newIASTWords.length} new IAST words`);
            console.log(`  Total IAST words: ${allIASTWords.length}`);
        } else {
            console.log(`✓ No new IAST words found`);
        }

        // Show sample of new words NOT in lexicon (these need definitions!)
        const wordsNotInLexicon = newDevanagariWords.filter(word => !lexiconSet.has(word));
        if (wordsNotInLexicon.length > 0) {
            console.log(`\n📝 Found ${wordsNotInLexicon.length} new words NOT in lexicon (need definitions!):`);
            console.log(wordsNotInLexicon.slice(0, 30).join(', '));
            if (wordsNotInLexicon.length > 30) {
                console.log(`... and ${wordsNotInLexicon.length - 30} more`);
            }
        }

        // Show sample of all new words
        if (newDevanagariWords.length > 0 && newDevanagariWords.length !== wordsNotInLexicon.length) {
            console.log('\nAll new Devanagari words:');
            console.log(newDevanagariWords.slice(0, 20).join(', '));
            if (newDevanagariWords.length > 20) {
                console.log(`... and ${newDevanagariWords.length - 20} more`);
            }
        }

        if (newIASTWords.length > 0) {
            console.log('\nNew IAST words:');
            console.log(newIASTWords.slice(0, 20).join(', '));
            if (newIASTWords.length > 20) {
                console.log(`... and ${newIASTWords.length - 20} more`);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

/**
 * Extract text content from EPUB (based on app.js logic)
 */
async function extractTextFromEPUB(zip) {
    try {
        // Find and parse content.opf to get the spine
        const containerXML = await zip.file('META-INF/container.xml').async('string');
        const containerDoc = new DOMParser().parseFromString(containerXML, 'text/xml');
        const rootfilePath = containerDoc.getElementsByTagName('rootfile')[0].getAttribute('full-path');

        const contentOPF = await zip.file(rootfilePath).async('string');
        const opfDoc = new DOMParser().parseFromString(contentOPF, 'text/xml');

        // Get base path for content files
        const basePath = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);

        // Get spine items (reading order)
        const spineItems = opfDoc.getElementsByTagName('itemref');
        const manifest = opfDoc.getElementsByTagName('item');

        // Build manifest map
        const manifestMap = {};
        for (let i = 0; i < manifest.length; i++) {
            const item = manifest[i];
            manifestMap[item.getAttribute('id')] = item.getAttribute('href');
        }

        // Extract text from each spine item
        let fullText = '';

        for (let i = 0; i < spineItems.length; i++) {
            const idref = spineItems[i].getAttribute('idref');
            const href = manifestMap[idref];

            if (href && (href.endsWith('.html') || href.endsWith('.xhtml') || href.endsWith('.htm'))) {
                const filePath = basePath + href;
                const fileContent = await zip.file(filePath).async('string');

                // Parse HTML and extract text
                const htmlDoc = new DOMParser().parseFromString(fileContent, 'text/html');
                const bodyText = extractTextFromHTML(htmlDoc);
                fullText += bodyText + '\n';
            }
        }

        return fullText;

    } catch (error) {
        console.error('Error extracting text from EPUB:', error.message);
        return '';
    }
}

/**
 * Extract text content from HTML document
 */
function extractTextFromHTML(doc) {
    // Remove script and style elements
    const scripts = doc.getElementsByTagName('script');
    const styles = doc.getElementsByTagName('style');

    for (let i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].parentNode) {
            scripts[i].parentNode.removeChild(scripts[i]);
        }
    }

    for (let i = styles.length - 1; i >= 0; i--) {
        if (styles[i].parentNode) {
            styles[i].parentNode.removeChild(styles[i]);
        }
    }

    // Get text content from body
    const body = doc.getElementsByTagName('body')[0];
    if (!body) return '';

    return getTextContent(body);
}

/**
 * Recursively extract text content from DOM node
 */
function getTextContent(node) {
    if (node.nodeType === 3) { // Text node
        return node.nodeValue || '';
    }

    let text = '';
    if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
            text += getTextContent(node.childNodes[i]);
        }
    }

    return text;
}

/**
 * Clean individual Devanagari word by removing internal spaces
 * This is more conservative - only removes spaces within a single extracted word
 */
function cleanDevanagariWord(word) {
    // Remove all whitespace from individual words
    // Since this is already a "word" extracted by the regex, any spaces inside are artifacts
    return word.replace(/\s+/g, '');
}

/**
 * Filter function to remove anomalous Devanagari entries (same as extract-sanskrit-words.js)
 */
function isValidDevanagariEntry(word) {
    // Keep valid punctuation marks FIRST (। and ॥ by themselves)
    if (word === '।' || word === '॥') return true;

    // Remove entries that start with daṇḍa punctuation followed by other characters
    if (/^।[^\s]/.test(word)) return false; // । followed by non-whitespace
    if (/^॥[^\s]/.test(word)) return false; // ॥ followed by non-whitespace

    // Remove pure numerals (but keep punctuation marks)
    if (/^[०-९]+$/.test(word)) return false; // Pure Devanagari numerals
    if (/^[0-9]+$/.test(word)) return false; // Pure ASCII numerals

    // Remove obvious parsing errors (numeral + fragment)
    if (/^[०-९0-9]+[^०-९0-9\s]/.test(word) && word.length < 5) return false;

    // Remove the abbreviation mark ॰ by itself
    if (word === '॰') return false;

    // Keep everything else
    return true;
}

// Run the extraction
extractFromEPUBs();
