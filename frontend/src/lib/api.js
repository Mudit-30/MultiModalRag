const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function queryAgentic(query) {
  const res = await fetch(`${API_URL}/query/agentic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Query failed: ${res.statusText}`)
  return res.json()
}

export async function ingestFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(xhr.statusText))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.open('POST', `${API_URL}/ingest/`)
    xhr.send(formData)
  })
}

export async function checkHealth() {
  const res = await fetch(`${API_URL}/health`)
  return res.json()
}
