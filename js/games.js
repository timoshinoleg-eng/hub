/** Единый продуктовый манифест игр. */
export const GAMES = [
  {
    id:'merge',title:'Мердж 2048',tagline:'Соединяй плитки и строй комбо',emoji:'🔢',enabled:true,unit:'очков',
    genre:'ЛОГИКА',length:'2–5 мин',accent:'#ffb44c',accent2:'#ff7b58',
    howTo:'Свайпай в любую сторону — одинаковые плитки соединяются.',
    cfg:{scoreSelector:'#score',finishSelector:'#result',preventScroll:true},
  },
  {
    id:'reaction',title:'Реакция',tagline:'30 секунд чистого рефлекса',emoji:'⚡',enabled:true,unit:'попаданий',
    genre:'СКОРОСТЬ',length:'30 сек',accent:'#ff5f7e',accent2:'#ffbd59',
    howTo:'Бей по целям, пока они видны. Чем дольше серия — тем выше темп.',
    cfg:{scoreSelector:'.score',preventScroll:true},
  },
  {
    id:'snake',title:'Змейка',tagline:'Собирай еду и не врежься',emoji:'🐍',enabled:true,unit:'очков',
    genre:'АРКАДА',length:'1–3 мин',accent:'#57da84',accent2:'#28c9b7',
    howTo:'Свайпай в нужную сторону. Не разворачивайся прямо в себя.',
    cfg:{scoreSelector:'.score',preventScroll:true},
  },
  {
    id:'sapper',title:'Сапёр',tagline:'Один расклад на всех сегодня',emoji:'💣',enabled:true,unit:'очков',
    genre:'DAILY',length:'2–4 мин',accent:'#9c83ff',accent2:'#6b73ff',
    howTo:'Тап открывает клетку. Флагом отмечай места, где подозреваешь мину.',
    cfg:{preventContextMenu:true,preventScroll:true,daily:true},
  },
  {
    id:'quiz',title:'Квиз дня',tagline:'20 вопросов на эрудицию',emoji:'❓',enabled:true,unit:'правильных',
    genre:'DAILY',length:'2–4 мин',accent:'#4d96ff',accent2:'#4ce3e8',
    howTo:'Выбирай один ответ. В daily порядок одинаков для всех в течение дня.',
    cfg:{preventScroll:true,daily:true},
  },
  {
    id:'echo',title:'Эхо',tagline:'Запомни и повтори ритм',emoji:'🔔',enabled:true,unit:'уровней',
    genre:'ПАМЯТЬ',length:'1–3 мин',accent:'#ff70c8',accent2:'#a76cff',
    howTo:'Смотри на последовательность цветов, затем повторяй её без ошибки.',
    cfg:{preventScroll:true},
  },
  {
    id:'memory',title:'Пары',tagline:'Найди 8 пар за минимум ходов',emoji:'🧠',enabled:true,unit:'ходов',
    genre:'ПАМЯТЬ',length:'1–3 мин',accent:'#20cdb6',accent2:'#49a8ff',
    howTo:'Открывай по две карточки и запоминай их позиции. Меньше ходов — лучше.',
    cfg:{preventScroll:true,higherIsBetter:false},
  },
];
export const byId=(id)=>GAMES.find((g)=>g.id===id);
export const visible=(showAll)=>GAMES.filter((g)=>showAll||g.enabled);
