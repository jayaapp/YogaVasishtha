#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORDS_FILE = 'Yoga-Vasishtha-Sanskrit-Words.txt';
const LEXICON_FILE = 'Yoga-Vasishtha-Lexicon.json';
const PROMPT_FILE = 'lexicon-prompt.txt';
const BATCH_OUTPUT_FILE = 'batch-output.txt';
const DELIMITER = '\n--- WORD DELIMITER ---\n';

function showUsage() {
    console.log(`
Usage: node lexicon-manager.js [options]

Options:
  -b <number>    Batch size (default: 100)
  -i <file>      Import batch analysis results from file
  -h, --help     Show this help message

Examples:
  node lexicon-manager.js -b 50        # Get next 50 words to analyze
  node lexicon-manager.js -i batch-output.txt  # Import analysis results
`);
}

function loadLexicon() {
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

function saveLexicon(lexicon) {
    try {
        fs.writeFileSync(LEXICON_FILE, JSON.stringify(lexicon, null, 2), 'utf8');
        console.log(`Lexicon saved to ${LEXICON_FILE}`);
    } catch (error) {
        console.error('Error saving lexicon:', error.message);
    }
}

function loadWords() {
    try {
        const content = fs.readFileSync(WORDS_FILE, 'utf8');
        return content.trim().split('\n').filter(word => word.trim());
    } catch (error) {
        console.error(`Error reading words file: ${error.message}`);
        process.exit(1);
    }
}

function getNextBatch(batchSize) {
    const words = loadWords();
    const lexicon = loadLexicon();

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

    console.log(`\n🔄 WORKFLOW INSTRUCTIONS`);
    console.log(`========================`);
    console.log(`1. Apply the above analysis format to EACH word in the batch`);
    console.log(`2. Save all analyses to '${BATCH_OUTPUT_FILE}'`);
    console.log(`3. Use this delimiter between each word analysis:`);
    console.log(`   ${DELIMITER.trim()}`);
    console.log(`4. Run: node lexicon-manager.js -i ${BATCH_OUTPUT_FILE}`);
    console.log(`5. Repeat until all words are processed`);
}

function importBatchResults(inputFile) {
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File ${inputFile} not found!`);
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(inputFile, 'utf8');
        const analyses = content.split(DELIMITER).filter(analysis => analysis.trim());

        const lexicon = loadLexicon();
        let importCount = 0;

        analyses.forEach(analysis => {
            const trimmed = analysis.trim();
            if (!trimmed) return;

            // Extract word from the first line (# word format)
            const lines = trimmed.split('\n');
            const firstLine = lines[0];
            if (firstLine.startsWith('# ')) {
                const word = firstLine.substring(2).trim();
                lexicon[word] = trimmed;
                importCount++;
                console.log(`Imported: ${word}`);
            }
        });

        if (importCount > 0) {
            saveLexicon(lexicon);
            console.log(`\n✅ Successfully imported ${importCount} word analyses`);
            console.log(`Total words in lexicon: ${Object.keys(lexicon).length}`);

            // Show next batch info
            const words = loadWords();
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

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
    showUsage();
    process.exit(0);
}

const batchSizeIndex = args.indexOf('-b');
const importFileIndex = args.indexOf('-i');

if (importFileIndex !== -1) {
    const inputFile = args[importFileIndex + 1];
    if (!inputFile) {
        console.error('Error: Please specify a file after -i');
        showUsage();
        process.exit(1);
    }
    importBatchResults(inputFile);
} else {
    const batchSize = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1]) || 100 : 100;
    getNextBatch(batchSize);
}