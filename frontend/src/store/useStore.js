import { create } from 'zustand'

const useStore = create((set) => ({
  // Chat messages
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  // Loading
  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),

  // Agent trace from last query
  trace: null,
  setTrace: (t) => set({ trace: t }),

  // Knowledge graph for visualization
  graphData: { nodes: [], links: [] },
  setGraphData: (d) => set({ graphData: d }),

  // Citations (source chunks with scores)
  citations: [],
  setCitations: (c) => set({ citations: c }),

  // Upload
  uploadProgress: 0,
  setUploadProgress: (v) => set({ uploadProgress: v }),
  uploadStatus: null,
  setUploadStatus: (v) => set({ uploadStatus: v }),
  uploadedFiles: [],
  addUploadedFile: (f) => set((s) => ({ uploadedFiles: [...s.uploadedFiles, f] })),
}))

export default useStore
