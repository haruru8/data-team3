  const questionBank = [
    "日本で一番高い山は？",
    "私が一番好きな食べ物は？",
    "一番最近行った旅行先は？",
    "私の趣味はなんでしょう？",
    "1+1は？（ひっかけなし）"
  ];

  function hostConfirmRoom() {
    if (state.players.length < 2) {
      document.getElementById('host-error').innerText = 'もう1人の入室を待ってください。';
      return;
    }
    state.mode = document.getElementById('game-mode').value;
    if (state.mode === 'intro') {
      // 順番をシャッフル
      state.introQueue = [...state.players].sort(() => Math.random() - 0.5);
      state.screen = 'intro';
      state.introTime = 30; //自己紹介の時間設定
    } else {
      setupQuizPrep();
    }
    startMasterLoop();
    hostBroadcastState();
  }

  function setupQuizPrep() {
    state.screen = 'quiz-prep';
    state.prepTime = 10;
    state.changeCount = 0;
    state.hintRequested = false;
    state.answeredPlayerIds = [];
    state.questionText = questionBank[Math.floor(Math.random() * questionBank.length)];
    // 回答者は出題者の次の人
    state.quizAnswererIndex = (state.quizMasterIndex + 1) % state.players.length;
  }

  function hostChangeQuestion() {
    if (!isHost) {
      hostConn.send({ type: 'CHANGE_QUESTION' });
      return;
    }
    if (state.changeCount < 2) {
      state.changeCount++;
      const candidates = questionBank.filter(question => question !== state.questionText);
      state.questionText = candidates[Math.floor(Math.random() * candidates.length)];
      hostBroadcastState();
    } else {
      document.getElementById('prep-change-count').innerText = '問題はもう換えられません。';
    }
  }

  function hostJudge(isCorrect) {
    if (!isHost) {
      hostConn.send({ type: 'JUDGE', isCorrect });
      return;
    }
    if (isCorrect) {
      hostBroadcastSound('correct');
      state.hintRequested = false;
      const answerer = state.players[state.quizAnswererIndex];
      if (!state.answeredPlayerIds.includes(answerer.id)) state.answeredPlayerIds.push(answerer.id);
      if (state.answeredPlayerIds.length >= state.players.length - 1) {
        state.screen = 'explanation';
        state.clearStatus = 'clear';
        state.gamesPlayed++;
        state.gamesCleared++;
      } else {
        do {
          state.quizAnswererIndex = (state.quizAnswererIndex + 1) % state.players.length;
        } while (state.quizAnswererIndex === state.quizMasterIndex ||
                 state.answeredPlayerIds.includes(state.players[state.quizAnswererIndex].id));
      }
    } else {
      hostBroadcastSound('wrong');
    }
    hostBroadcastState();
  }

  function hostPlayAgain() {
    if (!isHost) {
      hostConn.send({ type: 'PLAY_AGAIN' });
      return;
    }
    state.quizMasterIndex = (state.quizMasterIndex + 1) % state.players.length;
    setupQuizPrep();
    hostBroadcastState();
  }

  function hostEndGame() {
    if (!isHost) {
      hostConn.send({ type: 'END_GAME' });
      return;
    }
    state.screen = 'end';
    hostBroadcastState();
    clearInterval(masterInterval);
  }

  // ホストのメインループ (1秒に1回実行)
  function startMasterLoop() {
    if(masterInterval) clearInterval(masterInterval);
    masterInterval = setInterval(() => {
      
      if (state.screen === 'intro') {
        state.introTime--;
        if (state.introTime <= 0) {
          state.introQueue.shift();
          if (state.introQueue.length > 0) {
            state.introTime = 30; // 次の人
          } else {
            setupQuizPrep(); // 全員終わったらクイズへ
          }
        }
        hostBroadcastState();
      } 
      else if (state.screen === 'quiz-prep') {
        state.prepTime--;
        if (state.prepTime <= 0) {
          state.screen = 'quiz';
          state.quizTime = state.players.length * 5;
        }
        hostBroadcastState();
      }
      else if (state.screen === 'quiz') {
        state.quizTime--;
        if (state.quizTime <= 0) {
          hostBroadcastSound('explode');
          state.screen = 'explanation';
          state.clearStatus = 'fail';
          state.gamesPlayed++;
        }
        hostBroadcastState();
      }
    }, 1000);
  }

  function clientRequestHint() {
    if (!isHost) {
      hostConn.send({ type: 'REQ_HINT' });
    } else {
      state.hintRequested = true;
      hostBroadcastState();
    }
  }


