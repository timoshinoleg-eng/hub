/** Единый продуктовый манифест игр. */
const SHELL_THEME = `
html,body{font-size:16px!important}
main,.wrapper,.container,.qwrap{padding-top:8px!important}
.rhead,.qhead{display:none!important}
.shead span,.shead h1,.mhead span,.mhead h1,.mhead p,.ehead span,.ehead h1{display:none!important}
.shead{margin:0 0 7px!important}
.shead p,.ehead p{font-size:13px!important;line-height:1.35!important;margin:0 0 7px!important;color:#a9b0c0!important}
.mhead{margin:0!important;min-height:0!important;justify-content:flex-end!important}
.mhead>div:first-child{min-width:0!important}
.hud small,.shud small,.ehud small,.mhud small,.score-container small{font-size:10px!important}
.game-details,.qhud{font-size:12px!important}
#level-message,#memory-status,.answer-feedback{font-size:12px!important}
.mole::before{
  content:""!important;display:block!important;width:68%!important;aspect-ratio:1!important;border-radius:50%!important;
  background:radial-gradient(circle,#fff 0 9%,#ff5f7e 10% 24%,#fff 25% 39%,#ff9f58 40% 58%,#2a2436 59% 100%)!important;
  box-shadow:0 10px 18px rgba(0,0,0,.32),0 0 0 3px rgba(255,255,255,.06)!important;
}
@media(max-width:380px){
  .hud small,.shud small,.ehud small,.mhud small,.score-container small{font-size:9.5px!important}
  .game-details,.qhud{font-size:11.5px!important}
}
`;

const themed = (cfg = {}) => ({ injectCss: SHELL_THEME, ...cfg });

export const GAMES = [
  {
    id:'merge',title:'Мердж 2048',tagline:'Соединяй плитки и строй комбо',icon:'merge',enabled:true,unit:'очков',
    genre:'ЛОГИКА',length:'2–5 мин',accent:'#ffb44c',accent2:'#ff7b58',
    howTo:'Свайпай в любую сторону — одинаковые плитки соединяются.',
    cfg:themed({scoreSelector:'#score',finishSelector:'#result',preventScroll:true}),
  },
  {
    id:'reaction',title:'Реакция',tagline:'30 секунд чистого рефлекса',icon:'reaction',enabled:true,unit:'попаданий',
    genre:'СКОРОСТЬ',length:'30 сек',accent:'#ff5f7e',accent2:'#ffbd59',
    howTo:'Бей по целям, пока они видны. Чем дольше серия — тем выше темп.',
    cfg:themed({scoreSelector:'.score',preventScroll:true}),
  },
  {
    id:'snake',title:'Змейка',tagline:'Собирай еду и не врежься',icon:'snake',enabled:true,unit:'очков',
    genre:'АРКАДА',length:'1–3 мин',accent:'#57da84',accent2:'#28c9b7',
    howTo:'Свайпай в нужную сторону. Не разворачивайся прямо в себя.',
    cfg:themed({scoreSelector:'.score',preventScroll:true}),
  },
  {
    id:'sapper',title:'Сапёр',tagline:'Один расклад на всех сегодня',icon:'sapper',enabled:true,unit:'очков',
    genre:'ЛОГИКА',length:'2–4 мин',accent:'#9c83ff',accent2:'#6b73ff',
    howTo:'Тап открывает клетку. Флагом отмечай места, где подозреваешь мину.',
    cfg:themed({preventContextMenu:true,preventScroll:true,daily:true}),
  },
  {
    id:'quiz',title:'Квизик',tagline:'Темы, XP, рейтинг и дуэли',icon:'quiz',enabled:true,unit:'очков',
    genre:'ЭРУДИЦИЯ',length:'2–5 мин',accent:'#4d96ff',accent2:'#4ce3e8',
    howTo:'Полноценный Квизик: быстрые игры, квиз дня, рейтинг и дуэли с друзьями.',
    modulePath:'/quiz/',
    cfg:themed({preventScroll:true}),
  },
  {
    id:'echo',title:'Эхо',tagline:'Запомни и повтори ритм',icon:'echo',enabled:true,unit:'уровней',
    genre:'ПАМЯТЬ',length:'1–3 мин',accent:'#ff70c8',accent2:'#a76cff',
    howTo:'Смотри на последовательность цветов, затем повторяй её без ошибки.',
    cfg:themed({preventScroll:true,daily:true}),
  },
  {
    id:'memory',title:'Пары',tagline:'Найди 8 пар за минимум ходов',icon:'memory',enabled:true,unit:'ходов',
    genre:'ПАМЯТЬ',length:'1–3 мин',accent:'#20cdb6',accent2:'#49a8ff',
    howTo:'Открывай по две карточки и запоминай их позиции. Меньше ходов — лучше.',
    cfg:themed({preventScroll:true,higherIsBetter:false,daily:true}),
  },
];
export const byId=(id)=>GAMES.find((g)=>g.id===id);
export const visible=(showAll)=>GAMES.filter((g)=>showAll||g.enabled);
