"""
ImageProcessor — real image understanding via Groq Vision API (LLaMA 4 Scout).
Falls back to Pillow metadata if API is unavailable.
"""

import base64
import io
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class ImageProcessor:
    def __init__(self):
        self._embed_model = None

    @property
    def embed_model(self):
        if self._embed_model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading BGE model for image caption embedding...")
            self._embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5")
        return self._embed_model

    def generate_caption(self, image_bytes: bytes, filename: str = "image.jpg") -> str:
        """
        Use Groq Vision (LLaMA 3.2 Vision) to generate a rich caption.
        Falls back to image metadata description if API fails.
        """
        try:
            from groq import Groq
            from app.core.config import settings

            if not settings.GROQ_API_KEY or "your_key" in settings.GROQ_API_KEY:
                raise ValueError("GROQ_API_KEY is not configured")

            b64 = base64.b64encode(image_bytes).decode("utf-8")

            # Detect MIME type from magic bytes
            mime = "image/jpeg"
            if image_bytes[:4] == b"\x89PNG":
                mime = "image/png"
            elif image_bytes[:4] == b"GIF8":
                mime = "image/gif"
            elif image_bytes[:2] == b"BM":
                mime = "image/bmp"

            client = Groq(api_key=settings.GROQ_API_KEY)
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe this image in detail. Extract ALL text visible in the image. "
                                "Identify key entities, objects, data, charts, or any structured information. "
                                "Provide a comprehensive description that would allow someone to answer questions "
                                "about this image without seeing it. If there is text, quote it exactly."
                            ),
                        },
                    ],
                }],
                max_tokens=1024,
            )
            caption = response.choices[0].message.content
            logger.info("Vision caption generated: %d chars", len(caption))
            return caption

        except Exception as e:
            logger.error("[Vision API Failure] Filename: %s, Error: %s", filename, str(e))
            return self._fallback_description(image_bytes, filename, error=str(e))

    def _fallback_description(self, image_bytes: bytes, filename: str, error: str = "") -> str:
        """Generate basic description from image metadata using Pillow."""
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))
            mode_map = {
                "RGB":  "colour",
                "RGBA": "colour with transparency",
                "L":    "grayscale",
                "1":    "black-and-white",
            }
            colour_desc = mode_map.get(img.mode, img.mode)
            w, h = img.size
            
            reason = f" (API Error: {error})" if error else ""
            return (
                f"An image file named '{filename}' ({colour_desc}, {w}x{h} pixels). "
                f"This is a visual document that may contain charts, diagrams, or photographs. "
                f"Content could not be automatically extracted via Groq Vision{reason}. "
                f"Please manually describe this image if it contains critical information."
            )
        except Exception:
            return f"An image file named '{filename}' containing visual information. (Extraction Failed: {error})"


    def process(self, image_bytes: bytes, filename: str = "image.jpg") -> Dict[str, Any]:
        """Full image pipeline: caption → embed."""
        caption = self.generate_caption(image_bytes, filename=filename)
        caption = f"Document File: {filename}\n\n{caption}"
        embedding = self.embed_model.encode(
            [f"Represent this sentence for searching relevant passages: {caption}"],
            normalize_embeddings=True,
        )[0]
        return {
            "caption":   caption,
            "embedding": embedding.tolist(),
            "filename":  filename,
        }


image_processor = ImageProcessor()
