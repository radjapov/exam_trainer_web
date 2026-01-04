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
  // {
  //   "A_12": { coverage: 80, missed: ["file sharing"] }
  // }

  // ---------- загрузка предметов ----------
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
      if (subjects.length > 0) {
        loadQuestions(subjects[0]);
      }
    });

  // ---------- обычный режим ----------
  function loadQuestions(subject) {
    examMode = false;
    examAnswers = {};
    timerEl.textContent = "";

    fetch(`/questions/${subject}`)
      .then(r => r.json())
      .then(data => {
        questions = data;
        renderList(data);
        if (data.length > 0) showQuestion(0);
      });
  }

  function renderList(qs) {
    questionSelect.innerHTML = "";
    qs.forEach((q, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = q.title;
      questionSelect.appendChild(opt);
    });
  }

  // ---------- старт экзамена ----------
  window.startExam = async function () {
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
      qs.forEach(q => {
        q._examId = `${block}_${q.id}`;
        questions.push(q);
      });
    }

    addBlock("A", data.A);
    addBlock("B", data.B);
    addBlock("C", data.C);

    renderList(questions);
    showQuestion(0);
    startTimer(3 * 60 * 60);
  };

  // ---------- показать вопрос ----------
  function showQuestion(index) {
    const q = questions[index];
    if (!q) return;

    questionText.textContent =
      q.body + (q.explanation ? "\n\n" + q.explanation : "");

    notesEl.value = "";
    resultEl.textContent = "";
  }

  subjectSelect.addEventListener("change", () => {
    loadQuestions(subjectSelect.value);
  });

  questionSelect.addEventListener("change", () => {
    showQuestion(Number(questionSelect.value));
  });

  // ---------- проверка ----------
  window.checkAnswer = async function () {
    const index = Number(questionSelect.value);
    const q = questions[index];

    if (!q || !q.checkpoints) {
      resultEl.textContent = "Нет чекпоинтов";
      return;
    }

    const text = notesEl.value.trim();

    // ❗ проверка на пустой ответ
    if (text.length === 0) {
      alert("Ответ пустой. Напиши объяснение.");
      return;
    }

    // ---------- лимиты экзамена ----------
    if (examMode && q._examId) {
      const block = q._examId.split("_")[0];
      const limit = block === "A" ? 3 : block === "B" ? 2 : 1;

      if (!examAnswers[q._examId]) {
        const used = Object.keys(examAnswers)
          .filter(k => k.startsWith(block)).length;

        if (used >= limit) {
          alert(`Лимит блока ${block} исчерпан`);
          return;
        }
      }
    }

    // ---------- проверка ----------
    const res = await fetch("/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: text,
        checkpoints: q.checkpoints
      })
    });

    const data = await res.json();

    // ---------- вывод ----------
    let out = "";
    const missed = [];

    data.result.forEach(r => {
      out += (r.hit ? "✔ " : "✘ ") + r.checkpoint + "\n";
      if (!r.hit) missed.push(r.checkpoint);
    });

    out += `\nПокрытие: ${data.coverage}%\n`;

    resultEl.textContent = out;

    // ---------- сохранить результат экзамена ----------
    if (examMode && q._examId) {
      examAnswers[q._examId] = {
        coverage: data.coverage,
        missed
      };
    }
  };

  // ---------- таймер ----------
  function startTimer(seconds) {
    let remaining = seconds;
    timerEl.textContent = formatTime(remaining);

    const interval = setInterval(() => {
      remaining--;
      timerEl.textContent = formatTime(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        finishExam();
      }
    }, 1000);
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
      .forEach(r => {
        out += `- ${r}\n`;
      });

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