"""Local Socratic coach seam; replace responses with ADK orchestration later."""


def next_question(level: int = 1) -> str:
    questions = {
        1: "What range of hands did you think your opponent could have?",
        2: "How does the pot size compare with the amount you had to call?",
        3: "What equity would a call need to break even here?",
        4: "Let's walk through the pot odds and equity step by step.",
    }
    return questions.get(level, questions[4])
