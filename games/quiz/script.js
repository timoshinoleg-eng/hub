const quizData = [
  { question: "Столица России?", options: ["Москва", "Санкт-Петербург", "Казань", "Новосибирск"], answer: "Москва" },
  { question: "Сколько планет в Солнечной системе?", options: ["7", "8", "9", "10"], answer: "8" },
  { question: "Какая гора самая высокая?", options: ["Эверест", "К2", "Эльбрус", "Монблан"], answer: "Эверест" },
  { question: "Сколько континентов на Земле?", options: ["5", "6", "7", "8"], answer: "7" },
  { question: "Кто автор «Войны и мира»?", options: ["Толстой", "Достоевский", "Чехов", "Тургенев"], answer: "Толстой" },
  { question: "Сколько дней в високосном году?", options: ["365", "366", "364", "367"], answer: "366" },
  { question: "Какая планета «красная»?", options: ["Марс", "Венера", "Юпитер", "Сатурн"], answer: "Марс" },
  { question: "Кто написал музыку гимна России?", options: ["Александров", "Чайковский", "Глинка", "Моцарт"], answer: "Александров" },
  { question: "Сколько цветов в радуге?", options: ["5", "6", "7", "8"], answer: "7" },
  { question: "Какое озеро самое большое?", options: ["Каспийское", "Байкал", "Виктория", "Онтарио"], answer: "Каспийское" },
  { question: "На каком языке говорят в Бразилии?", options: ["португальский", "испанский", "французский", "английский"], answer: "португальский" },
  { question: "Сколько месяцев в году?", options: ["10", "11", "12", "13"], answer: "12" },
  { question: "Столица Японии?", options: ["Токио", "Киото", "Осака", "Нагойя"], answer: "Токио" },
  { question: "Кто изобрёл лампочку?", options: ["Эдисон", "Ньютон", "Эйнштейн", "Гальвани"], answer: "Эдисон" },
  { question: "Какая планета ближе всего к Солнцу?", options: ["Меркурий", "Венера", "Земля", "Марс"], answer: "Меркурий" },
  { question: "Сколько часов в сутках?", options: ["12", "24", "36", "48"], answer: "24" },
  { question: "Какое животное — «царь зверей»?", options: ["лев", "тигр", "медведь", "волк"], answer: "лев" },
  { question: "Сколько сторон у треугольника?", options: ["3", "4", "5", "6"], answer: "3" },
  { question: "Какая стихия нужна всем живым существам?", options: ["вода", "бензин", "молоко", "сок"], answer: "вода" },
  { question: "Кто летает выше всех?", options: ["птица", "самолёт", "ракета", "воздушный шар"], answer: "ракета" },
];

const quizContainer = document.getElementById("quiz");
const resultContainer = document.getElementById("result");
const submitButton = document.getElementById("submit");
const retryButton = document.getElementById("retry");
const showAnswerButton = document.getElementById("showAnswer");

let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }
let currentQuestion = 0;
let score = 0;
let incorrectAnswers = [];

const __hubParams = new URLSearchParams(location.search);
const __hubSeed = __hubParams.get("seed");
function __hubHash(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0); }
let __hubSeedState = __hubSeed ? __hubHash(__hubSeed) : 0;
function __hubRand() {
  if (!__hubSeed) return Math.random();
  let t = (__hubSeedState += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(__hubRand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function displayQuestion() {
  const questionData = quizData[currentQuestion];
  const questionElement = document.createElement("div");
  questionElement.className = "question";
  questionElement.textContent = `${currentQuestion + 1}. ${questionData.question}`;
  const optionsElement = document.createElement("div");
  optionsElement.className = "options";
  const shuffledOptions = [...questionData.options];
  shuffleArray(shuffledOptions);
  for (const value of shuffledOptions) {
    const option = document.createElement("label");
    option.className = "option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "quiz";
    radio.value = value;
    option.appendChild(radio);
    option.appendChild(document.createTextNode(value));
    optionsElement.appendChild(option);
  }
  quizContainer.innerHTML = "";
  quizContainer.appendChild(questionElement);
  quizContainer.appendChild(optionsElement);
}

function checkAnswer() {
  const selectedOption = document.querySelector('input[name="quiz"]:checked');
  if (!selectedOption) return;
  const answer = selectedOption.value;
  if (answer === quizData[currentQuestion].answer) score++;
  else incorrectAnswers.push({ question: quizData[currentQuestion].question, incorrectAnswer: answer, correctAnswer: quizData[currentQuestion].answer });
  currentQuestion++;
  if (currentQuestion < quizData.length) displayQuestion();
  else displayResult();
}

function displayResult() {
  quizContainer.style.display = "none";
  submitButton.style.display = "none";
  retryButton.style.display = "inline-block";
  showAnswerButton.style.display = "inline-block";
  resultContainer.textContent = `Ваш результат: ${score} из ${quizData.length}`;
  hubScore(score);
  hubFinish(score);
}

function retryQuiz() {
  currentQuestion = 0;
  score = 0;
  incorrectAnswers = [];
  __hubDone = false;
  quizContainer.style.display = "block";
  submitButton.style.display = "inline-block";
  retryButton.style.display = "none";
  showAnswerButton.style.display = "none";
  resultContainer.textContent = "";
  shuffleArray(quizData);
  displayQuestion();
}

function showAnswer() {
  quizContainer.style.display = "none";
  submitButton.style.display = "none";
  retryButton.style.display = "inline-block";
  showAnswerButton.style.display = "none";
  resultContainer.innerHTML = `<p>Ваш результат: ${score} из ${quizData.length}.</p>`;
  const title = document.createElement('p');
  title.textContent = 'Ошибки:';
  resultContainer.appendChild(title);
  for (const item of incorrectAnswers) {
    const p = document.createElement('p');
    p.textContent = `${item.question} Ваш ответ: ${item.incorrectAnswer}. Правильный: ${item.correctAnswer}.`;
    resultContainer.appendChild(p);
  }
}

submitButton.addEventListener("click", checkAnswer);
retryButton.addEventListener("click", retryQuiz);
showAnswerButton.addEventListener("click", showAnswer);
shuffleArray(quizData);
displayQuestion();
