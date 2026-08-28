"""
Real embedding adapter using Google's Gen AI SDK against Vertex AI.

Replaces the old placeholder that returned a fake 1-dimensional "hash" --
that could never detect that two differently-worded leak descriptions are
the same underlying pattern, which is the entire point of the mastery map's
vector-similarity clustering (PRD 4.4). This is what makes it real.

NOTE: I can't execute this against your actual Google Cloud project from
this sandbox (no network route to googleapis.com here), so this hasn't been
run against live Vertex AI. Test it yourself with:

    export GOOGLE_CLOUD_PROJECT=your-project-id
    export GOOGLE_CLOUD_LOCATION=us-central1
    python -c "from embeddings.embedder import embed_text; print(len(embed_text('bad river call')))"

If that prints a vector of length > 1 with real floating point values, it's wired correctly.
"""

from google import genai
from google.genai.types import EmbedContentConfig

_MODEL = "gemini-embedding-001"
_DIMENSIONS = 768  # good balance of quality vs. Firestore vector-index storage cost

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        # vertexai=True reads GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION from
        # the environment, same as the ADK agent already expects to be configured.
        _client = genai.Client(vertexai=True)
    return _client


def embed_text(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """
    text: the leak description, concept explanation, or hand summary to embed.
    task_type: "RETRIEVAL_DOCUMENT" when storing (e.g. a new leak being saved),
               "RETRIEVAL_QUERY" when searching (e.g. comparing a new leak
               against past ones) -- using the right one improves match quality.

    Returns a real embedding vector (768 floats), or [] for empty input.
    """
    if not text:
        return []

    client = _get_client()
    response = client.models.embed_content(
        model=_MODEL,
        contents=text,
        config=EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=_DIMENSIONS,
        ),
    )
    return list(response.embeddings[0].values)