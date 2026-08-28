from agent.coach_agent import next_question


def test_coach_has_four_hint_levels():
    assert all(next_question(level) for level in range(1, 5))
