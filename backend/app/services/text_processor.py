from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

class TextProcessor:
    def __init__(self):
        self._model = None
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
        )

    @property
    def model(self):
        if self._model is None:
            print("Loading sentence-transformer model...")
            self._model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._model

    def process(self, text: str):
        chunks = self.text_splitter.split_text(text)
        if not chunks:
            chunks = [text]
        embeddings = self.model.encode(chunks)
        return {"chunks": chunks, "embeddings": embeddings.tolist()}

text_processor = TextProcessor()
