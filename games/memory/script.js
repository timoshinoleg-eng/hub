const EMOJI = ["🍎", "🍇", "🍓", "🍒", "🍑", "🥝", "🍍", "🍌"];
const cards = document.querySelectorAll(".card");

let matched = 0;
let moves = 0;
let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }
let cardOne, cardTwo;
let disableDeck = false;

function flipCard({target: clickedCard}) {
    if(cardOne !== clickedCard && !disableDeck) {
        clickedCard.classList.add("flip");
        if(!cardOne) {
            return cardOne = clickedCard;
        }
        cardTwo = clickedCard;
        disableDeck = true;
        moves++;
        hubScore(moves);
        let cardOneImg = cardOne.dataset.emoji,
        cardTwoImg = cardTwo.dataset.emoji;
        matchCards(cardOneImg, cardTwoImg);
    }
}

function matchCards(img1, img2) {
    if(img1 === img2) {
        matched++;
        cardOne.removeEventListener("click", flipCard);
        cardTwo.removeEventListener("click", flipCard);
        cardOne = cardTwo = "";
        disableDeck = false;
        if(matched == 8) { hubFinish(moves); }
        return;
    }
    setTimeout(() => {
        cardOne.classList.add("shake");
        cardTwo.classList.add("shake");
    }, 400);

    setTimeout(() => {
        cardOne.classList.remove("shake", "flip");
        cardTwo.classList.remove("shake", "flip");
        cardOne = cardTwo = "";
        disableDeck = false;
    }, 1200);
}

function shuffleCard() {
    matched = 0;
    disableDeck = false;
    cardOne = cardTwo = "";
    let arr = [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8];
    arr.sort(() => Math.random() > 0.5 ? 1 : -1);
    cards.forEach((card, i) => {
        card.classList.remove("flip");
        const back = card.querySelector(".back-view");
        card.dataset.emoji = EMOJI[arr[i] - 1];
        back.textContent = EMOJI[arr[i] - 1];
        back.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:38px;line-height:1";
        card.addEventListener("click", flipCard);
        card.addEventListener("touchstart", (e) => { e.preventDefault(); flipCard({ target: card }); }, { passive: false });
    });
}

shuffleCard();
    
cards.forEach(card => {
    card.addEventListener("click", flipCard);
});