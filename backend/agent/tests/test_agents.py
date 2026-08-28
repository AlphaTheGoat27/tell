from agent.coach_agent import get_hand_equity, get_required_equity, next_question


def test_coach_has_four_hint_levels():
    assert all(next_question(level) for level in range(1, 5))


def test_get_required_equity_matches_math_engine():
    result = get_required_equity(pot_before_call=100, call_amount=50)
    assert "33.3%" in result
    assert "2.00:1" in result


def test_get_hand_equity_returns_real_computation():
    # AA vs KK preflop -- same benchmark used in the math engine's own tests
    result = get_hand_equity(hero_cards=["Ah", "Ad"], board=[], villain_cards=["Kh", "Kd"])
    assert "hero_win=" in result
    win_fraction = float(result.split("(win=")[1].split(",")[0])
    assert 0.75 < win_fraction < 0.87


def test_root_agent_constructs_with_tools_when_adk_available():
    """
    If google-adk isn't installed, root_agent is None by design (see
    agent.py's try/except) -- skip in that environment rather than fail.
    """
    from agent.agent import root_agent

    if root_agent is None:
        import pytest

        pytest.skip("google-adk not installed in this environment")

    tool_names = {t.__name__ for t in root_agent.tools}
    assert tool_names == {"next_question", "get_required_equity", "get_hand_equity"}
    assert "never state a pot-odds" in root_agent.instruction