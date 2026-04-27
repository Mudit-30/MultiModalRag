import { create } from 'zustand'

const useStore = create((set, get) => ({
  // Chat messages
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  // Current query state
  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),

  // Agent trace from last query
  trace: null,
  setTrace: (t) => set({ trace: t }),

  // Knowledge graph data for visualization
  graphData: { nodes: [], links: [] },
  setGraphData: (d) => set({ graphData: d }),
  appendGraphData: (nodes, links) => set((s) => ({
    graphData: {
      nodes: [...s.graphData.nodes, ...nodes.filter(n => !s.graphData.nodes.find(existing => existing.id === n.id))],
      links: [...s.graphData.links, ...links],
    }
  })),

  // Citation sources from last response
  citations: [],
  setCitations: (c) => set({ citations: c }),

  // Upload state
  uploadProgress: 0,
  setUploadProgress: (v) => set({ uploadProgress: v }),
  uploadStatus: null, // null | 'uploading' | 'processing' | 'done' | 'error'
  setUploadStatus: (v) => set({ uploadStatus: v }),
  uploadedFiles: [],
  addUploadedFile: (f) => set((s) => ({ uploadedFiles: [...s.uploadedFiles, f] })),
}))

export default useStore
