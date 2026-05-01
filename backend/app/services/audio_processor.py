"""
AudioProcessor — Whisper transcription + BGE embedding.
"""

import os
import tempfile
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class AudioProcessor:
    def __init__(self):
        self._whisper = None
        self._embed_model = None

    @property
    def whisper_model(self):
        if self._whisper is None:
            import whisper
            logger.info("Loading Whisper model (base)...")
            self._whisper = whisper.load_model("base")
        return self._whisper

    @property
    def embed_model(self):
        if self._embed_model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading BGE model for audio embedding...")
            self._embed_model = SentenceTransformer("BAAI/bge-small-en-v1.5")
        return self._embed_model

    def process(self, audio_bytes: bytes, filename: str = "audio.wav") -> Dict[str, Any]:
        """Transcribe audio and return transcript + embedding."""
        # Write to temp file for Whisper
        ext = os.path.splitext(filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            result = self.whisper_model.transcribe(tmp_path)
            transcript = result.get("text", "").strip()
            logger.info("Transcribed audio: %d chars", len(transcript))
        except Exception as e:
            logger.error("Whisper transcription failed: %s", e)
            transcript = "(Audio transcription failed)"
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

        # Embed transcript with BGE query prefix for better recall
        embedding = self.embed_model.encode(
            [f"Represent this sentence for searching relevant passages: {transcript}"],
            normalize_embeddings=True,
        )[0]

        return {
            "transcript": transcript,
            "embedding":  embedding.tolist(),
            "filename":   filename,
        }


audio_processor = AudioProcessor()
