const tweakQueue = [];
let isTweakVisible = false;

export function showTweak(message, type = 'success', duration = 3000) {
    tweakQueue.push({ message, type, duration });
    if (!isTweakVisible) {
        processQueue();
    }
}

function processQueue() {
    if (tweakQueue.length === 0) {
        isTweakVisible = false;
        return;
    }

    isTweakVisible = true;
    const { message, type, duration } = tweakQueue.shift();

    const container = document.getElementById('tweak-container');
    if (!container) return;

    container.classList.remove('hidden');

    const div = document.createElement('div');
    div.className = `tweak ${type}`;
    div.innerHTML = `
    ${message}
    <button class="tweak-close" onclick="this.parentElement.remove()"></button>
  `;
    container.appendChild(div);

    setTimeout(() => {
        div.style.animation = 'tweak-slide-out 0.3s forwards';
        setTimeout(() => {
            div.remove();
            if (container.children.length === 0) {
                container.classList.add('hidden');
            }
            isTweakVisible = false;
            processQueue(); // Показать следующий твик
        }, 300);
    }, duration);
}
