import os

from huggingface_hub import InferenceClient


HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_EMBEDDING_MODEL = os.getenv("HF_EMBEDDING_MODEL", "intfloat/e5-small-v2")
HF_TEXT_MODEL = os.getenv("HF_TEXT_MODEL", "HuggingFaceH4/zephyr-7b-beta")
HF_PROVIDER = os.getenv("HF_PROVIDER", "hf-inference")
HF_TIMEOUT_MS = int(os.getenv("HF_TIMEOUT_MS", "30000"))

embeddings_client = InferenceClient(
    model=HF_EMBEDDING_MODEL,
    token=HF_TOKEN,
    provider=HF_PROVIDER,
    timeout=HF_TIMEOUT_MS / 1000.0,
)

text_client = InferenceClient(
    model=HF_TEXT_MODEL,
    token=HF_TOKEN,
    provider=HF_PROVIDER,
    timeout=HF_TIMEOUT_MS / 1000.0,
)
