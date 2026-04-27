import { useCallback, useState } from 'react'
import { Upload, File, Image, Music, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import useStore from '../store/useStore'
import { ingestFile } from '../lib/api'

const MIME_ICONS = {
  'text/': File,
  'image/': Image,
  'audio/': Music,
  'application/pdf': File,
}

function getMimeIcon(type) {
  const match = Object.keys(MIME_ICONS).find(k => type.startsWith(k) || type === k)
  return match ? MIME_ICONS[match] : File
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)
  const { uploadedFiles, addUploadedFile, uploadProgress, setUploadProgress, uploadStatus, setUploadStatus } = useStore()

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      const fileRecord = { name: file.name, size: file.size, type: file.type, status: 'uploading', progress: 0, id: Date.now() }
      addUploadedFile(fileRecord)
      setUploadStatus('uploading')

      try {
        await ingestFile(file, (pct) => {
          setUploadProgress(pct)
        })
        setUploadStatus('done')
      } catch (err) {
        setUploadStatus('error')
      }
    }
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [])

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
          ${isDragging ? 'border-indigo-500 bg-indigo-950/30' : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'}`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          className="hidden"
          accept="text/*,image/*,audio/*,application/pdf"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-indigo-400' : 'text-gray-600'}`} />
        <p className="text-sm font-medium text-gray-400">Drop files here or click to browse</p>
        <p className="text-xs text-gray-600 mt-1">Text, PDF, Images, Audio</p>
      </div>

      {/* Upload Status Bar */}
      {uploadStatus === 'uploading' && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            Uploading & processing…
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-200 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {uploadedFiles.map((f) => {
          const Icon = getMimeIcon(f.type)
          return (
            <div key={f.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate">{f.name}</p>
                <p className="text-xs text-gray-600">{formatBytes(f.size)}</p>
              </div>
              {f.status === 'done' || uploadStatus === 'done'
                ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                : uploadStatus === 'error'
                  ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  : <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
