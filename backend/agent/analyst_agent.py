"""Analyst adapter seam. Structured exports use the deterministic parser."""

from parsers.structured_parser import looks_like_structured_export, parse_structured_hand


def analyze(raw_text: str) -> dict:
    if not looks_like_structured_export(raw_text):
        return {"status": "needs_clarification", "parsed": None}
    return {"status": "parsed", "parsed": parse_structured_hand(raw_text)}
