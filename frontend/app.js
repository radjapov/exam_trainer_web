document.addEventListener("DOMContentLoaded", () => {
  const subjectSelect = document.getElementById("subject");
  const questionSelect = document.getElementById("question");
  const questionText = document.getElementById("questionText");
  const notesEl = document.getElementById("notes");
  const resultEl = document.getElementById("result");
  const timerEl = document.getElementById("timer");

  let questions = [];

  // ===== экзамен =====
  let examMode = false;
  let examAnswers = {};
  let examTimer = null;

  /* ==========================
     ЗАГРУЗКА ПРЕДМЕТОВ
  ========================== */
  fetch("/subjects")
    .then(r => r.json())
    .then(subjects => {
      subjectSelect.innerHTML = "";
      subjects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        subjectSelect.appendChild(opt);
      });
      if (subjects.length > 0) loadQuestions(subjects[0]);
    })
    .catch(err => {
      console.error("Ошибка загрузки предметов", err);
      resultEl.textContent = "Ошибка загрузки предметов";
    });

  /* ==========================
     ОБЫЧНЫЙ РЕЖИМ
  ========================== */
  function loadQuestions(subject) {
    examMode = false;
    examAnswers = {};
    clearTimer();

    fetch(`/questions/${subject}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error("Questions is not array");
        }
        questions = data;
        renderList(data);
        if (data.length > 0) showQuestion(0);
      })
      .catch(err => {
        console.error(err);
        resultEl.textContent = "Ошибка загрузки вопросов";
      });
  }

  function renderList(qs) {
    questionSelect.innerHTML = "";
    qs.forEach((q, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = q.title || `Вопрос ${i + 1}`;
      questionSelect.appendChild(opt);
    });
  }

  /* ==========================
     СТАРТ ЭКЗАМЕНА
  ========================== */
  window.startExam = async function () {
    try {
      const subject = subjectSelect.value;
      const res = await fetch(`/exam/${subject}`);
      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      examMode = true;
      examAnswers = {};
      questions = [];

      function addBlock(block, qs) {
        if (!Array.isArray(qs)) return;
        qs.forEach(q => {
          questions.push({
            ...q,
            _examBlock: block,
            _examId: `${block}_${q.id}`
          });
        });
      }

      addBlock("A", data.A);
      addBlock("B", data.B);
      addBlock("C", data.C);

      renderList(questions);
      showQuestion(0);
      startTimer(3 * 60 * 60);
    } catch (e) {
      console.error(e);
      resultEl.textContent = "Ошибка запуска экзамена";
    }
  };

  /* ==========================
     ПОКАЗ ВОПРОСА
  ========================== */
  function showQuestion(index) {
    const q = questions[index];
    if (!q) return;

    questionText.textContent =
      (q.body || "") + (q.explanation ? "\n\n" + q.explanation : "");

    notesEl.value =
      examMode && examAnswers[q._examId]?.text
        ? examAnswers[q._examId].text
        : "";

    resultEl.textContent = "";
  }

  subjectSelect.addEventListener("change", () => {
    loadQuestions(subjectSelect.value);
  });

  questionSelect.addEventListener("change", () => {
    showQuestion(Number(questionSelect.value));
  });

  /* ==========================
     ПРОВЕРКА ОТВЕТА
  ========================== */
  window.checkAnswer = async function () {
    const index = Number(questionSelect.value);
    const q = questions[index];

    if (!q || !Array.isArray(q.checkpoints)) {
      resultEl.textContent = "Нет чекпоинтов для проверки";
      return;
    }

    const text = notesEl.value.trim();
    if (!text) {
      alert("Ответ пустой. Напиши объяснение.");
      return;
    }

    // ----- лимиты экзамена -----
    if (examMode && q._examId) {
      const block = q._examBlock;
      const limit = block === "A" ? 3 : block === "B" ? 2 : 1;

      const used = Object.values(examAnswers)
        .filter(a => a.block === block).length;

      if (!examAnswers[q._examId] && used >= limit) {
        alert(`Лимит блока ${block} исчерпан`);
        return;
      }
    }

    let data;
    try {
      const res = await fetch("/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: text,
          checkpoints: q.checkpoints
        })
      });

      data = await res.json();
    } catch (e) {
      console.error(e);
      resultEl.textContent = "Ошибка проверки (сервер недоступен)";
      return;
    }

    // ----- ЖЁСТКАЯ ПРОВЕРКА ФОРМАТА -----
    let results = null;

    if (Array.isArray(data.result)) {
      results = data.result;
    } else if (Array.isArray(data.details)) {
      results = data.details;
    } else {
      console.error("Неверный формат /check:", data);
      resultEl.textContent = "Ошибка проверки (неверный формат ответа)";
      return;
    }

    let out = "";
    const missed = [];

    results.forEach(r => {
      out += (r.hit ? "✔ " : "✘ ") + r.checkpoint + "\n";
      if (!r.hit) missed.push(r.checkpoint);
    });

    const coverage = typeof data.coverage === "number" ? data.coverage : 0;
    out += `\nПокрытие: ${coverage}%\n`;

    if (missed.length) {
      out += "\nГде провалился:\n";
      missed.forEach(m => out += `- ${m}\n`);
    }

    resultEl.textContent = out;

    if (examMode && q._examId) {
      examAnswers[q._examId] = {
        text,
        block: q._examBlock,
        coverage,
        missed
      };
    }
  };

  /* ==========================
     ТАЙМЕР
  ========================== */
  function startTimer(seconds) {
    clearTimer();
    let remaining = seconds;
    timerEl.textContent = formatTime(remaining);

    examTimer = setInterval(() => {
      remaining--;
      timerEl.textContent = formatTime(remaining);

      if (remaining <= 0) {
        clearTimer();
        finishExam();
      }
    }, 1000);
  }

  function clearTimer() {
    if (examTimer) {
      clearInterval(examTimer);
      examTimer = null;
    }
    timerEl.textContent = "";
  }

  function finishExam() {
    examMode = false;

    let total = 0;
    let count = 0;
    const repeat = {};

    Object.values(examAnswers).forEach(a => {
      total += a.coverage;
      count++;
      a.missed.forEach(m => {
        repeat[m] = (repeat[m] || 0) + 1;
      });
    });

    const score = count ? Math.round(total / count) : 0;

    let out = `ИТОГ ЭКЗАМЕНА\n\n`;
    out += `Средний результат: ${score}%\n\n`;
    out += `Что повторить:\n`;

    Object.keys(repeat)
      .sort((a, b) => repeat[b] - repeat[a])
      .forEach(r => out += `- ${r}\n`);

    resultEl.textContent = out;
    alert("Экзамен завершён");
  }

  function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
});