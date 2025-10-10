#!/usr/bin/env node

const fs = require('fs');

// Configuration
const MAPPING_FILE = 'Yoga-Vasishtha-Words-Passages-Mapping.json';
const TRANSLATIONS_FILE = 'Yoga-Vasishtha-Sanskrit-Passages.json';
const ERROR_OUTPUT_FILE = 'missing-passages-errors.txt';

console.log('🔍 Testing Words-Passages Mapping against Translations...\n');

try {
    // Load mapping file
    console.log(`📖 Loading ${MAPPING_FILE}...`);
    if (!fs.existsSync(MAPPING_FILE)) {
        console.error(`❌ Error: ${MAPPING_FILE} not found!`);
        process.exit(1);
    }
    const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    console.log(`   ✅ Loaded mapping for ${Object.keys(mapping).length} words\n`);

    // Load translations file
    console.log(`📖 Loading ${TRANSLATIONS_FILE}...`);
    if (!fs.existsSync(TRANSLATIONS_FILE)) {
        console.error(`❌ Error: ${TRANSLATIONS_FILE} not found!`);
        process.exit(1);
    }
    const translations = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8'));
    console.log(`   ✅ Loaded ${Object.keys(translations).length} translations\n`);

    // Collect all unique hashes from mapping
    const allHashes = new Set();
    const hashToWords = {}; // Track which words reference each hash

    for (const word in mapping) {
        const passages = mapping[word];
        for (const passageEntry of passages) {
            const hash = passageEntry.hash;
            allHashes.add(hash);

            if (!hashToWords[hash]) {
                hashToWords[hash] = [];
            }
            hashToWords[hash].push(word);
        }
    }

    console.log(`🔑 Found ${allHashes.size} unique passage hashes in mapping\n`);
    console.log('🔎 Checking which hashes have translations...\n');

    // Test each hash
    let foundCount = 0;
    let missingCount = 0;
    const missingHashes = [];

    for (const hash of allHashes) {
        if (translations[hash]) {
            foundCount++;
        } else {
            missingCount++;
            missingHashes.push({
                hash: hash,
                words: hashToWords[hash]
            });
        }
    }

    // Print results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTS:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Translations found:    ${foundCount} / ${allHashes.size} (${(foundCount / allHashes.size * 100).toFixed(2)}%)`);
    console.log(`❌ Translations missing:  ${missingCount} / ${allHashes.size} (${(missingCount / allHashes.size * 100).toFixed(2)}%)`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Show sample of missing hashes
    if (missingCount > 0) {
        console.log('📋 Sample of missing translations (first 10):');
        console.log('───────────────────────────────────────────────────────────');

        const sampleSize = Math.min(10, missingHashes.length);
        for (let i = 0; i < sampleSize; i++) {
            const item = missingHashes[i];
            const wordsList = item.words.slice(0, 3).join(', ') +
                            (item.words.length > 3 ? `, ... (${item.words.length} total)` : '');
            console.log(`\n${i + 1}. Hash: ${item.hash}`);
            console.log(`   Referenced by words: ${wordsList}`);

            // Find and show the actual passage text
            let passageText = null;
            for (const word of item.words) {
                const passages = mapping[word];
                const passage = passages.find(p => p.hash === item.hash);
                if (passage) {
                    passageText = passage.passage;
                    break;
                }
            }

            if (passageText) {
                const preview = passageText.length > 80
                    ? passageText.substring(0, 80) + '...'
                    : passageText;
                console.log(`   Passage: ${preview}`);
            }
        }
        console.log('───────────────────────────────────────────────────────────');

        if (missingCount > sampleSize) {
            console.log(`\n(... and ${missingCount - sampleSize} more missing translations)`);
        }

        // Write complete list of missing passages to file
        console.log(`\n📝 Writing complete list of ${missingCount} missing passages to ${ERROR_OUTPUT_FILE}...`);

        let errorReport = '';
        errorReport += '═══════════════════════════════════════════════════════════\n';
        errorReport += 'MISSING PASSAGE TRANSLATIONS REPORT\n';
        errorReport += `Generated: ${new Date().toISOString()}\n`;
        errorReport += '═══════════════════════════════════════════════════════════\n\n';
        errorReport += `Total Missing: ${missingCount} / ${allHashes.size} passages\n`;
        errorReport += `Coverage: ${(foundCount / allHashes.size * 100).toFixed(2)}% translated\n\n`;
        errorReport += '───────────────────────────────────────────────────────────\n\n';

        missingHashes.forEach((item, index) => {
            const wordsList = item.words.join(', ');
            errorReport += `${index + 1}. Hash: ${item.hash}\n`;
            errorReport += `   Referenced by ${item.words.length} word(s): ${wordsList}\n`;

            // Find and show the actual passage text
            let passageText = null;
            for (const word of item.words) {
                const passages = mapping[word];
                const passage = passages.find(p => p.hash === item.hash);
                if (passage) {
                    passageText = passage.passage;
                    break;
                }
            }

            if (passageText) {
                errorReport += `   Passage: ${passageText}\n`;
            } else {
                errorReport += `   Passage: [TEXT NOT FOUND]\n`;
            }
            errorReport += '\n';
        });

        errorReport += '═══════════════════════════════════════════════════════════\n';
        errorReport += 'END OF REPORT\n';
        errorReport += '═══════════════════════════════════════════════════════════\n';

        fs.writeFileSync(ERROR_OUTPUT_FILE, errorReport, 'utf8');
        console.log(`   ✅ Complete error report written to ${ERROR_OUTPUT_FILE}`);
    }

    console.log('\n✨ Test complete!\n');

} catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}
