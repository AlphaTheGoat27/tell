from dataclasses import dataclass, field
from random import shuffle, choice, random
from uuid import uuid4

from treys import Card, Evaluator

RANKS = "23456789TJQKA"
SUITS = "shdc"
EVALUATOR = Evaluator()

BOT_PERSONALITIES = [
    {
        "name": "Alex",
        "style": "Tight-Aggressive",
        "traits": "plays premium hands, bets them for value, folds garbage",
        "aggression": 0.65,
        "call_frequency": 0.55,
    },
    {
        "name": "Sam",
        "style": "Loose-Aggressive",
        "traits": "wide ranges, heavy bet sizing, pressures with bluffs",
        "aggression": 0.8,
        "call_frequency": 0.65,
    },
    {
        "name": "Jordan",
        "style": "Calling Station",
        "traits": "loves to see flops, calls down light, rarely bluffs",
        "aggression": 0.3,
        "call_frequency": 0.82,
    },
    {
        "name": "Casey",
        "style": "Ultra-Tight",
        "traits": "only premium hands preflop, only nuts postflop, easy to bluff",
        "aggression": 0.4,
        "call_frequency": 0.35,
    },
    {
        "name": "Riley",
        "style": "Hyper-Aggressive",
        "traits": "raises constantly, bets every street, impossible to read at first",
        "aggression": 0.92,
        "call_frequency": 0.7,
    },
    {
        "name": "Drew",
        "style": "GTO-ish",
        "traits": "mixed strategies, good bet sizing ratios, hard to exploit",
        "aggression": 0.6,
        "call_frequency": 0.6,
    },
    {
        "name": "Taylor",
        "style": "Recreational",
        "traits": "plays any two face cards, chases draws regardless of price",
        "aggression": 0.45,
        "call_frequency": 0.78,
    },
]

STREET_INTROS = {
    "preflop": [
        "New hand. Look at your cards.",
        "Two cards dealt. What's your move?",
        "Preflop. How strong is your hand?",
    ],
    "flop": [
        "Flop is out. What can you make?",
        "Three on the board. Still in?",
        "Board hit. Your move.",
    ],
    "turn": [
        "Turn card. Help or hurt?",
        "Fourth street. Your call.",
        "Turn is here. Act when ready.",
    ],
    "river": [
        "River — last card. Value or check?",
        "Final street. What's it worth?",
        "River dealt. Last decision.",
    ],
    "showdown": [
        "Showdown. Who wins?",
        "All cards up. Let's compare.",
    ],
}


def _card(card: str) -> str:
    return card


def _format_cards(cards: list[str]) -> str:
    return " ".join(c[0].upper() + c[1:] for c in cards)


def _preflop_read(hand: list[str]) -> tuple[str, str]:
    """Returns (tier, short_tip) for coach voice."""
    if len(hand) < 2:
        return "weak", "check your cards"
    r1, r2 = RANKS.index(hand[0][0]), RANKS.index(hand[1][0])
    high, low = max(r1, r2), min(r1, r2)
    suited = hand[0][1] == hand[1][1]
    paired = r1 == r2
    label = _format_cards(hand)
    tag = "suited" if suited else "offsuit"

    if paired and high >= 10:
        return "premium", f"{label} is a premium pair — raise"
    if paired and high >= 7:
        return "playable", f"{label} is a medium pair — set-mine or raise late"
    if paired:
        return "weak", f"{label} is a small pair — fold unless cheap"
    if high >= 12 and low >= 10:
        return "premium", f"{label} {tag} — broadway, raise"
    if high >= 12 and low >= 8 and suited:
        return "premium", f"{label} suited — strong ace, raise"
    if (high >= 11 and low >= 9) or (suited and high - low <= 2 and low >= 4):
        return "playable", f"{label} {tag} — playable, see a flop"
    if high >= 11:
        return "playable", f"{label} — one broadway, late position only"
    if high - low >= 4 or low <= 4:
        return "weak", f"{label} {tag} — weak and disconnected, fold"
    return "weak", f"{label} — low cards, usually a fold"


