import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function getFileSchema(filePath: string): Promise<string> {
  try {
    if (!existsSync(filePath)) {
      return 'File not found'
    }

    // For Excel files, we'll use a Python script to get schema
    if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
      try {
        const schemaScript = `
import pandas as pd
import json
import sys

try:
    df = pd.read_excel(r"${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")
    schema = {
        'columns': df.columns.tolist(),
        'shape': df.shape,
        'dtypes': df.dtypes.astype(str).to_dict(),
        'head': df.head(10).to_dict('records')
    }
    print(json.dumps(schema))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`
        const tempDir = join(process.cwd(), 'temp')
        if (!existsSync(tempDir)) {
          await mkdir(tempDir, { recursive: true })
        }
        const schemaPath = join(tempDir, `schema_${Date.now()}.py`)
        await writeFile(schemaPath, schemaScript, 'utf-8')
        const { stdout } = await execAsync(`python3 "${schemaPath}"`, { timeout: 10000 })
        try {
          await execAsync(`rm -f "${schemaPath}"`)
        } catch {}
        
        const schema = JSON.parse(stdout)
        if (schema.error) {
          return `Excel file detected. Error reading: ${schema.error}`
        }
        return `Excel file with ${schema.shape[0]} rows and ${schema.shape[1]} columns.\nColumns: ${schema.columns.join(', ')}\nData types: ${Object.entries(schema.dtypes).map(([k, v]) => `${k}: ${v}`).join(', ')}\nFirst 10 rows preview available.`
      } catch (error) {
        return `Excel file detected but could not read schema: ${error}`
      }
    }

    // For CSV and JSON files, read directly
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n').slice(0, 20).join('\n')
    
    if (filePath.endsWith('.csv')) {
      const firstLine = content.split('\n')[0]
      const columns = firstLine.split(',').map(col => col.trim().replace(/^"|"$/g, ''))
      const rowCount = content.split('\n').length - 1
      return `CSV file with approximately ${rowCount} rows.\nColumns: ${columns.join(', ')}\nFirst few rows:\n${lines}`
    } else if (filePath.endsWith('.json')) {
      try {
        const jsonData = JSON.parse(content)
        if (Array.isArray(jsonData)) {
          return `JSON array with ${jsonData.length} items.\nFirst item keys: ${Object.keys(jsonData[0] || {}).join(', ')}\nPreview: ${lines.substring(0, 500)}`
        } else {
          return `JSON object with keys: ${Object.keys(jsonData).join(', ')}\nPreview: ${lines.substring(0, 500)}`
        }
      } catch {
        return `JSON file content preview:\n${lines.substring(0, 500)}`
      }
    } else {
      return `File content preview:\n${lines.substring(0, 500)}`
    }
  } catch (error) {
    return `Error reading file: ${error}`
  }
}

