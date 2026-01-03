document.addEventListener("DOMContentLoaded", () => {
  const subjectSelect = document.getElementById("subject");
  const questionSelect = document.getElementById("question");
  const questionText = document.getElementById("questionText");
  const notesEl = document.getElementById("notes");
  const resultEl = document.getElementById("result");
  const timerEl = document.getElementById("timer");

  let questions = [];

  // ===== экзамен =====
  let exam = null;
  let examMode = false;

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
    })
    .catch(err => {
      console.error("Ошибка загрузки предметов", err);
    });

  // ---------- загрузка вопросов (обычный режим) ----------
  function loadQuestions(subject) {
    examMode = false;
    exam = null;
    localStorage.removeItem("exam");

    fetch(`/questions/${subject}`)
      .then(r => r.json())
      .then(data => {
        questions = data;
        renderQuestionList(data);
        if (data.length > 0) showQuestion(0);
        timerEl.textContent = "";
      });
  }

  // ---------- экзамен ----------
  window.startExam = function () {
    const subject = subjectSelect.value;
    if (!subject) {
      alert("Выбери предмет");
      return;
    }

    fetch(`/exam/${subject}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
          return;
        }

        examMode = true;
        exam = {
          started: true,
          startTime: Date.now(),
          duration: 3 * 60 * 60, // 3 часа (можно временно 600)
          blocks: data,
          answers: {}
        };

        localStorage.setItem("exam", JSON.stringify(exam));
        renderExam();
        startTimer();
      });
  };

  // ---------- отрисовка списка ----------
  function renderQuestionList(qs) {
    questionSelect.innerHTML = "";
    qs.forEach((q, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = q.title;
      questionSelect.appendChild(opt);
    });
  }

  function renderExam() {
    questionSelect.innerHTML = "";
    questions = [];

    function header(text) {
      const opt = document.createElement("option");
      opt.textContent = text;
      opt.disabled = true;
      questionSelect.appendChild(opt);
    }

    function addQuestion(q) {
      questions.push(q);
      const opt = document.createElement("option");
      opt.value = q.id;
      opt.textContent = q.title;
      questionSelect.appendChild(opt);
    }

    header("БЛОК A (ответить на 3 из 4)");
    exam.blocks.A.forEach(addQuestion);

    header("БЛОК B (ответить на 2 из 3)");
    exam.blocks.B.forEach(addQuestion);

    header("БЛОК C (обязательный)");
    exam.blocks.C.forEach(addQuestion);
  }

  // ---------- показать вопрос ----------
  function showQuestion(index) {
    const q = examMode
      ? questions.find(x => x.id == index)
      : questions[index];

    if (!q) return;

    questionText.textContent =
      q.body + (q.explanation ? "\n\n" + q.explanation : "");

    if (examMode && exam.answers[q.id]) {
      notesEl.value = exam.answers[q.id];
    } else {
      notesEl.value = "";
    }

    resultEl.textContent = "";
  }

  // ---------- события ----------
  subjectSelect.addEventListener("change", () => {
    loadQuestions(subjectSelect.value);
  });

  questionSelect.addEventListener("change", () => {
    showQuestion(questionSelect.value);
  });

  // ---------- экзамен: блок ----------
  function getExamBlock(question) {
    if (exam.blocks.A.find(q => q.id === question.id)) return "A";
    if (exam.blocks.B.find(q => q.id === question.id)) return "B";
    if (exam.blocks.C.find(q => q.id === question.id)) return "C";
    return null;
  }

  function countAnswered(block) {
    return Object.keys(exam.answers).filter(qid => {
      const q = exam.blocks[block].find(x => x.id == qid);
      return q && exam.answers[qid].trim() !== "";
    }).length;
  }

  // ---------- проверка ----------
  window.checkAnswer = async function () {
    const q = examMode
      ? questions.find(x => x.id == questionSelect.value)
      : questions[questionSelect.value];

    if (!q || !q.checkpoints) {
      resultEl.textContent = "Нет чекпоинтов";
      return;
    }

    // --- экзаменационные ограничения ---
    if (examMode) {
      const block = getExamBlock(q);
      const text = notesEl.value.trim();
      const limit = block === "A" ? 3 : block === "B" ? 2 : 1;

      if (!exam.answers[q.id] && text !== "") {
        if (countAnswered(block) >= limit) {
          alert(`Лимит блока ${block} исчерпан`);
          return;
        }
      }

      exam.answers[q.id] = text;
      localStorage.setItem("exam", JSON.stringify(exam));
    }

    // --- проверка ---
    const res = await fetch("/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: notesEl.value,
        checkpoints: q.checkpoints
      })
    });

    const data = await res.json();

    let text = "";
    data.result.forEach(r => {
      text += (r.hit ? "✔ " : "✘ ") + r.checkpoint + "\n";
    });
    text += "\nПокрытие: " + data.coverage + "%";

    resultEl.textContent = text;
  };

  // ---------- таймер ----------
  function startTimer() {
    const interval = setInterval(() => {
      if (!exam || !exam.started) {
        clearInterval(interval);
        return;
      }

      const elapsed = Math.floor((Date.now() - exam.startTime) / 1000);
      const left = exam.duration - elapsed;

      if (left <= 0) {
        alert("Время вышло");
        exam.started = false;
        localStorage.removeItem("exam");
        timerEl.textContent = "00:00:00";
        clearInterval(interval);
        return;
      }

      const h = String(Math.floor(left / 3600)).padStart(2, "0");
      const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
      const s = String(left % 60).padStart(2, "0");

      timerEl.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }
});