def _street_label(street: str) -> str:
    return {"preflop": "Preflop", "flop": "Flop", "turn": "Turn", "river": "River", "showdown": "Showdown"}.get(street, street)


@dataclass
class BotAction:
    bot_name: str
    bot_seat: int
    personality: str
    action: str
    reasoning: str
    hand_strength: str


@dataclass
class PracticeHand:
    players: int
    id: str = field(default_factory=lambda: str(uuid4()))
    deck: list[str] = field(default_factory=list)
    hands: list[list[str]] = field(default_factory=list)
    board: list[str] = field(default_factory=list)
    street: str = "preflop"
    pot: float = 1.5
    hero_stack: float = 99.5
    bot_stacks: list[float] = field(default_factory=list)
    hero_folded: bool = False
    hero_fold_street: str | None = None
    complete: bool = False
    result: str | None = None
    winner: int | None = None
    bot_actions: list[BotAction] = field(default_factory=list)
    last_hero_action: str | None = None
    last_intro: str | None = None
    needs_prediction: bool = False
    prediction_resolved: bool = False

    @classmethod
    def deal(cls, players: int) -> "PracticeHand":
        deck = [r + s for r in RANKS for s in SUITS]
        shuffle(deck)
        hands = [[deck.pop(), deck.pop()] for _ in range(players)]
        hand = cls(
            players=players,
            deck=deck,
            hands=hands,
            bot_stacks=[99.0] * (players - 1),
        )
        hand.last_intro = choice(STREET_INTROS["preflop"])
        return hand

    def _bot_reasoning(self, seat: int, action: str, wager: float) -> BotAction:
        personality = BOT_PERSONALITIES[(seat - 1) % len(BOT_PERSONALITIES)]
        hand = self.hands[seat]
        board_cards = [Card.new(_card(c)) for c in self.board] if self.board else []
        my_cards = [Card.new(_card(c)) for c in hand]
        if board_cards:
            score = EVALUATOR.evaluate(board_cards, my_cards)
            cls_int = EVALUATOR.get_rank_class(score)
            strength_name = EVALUATOR.class_to_string(cls_int)
            raw_strength = 1 - (score / 8000)
        else:
            high = max(RANKS.index(h[0]) for h in hand)
            suited = hand[0][1] == hand[1][1]
            paired = hand[0][0] == hand[1][0]
            raw_strength = (high / 12) * (1.1 if suited else 1.0) * (1.3 if paired else 1.0)
            raw_strength = min(1.0, raw_strength)
            strength_name = (
                "premium" if raw_strength > 0.7 else
                "playable" if raw_strength > 0.4 else "weak"
            ) + " preflop"
        if action == "call":
            if raw_strength > 0.75:
                reason = f"I have {strength_name} — I'm calling for value, hoping to build a big pot."
            elif raw_strength > 0.45:
                price_ok = (self.pot if self.pot else 3) / max(wager, 1)
                reason = f"I have {strength_name}, and I'm getting roughly {price_ok:.0f}:1 on a call — worth seeing the next street."
            else:
                reason = f"I'm {personality['style']} — {personality['traits']}. I {strength_name} but called anyway this time."
        elif action == "raise":
            reason = f"I {strength_name}. As {personality['style']} I'm building the pot here — aggression={personality['aggression']:.0%}."
        elif action == "fold":
            reason = f"{strength_name} is too weak for my standards. {personality['style']} — I don't continue with garbage."
        elif action == "check":
            reason = f"I check back with {strength_name}. {personality['style']} — pot control here, let's see a free card."
        else:
            reason = f"{strength_name}, so I'm continuing."
        return BotAction(
            bot_name=personality["name"],
            bot_seat=seat,
            personality=personality["style"],
            action=action,
            reasoning=reason,
            hand_strength=strength_name,
        )

    def _deal_street(self) -> None:
        if self.street == "preflop":
            self.board.extend([self.deck.pop(), self.deck.pop(), self.deck.pop()])
            self.street = "flop"
        elif self.street == "flop":
            self.board.append(self.deck.pop())
            self.street = "turn"
        elif self.street == "turn":
            self.board.append(self.deck.pop())
            self.street = "river"
        else:
            self.street = "showdown"
            self._showdown()
        if self.street in STREET_INTROS:
            self.last_intro = choice(STREET_INTROS[self.street])

    def _run_bots(self, hero_action: str, hero_wager: float) -> None:
        active_bots = min(self.players - 1, 2)
        if hero_wager:
            for i in range(active_bots):
                seat = i + 1
                personality = BOT_PERSONALITIES[i % len(BOT_PERSONALITIES)]
                roll = random()
                if hero_action == "raise" and roll < (1 - personality["call_frequency"]) * 0.5:
                    bot_act = "fold"
                elif hero_action == "raise" and roll < personality["call_frequency"] + personality["aggression"] * 0.15:
                    bot_act = "raise"
                else:
                    bot_act = "call"
                if bot_act != "fold":
                    amount = hero_wager * (2.0 if bot_act == "raise" else 1.0)
                    self.bot_stacks[i] -= amount
                    self.pot += amount
                self.bot_actions.append(self._bot_reasoning(seat, bot_act, hero_wager))
        else:
            for i in range(active_bots):
                seat = i + 1
                personality = BOT_PERSONALITIES[i % len(BOT_PERSONALITIES)]
                if random() < personality["aggression"] * 0.5:
                    bet = 2.0
                    self.bot_stacks[i] -= bet
                    self.pot += bet
                    self.bot_actions.append(self._bot_reasoning(seat, "raise", bet))
                else:
                    self.bot_actions.append(self._bot_reasoning(seat, "check", 0))

    def _deal_all_remaining(self) -> None:
        while self.street != "showdown":
            self._deal_street()

    def act(self, action: str) -> None:
        if self.complete or self.needs_prediction:
            raise ValueError("This hand is not accepting hero actions right now.")
        if action not in {"fold", "check", "call", "raise"}:
            raise ValueError("Unsupported action.")
        self.last_hero_action = action
        if action == "fold":
            self.hero_folded = True
            self.hero_fold_street = self.street
            for i in range(1, self.players):
                if i < len(self.hands):
                    self.bot_actions.append(self._bot_reasoning(i, "show", 0))
            self._deal_all_remaining()
            self.needs_prediction = True
            return
        wager = 0 if action == "check" else (3.0 if action == "raise" else 1.0)
        self.hero_stack -= wager
        self.pot += wager
        self._run_bots(action, wager)
        current_street_before = self.street
        self._deal_street()
        if self.street == "showdown":
            self.complete = True

    def bot_round(self, predicted_winner: int | None = None) -> None:
        """Called when the user submits their post-fold prediction — finalizes showdown."""
        if self.complete:
            raise ValueError("This hand is already complete.")
        if not self.needs_prediction:
            raise ValueError("No prediction to resolve right now.")
        if not self.hero_folded:
            raise ValueError("Predictions are only needed after you fold.")
        if predicted_winner is not None and self.winner is not None:
            pass  # Frontend gives prediction feedback; keep result clean for voice.
        if not self.prediction_resolved:
            self.prediction_resolved = True
            self.complete = True

    def _showdown(self) -> None:
        board = [Card.new(_card(c)) for c in self.board]
        scores = [
            EVALUATOR.evaluate(board, [Card.new(_card(c)) for c in hand])
            for hand in self.hands
        ]
        contenders = range(1, self.players) if self.hero_folded else range(self.players)
        winner = min(contenders, key=lambda i: scores[i])
        self.winner = winner
        winner_name = "You" if winner == 0 else BOT_PERSONALITIES[(winner - 1) % len(BOT_PERSONALITIES)]["name"]
        win_class = EVALUATOR.get_rank_class(scores[winner])
        hand_name = EVALUATOR.class_to_string(win_class)
        self.result = f"{winner_name} wins with {hand_name}."

    def _coach_voice(self) -> str:
        hand = _format_cards(self.hands[0]) if self.hands else "your cards"
        board = _format_cards(self.board) if self.board else "no board yet"
        label = _street_label(self.street)

        if self.complete:
            base = self.result or "Hand over."
            return base.split(". You picked")[0].split(". Nice read")[0]
        if self.needs_prediction and self.hero_folded:
            fold_label = _street_label(self.hero_fold_street or self.street)
            return f"You folded on {fold_label}. Board: {board}. Pick who wins."
        if self.street == "preflop" and not self.last_hero_action:
            return f"Preflop. You have {hand}. How strong is this hand?"
        if self.street == "flop":
            return f"Flop. Board is {board}. You hold {hand}. What is your best hand?"
        if self.street == "turn":
            return f"Turn. Board is {board}. Did your hand improve?"
        if self.street == "river":
            return f"River. Board is {board}. Bet for value or check?"
        return f"{label}. What is your move?"

    def public(self) -> dict:
        coach_prompt = self._coach_voice()
        showdown_reasoning = []
        if self.bot_actions:
            for ba in self.bot_actions:
                showdown_reasoning.append({
                    "bot_name": ba.bot_name,
                    "seat": ba.bot_seat,
                    "personality": ba.personality,
                    "action": ba.action,
                    "reasoning": ba.reasoning,
                    "hand_strength": ba.hand_strength,
                })
        actions_available = not self.complete and not self.needs_prediction
        return {
            "id": self.id,
            "hero_cards": self.hands[0],
            "board": self.board,
            "showdown_hands": self.hands if (self.complete or self.hero_folded) else [],
            "bot_reasoning": showdown_reasoning,
            "winner": self.winner if self.complete else None,
            "players": self.players,
            "street": self.street,
            "pot": round(self.pot, 2),
            "hero_stack": round(self.hero_stack, 2),
            "bot_stacks": [round(s, 2) for s in self.bot_stacks],
            "complete": self.complete,
            "result": self.result,
            "available_actions": ["fold", "check", "call", "raise"] if actions_available else [],
            "needs_prediction": self.needs_prediction and not self.complete,
            "coach_prompt": coach_prompt,
            "last_hero_action": self.last_hero_action,
            "hero_folded": self.hero_folded,
            "hero_fold_street": self.hero_fold_street,
        }


class PracticeGames:
    def __init__(self) -> None:
        self.games: dict[str, PracticeHand] = {}

    def create(self, players: int) -> dict:
        game = PracticeHand.deal(players)
        self.games[game.id] = game
        return game.public()

    def action(self, game_id: str, action: str) -> dict:
        game = self.games.get(game_id)
        if game is None:
            raise KeyError("Practice hand not found.")
        game.act(action)
        return game.public()

    def advance_bots(self, game_id: str, predicted_winner: int | None = None) -> dict:
        game = self.games.get(game_id)
        if game is None:
            raise KeyError("Practice hand not found.")
        game.bot_round(predicted_winner=predicted_winner)
        return game.public()

    def chat(self, game_id: str, message: str) -> dict:
        game = self.games.get(game_id)
        if game is None:
            raise KeyError("Practice hand not found.")

        # Prefer the Gemini-backed coach for natural answers; it is grounded
        # in the deterministic engine so its numbers stay correct. Fall back
        # to the rule-based coach when Gemini is unavailable or errors.
        try:
            from game.gemini_coach import gemini_reply

            result = gemini_reply(game, message)
            if result.get("reply"):
                return result
        except Exception:
            pass

        from game.coach_chat import coach_reply

        return coach_reply(game, message)
