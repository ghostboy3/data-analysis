#!/bin/bash

echo "🚀 Setting up AI Data Analysis Application..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip3 install -r python-service/requirements.txt

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads temp

# Check for .env file
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local file not found!"
    echo "Please create a .env.local file with your OpenAI API key:"
    echo "OPENAI_API_KEY=your_api_key_here"
fi

echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "Make sure to set your OPENAI_API_KEY in .env.local"
