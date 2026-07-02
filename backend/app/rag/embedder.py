"""
StubEmbedder — a deterministic stand-in for the real embedding model.

Produces a normalized 768-d vector from a SHA256 expansion of the text. This is NOT
semantically meaningful — identical text yields identical vectors (so the query-embedding
cache and the pipeline plumbing can be exercised and tested), but nearest-neighbour results
are meaningless until the real model + populated corpus land. Dimensions/model_name match
the schema (003_rag.sql: vector(768), nomic-embed-text-v1.5) so the swap is drop-in.
"""
import hashlib
import math


class StubEmbedder:
    model_name = "stub-nomic-embed-768"
    dimensions = 768

    async def embed_query(self, text: str) -> list[float]:
        return self._vec(text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def _vec(self, text: str) -> list[float]:
        out: list[float] = []
        counter = 0
        while len(out) < self.dimensions:
            block = hashlib.sha256(f"{text}:{counter}".encode("utf-8")).digest()
            for i in range(0, len(block), 4):
                if len(out) >= self.dimensions:
                    break
                out.append(int.from_bytes(block[i:i + 4], "big") / 2**32 - 0.5)
            counter += 1
        norm = math.sqrt(sum(v * v for v in out)) or 1.0
        return [v / norm for v in out]  # unit-normalized → cosine-ready
