const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Query ──────────────────────────────────────────────────────────────────────
export async function queryAgentic(query) {
  const res = await fetch(`${API_URL}/query/agentic`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
  })
  if (!res.ok) {
    let detail = res.statusText
    try { const j = await res.json(); detail = j.detail || detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()   // { answer, context, confidence, trace, citations }
}

// ── Ingest ─────────────────────────────────────────────────────────────────────
export async function ingestFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr      = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress)
        onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        let msg = xhr.statusText
        try { msg = JSON.parse(xhr.responseText).detail || msg } catch (_) {}
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.open('POST', `${API_URL}/ingest`)
    xhr.send(formData)
  })
}

// Upload multiple files sequentially
export async function ingestDocuments(files) {
  const results = []
  for (const file of files) {
    const result = await ingestFile(file)
    results.push(result)
  }
  return results
}

// ── Scrape URL → ingest as RAG context ────────────────────────────────────────
export async function scrapeUrl(url) {
  const res = await fetch(`${API_URL}/ingest/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    let detail = res.statusText
    try { const j = await res.json(); detail = j.detail || detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

export async function resetMemory() {
  const res = await fetch(`${API_URL}/ingest/reset`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reset memory')
  return res.json()
}

// ── Health ─────────────────────────────────────────────────────────────────────
export async function checkHealth() {
  const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('API offline')
  return res.json()
}

// ── Stats (debug) ──────────────────────────────────────────────────────────────
export async function fetchStats() {
  const res = await fetch(`${API_URL}/debug/stats`)
  return res.json()
}
