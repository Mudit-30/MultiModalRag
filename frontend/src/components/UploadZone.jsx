import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, FileText, CheckCircle2, Loader2, X, Upload, AlertCircle, Image, Music, FileSpreadsheet, Film, Globe, Link } from 'lucide-react';
import useStore from '../store/useStore';
import { ingestDocuments } from '../lib/api';

const displayFont = { fontFamily: '"Gravitas One", serif' };

const ACCEPTED = '.pdf,.docx,.doc,.txt,.md,.csv,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.webm';
const MAX_MB = 50;

function FileIcon({ name }) {
  const ext = name.split('.').pop().toLowerCase();
  if (['png','jpg','jpeg','gif','webp'].includes(ext)) return <Image size={18} className="text-amber-400" />;
  if (['mp3','wav','m4a','ogg'].includes(ext)) return <Music size={18} className="text-cyan-400" />;
  if (['mp4','webm','mkv','avi'].includes(ext)) return <Film size={18} className="text-purple-400" />;
  if (['csv','xlsx'].includes(ext)) return <FileSpreadsheet size={18} className="text-green-400" />;
  return <FileText size={18} className="text-blue-400" />;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadZone() {
  const { uploadedFiles, addUploadedFile, uploadProgress, setUploadProgress, uploadStatus, setUploadStatus } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [localFiles, setLocalFiles] = useState([]); // queued but not yet uploaded
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const queueFiles = (fileList) => {
    const valid = Array.from(fileList).filter(f => f.size <= MAX_MB * 1024 * 1024);
    setLocalFiles(prev => [...prev, ...valid]);
    setError(valid.length < fileList.length ? `Some files exceeded ${MAX_MB}MB and were skipped.` : null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    queueFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!localFiles.length) return;
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Simulated progress (real backend may stream progress)
      const interval = setInterval(() => {
        setUploadProgress(p => Math.min(p + 12, 88));
      }, 300);

      await ingestDocuments(localFiles);
      clearInterval(interval);
      setUploadProgress(100);

      localFiles.forEach(f => addUploadedFile({
        name: f.name,
        size: f.size,
        uploadedAt: new Date().toISOString(),
        status: 'indexed',
      }));

      setLocalFiles([]);
      setUploadStatus('success');
      setTimeout(() => { setUploadProgress(0); setUploadStatus(null); }, 3000);
    } catch (err) {
      setError(err.message || 'Upload failed. Please check the backend.');
      setUploadProgress(0);
      setUploadStatus('error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/5 shrink-0">
        <h2 className="text-3xl text-white tracking-tight" style={displayFont}>Ingest Knowledge</h2>
        <p className="text-slate-500 mt-1 text-sm">Upload documents to expand your private context window.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
        {/* URL Ingestion */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2 opacity-80">
            <Globe size={12} className="text-cyan-600" /> Web Ingestion
          </h4>
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Link size={14} className="text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
              </div>
              <input 
                type="text" 
                placeholder="Enter URL to scrape (Wikipedia, documentation, blogs)..." 
                className="w-full bg-[#050810] border border-white/5 rounded-xl pl-11 pr-4 py-3.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-slate-600 shadow-inner"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    const url = e.target.value.trim();
                    const input = e.target;
                    setUploading(true);
                    setError(null);
                    try {
                      const { scrapeUrl } = await import('../lib/api');
                      await scrapeUrl(url);
                      addUploadedFile({ 
                        name: url, 
                        size: 0, 
                        uploadedAt: new Date().toISOString(), 
                        status: 'indexed' 
                      });
                      input.value = '';
                      setUploadStatus('success');
                      setTimeout(() => setUploadStatus(null), 3000);
                    } catch (err) {
                      setError(err.message || "Failed to scrape URL");
                    } finally {
                      setUploading(false);
                    }
                  }
                }}
              />
            </div>
            <button className="px-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-slate-400 hover:text-white transition-all text-xs font-semibold shadow-lg">
              Scrape
            </button>
          </div>
          <p className="text-[10px] text-slate-600 ml-1 italic">Press Enter to start ingestion</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all
            ${isDragging
              ? 'border-cyan-500/60 bg-cyan-500/5 shadow-[0_0_40px_rgba(6,182,212,0.1)]'
              : 'border-white/10 hover:border-cyan-500/30 bg-[#0c111d] hover:bg-white/[0.02]'}`}
        >
          <input ref={inputRef} type="file" multiple accept={ACCEPTED} className="hidden"
            onChange={(e) => queueFiles(e.target.files)} />
          <motion.div
            animate={{ scale: isDragging ? 1.12 : 1 }}
            className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-5"
          >
            <Database size={30} className={isDragging ? 'text-cyan-400' : 'text-cyan-600'} />
          </motion.div>
          <h3 className="text-slate-200 font-medium text-lg mb-1">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </h3>
          <p className="text-slate-500 text-sm text-center max-w-xs mb-5 leading-relaxed">
            PDF, DOCX, TXT, MD, CSV, Images, Audio — up to {MAX_MB}MB per file
          </p>
          <span className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-medium transition-all">
            Select Files
          </span>
        </div>

        {/* Queued files */}
        <AnimatePresence>
          {localFiles.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Ready to Upload ({localFiles.length})
              </h4>
              <div className="space-y-2 mb-4">
                {localFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#0c111d] border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg flex items-center justify-center w-8 h-8 rounded-lg bg-white/5"><FileIcon name={f.name} /></span>
                      <div>
                        <p className="text-sm text-slate-300 font-medium truncate max-w-[200px]">{f.name}</p>
                        <p className="text-[10px] text-slate-500">{humanSize(f.size)}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setLocalFiles(p => p.filter((_, j) => j !== i)); }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Upload progress */}
              {uploading && uploadProgress > 0 && (
                <div className="mb-3">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 text-center">{uploadProgress}% uploaded</p>
                </div>
              )}

              <motion.button
                onClick={handleUpload}
                disabled={uploading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all shadow-lg shadow-cyan-900/30"
              >
                {uploading
                  ? <><Loader2 size={16} className="animate-spin" /> Ingesting...</>
                  : <><Upload size={16} /> Ingest {localFiles.length} file{localFiles.length > 1 ? 's' : ''}</>}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-4 py-3 bg-red-950/30 border border-red-900/40 rounded-xl text-sm text-red-400">
              <AlertCircle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent uploads from store */}
        {uploadedFiles.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Recent Uploads ({uploadedFiles.length})
            </h4>
            <div className="space-y-2">
              {uploadedFiles.slice().reverse().map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#0c111d] border border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-950/30">
                      <FileText size={15} className="text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300 truncate max-w-[180px]">{f.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {humanSize(f.size)} · {new Date(f.uploadedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <span className="text-cyan-400 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-cyan-950/30 rounded-full border border-cyan-900/30">
                    <CheckCircle2 size={12} /> Indexed
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for uploads */}
        {uploadedFiles.length === 0 && localFiles.length === 0 && (
          <div className="text-center py-6">
            <p className="text-slate-600 text-sm">No files ingested yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
