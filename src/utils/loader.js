// src/utils/loader.js
import { loadingMessages } from '../../constants/loadingMessages.js';

export function showLoader() {
    const loader = document.getElementById('loading-screen');
    const text = document.getElementById('loading-text');

    if (!loader || !text) return;

    // Выбираем случайное сообщение
    const random = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    text.textContent = random;

    loader.style.display = 'flex';
    loader.style.opacity = '1';

    // Через секунду — плавное исчезновение
    setTimeout(() => {
        loader.style.transition = 'opacity 0.5s ease-out';
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }, 1000);
}
