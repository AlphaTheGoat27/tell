from fastapi.testclient import TestClient

from api.main import app


def test_health_endpoint():
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def _start_practice_game(client):
    from api.main import practice_games

    game = client.post('/api/practice', json={'players': 2}).json()
    live = practice_games.games[game['id']]
    live.hands[0] = ['7c', '9c']
    live.board = ['9h', '7d', '4h']
    live.street = 'flop'
    live.pot = 1.5
    return game['id']


def test_chat_endpoint_corrects_wrong_best_hand():
    client = TestClient(app)
    game_id = _start_practice_game(client)
    response = client.post(
        f'/api/practice/{game_id}/chat',
        json={'message': '9, 9, 9, 7, 7'},
    )
    assert response.status_code == 200
    body = response.json()
    assert body['topic'] == 'best_hand'
    assert body['correct'] is False
    assert 'Two Pair' in body['reply']


def test_chat_endpoint_affirms_correct_best_hand():
    client = TestClient(app)
    game_id = _start_practice_game(client)
    response = client.post(
        f'/api/practice/{game_id}/chat',
        json={'message': '9 9 7 7 4'},
    )
    assert response.status_code == 200
    assert response.json()['correct'] is True


def test_chat_endpoint_answers_outs_question():
    client = TestClient(app)
    game_id = _start_practice_game(client)
    response = client.post(
        f'/api/practice/{game_id}/chat',
        json={'message': 'what are my outs?'},
    )
    assert response.status_code == 200
    assert response.json()['topic'] == 'outs'


def test_chat_endpoint_unknown_game_returns_error():
    client = TestClient(app)
    response = client.post(
        '/api/practice/does-not-exist/chat',
        json={'message': 'hello'},
    )
    assert response.status_code == 200
    assert 'error' in response.json()
