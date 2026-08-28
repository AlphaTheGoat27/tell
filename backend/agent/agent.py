"""Optional ADK entrypoint.

The local MVP can be tested without cloud credentials or the ADK package.
"""

try:
    from google.adk.agents.llm_agent import Agent
except ImportError:  # pragma: no cover - exercised only without optional ADK
    Agent = None


root_agent = (
    Agent(
        model="gemini-3.5-flash",
        name="root_agent",
        description="A helpful assistant for user questions.",
        instruction="Answer user questions to the best of your knowledge",
    )
    if Agent
    else None
)
