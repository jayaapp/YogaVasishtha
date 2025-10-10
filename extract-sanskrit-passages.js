const fs = require('fs');

function extractSanskritPassages() {
    try {
        const inputFile = 'Yoga-Vasishtha.txt';
        const outputFile = 'Yoga-Vasishtha-Devanagari-Passages.txt';

        const content = fs.readFileSync(inputFile, 'utf8');

        const passages = [];
        let currentPassage = '';
        // Stop only at Roman letters (a-z, A-Z)
        // Include: Devanagari, whitespace, numbers, ALL punctuation
        const romanLetterPattern = /[a-zA-Z]/;

        const hasDevanagariPattern = /[\u0900-\u097F]/;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];

            // Check if character is a Roman letter (passage boundary)
            if (romanLetterPattern.test(char)) {
                // Roman letter encountered - end of passage
                if (currentPassage.trim().length > 0) {
                    // Clean leading/trailing non-Devanagari characters (including numbers, punctuation)
                    let passage = currentPassage
                        .replace(/^[^\u0900-\u097F]+/, '')  // Remove ALL leading non-Devanagari
                        .replace(/[^\u0900-\u097F]+$/, '')  // Remove ALL trailing non-Devanagari
                        .trim();

                    // Save only if: contains whitespace AND has at least 2 Devanagari characters
                    const devanagariChars = (passage.match(/[\u0900-\u097F]/g) || []);
                    if (/\s/.test(passage) && devanagariChars.length >= 2 && !passages.includes(passage)) {
                        passages.push(passage);
                    }
                }
                currentPassage = '';
            } else {
                // Include everything else: Devanagari, numbers, punctuation, whitespace
                currentPassage += char;
            }
        }

        // Handle any remaining passage at end of file
        if (currentPassage.trim().length > 0) {
            let passage = currentPassage
                .replace(/^[^\u0900-\u097F]+/, '')  // Remove ALL leading non-Devanagari
                .replace(/[^\u0900-\u097F]+$/, '')  // Remove ALL trailing non-Devanagari
                .trim();
            // Save only if: contains whitespace AND has at least 2 Devanagari characters
            const devanagariChars = (passage.match(/[\u0900-\u097F]/g) || []);
            if (/\s/.test(passage) && devanagariChars.length >= 2 && !passages.includes(passage)) {
                passages.push(passage);
            }
        }

        // Write passages to output file
        const output = passages.join('\n---\n');
        fs.writeFileSync(outputFile, output, 'utf8');

        console.log(`Extracted ${passages.length} unique Devanagari passages.`);
        console.log(`Output written to: ${outputFile}`);

        // Show sample of first few passages
        if (passages.length > 0) {
            console.log('\nSample passages:');
            const sampleCount = Math.min(3, passages.length);
            for (let i = 0; i < sampleCount; i++) {
                const preview = passages[i].length > 80
                    ? passages[i].substring(0, 80) + '...'
                    : passages[i];
                console.log(`${i + 1}. ${preview}`);
            }
        }

    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}


function extractRomanizedPassages() {
    try {
        const inputFile = 'Yoga-Vasishtha.txt';
        const outputFile = 'Yoga-Vasishtha-IAST-Passages.txt';

        const content = fs.readFileSync(inputFile, 'utf8');
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

        // Write passages to output file
        const output = passages.join('\n---\n');
        fs.writeFileSync(outputFile, output, 'utf8');

        console.log(`Extracted ${passages.length} unique IAST passages.`);
        console.log(`Output written to: ${outputFile}`);

        // Show sample of first few passages
        if (passages.length > 0) {
            console.log('\nSample IAST passages:');
            const sampleCount = Math.min(3, passages.length);
            for (let i = 0; i < sampleCount; i++) {
                const preview = passages[i].length > 80
                    ? passages[i].substring(0, 80) + '...'
                    : passages[i];
                console.log(`${i + 1}. ${preview}`);
            }
        }

    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}

extractSanskritPassages();
extractRomanizedPassages();
