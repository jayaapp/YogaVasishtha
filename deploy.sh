#!/bin/bash

# Deploy script for Yoga Vasishtha PWA
# Usage: ./deploy.sh /path/to/deployment/directory

if [ $# -ne 1 ]; then
    echo "Usage: $0 <deployment_directory>"
    echo "Example: $0 /var/www/html/yoga-vasishtha"
    exit 1
fi

DEPLOY_DIR="$1"

# Check if deployment directory exists, create if not
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "Creating deployment directory: $DEPLOY_DIR"
    mkdir -p "$DEPLOY_DIR"
fi

echo "Deploying Yoga Vasishtha PWA to: $DEPLOY_DIR"

# Core application files
echo "Copying core application files..."
cp index.html "$DEPLOY_DIR/"
cp app.js "$DEPLOY_DIR/"
cp app.css "$DEPLOY_DIR/"
cp favicon.ico "$DEPLOY_DIR/"

# PWA files
echo "Copying PWA files..."
cp manifest.json "$DEPLOY_DIR/"
cp sw.js "$DEPLOY_DIR/"

# Google Drive sync files
echo "Copying sync files..."
cp trueheart-*.js "$DEPLOY_DIR/"
cp trueheart-style.css "$DEPLOY_DIR/"

# Lexicon files
echo "Copying lexicon files..."
cp Yoga-Vasishtha-*.json "$DEPLOY_DIR/" 2>/dev/null || echo "Warning: Lexicon files not found"

# EPUB directory
if [ -d "epub" ]; then
    echo "Copying EPUB files..."
    cp -r epub "$DEPLOY_DIR/"
else
    echo "Warning: epub directory not found"
fi

# Assets directory (icons, etc.)
if [ -d "assets" ]; then
    echo "Copying assets..."
    cp -r assets "$DEPLOY_DIR/"
else
    echo "Warning: assets directory not found"
fi

echo "Deployment complete!"
echo "Files deployed to: $DEPLOY_DIR"
echo ""
echo "Deployed files:"
ls -la "$DEPLOY_DIR"
