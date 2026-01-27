import logging
import os
from fastapi import FastAPI, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO)


def require_shared_secret(request: Request):
    secret = os.environ.get("AI_SHARED_SECRET", "")
    if not secret:
        logger.error("AI_SHARED_SECRET is not configured")
        raise HTTPException(status_code=500, detail="AI_SHARED_SECRET not configured")
    auth_header = request.headers.get("Authorization", "")
    if auth_header != f"Bearer {secret}":
        logger.warning("Unauthorized ai_service request")
        raise HTTPException(status_code=401, detail="unauthorized")


app = FastAPI(title="Note Taker AI Service", dependencies=[Depends(require_shared_secret)])

client = chromadb.Client(
    Settings(
        persist_directory=".chroma",
        anonymized_telemetry=False
    )
)

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", "64"))
COLLECTION_NAME = os.environ.get("CHROMA_COLLECTION", "embeddings")

model = SentenceTransformer(MODEL_NAME)
collection = client.get_or_create_collection(COLLECTION_NAME)


class EmbedItem(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None
    userId: Optional[str] = None
    objectType: Optional[str] = None
    objectId: Optional[str] = None
    updatedAt: Optional[str] = None
    embedding: Optional[List[float]] = None


class EmbedUpsertRequest(BaseModel):
    items: List[EmbedItem]


class SearchRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    query: Optional[str] = None
    types: Optional[List[str]] = None
    limit: int = 10
    embedding: Optional[List[float]] = None


class SimilarRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    sourceId: str = Field(..., min_length=1)
    types: Optional[List[str]] = None
    limit: int = 10


class EmbedDeleteRequest(BaseModel):
    ids: List[str]

class EmbedGetRequest(BaseModel):
    ids: List[str]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed/upsert")
def embed_upsert(req: EmbedUpsertRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")

    ids = [item.id for item in req.items]
    texts = [item.text for item in req.items]
    metadatas = []
    embeddings = []
    missing_texts = []
    missing_indexes = []

    for item in req.items:
        metadata = dict(item.metadata or {})
        if item.userId:
            metadata["userId"] = item.userId
        if item.objectType:
            metadata["objectType"] = item.objectType
        if item.objectId:
            metadata["objectId"] = item.objectId
        if item.updatedAt:
            metadata["updatedAt"] = item.updatedAt
        metadatas.append(metadata)
        if item.embedding and isinstance(item.embedding, list):
            embeddings.append(item.embedding)
        else:
            embeddings.append(None)
            missing_indexes.append(len(embeddings) - 1)
            missing_texts.append(item.text)

    try:
        if missing_texts:
            computed = []
            for i in range(0, len(missing_texts), EMBEDDING_BATCH_SIZE):
                batch = missing_texts[i:i + EMBEDDING_BATCH_SIZE]
                computed.extend(model.encode(batch, normalize_embeddings=True).tolist())
            for idx, emb in zip(missing_indexes, computed):
                embeddings[idx] = emb
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )
        return {"upserted": len(ids)}
    except Exception as exc:
        logger.exception("Embedding upsert failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/embed/delete")
def embed_delete(req: EmbedDeleteRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids are required")
    try:
        collection.delete(ids=req.ids)
        return {"deleted": len(req.ids)}
    except Exception as exc:
        logger.exception("Embedding delete failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/embed/get")
def embed_get(req: EmbedGetRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids are required")
    try:
        result = collection.get(ids=req.ids, include=["embeddings", "metadatas", "documents"])
        ids = result.get("ids", []) or []
        embeddings = result.get("embeddings", []) or []
        metadatas = result.get("metadatas", []) or []
        documents = result.get("documents", []) or []
        items = []
        for idx, item_id in enumerate(ids):
            items.append({
                "id": item_id,
                "embedding": embeddings[idx] if idx < len(embeddings) else None,
                "metadata": metadatas[idx] if idx < len(metadatas) else {},
                "document": documents[idx] if idx < len(documents) else None
            })
        return {"results": items}
    except Exception as exc:
        logger.exception("Embedding get failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@app.post("/search")
def search(req: SearchRequest):
    if not (req.query or req.embedding):
        raise HTTPException(status_code=400, detail="query or embedding is required")
    try:
        if req.embedding and isinstance(req.embedding, list):
            embedding = req.embedding
        else:
            if not req.query or not req.query.strip():
                raise HTTPException(status_code=400, detail="query is required")
            embedding = model.encode([req.query], normalize_embeddings=True).tolist()[0]
        where = {"userId": req.userId}
        if req.types:
            where["objectType"] = {"$in": req.types}
        result = collection.query(
            query_embeddings=[embedding],
            n_results=req.limit,
            where=where,
            include=["metadatas", "documents", "distances", "ids"]
        )
        ids = result.get("ids", [[]])[0] or []
        metadatas = result.get("metadatas", [[]])[0] or []
        documents = result.get("documents", [[]])[0] or []
        distances = result.get("distances", [[]])[0] or []
        results = []
        for idx, item_id in enumerate(ids):
            metadata = metadatas[idx] if idx < len(metadatas) else {}
            distance = distances[idx] if idx < len(distances) else None
            score = (1 - distance) if distance is not None else None
            results.append({
                "id": item_id,
                "score": score,
                "distance": distance,
                "metadata": metadata or {},
                "document": documents[idx] if idx < len(documents) else None
            })
        return {"results": results}
    except Exception as exc:
        logger.exception("Semantic search failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/similar")
def similar(req: SimilarRequest):
    try:
        source = collection.get(ids=[req.sourceId], include=["embeddings"])
        embeddings = source.get("embeddings", []) if source else []
        if not embeddings:
            raise HTTPException(status_code=404, detail="source embedding not found")
        embedding = embeddings[0]
        where = {"userId": req.userId}
        if req.types:
            where["objectType"] = {"$in": req.types}
        result = collection.query(
            query_embeddings=[embedding],
            n_results=req.limit + 1,
            where=where,
            include=["metadatas", "documents", "distances", "ids"]
        )
        ids = result.get("ids", [[]])[0] or []
        metadatas = result.get("metadatas", [[]])[0] or []
        documents = result.get("documents", [[]])[0] or []
        distances = result.get("distances", [[]])[0] or []
        results = []
        for idx, item_id in enumerate(ids):
            if item_id == req.sourceId:
                continue
            metadata = metadatas[idx] if idx < len(metadatas) else {}
            distance = distances[idx] if idx < len(distances) else None
            score = (1 - distance) if distance is not None else None
            results.append({
                "id": item_id,
                "score": score,
                "distance": distance,
                "metadata": metadata or {},
                "document": documents[idx] if idx < len(documents) else None
            })
            if len(results) >= req.limit:
                break
        return {"results": results}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Similarity search failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
