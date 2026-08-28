from models.hand import Hand
from models.mastery_map import MasteryMap
from storage.firestore_client import InMemoryStore
from storage.hand_repository import HandRepository
from storage.mastery_repository import MasteryRepository


def test_hand_repository_round_trip():
    repository = HandRepository()
    hand = Hand(id='h1', user_id='u1', raw_text='test')
    repository.save(hand)
    assert repository.get('h1').user_id == 'u1'


def test_mastery_repository_round_trips_through_serialization():
    """
    Guards against the 'shared Python object' bug: write through one
    MasteryRepository instance, then read through a *fresh* instance backed
    by the *same* InMemoryStore.  If the score survives that crossing it can
    only be because to_firestore_dict / from_firestore_dict did real work.
    """
    shared_store = InMemoryStore()

    writer = MasteryRepository(store=shared_store)
    writer.update(user_id="u1", concept_id="pot_odds", signal=0.8)

    # Deliberately create a brand-new repo object — no shared Python state.
    reader = MasteryRepository(store=shared_store)
    mastery = reader.get("u1")

    assert "pot_odds" in mastery.scores
    # EWA with weight 0.2 starting from signal as seed: 0.8 + 0.2*(0.8-0.8) == 0.8
    assert abs(mastery.scores["pot_odds"] - 0.8) < 1e-9
