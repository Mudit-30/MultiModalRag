import { useCallback, useState } from 'react'
import { Upload, FileText, Image, Music, CheckCircle2, XCircle, Loader2, Trash2, Database } from 'lucide-react'
import useStore from '../store/useStore'
import { ingestFile } from '../lib/api'

const MIME_ICONS = {
  'text':        FileText,
  'image':       Image,
  'audio':       Music,
  'application': FileText,
}
const getMimeIcon = (type) => {
  const key = (type || '').split('/')[0]
  return MIME_ICONS[key] || FileText
}
const formatBytes = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1048576)     return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

// Pre-loaded demo files for the presentation
const DEMO_FILES = [
  { name: 'patient_case.txt',  desc: 'Clinical patient case: John Doe, cardiac symptoms, medical history', modality:'text' },
  { name: 'xray_report.txt',   desc: 'Radiology X-Ray report: cardiomegaly, pulmonary findings',          modality:'text' },
  { name: 'doctor_notes.txt',  desc: "Doctor's notes: diagnosis, differential, treatment plan, plan",      modality:'text' },
]

export default function UploadZone() {
  const [isDragging, setIsDragging]     = useState(false)
  const [fileStatuses, setFileStatuses] = useState({})
  const { uploadedFiles, addUploadedFile, setUploadProgress, setUploadStatus } = useStore()

  const processFile = async (file) => {
    const id = `${file.name}-${Date.now()}`
    addUploadedFile({ name: file.name, size: file.size, type: file.type, id })
    setFileStatuses(s => ({ ...s, [id]: 'uploading' }))
    setUploadStatus('uploading')

    try {
      await ingestFile(file, pct => setUploadProgress(pct))
      setFileStatuses(s => ({ ...s, [id]: 'done' }))
      setUploadStatus('done')
    } catch {
      setFileStatuses(s => ({ ...s, [id]: 'error' }))
      setUploadStatus('error')
    }
  }

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) await processFile(file)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, height:'100%' }}>

      {/* Demo quick-load */}
      <div style={{
        background:'var(--bg-base)', border:'1px solid var(--border)',
        borderRadius:10, padding:'12px 14px',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
          <Database size={13} color="var(--cyan)" />
          <span style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>Demo Dataset</span>
          <span className="chip cyan" style={{ marginLeft:'auto' }}>Medical Case Study</span>
        </div>
        <p style={{ fontSize:11, color:'var(--text-3)', marginBottom:10, lineHeight:1.6 }}>
          Pre-loaded medical documents. Upload them to the backend for the presentation demo.
        </p>
        {DEMO_FILES.map(f => (
          <div key={f.name} style={{
            display:'flex', alignItems:'flex-start', gap:8,
            padding:'8px 10px', marginBottom:6,
            background:'var(--bg-elevated)', border:'1px solid var(--border)',
            borderRadius:7,
          }}>
            <FileText size={13} color="var(--violet)" style={{ flexShrink:0, marginTop:1 }} />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:11, fontWeight:600, color:'var(--text-1)' }}>{f.name}</p>
              <p style={{ fontSize:10, color:'var(--text-3)', lineHeight:1.5 }}>{f.desc}</p>
            </div>
            <span className="chip indigo">{f.modality}</span>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => document.getElementById('file-input-main').click()}
        style={{
          border:`2px dashed ${isDragging ? 'var(--indigo)' : 'var(--border-bright)'}`,
          borderRadius:12, padding:'20px 16px',
          textAlign:'center', cursor:'pointer',
          background: isDragging ? '#1e1b4b22' : 'var(--bg-base)',
          transition:'all .15s',
        }}
      >
        <input
          id="file-input-main"
          type="file"
          multiple
          className="hidden"
          style={{ display:'none' }}
          accept="text/*,image/*,audio/*,application/pdf"
          onChange={e => handleFiles(e.target.files)}
        />
        <Upload size={24} color={isDragging ? 'var(--indigo-glow)' : 'var(--text-4)'} style={{ margin:'0 auto 8px' }} />
        <p style={{ fontSize:13, fontWeight:500, color: isDragging ? 'var(--indigo-glow)' : 'var(--text-2)' }}>
          Drop files or click to upload
        </p>
        <p style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>
          Supports TXT · PDF · PNG/JPG · MP3/WAV
        </p>
      </div>

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'.08em' }}>
            Ingested Files ({uploadedFiles.length})
          </p>
          {uploadedFiles.map(f => {
            const Icon = getMimeIcon(f.type)
            const status = fileStatuses[f.id] || 'done'
            return (
              <div key={f.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 10px',
                background:'var(--bg-base)', border:'1px solid var(--border)',
                borderRadius:8,
              }}>
                <div style={{
                  width:28, height:28, borderRadius:7,
                  background:'#1e1b4b', border:'1px solid #3730a3',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>
                  <Icon size={13} color="var(--indigo-glow)" />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:11, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {f.name}
                  </p>
                  <p style={{ fontSize:10, color:'var(--text-4)' }}>{formatBytes(f.size)}</p>
                </div>
                {status === 'done'      && <CheckCircle2 size={14} color="var(--green)" />}
                {status === 'error'     && <XCircle size={14} color="var(--red)" />}
                {status === 'uploading' && <Loader2 size={14} color="var(--indigo-glow)" style={{ animation:'spin 1s linear infinite' }} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
