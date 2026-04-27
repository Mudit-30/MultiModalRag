import os
import tempfile
from sentence_transformers import SentenceTransformer

class AudioProcessor:
    def __init__(self):
        self._whisper = None
        self._text_model = None

    @property
    def whisper_model(self):
        if self._whisper is None:
            import whisper
            print("Loading Whisper model (base)...")
            self._whisper = whisper.load_model("base")
        return self._whisper

    @property
    def text_model(self):
        if self._text_model is None:
            self._text_model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._text_model

    def process(self, audio_bytes: bytes, filename: str = "audio.wav"):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            result = self.whisper_model.transcribe(tmp_path)
            transcript = result["text"]
        finally:
            os.remove(tmp_path)

        embedding = self.text_model.encode([transcript])[0]
        return {"transcript": transcript, "embedding": embedding.tolist()}

audio_processor = AudioProcessor()
