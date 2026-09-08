const questionBank=[
  {question:'Столица России?',options:['Москва','Санкт-Петербург','Казань','Новосибирск'],answer:'Москва'},
  {question:'Сколько планет в Солнечной системе?',options:['7','8','9','10'],answer:'8'},
  {question:'Какая гора самая высокая над уровнем моря?',options:['Эверест','К2','Эльбрус','Монблан'],answer:'Эверест'},
  {question:'Сколько дней в високосном году?',options:['365','366','364','367'],answer:'366'},
  {question:'Какая планета известна как Красная?',options:['Марс','Венера','Юпитер','Сатурн'],answer:'Марс'},
  {question:'Сколько цветов обычно выделяют в радуге?',options:['5','6','7','8'],answer:'7'},
  {question:'На каком языке говорят в Бразилии?',options:['португальский','испанский','французский','английский'],answer:'португальский'},
  {question:'Столица Японии?',options:['Токио','Киото','Осака','Нагойя'],answer:'Токио'},
  {question:'Какая планета ближе всего к Солнцу?',options:['Меркурий','Венера','Земля','Марс'],answer:'Меркурий'},
  {question:'Сколько минут в двух часах?',options:['60','90','120','180'],answer:'120'},
  {question:'Какой океан самый большой?',options:['Тихий','Атлантический','Индийский','Северный Ледовитый'],answer:'Тихий'},
  {question:'Какой газ преобладает в атмосфере Земли?',options:['азот','кислород','углекислый газ','водород'],answer:'азот'},
  {question:'Сколько сторон у шестиугольника?',options:['5','6','7','8'],answer:'6'},
  {question:'Кто написал «Войну и мир»?',options:['Лев Толстой','Антон Чехов','Александр Пушкин','Иван Тургенев'],answer:'Лев Толстой'},
  {question:'Как называется спутник Земли?',options:['Луна','Фобос','Европа','Титан'],answer:'Луна'},
  {question:'Сколько граммов в килограмме?',options:['100','500','1000','10000'],answer:'1000'},
  {question:'Какой металл обозначается символом Fe?',options:['железо','медь','серебро','олово'],answer:'железо'},
  {question:'Какое число является квадратом 9?',options:['18','27','81','99'],answer:'81'},
  {question:'На каком материке находится Египет?',options:['Африка','Азия','Европа','Южная Америка'],answer:'Африка'},
  {question:'Как называется процесс превращения воды в пар?',options:['испарение','замерзание','конденсация','плавление'],answer:'испарение'},
];
const quizContainer=document.getElementById('quiz');const resultContainer=document.getElementById('result');const qIndex=document.getElementById('q-index');const qScore=document.getElementById('q-score');const progress=document.getElementById('q-progress');
let __hubDone=false,currentQuestion=0,score=0,locked=false;
function hubScore(s){window.parent.postMessage({__hub:1,type:'score',value:s},'*')}function hubFinish(s){if(__hubDone)return;__hubDone=true;window.parent.postMessage({__hub:1,type:'finish',score:s},'*')}
const __hubParams=new URLSearchParams(location.search);const __hubSeed=__hubParams.get('seed');function __hubHash(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19)}return h>>>0}let __hubSeedState=__hubSeed?__hubHash(__hubSeed):0;function __hubRand(){if(!__hubSeed)return Math.random();let t=(__hubSeedState+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
function shuffleArray(array){for(let i=array.length-1;i>0;i--){const j=Math.floor(__hubRand()*(i+1));[array[i],array[j]]=[array[j],array[i]]}}
shuffleArray(questionBank);const quizData=questionBank.slice(0,10);
function displayQuestion(){
  locked=false;const q=quizData[currentQuestion];qIndex.textContent=`${currentQuestion+1}/${quizData.length}`;qScore.textContent=String(score);progress.style.width=`${((currentQuestion+1)/quizData.length)*100}%`;quizContainer.innerHTML='';resultContainer.textContent='';
  const title=document.createElement('div');title.className='question';title.textContent=q.question;const options=document.createElement('div');options.className='options';const values=[...q.options];shuffleArray(values);
  values.forEach((value)=>{const b=document.createElement('button');b.type='button';b.className='option';b.textContent=value;b.addEventListener('click',()=>chooseAnswer(value,b,options));options.appendChild(b)});quizContainer.appendChild(title);quizContainer.appendChild(options);const feedback=document.createElement('div');feedback.className='answer-feedback';feedback.id='answer-feedback';quizContainer.appendChild(feedback);
}
function chooseAnswer(value,button,options){
  if(locked)return;locked=true;const q=quizData[currentQuestion];const ok=value===q.answer;if(ok){score++;button.classList.add('correct')}else{button.classList.add('wrong');[...options.children].forEach((b)=>{if(b.textContent===q.answer)b.classList.add('correct')})}[...options.children].forEach((b)=>{b.disabled=true});qScore.textContent=String(score);hubScore(score);const feedback=document.getElementById('answer-feedback');if(feedback)feedback.textContent=ok?'Верно ✦':`Правильный ответ: ${q.answer}`;
  setTimeout(()=>{currentQuestion++;if(currentQuestion<quizData.length)displayQuestion();else{quizContainer.innerHTML='';resultContainer.textContent=`Готово: ${score} из ${quizData.length}`;hubFinish(score)}},520);
}
displayQuestion();
