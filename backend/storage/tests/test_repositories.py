from models.hand import Hand
from storage.hand_repository import HandRepository


def test_hand_repository_round_trip():
    repository = HandRepository()
    hand = Hand(id='h1', user_id='u1', raw_text='test')
    repository.save(hand)
    assert repository.get('h1').user_id == 'u1'
