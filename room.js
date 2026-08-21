  // --- 通信初期化 ---
  function initPeer(onOpen) {
    peer = new Peer();
    peer.on('open', (id) => { myId = id; onOpen(id); });
    peer.on('error', (error) => {
      const message = error.type === 'peer-unavailable'
        ? '部屋が見つかりません。合言葉を確認してください。'
        : '接続できませんでした。インターネット接続を確認してください。';
      const target = document.getElementById(isHost ? 'host-error' : 'join-error');
      if (target) target.innerText = message;
    });
  }

  function uiStartHost() {
    myName = document.getElementById('nickname').value || 'ホスト';
    isHost = true;
    state.screen = 'lobby';
    switchScreen('screen-create');
    initPeer((id) => {
      document.getElementById('host-id-display').innerText = id;
      state.players.push({ id: myId, name: myName });
      updateLobbyUI();
      peer.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data) => hostHandleClientData(data, conn));
      });
    });
  }

  function uiStartGuest() {
    myName = document.getElementById('nickname').value || 'ゲスト';
    isHost = false;
    switchScreen('screen-join');
    initPeer(() => {});
  }

  function guestConnect() {
    const hostId = document.getElementById('join-room-id').value.trim();
    const errorBox = document.getElementById('join-error');
    errorBox.innerText = '';
    if (!hostId) {
      errorBox.innerText = '合言葉を入力してください。';
      return;
    }
    hostConn = peer.connect(hostId);
    hostConn.on('open', () => {
      hostConn.send({ type: 'JOIN', name: myName, id: myId });
      switchScreen('screen-lobby');
    });
    hostConn.on('data', (data) => guestHandleHostData(data));
    hostConn.on('error', () => { errorBox.innerText = '部屋に接続できませんでした。'; });
    hostConn.on('close', () => { errorBox.innerText = 'ホストとの接続が切れました。'; });
  }

  function updateLobbyUI() {
    const txt = `入室済: ${state.players.length} 人`;
    document.getElementById('host-lobby-count').innerText = txt;
    document.getElementById('guest-lobby-count').innerText = txt;
    const playerList = state.players
      .map(player => `<li>${escapeHtml(player.name)}${player.id === myId ? '（あなた）' : ''}</li>`).join('');
    document.getElementById('host-player-list').innerHTML = playerList;
    document.getElementById('guest-player-list').innerHTML = playerList;
    const startButton = document.getElementById('btn-start-game');
    if (startButton) {
      startButton.disabled = state.players.length < 2;
      startButton.innerText = state.players.length < 2 ? '2人そろったらゲーム開始' : '部屋確定・ゲーム開始';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- ホスト側のロジック (司令塔) ---
  function hostBroadcastState() {
    connections.forEach(c => c.send({ type: 'SYNC_STATE', state: state }));
    renderState(); // 自分自身の画面も更新
  }

  function hostBroadcastSound(soundType) {
    playSound(soundType);
    connections.forEach(c => c.send({ type: 'PLAY_SOUND', sound: soundType }));
  }

  function hostHandleClientData(data, conn) {
    if (data.type === 'JOIN') {
      if (state.players.length >= 5 && !state.players.some(player => player.id === data.id)) {
        conn.send({ type: 'ROOM_FULL' });
        setTimeout(() => conn.close(), 100);
        return;
      }
      if (!state.players.some(player => player.id === data.id)) {
        state.players.push({ id: data.id, name: data.name });
      }
      updateLobbyUI();
      hostBroadcastState();
    } else if (data.type === 'REQ_HINT') {
      state.hintRequested = true;
      hostBroadcastState();
    } else if (data.type === 'CHANGE_QUESTION') {
      hostChangeQuestion();
    } else if (data.type === 'JUDGE') {
      hostJudge(data.isCorrect);
    } else if (data.type === 'PLAY_AGAIN') {
      hostPlayAgain();
    } else if (data.type === 'END_GAME') {
      hostEndGame();
    }
  }

  // --- ゲスト側のロジック ---
  function guestHandleHostData(data) {
    if (data.type === 'SYNC_STATE') {
      state = data.state;
      renderState();
    } else if (data.type === 'PLAY_SOUND') {
      playSound(data.sound);
    } else if (data.type === 'ROOM_FULL') {
      switchScreen('screen-join');
      document.getElementById('join-error').innerText = 'この部屋は満員です（最大5人）。';
    }
  }


