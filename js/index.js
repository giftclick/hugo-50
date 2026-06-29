
(() => {
    let exportAnimationObserver = null;

    function initializeAnimations(root = document) {
        const animationElements = Array.from(root.querySelectorAll(
            '.reveal, .reveal-left, .reveal-right, .image-reveal'
        ));
        let imageIndex = 0;

        animationElements.forEach((element) => {
            if (element.classList.contains('image-reveal')) {
                element.style.setProperty('--delay', (imageIndex * 0.8) + 's');
                imageIndex++;
            }

            if (element.dataset.gcAnimationObserved === 'true') {
                return;
            }
            element.dataset.gcAnimationObserved = 'true';

            if ('IntersectionObserver' in window) {
                if (!exportAnimationObserver) {
                    exportAnimationObserver = new IntersectionObserver((entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                entry.target.classList.add('active');
                            }
                        });
                    }, { threshold: 0.1 });
                }
                exportAnimationObserver.observe(element);
                return;
            }

            window.setTimeout(() => element.classList.add('active'), 0);
        });
    }

    function updateCountdown(element) {
        const targetValue = element.getAttribute('data-export-date');
        const target = new Date(targetValue).getTime();
        if (!Number.isFinite(target)) return;
        const difference = Math.max(0, target - Date.now());
        const values = {
            days: Math.floor(difference / 86400000),
            hours: Math.floor((difference % 86400000) / 3600000),
            minutes: Math.floor((difference % 3600000) / 60000),
            seconds: Math.floor((difference % 60000) / 1000)
        };
        const unitElements = {
            days: element.querySelector('#days, #cd-days'),
            hours: element.querySelector('#hours, #cd-hours'),
            minutes: element.querySelector('#minutes, #cd-minutes'),
            seconds: element.querySelector('#seconds, #cd-seconds')
        };
        if (Object.values(unitElements).some(Boolean)) {
            Object.entries(unitElements).forEach(([unit, node]) => {
                if (!node) return;
                node.textContent = unit === 'days'
                    ? String(values[unit])
                    : String(values[unit]).padStart(2, '0');
            });
            return;
        }
        element.textContent = difference <= 0
            ? '¡Ya comenzó!'
            : values.days + ' días ' + values.hours + 'h ' + values.minutes + 'm ' + values.seconds + 's';
    }

    function initializeCountdowns() {
        const countdowns = Array.from(document.querySelectorAll('[data-export-date]'));
        const update = () => countdowns.forEach(updateCountdown);
        update();
        if (countdowns.length) window.setInterval(update, 1000);
    }

    function initializeMusic() {
        const musicStorageKey = 'giftclick-music-state-v1';
        const bar = document.querySelector('[data-export-music-src]');
        if (!bar) return;
        const source = bar.getAttribute('data-export-music-src');
        const playButton = document.getElementById('play-btn');
        const pauseButton = document.getElementById('pause-btn');
        const progressBar = document.getElementById('progress-bar');
        const progressCurrent = document.getElementById('progress-current');
        const timeDisplay = document.getElementById('time-display');
        if (!source || !playButton || !pauseButton) return;

        const audio = new Audio(source);
        audio.preload = 'auto';
        let lastSavedAt = 0;

        const readMusicState = () => {
            try {
                return JSON.parse(window.localStorage.getItem(musicStorageKey) || '{}') || {};
            } catch (error) {
                return {};
            }
        };

        const writeMusicState = (patch = {}) => {
            const current = readMusicState();
            const next = Object.assign({}, current, patch, {
                source,
                updatedAt: Date.now()
            });

            try {
                window.localStorage.setItem(musicStorageKey, JSON.stringify(next));
            } catch (error) {
                // Storage can be unavailable in private browsing; the player still works manually.
            }
        };

        const formatTime = (seconds) => {
            if (!Number.isFinite(seconds)) return '00:00';
            const minutes = Math.floor(seconds / 60);
            const remaining = Math.floor(seconds % 60);
            return String(minutes).padStart(2, '0') + ':' + String(remaining).padStart(2, '0');
        };

        const updateProgress = () => {
            if (progressCurrent && Number.isFinite(audio.duration) && audio.duration > 0) {
                progressCurrent.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
            }
            if (timeDisplay) timeDisplay.textContent = formatTime(audio.currentTime);
        };

        const savePlaybackState = (isPlaying = !audio.paused, force = false) => {
            const now = Date.now();
            if (!force && now - lastSavedAt < 800) return;
            lastSavedAt = now;
            const state = readMusicState();
            writeMusicState({
                accepted: state.accepted === true,
                rejected: state.rejected === true,
                playing: isPlaying,
                currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
                duration: Number.isFinite(audio.duration) ? audio.duration : 0
            });
        };

        const getResumeTime = () => {
            const state = readMusicState();
            if (state.source && state.source !== source) return 0;
            let resumeTime = Number(state.currentTime);
            if (!Number.isFinite(resumeTime) || resumeTime < 0) return 0;

            if (state.playing === true && Number.isFinite(Number(state.updatedAt))) {
                resumeTime += Math.max(0, (Date.now() - Number(state.updatedAt)) / 1000);
            }

            if (Number.isFinite(audio.duration) && audio.duration > 1) {
                return Math.min(resumeTime, audio.duration - 0.5);
            }

            return resumeTime;
        };

        const restoreSavedPosition = () => {
            const applyPosition = () => {
                const resumeTime = getResumeTime();
                if (resumeTime > 0 && Number.isFinite(resumeTime)) {
                    audio.currentTime = resumeTime;
                    updateProgress();
                }
            };

            if (audio.readyState >= 1) {
                applyPosition();
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                const done = () => {
                    audio.removeEventListener('loadedmetadata', done);
                    audio.removeEventListener('error', done);
                    applyPosition();
                    resolve();
                };

                audio.addEventListener('loadedmetadata', done, { once: true });
                audio.addEventListener('error', done, { once: true });
                audio.load();
            });
        };

        const playMusic = (rememberChoice = true) => {
            if (rememberChoice) {
                writeMusicState({
                    accepted: true,
                    rejected: false,
                    playing: true,
                    currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
                    duration: Number.isFinite(audio.duration) ? audio.duration : 0
                });
            }
            restoreSavedPosition().then(() => {
                audio.play().catch(() => {});
            });
        };

        const showMusicPrompt = () => {
            if (document.querySelector('.music-consent-backdrop')) return;

            const prompt = document.createElement('div');
            prompt.className = 'music-consent-backdrop';
            prompt.setAttribute('role', 'dialog');
            prompt.setAttribute('aria-modal', 'true');
            prompt.setAttribute('aria-labelledby', 'music-consent-title');
            prompt.innerHTML = [
                '<div class="music-consent-dialog">',
                '<div class="music-consent-icon"><i class="fas fa-music" aria-hidden="true"></i></div>',
                '<h2 id="music-consent-title">¿Ver la invitación con música?</h2>',
                '<p>Activa la canción de fondo ahora. Al abrir la invitación completa continuará desde el mismo punto.</p>',
                '<div class="music-consent-actions">',
                '<button type="button" class="music-consent-primary" data-music-yes>Sí, con música</button>',
                '<button type="button" class="music-consent-secondary" data-music-no>No, gracias</button>',
                '</div>',
                '</div>'
            ].join('');

            document.body.appendChild(prompt);

            prompt.querySelector('[data-music-yes]').addEventListener('click', () => {
                playMusic(true);
                prompt.remove();
            });

            prompt.querySelector('[data-music-no]').addEventListener('click', () => {
                writeMusicState({
                    accepted: false,
                    rejected: true,
                    playing: false,
                    currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
                    duration: Number.isFinite(audio.duration) ? audio.duration : 0
                });
                prompt.remove();
            });
        };

        playButton.addEventListener('click', () => playMusic(true));
        pauseButton.addEventListener('click', () => {
            audio.pause();
            savePlaybackState(false, true);
        });

        audio.addEventListener('play', () => {
            playButton.style.display = 'none';
            pauseButton.style.display = 'flex';
            writeMusicState({
                accepted: true,
                rejected: false,
                playing: true,
                duration: Number.isFinite(audio.duration) ? audio.duration : 0
            });
        });

        audio.addEventListener('pause', () => {
            playButton.style.display = 'flex';
            pauseButton.style.display = 'none';
            if (!audio.ended) savePlaybackState(false, true);
        });

        audio.addEventListener('ended', () => {
            writeMusicState({
                accepted: readMusicState().accepted === true,
                rejected: false,
                playing: false,
                currentTime: 0,
                duration: Number.isFinite(audio.duration) ? audio.duration : 0
            });
        });

        audio.addEventListener('timeupdate', () => {
            updateProgress();
            savePlaybackState(!audio.paused);
        });

        if (progressBar) {
            progressBar.addEventListener('click', (event) => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                const rect = progressBar.getBoundingClientRect();
                audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
                savePlaybackState(!audio.paused, true);
            });
        }

        const saveBeforeInternalNavigation = (event) => {
            const link = event.target.closest && event.target.closest('a[href]');
            if (!link) return;
            try {
                const url = new URL(link.getAttribute('href'), window.location.href);
                if (url.origin === window.location.origin && /(?:index|home)\.html$/i.test(url.pathname)) {
                    savePlaybackState(!audio.paused, true);
                }
            } catch (error) {
                // Ignore malformed links.
            }
        };

        ['pointerdown', 'touchstart', 'click'].forEach((eventName) => {
            document.addEventListener(eventName, saveBeforeInternalNavigation, true);
        });

        window.addEventListener('pagehide', () => savePlaybackState(!audio.paused, true));
        window.addEventListener('beforeunload', () => savePlaybackState(!audio.paused, true));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') savePlaybackState(!audio.paused, true);
        });

        restoreSavedPosition().then(updateProgress);
        updateProgress();

        const state = readMusicState();
        if (state.accepted === true && state.playing === true) {
            window.setTimeout(() => playMusic(false), 120);
        } else if (state.accepted !== true && state.rejected !== true) {
            window.setTimeout(showMusicPrompt, 450);
        }
    }

    function initializeStaticRsvp() {
        document.querySelectorAll('.gc-rsvp-form').forEach((form) => {
            form.querySelectorAll('input, textarea, button').forEach((control) => {
                control.disabled = false;
            });
            const showStaticMessage = () => {
                const status = form.parentElement && form.parentElement.querySelector('.gc-rsvp-status');
                if (status) {
                    status.textContent = 'Esta copia estática no está conectada al panel RSVP de GiftClick.';
                }
            };
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                showStaticMessage();
            });
            form.querySelectorAll('button').forEach((button) => {
                button.addEventListener('click', showStaticMessage);
            });
        });
    }

    function normalizePassCount(value) {
        const parsed = Number.parseInt(String(value || ''), 10);
        if (!Number.isFinite(parsed) || parsed < 1) return 1;
        return Math.min(parsed, 999);
    }

    function readGuestPassFromQuery() {
        const params = new URLSearchParams(window.location.search);
        let guestName = String(params.get('guest') || params.get('name') || '').trim();
        let passCount = params.get('passes') || params.get('pass_count') || '';

        if (!guestName && !passCount && window.location.search.length > 1) {
            let raw = window.location.search.slice(1).replace(/\+/g, ' ');
            let decoded = raw;
            let previous = '';
            do {
                previous = decoded;
                try {
                    decoded = decodeURIComponent(decoded);
                } catch (error) {
                    break;
                }
            } while (decoded !== previous);

            const parts = decoded.split('-');
            if (parts.length >= 3) {
                guestName = [parts[0], parts[1]].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
                passCount = parts[2];
            }
        }

        if (!guestName && !passCount) return null;
        return {
            name: guestName,
            pass_count: normalizePassCount(passCount)
        };
    }

    function applyGuestPassFromQuery() {
        const context = readGuestPassFromQuery();
        if (!context) return;

        const isSingular = context.pass_count === 1;
        const nameElement = document.getElementById('name');
        const passNumbersElement = document.getElementById('passnumbers');
        const passNumbersValueElement = document.getElementById('passnumbers-value');
        const reservedPhraseElement = document.getElementById('reserved-phrase');
        const passesTitleElement = document.getElementById('passes-title');
        const placesTextElement = document.getElementById('places-text');

        if (nameElement && context.name) nameElement.textContent = context.name;
        if (passNumbersValueElement) {
            passNumbersValueElement.textContent = String(context.pass_count);
        } else if (passNumbersElement) {
            passNumbersElement.textContent = String(context.pass_count);
        }
        if (reservedPhraseElement) reservedPhraseElement.textContent = isSingular ? 'Reservado' : 'Reservados';
        if (passesTitleElement) passesTitleElement.textContent = isSingular ? 'Pase' : 'Pases';
        if (placesTextElement) placesTextElement.textContent = isSingular ? 'Lugar' : 'Lugares';
    }

    window.addEventListener('DOMContentLoaded', () => {
        applyGuestPassFromQuery();
        initializeAnimations();
        initializeCountdowns();
        initializeMusic();
        initializeStaticRsvp();
    });
})();



(() => {
    const outputNameMap = {"index.html":"index.html","home.html":"home.html"};

    function enforceExportLinks() {
        document.querySelectorAll('a[href]').forEach((link) => {
            const rawHref = link.getAttribute('href') || '';
            if (!rawHref || rawHref.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(rawHref)) {
                return;
            }

            try {
                const url = new URL(rawHref, window.location.href);
                if (url.origin !== window.location.origin) return;

                const normalizedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
                const sourceName = normalizedPath.split('/').pop() || normalizedPath;
                const mappedName = outputNameMap[normalizedPath] || outputNameMap[sourceName];
                if (!mappedName) return;

                link.setAttribute('href', mappedName + (url.search || window.location.search || '') + url.hash);
            } catch (error) {
                // Leave malformed links untouched.
            }
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        window.setTimeout(enforceExportLinks, 0);
    });
})();
