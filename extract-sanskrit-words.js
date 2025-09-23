const fs = require('fs');

function extractSanskritWords() {
    try {
        const inputFile = 'Yoga-Vasishtha.txt';
        const outputFile = 'Yoga-Vasishtha-Sanskrit-Words.txt';

        const content = fs.readFileSync(inputFile, 'utf8');

        const devanagariRange = /[\u0900-\u097F]+/g;
        const matches = content.match(devanagariRange);

        if (!matches) {
            console.log('No Sanskrit Devanagari words found in the file.');
            return;
        }

        const uniqueWords = [...new Set(matches)];
        uniqueWords.sort();

        const output = uniqueWords.join('\n');

        fs.writeFileSync(outputFile, output, 'utf8');

        console.log(`Extracted ${uniqueWords.length} unique Sanskrit words to ${outputFile}`);
        console.log(`Total matches found: ${matches.length}`);

    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}

extractSanskritWords();