const fs = require('fs');

function extractSanskritPassages() {
    try {
        const inputFile = 'Yoga-Vasishtha.txt';
        const outputFile = 'Yoga-Vasishtha-Devanagari-Passages.txt';

        const content = fs.readFileSync(inputFile, 'utf8');

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

        // Handle any remaining passage at end of file
        if (currentPassage.trim().length > 0) {
            const passage = currentPassage.trim();
            // Check if passage contains whitespace (space or newline) indicating multiple words/lines
            if (/\s/.test(passage) && !passages.includes(passage)) {
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