async function executePythonCode(code: string, filePath: string): Promise<{ image?: string; output?: string; error?: string }> {
  try {
    // Create temp directory for Python execution
    const tempDir = join(process.cwd(), 'temp')
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }

    // Create a Python script that will execute the code and save the plot
    const scriptId = Date.now()
    const scriptPath = join(tempDir, `script_${scriptId}.py`)
    const outputPath = join(tempDir, `output_${scriptId}.png`)

    // Escape file paths for Python
    const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedOutputPath = outputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    // Wrap the user code to capture plots
    const wrappedCode = `import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')  # Suppress warnings
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import json
import sys
import os

# Suppress matplotlib warnings about non-interactive backend
import logging
logging.getLogger('matplotlib').setLevel(logging.ERROR)

# Set style
try:
    plt.style.use('seaborn-v0_8-darkgrid')
except:
    plt.style.use('seaborn-darkgrid')
sns.set_palette("husl")

# Read the data file
file_path = r"${escapedFilePath}"

try:
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    elif file_path.endswith('.xlsx') or file_path.endswith('.xls'):
        df = pd.read_excel(file_path)
    elif file_path.endswith('.json'):
        df = pd.read_json(file_path)
    else:
        df = pd.read_csv(file_path)
    
    # User's code
${code.split('\n').map(line => '    ' + line).join('\n')}
    
    # Save the current figure if one exists
    output_image_path = r"${escapedOutputPath}"
    if plt.get_fignums():
        plt.tight_layout()
        plt.savefig(output_image_path, dpi=150, bbox_inches='tight')
        plt.close('all')
        print(f"IMAGE_SAVED:{output_image_path}")
    else:
        print("NO_PLOT_GENERATED")
        
except Exception as e:
    print(f"ERROR:{str(e)}", file=sys.stderr)
    sys.exit(1)
`

    // Write Python script to file
    await writeFile(scriptPath, wrappedCode, 'utf-8')
    
    // Execute Python script
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })

    let image: string | undefined
    let output = stdout

    // Check if image was saved
    if (stdout.includes('IMAGE_SAVED:')) {
      const imagePath = stdout.split('IMAGE_SAVED:')[1].trim()
      if (existsSync(imagePath)) {
        const imageBuffer = await readFile(imagePath)
        image = imageBuffer.toString('base64')
        // Clean up
        try {
          await execAsync(`rm -f "${imagePath}" "${scriptPath}"`)
        } catch {}
      }
    }

    if (stderr) {
      return { error: stderr, output }
    }

    return { image, output }
  } catch (error: any) {
    return { 
      error: error.message || 'Failed to execute Python code',
      output: error.stdout || ''
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, filePath, fileName } = await request.json()

    if (!message || !filePath) {
      return NextResponse.json(
        { error: 'Message and file path are required' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Get file schema
    const fileSchema = await getFileSchema(filePath)

    // Create prompt for OpenAI
    const systemPrompt = `You are a data analysis assistant. Your job is to generate Python code that analyzes data files and creates visualizations.

Rules:
1. Always use pandas to read the file (pd.read_csv, pd.read_excel, or pd.read_json)
2. Use matplotlib or seaborn for visualizations
3. Make sure to create clear, informative plots
4. Use appropriate plot types (histogram, scatter, line, bar, etc.) based on the request
5. Always include labels, titles, and legends
6. The file path is already loaded in variable 'file_path' - use it to read the data
7. Return ONLY the Python code, no explanations or markdown formatting
8. Import all necessary libraries at the top
9. Handle errors gracefully

The user has uploaded a file: ${fileName}
File schema/preview:
${fileSchema}

Generate Python code that will: ${message}`

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_completion_tokens: 2000,
    })

    const generatedCode = completion.choices[0]?.message?.content || ''
    
    // Clean up code (remove markdown code blocks if present)
    let cleanCode = generatedCode
    if (cleanCode.includes('```python')) {
      cleanCode = cleanCode.split('```python')[1].split('```')[0].trim()
    } else if (cleanCode.includes('```')) {
      cleanCode = cleanCode.split('```')[1].split('```')[0].trim()
    }

    // Remove plt.show() calls since we're using non-interactive backend
    cleanCode = cleanCode.replace(/plt\.show\(\)/g, '# plt.show() # Removed: using non-interactive backend')
    cleanCode = cleanCode.replace(/plt\.show\(.*?\)/g, '# plt.show() # Removed: using non-interactive backend')

    // Execute the Python code
    const executionResult = await executePythonCode(cleanCode, filePath)

    // Generate a natural language response
    const responsePrompt = `Based on the user's request "${message}" and the analysis performed, provide a brief, clear explanation of what was done. Keep it concise (2-3 sentences).`
    
    const responseCompletion = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful data analysis assistant. Provide clear, concise explanations.' },
        { role: 'user', content: responsePrompt },
      ],
      max_completion_tokens: 200,
    })

    const response = responseCompletion.choices[0]?.message?.content || 'Analysis completed successfully.'

    return NextResponse.json({
      response,
      code: cleanCode,
      image: executionResult.image,
      output: executionResult.output,
      error: executionResult.error,
    })
  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process request',
        response: 'Sorry, I encountered an error processing your request.'
      },
      { status: 500 }
    )
  }
}
