const CLICK_THRESHOLD = 2;
const THROTTLE_MS = 90000;

let clickCount = 0;
let lastSmartlinkTime = 0;

document.addEventListener('click', (e) => {
  if (!e.isTrusted) return;

  clickCount++;

  if (clickCount >= CLICK_THRESHOLD) {
    const now = Date.now();
    if (now - lastSmartlinkTime > THROTTLE_MS) {
      clickCount = 0;
      lastSmartlinkTime = now;
   window.open('https://www.profitablecpmratenetwork.com/s4wpfwdhq3?key=aa39e8f75e7c3e592a14cb08cdac1bec)', '_blank', 'noopener');
    }
  }
}, true);
const script = document.createElement('script');
script.src = 'https://pl29187115.profitablecpmratenetwork.com/d2/bc/ce/d2bccefe4c967fbff9ec64b472024047.js';
document.body.appendChild(script);

export {};
