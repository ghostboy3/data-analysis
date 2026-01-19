'use client'

import { useState } from 'react'
import ChatInterface from '@/components/ChatInterface'
import FileUpload from '@/components/FileUpload'

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(null)

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
            <h1 className="text-3xl font-bold mb-2">AI Data Analysis</h1>
            <p className="text-purple-100">Upload your data files and ask questions to get insights and visualizations</p>
          </div>
          
          <div className="p-6">
            <FileUpload onFileUploaded={setUploadedFile} uploadedFile={uploadedFile} />
            <div className="mt-6">
              <ChatInterface uploadedFile={uploadedFile} />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
