'use client'

interface MessageProps {
  message: {
    id: string
    role: 'user' | 'assistant'
    content: string
    code?: string
    image?: string
    error?: string
  }
}

export default function Message({ message }: MessageProps) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-lg p-4 ${
          message.role === 'user'
            ? 'bg-indigo-600 text-white'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        
        {message.code && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2 text-gray-700">Generated Python Code:</div>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{message.code}</code>
            </pre>
          </div>
        )}
        
        {message.image && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2 text-gray-700">Visualization:</div>
            <img
              src={`data:image/png;base64,${message.image}`}
              alt="Generated visualization"
              className="max-w-full rounded-lg border border-gray-300"
            />
          </div>
        )}
        
        {message.error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            <strong>Error:</strong> {message.error}
          </div>
        )}
      </div>
    </div>
  )
}
