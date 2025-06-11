export function initBannerCarousel(containerSelector = ".banner-carousel .slides-container") {
    const container = document.querySelector(containerSelector);
    if (!container) return () => {};

    const slides = Array.from(container.querySelectorAll(".banner-slide"));
    if (!slides.length) return () => {};

    // ---- layout once ----
    container.style.display       = "flex";
    container.style.transition    = "transform 0.5s ease";
    container.style.touchAction   = "pan-y";
    slides.forEach(slide => (slide.style.minWidth = "100%"));

    // ---- state ----
    let current      = 0;
    let startX       = 0;
    let isDragging   = false;
    let translateX   = 0;

    // ---- helpers ----
    const setPosition = idx => {
        container.style.transform = `translateX(-${idx * 100}%)`;
    };

    // ---- touch handlers ----
    const onStart = e => {
        startX      = e.touches[0].clientX;
        isDragging  = true;
        container.style.transition = "none";
        translateX  = current * -100;
    };

    const onMove = e => {
        if (!isDragging) return;
        const diff = e.touches[0].clientX - startX;
        container.style.transform = `translateX(${translateX + (diff / container.offsetWidth) * 100}%)`;
    };

    const onEnd = e => {
        if (!isDragging) return;
        isDragging = false;
        container.style.transition = "transform 0.5s ease";
        const diff = e.changedTouches[0].clientX - startX;
        if (diff > 50) current = Math.max(current - 1, 0);
        else if (diff < -50) current = Math.min(current + 1, slides.length - 1);
        setPosition(current);
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: true });
    container.addEventListener("touchend", onEnd);

    // ---- auto‑scroll ----
    const intervalId = window.setInterval(() => {
        if (!isDragging) {
            current = (current + 1) % slides.length;
            setPosition(current);
        }
    }, 5000);

    // ---- click‑through links ----
    slides.forEach(slide => {
        const url = slide.dataset.link;
        if (url) {
            slide.style.cursor = "pointer";
            slide.addEventListener("click", () => window.open(url, "_blank"));
        }
    });

    // ---- cleanup fn ----
    const cleanup = () => {
        container.removeEventListener("touchstart", onStart);
        container.removeEventListener("touchmove", onMove);
        container.removeEventListener("touchend", onEnd);
        clearInterval(intervalId);
    };

    return cleanup;
}
