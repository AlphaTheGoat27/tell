"""
Tests for the embeddings.embedder module.

The live API call (genai.Client + Vertex AI) can't run without credentials,
so we mock at the SDK boundary.  The mock verifies:
  - empty input  ? empty list (guard clause, no SDK call made)
  - non-empty    ? a real 768-float vector returned through embed_content
  - empty text in embed_text returns [] without touching the SDK

To run against a real Vertex AI project (credentials required):
    export GOOGLE_CLOUD_PROJECT=your-project-id
    export GOOGLE_CLOUD_LOCATION=us-central1
    python -c "from embeddings.embedder import embed_text; print(len(embed_text('bad river call')))"
Expected output: 768
"""
from unittest.mock import MagicMock, patch

import embeddings.embedder as embedder_module
from embeddings.embedder import embed_text


def _make_fake_response(n_dims: int = 768):
    """Build a minimal mock that matches the SDK's response shape."""
    embedding = MagicMock()
    embedding.values = [0.1] * n_dims
    response = MagicMock()
    response.embeddings = [embedding]
    return response


def test_empty_input_returns_empty_list_without_sdk_call():
    """Guard clause: empty string must short-circuit before hitting the network."""
    with patch.object(embedder_module, "_client", MagicMock()) as mock_client:
        result = embed_text("")
    assert result == []
    mock_client.models.embed_content.assert_not_called()


def test_embed_text_returns_correct_dimension_vector():
    """Non-empty text must return a list of floats via the SDK."""
    # Reset the module-level singleton so our mock is picked up cleanly.
    original_client = embedder_module._client
    try:
        fake_client = MagicMock()
        fake_client.models.embed_content.return_value = _make_fake_response(768)
        embedder_module._client = fake_client

        result = embed_text("bad river call")

        assert isinstance(result, list)
        assert len(result) == 768
        assert all(isinstance(v, float) for v in result)

        # Confirm the right model and a config with our dimensionality was used.
        call_kwargs = fake_client.models.embed_content.call_args
        assert call_kwargs.kwargs["model"] == "gemini-embedding-001"
        assert call_kwargs.kwargs["config"].output_dimensionality == 768
    finally:
        embedder_module._client = original_client


def test_task_type_is_passed_through():
    """Callers can switch to RETRIEVAL_QUERY for similarity searches."""
    original_client = embedder_module._client
    try:
        fake_client = MagicMock()
        fake_client.models.embed_content.return_value = _make_fake_response(768)
        embedder_module._client = fake_client

        embed_text("pot odds concept", task_type="RETRIEVAL_QUERY")

        config = fake_client.models.embed_content.call_args.kwargs["config"]
        assert config.task_type == "RETRIEVAL_QUERY"
    finally:
        embedder_module._client = original_client
