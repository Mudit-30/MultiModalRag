from sentence_transformers import SentenceTransformer

class ImageProcessor:
    def __init__(self):
        self._model = None

    @property
    def model(self):
        if self._model is None:
            self._model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._model

    def generate_caption(self, image_bytes: bytes) -> str:
        # Stub: in production use BLIP-2 or a Groq vision model
        return "An image containing visual information relevant to the document."

    def process(self, image_bytes: bytes):
        caption = self.generate_caption(image_bytes)
        embedding = self.model.encode([caption])[0]
        return {"caption": caption, "embedding": embedding.tolist()}

image_processor = ImageProcessor()
