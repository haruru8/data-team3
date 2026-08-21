  // --- 状態管理 (ホストのみが更新し、全員に配る) ---
  let state = {
    screen: 'home',
    players: [], // { id, name }
    mode: 'intro',
    introQueue: [],
    introTime: 30,
    quizMasterIndex: 0,
    quizAnswererIndex: 1,
    questionText: '',
    changeCount: 0,
    prepTime: 10,
    quizTime: 30,
    hintRequested: false,
    clearStatus: 'none', // none, clear, fail
    answeredPlayerIds: [],
    gamesPlayed: 0,
    gamesCleared: 0
  };

  let myId = '';
  let myName = '';
  let isHost = false;
  let peer = null;
  let connections = []; // ホストが保持するゲスト接続
  let hostConn = null;  // ゲストが保持するホスト接続
  let masterInterval = null;

  // --- 音源再生 (Web Audio API) ---
  function playSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    if (type === 'correct') {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'wrong') {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'explode') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    }
  }

  // --- UI制御 ---
  function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  // --- 画面描画 (ホスト・ゲスト共通) ---
  function renderState() {
    if (state.screen === 'lobby') {
      switchScreen(isHost ? 'screen-create' : 'screen-lobby');
      updateLobbyUI();
    } else {
      switchScreen('screen-' + state.screen);
    }

    if (state.screen === 'intro') {
      document.getElementById('intro-current-name').innerText = state.introQueue[0].name + " さんの番です";
      document.getElementById('intro-timer').innerText = state.introTime;
      document.getElementById('intro-timer').classList.toggle('timer-danger', state.introTime <= 5);
    }
    
    if (state.screen === 'quiz-prep') {
      const masterName = state.players[state.quizMasterIndex].name;
      const answererName = state.players[state.quizAnswererIndex].name;
      const amIMaster = state.players[state.quizMasterIndex].id === myId;
      
      document.getElementById('prep-master').innerText = masterName;
      document.getElementById('prep-answerer').innerText = answererName;
      document.getElementById('prep-timer').innerText = state.prepTime;
      
      if (amIMaster) {
        document.getElementById('prep-master-ui').style.display = 'block';
        document.getElementById('prep-guest-ui').style.display = 'none';
        document.getElementById('prep-question-text').innerText = state.questionText;
        document.getElementById('prep-change-count').innerText = `残り変更回数: ${2 - state.changeCount}回`;
        document.getElementById('btn-change-q').disabled = false;
        document.getElementById('btn-change-q').innerText = state.changeCount >= 2
          ? 'もう換えられません' : '問題を変更する';
      } else {
        document.getElementById('prep-master-ui').style.display = 'none';
        document.getElementById('prep-guest-ui').style.display = 'block';
      }
    }
    
    if (state.screen === 'quiz') {
      const amIMaster = state.players[state.quizMasterIndex].id === myId;
      const amIAnswerer = state.players[state.quizAnswererIndex].id === myId;
      
      document.getElementById('quiz-question-text').innerText = state.questionText;
      document.getElementById('quiz-answerer-name').innerText = state.players[state.quizAnswererIndex].name;
      
      // 爆弾と時間表示
      const timeDisplay = document.getElementById('quiz-time-display');
      timeDisplay.innerText = state.quizTime;
      if (state.quizTime <= 5) {
        timeDisplay.classList.add('timer-danger');
      } else {
        timeDisplay.classList.remove('timer-danger');
      }
      
      const bomb = document.getElementById('bomb');
      const travel = 160;
      bomb.style.top = (travel * ((30 - state.quizTime) / 30)) + 'px';

      // ヒントアラート
      const alertBox = document.getElementById('quiz-alert');
      if (state.hintRequested && amIMaster) {
        alertBox.innerText = "💡 回答者がヒントを求めています！答えの頭文字などを教えてあげましょう！";
      } else {
        alertBox.innerText = "";
      }

      // UI出し分け
      document.getElementById('quiz-master-ui').style.display = amIMaster ? 'block' : 'none';
      document.getElementById('quiz-guest-ui').style.display = amIAnswerer ? 'block' : 'none';
      const hintButton = document.getElementById('btn-hint');
      hintButton.disabled = state.quizTime > 20 || state.hintRequested;
      hintButton.innerText = state.hintRequested
        ? 'ヒントをお願いしました'
        : state.quizTime > 20 ? `あと${state.quizTime - 20}秒でヒントを使えます` : 'ヒントをもらう';
    }
    
    if (state.screen === 'explanation') {
      const amIMaster = state.players[state.quizMasterIndex].id === myId;
      
      if (state.clearStatus === 'clear') {
        document.getElementById('exp-title').innerText = "🎉 全員正解クリア！";
        document.getElementById('exp-title').style.color = "#4CAF50";
        document.getElementById('exp-subtitle').innerText = "なぜそれが好きか、理由を話してください";
      } else {
        document.getElementById('exp-title').innerText = "💥 タイムアップ...";
        document.getElementById('exp-title').style.color = "#f44336";
        document.getElementById('exp-subtitle').innerText = "正解を発表してください";
      }
      
      document.getElementById('exp-host-ui').style.display = amIMaster ? 'block' : 'none';
      document.getElementById('exp-guest-ui').style.display = !amIMaster ? 'block' : 'none';
    }

    if (state.screen === 'end') {
      document.getElementById('end-score').innerText = `${state.gamesPlayed}問中 ${state.gamesCleared}問クリア`;
    }
  }

  function returnToTop() {
    if (peer) peer.destroy();
    location.reload();
  }
