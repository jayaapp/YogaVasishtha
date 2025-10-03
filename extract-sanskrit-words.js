const fs = require('fs');

function extractSanskritWords() {
    try {
        const inputFile = 'Yoga-Vasishtha.txt';
        const devanagariOutputFile = 'Yoga-Vasishtha-Devanagari-Words.txt';
        const iastOutputFile = 'Yoga-Vasishtha-IAST-Words.txt';

        const content = fs.readFileSync(inputFile, 'utf8');

        // Load existing Devanagari words from the file to preserve them
        let existingDevanagariWords = [];
        try {
            const existingContent = fs.readFileSync(devanagariOutputFile, 'utf8');
            existingDevanagariWords = existingContent.split('\n').filter(word => word.trim().length > 0);
            console.log(`Found ${existingDevanagariWords.length} existing Devanagari words in the file.`);
        } catch (error) {
            console.log('No existing Sanskrit words file found, will create new one.');
        }

        // Load existing IAST words from the file to preserve them
        let existingIASTWords = [];
        try {
            const existingIASTContent = fs.readFileSync(iastOutputFile, 'utf8');
            existingIASTWords = existingIASTContent.split('\n').filter(word => word.trim().length > 0);
            console.log(`Found ${existingIASTWords.length} existing IAST words in the file.`);
        } catch (error) {
            console.log('No existing IAST words file found, will create new one.');
        }

        // Extract Devanagari script words (only if file doesn't exist)
        let newDevanagariWords = [];
        if (existingDevanagariWords.length === 0) {
            const devanagariRange = /[\u0900-\u097F]+/g;
            const devanagariMatches = content.match(devanagariRange) || [];
            newDevanagariWords = [...new Set(devanagariMatches)];
            newDevanagariWords.sort();
            console.log(`Extracted ${newDevanagariWords.length} unique Devanagari words.`);
        }

        // Extract romanized Sanskrit words ONLY from [Sanskrit: ...] patterns
        const sanskritPatternRegex = /\[Sanskrit:\s*([^\]]+)\]/g;
        const romanizedMatches = [];
        let match;

        while ((match = sanskritPatternRegex.exec(content)) !== null) {
            const words = match[1]
                .split(/[,;]/) // Split on comma or semicolon
                .map(word => word.trim())
                .filter(word => word.length > 0)
                .map(word => word.replace(/\s+and\s+/g, ', ')) // Handle "and" between words
                .flatMap(word => word.split(/,\s*/)) // Split on remaining commas
                .map(word => word.trim())
                .filter(word => word.length > 0)
                .filter(word => !word.includes('|')) // Filter out long passages with |
                .filter(word => word.length < 100) // Filter out very long entries
                .flatMap(phrase => {
                    // Split each phrase into individual words
                    return phrase.split(/\s+/)
                        .map(w => w.trim())
                        .filter(w => w.length > 0)
                        .filter(w => w.length > 1) // At least 2 characters for individual words
                        .filter(w => !/^[.,:;!?()[\]{}]$/.test(w)); // Filter out pure punctuation
                });

            romanizedMatches.push(...words);
        }

        // Get unique romanized words that aren't already in the existing IAST list
        const newIASTWords = [...new Set(romanizedMatches)]
            .filter(word => !existingIASTWords.includes(word))
            .sort();

        // Filter function to remove anomalous entries
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

        // Prepare final word lists with filtering
        const finalDevanagariWords = [...existingDevanagariWords, ...newDevanagariWords]
            .filter(isValidDevanagariEntry);
        const finalIASTWords = [...existingIASTWords, ...newIASTWords];

        // Count removed entries for reporting
        const totalBeforeFilter = existingDevanagariWords.length + newDevanagariWords.length;
        const removedCount = totalBeforeFilter - finalDevanagariWords.length;

        // Write the Devanagari words to file (always write if filtered or new words added)
        if (newDevanagariWords.length > 0 || existingDevanagariWords.length === 0 || removedCount > 0) {
            const devanagariOutput = finalDevanagariWords.join('\n');
            fs.writeFileSync(devanagariOutputFile, devanagariOutput, 'utf8');
        }

        // Write the IAST words to separate file
        const iastOutput = finalIASTWords.join('\n');
        fs.writeFileSync(iastOutputFile, iastOutput, 'utf8');

        console.log(`Results:`);
        if (newDevanagariWords.length > 0) {
            console.log(`- Added ${newDevanagariWords.length} Devanagari script words`);
        }
        if (removedCount > 0) {
            console.log(`- Removed ${removedCount} anomalous entries (punctuation+text, pure numerals, etc.)`);
        }
        console.log(`- Found ${romanizedMatches.length} total romanized matches`);
        console.log(`- Added ${newIASTWords.length} new unique IAST words`);
        console.log(`- Total Devanagari words: ${finalDevanagariWords.length}`);
        console.log(`- Total IAST words: ${finalIASTWords.length}`);

        // Show sample of newly found IAST words
        if (newIASTWords.length > 0) {
            console.log('\nSample new IAST Sanskrit words:');
            console.log(newIASTWords.slice(0, 10).join(', '));
            if (newIASTWords.length > 10) {
                console.log(`... and ${newIASTWords.length - 10} more`);
            }
        }

    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}

extractSanskritWords();