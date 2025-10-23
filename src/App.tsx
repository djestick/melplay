import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import "./styles/app.css";
import { Platform } from "./components/Platform.tsx";
import { firebaseServices } from "./lib/firebase.ts";
import { useAuth } from "./hooks/useAuth.ts";

type TapParticle = {
  id: number;
  offsetX: number;
  offsetY: number;
};

const BURST_OFFSETS: ReadonlyArray<Pick<TapParticle, "offsetX" | "offsetY">> = [
  { offsetX: 78, offsetY: -96 },
  { offsetX: -84, offsetY: -42 },
  { offsetX: 68, offsetY: 18 },
  { offsetX: -58, offsetY: 42 },
];

const TAP_SOUND_MODULES = import.meta.glob("./assets/sounds1/*.wav", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const TAP_SOUND_URLS = Object.values(TAP_SOUND_MODULES);
const TAP_SOUND_VOLUME = 0.5;

const getStandaloneStatus = () => {
  if (typeof window === "undefined") {
    return true;
  }

  const queries = [
    "(display-mode: standalone)",
    "(display-mode: fullscreen)",
    "(display-mode: minimal-ui)",
    "(display-mode: window-controls-overlay)",
  ];

  const isStandaloneQuery = queries.some((query) => {
    if (!("matchMedia" in window)) {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    isStandaloneQuery || navigatorWithStandalone.standalone === true || false
  );
};

type InstallPlatform = "ios" | "android" | "other";

const detectPlatform = (): InstallPlatform => {
  if (typeof navigator === "undefined") {
    return "other";
  }

  const nav = navigator as Navigator & {
    userAgentData?: { brands?: Array<{ brand: string }>; platform?: string };
    standalone?: boolean;
  };

  const platformHints =
    nav.userAgentData?.platform?.toLowerCase() ??
    nav.userAgentData?.brands?.map((brand) => brand.brand.toLowerCase()).join(" ") ??
    "";
  const userAgent = navigator.userAgent.toLowerCase();

  const isiOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    platformHints.includes("ios") ||
    (nav.standalone === true && userAgent.includes("macintosh"));
  if (isiOS) {
    return "ios";
  }

  const isAndroid =
    /android/.test(userAgent) || platformHints.includes("android");
  if (isAndroid) {
    return "android";
  }

  return "other";
};

export default function App() {
  const { user, status, error, signIn, signOut, isUsingMock } = useAuth();
  const { db } = firebaseServices;
  const preloadedSoundsRef = useRef<HTMLAudioElement[]>([]);
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(() =>
    getStandaloneStatus()
  );
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>(() =>
    detectPlatform()
  );
  const fallbackName = useMemo(() => {
    if (user?.displayName) {
      return user.displayName;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "Игрок";
  }, [user]);
  const [score, setScore] = useState(0);
  const [playerName, setPlayerName] = useState<string>(fallbackName);
  const [pendingName, setPendingName] = useState<string>(fallbackName);
  const [isScoreLoaded, setIsScoreLoaded] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [particles, setParticles] = useState<TapParticle[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const burstCursor = useRef(0);
  const shouldShowInstallPrompt = !isStandaloneApp;
  const isAuthReady = status === "ready" || status === "error";
  const shouldShowAuthModal = isAuthReady && !user;
  const shouldBlur =
    shouldShowInstallPrompt || shouldShowAuthModal || isEditingName;
  const showIosInstructions =
    installPlatform === "ios" || installPlatform === "other";
  const showAndroidInstructions = installPlatform === "android";

  const triggerHaptics = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(18);
    }
  }, []);

  const spawnParticle = useCallback(() => {
    const nextIndex = burstCursor.current % BURST_OFFSETS.length;
    const offset = BURST_OFFSETS[nextIndex];
    burstCursor.current = (nextIndex + 1) % BURST_OFFSETS.length;

    const id = Date.now() + Math.random();
    setParticles((prev) => [
      ...prev,
      { id, offsetX: offset.offsetX, offsetY: offset.offsetY },
    ]);

    window.setTimeout(() => {
      setParticles((current) =>
        current.filter((particle) => particle.id !== id)
      );
    }, 520);
  }, []);

  useEffect(() => {
    preloadedSoundsRef.current = TAP_SOUND_URLS.map((src) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = TAP_SOUND_VOLUME;
      audio.load();
      return audio;
    });

    return () => {
      preloadedSoundsRef.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      preloadedSoundsRef.current = [];
    };
  }, []);

  const playRandomTapSound = useCallback(() => {
    const sounds = preloadedSoundsRef.current;
    if (!sounds.length) {
      return;
    }

    const base = sounds[Math.floor(Math.random() * sounds.length)];
    const audio = base.cloneNode(true) as HTMLAudioElement;
    audio.volume = base.volume;
    void audio.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateStandaloneStatus = () => {
      setIsStandaloneApp(getStandaloneStatus());
      setInstallPlatform(detectPlatform());
    };

    updateStandaloneStatus();

    const queries = [
      "(display-mode: standalone)",
      "(display-mode: fullscreen)",
      "(display-mode: minimal-ui)",
      "(display-mode: window-controls-overlay)",
    ];

    const mediaQueryLists: MediaQueryList[] = [];

    if (typeof window.matchMedia === "function") {
      queries.forEach((query) => {
        mediaQueryLists.push(window.matchMedia(query));
      });
    }

    const handleMediaChange = () => updateStandaloneStatus();

    mediaQueryLists.forEach((mql) => {
      if ("addEventListener" in mql) {
        mql.addEventListener("change", handleMediaChange);
      }
    });

    window.addEventListener("appinstalled", updateStandaloneStatus);
    window.addEventListener("beforeinstallprompt", updateStandaloneStatus);
    document.addEventListener("visibilitychange", updateStandaloneStatus);

    return () => {
      mediaQueryLists.forEach((mql) => {
        if ("removeEventListener" in mql) {
          mql.removeEventListener("change", handleMediaChange);
        }
      });
      window.removeEventListener("appinstalled", updateStandaloneStatus);
      window.removeEventListener("beforeinstallprompt", updateStandaloneStatus);
      document.removeEventListener("visibilitychange", updateStandaloneStatus);
    };
  }, []);

  useEffect(() => {
    setPlayerName(fallbackName);
    setPendingName(fallbackName);
    setIsEditingName(false);
    setNameError(null);
  }, [fallbackName]);

  useEffect(() => {
    if (shouldShowInstallPrompt && isEditingName) {
      setIsEditingName(false);
    }
  }, [isEditingName, shouldShowInstallPrompt]);

  useEffect(() => {
    if (!user) {
      setScore(0);
      setIsScoreLoaded(true);
      return;
    }

    if (!db) {
      setIsScoreLoaded(true);
      return;
    }

    let isMounted = true;
    setIsScoreLoaded(false);

    const userRef = doc(db, "players", user.uid);

    const syncScore = async () => {
      try {
        const snapshot = await getDoc(userRef);

        if (!isMounted) {
          return;
        }

        if (snapshot.exists()) {
          const data = snapshot.data() as {
            score?: number;
            displayName?: string;
          };
          setScore(typeof data.score === "number" ? data.score : 0);
          if (
            typeof data.displayName === "string" &&
            data.displayName.trim().length > 0
          ) {
            setPlayerName(data.displayName.trim());
            setPendingName(data.displayName.trim());
          } else {
            setPlayerName(fallbackName);
            setPendingName(fallbackName);
          }
        } else {
          await setDoc(
            userRef,
            {
              displayName: fallbackName,
              score: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          if (!isMounted) {
            return;
          }

          setScore(0);
          setPlayerName(fallbackName);
          setPendingName(fallbackName);
        }
      } catch (firebaseError) {
        console.error("[firebase] failed to load score", firebaseError);
      } finally {
        if (isMounted) {
          setIsScoreLoaded(true);
        }
      }
    };

    void syncScore();

    return () => {
      isMounted = false;
    };
  }, [db, fallbackName, user]);

  const persistScore = useCallback(
    async (nextScore: number) => {
      if (!db || !user) {
        return;
      }

      try {
        const userRef = doc(db, "players", user.uid);
        const nameForSave =
          typeof playerName === "string" && playerName.trim().length > 0
            ? playerName.trim()
            : fallbackName;
        await setDoc(
          userRef,
          {
            displayName: nameForSave,
            score: nextScore,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (firebaseError) {
        console.error("[firebase] failed to update score", firebaseError);
      }
    },
    [db, fallbackName, playerName, user]
  );

  const applyTap = useCallback(
    (isKeyboard = false) => {
      if (shouldBlur) {
        return;
      }

      if (user && !isScoreLoaded) {
        return;
      }

      setIsPressed(true);
      setScore((prev) => {
        const next = prev + 1;
        void persistScore(next);
        return next;
      });
      spawnParticle();
      playRandomTapSound();
      triggerHaptics();

      if (isKeyboard) {
        window.setTimeout(() => setIsPressed(false), 140);
      }
    },
    [
      isScoreLoaded,
      persistScore,
      shouldBlur,
      spawnParticle,
      triggerHaptics,
      playRandomTapSound,
      user,
    ]
  );

  const handlePointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture might be unavailable; ignore the failure.
      }
      applyTap(false);
    },
    [applyTap]
  );

  const handlePointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Nothing to release; ignore the failure.
      }
      setIsPressed(false);
    },
    []
  );

  const handlePointerLeave = useCallback<
    PointerEventHandler<HTMLDivElement>
  >(() => {
    setIsPressed(false);
  }, []);

  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        applyTap(true);
      }
    },
    [applyTap]
  );

  const handleStartEditName = useCallback(() => {
    if (!user || shouldShowAuthModal || shouldShowInstallPrompt) {
      return;
    }
    setPendingName(playerName);
    setNameError(null);
    setIsEditingName(true);
  }, [playerName, shouldShowAuthModal, shouldShowInstallPrompt, user]);

  const handleCloseNameModal = useCallback(() => {
    setIsEditingName(false);
    setPendingName(playerName);
    setNameError(null);
  }, [playerName]);

  const handleNameChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      setPendingName(event.target.value);
    },
    []
  );

  const handleNameSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    async (event) => {
      event.preventDefault();
      const trimmed = pendingName.trim();

      if (!trimmed) {
        setNameError("Введите ник");
        return;
      }

      if (trimmed.length > 24) {
        setNameError("Максимум 24 символа");
        return;
      }

      if (!user) {
        setNameError("Авторизуйся, чтобы изменить ник");
        return;
      }

      if (!db) {
        setPlayerName(trimmed);
        setPendingName(trimmed);
        setIsEditingName(false);
        setNameError(null);
        return;
      }

      try {
        setIsSavingName(true);
        const userRef = doc(db, "players", user.uid);
        await setDoc(
          userRef,
          {
            displayName: trimmed,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setPlayerName(trimmed);
        setPendingName(trimmed);
        setIsEditingName(false);
        setNameError(null);
      } catch (firebaseError) {
        console.error("[firebase] failed to update displayName", firebaseError);
        setNameError("Не удалось изменить ник. Попробуй ещё раз.");
      } finally {
        setIsSavingName(false);
      }
    },
    [db, pendingName, user]
  );

  const appContentClassName = shouldBlur
    ? "app__content app__content--blurred"
    : "app__content";

  return (
    <div className="app">
      <div
        className={appContentClassName}
        aria-hidden={shouldBlur ? "true" : undefined}
      >
        <header className="scoreboard">
          <div className="scoreboard__actions">
            {user ? (
              <button type="button" className="auth-button" onClick={signOut}>
                Выйти
              </button>
            ) : !shouldShowAuthModal && !shouldShowInstallPrompt ? (
              <button type="button" className="auth-button" onClick={signIn}>
                Войти через Google
              </button>
            ) : null}
            {isUsingMock ? (
              <span
                className="preview-badge"
                title="Работаем в демо-режиме без Firebase"
              >
                DEMO
              </span>
            ) : null}
          </div>

          <div className="scoreboard__name-row">
            <div className="scoreboard__name">{playerName}</div>
            {user && !shouldShowInstallPrompt ? (
              <button
                type="button"
                className="scoreboard__edit"
                onClick={handleStartEditName}
                title="Изменить ник"
                aria-label="Изменить ник"
              >
                <svg
                  className="scoreboard__edit-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M11.9 2.1a1.5 1.5 0 0 1 2.12 0l.88.88a1.5 1.5 0 0 1 0 2.12l-7.1 7.1a1 1 0 0 1-.47.26l-3.16.63a.5.5 0 0 1-.58-.58l.63-3.16a1 1 0 0 1 .26-.47zM11.2 3.5 4.96 9.73a.5.5 0 0 0-.13.23l-.38 1.88 1.88-.38a.5.5 0 0 0 .23-.13L12.8 5.5z"
                    fill="currentColor"
                  />
                  <path d="M2 14h12v1H2z" opacity="0.3" fill="currentColor" />
                </svg>
              </button>
            ) : null}
          </div>
          <div className="scoreboard__score">{score}</div>

          {error && !shouldBlur ? (
            <p className="scoreboard__error">{error}</p>
          ) : null}
        </header>

        <div className="stage">
          <div className="particles">
            {particles.map((particle) => (
              <span
                key={particle.id}
                style={
                  {
                    "--offset-x": `${particle.offsetX}px`,
                    "--offset-y": `${particle.offsetY}px`,
                  } as React.CSSProperties
                }
              >
                +1
              </span>
            ))}
          </div>
          <Platform
            pressed={isPressed}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
            onKeyDown={handleKeyDown}
            aria-label="Платформа, нажми чтобы заработать очки"
          />
        </div>
      </div>
      {shouldShowInstallPrompt ? (
        <div
          className="install-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-modal-title"
          aria-describedby="install-modal-description"
        >
          <div className="install-modal__dialog">
            <h2 className="install-modal__title" id="install-modal-title">
              Добавь Melplay на главный экран
            </h2>
            <p className="install-modal__subtitle" id="install-modal-description">
              Приложение работает только как установленный ярлык. Добавь Melplay на рабочий стол, чтобы продолжить.
            </p>
            <div className="install-modal__platforms">
              {showIosInstructions ? (
                <section
                  className="install-modal__section install-modal__section--ios"
                  aria-label="Инструкция для iPhone"
                >
                  <h3 className="install-modal__section-title">Для iPhone</h3>
                  <ol className="install-modal__steps">
                    <li className="install-modal__step">
                      <span className="install-modal__icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" focusable="false">
                          <path
                            d="M12 3l3.8 3.8a.8.8 0 01-.57 1.37H13v6h-2V8.17H8.77a.8.8 0 01-.57-1.37L12 3z"
                            fill="currentColor"
                          />
                          <rect
                            x="6"
                            y="10"
                            width="12"
                            height="10"
                            rx="2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                        </svg>
                      </span>
                      <span className="install-modal__step-text">
                        Нажми <strong>«Поделиться»</strong>
                      </span>
                    </li>
                    <li className="install-modal__step">
                      <span className="install-modal__icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" focusable="false">
                          <rect
                            x="4"
                            y="4"
                            width="16"
                            height="16"
                            rx="4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path d="M12 8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M8 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="install-modal__step-text">
                        Пролистай вниз и выбери <strong>«Добавить на рабочий экран»</strong>
                      </span>
                    </li>
                  </ol>
                </section>
              ) : null}
              {showAndroidInstructions ? (
                <section
                  className="install-modal__section install-modal__section--android"
                  aria-label="Инструкция для Android"
                >
                  <h3 className="install-modal__section-title">Для Android</h3>
                  <ol className="install-modal__steps">
                    <li className="install-modal__step">
                      <span className="install-modal__icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" focusable="false">
                          <circle cx="12" cy="4" r="1.6" fill="currentColor" />
                          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                          <circle cx="12" cy="20" r="1.6" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="install-modal__step-text">
                        Нажми на <strong>три точки</strong> меню
                      </span>
                    </li>
                    <li className="install-modal__step">
                      <span className="install-modal__icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" focusable="false">
                          <rect
                            x="4"
                            y="5"
                            width="16"
                            height="12"
                            rx="2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path
                            d="M12 9v6"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                          <path
                            d="M9 12h6"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                          <path
                            d="M7 19h10"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span className="install-modal__step-text">
                        Выбери <strong>«Добавить на главный экран»</strong>
                      </span>
                    </li>
                  </ol>
                </section>
              ) : null}
            </div>
            <p className="install-modal__footnote">
              После установки запускай Melplay из ярлыка. Страница автоматически обновится, когда откроешь приложение из установленного ярлыка.
            </p>
          </div>
        </div>
      ) : null}
      {!shouldShowInstallPrompt && shouldShowAuthModal ? (
        <div
          className="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          aria-describedby="auth-modal-description"
        >
          <div className="auth-modal__dialog auth-modal__dialog--login">
            <h2 className="auth-modal__title" id="auth-modal-title">
              Вход в аккаунт
            </h2>
            <p className="auth-modal__subtitle" id="auth-modal-description">
              Войди в аккаунт, чтобы сохранять очки и продолжать фармить их на
              любом устройстве.
            </p>
            <button
              type="button"
              className="auth-modal__button"
              onClick={signIn}
            >
              Продолжить с Google
            </button>
            {error ? <p className="auth-modal__error">{error}</p> : null}
            <p className="auth-modal__footnote">Связь @djestick</p>
          </div>
        </div>
      ) : null}
      {!shouldShowInstallPrompt && isEditingName ? (
        <div
          className="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-modal-title"
          aria-describedby="name-modal-description"
          onClick={handleCloseNameModal}
        >
          <div
            className="auth-modal__dialog auth-modal__dialog--profile"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="auth-modal__title" id="name-modal-title">
              Измени ник
            </h2>
            <p className="auth-modal__subtitle" id="name-modal-description">
              Придумай короткое имя, чтобы тебя было легко узнать в таблице
              лидеров.
            </p>
            <form className="name-form" onSubmit={handleNameSubmit} noValidate>
              <input
                type="text"
                className="name-form__input"
                value={pendingName}
                onChange={handleNameChange}
                maxLength={24}
                placeholder="Новый ник"
                autoFocus
              />
              <button
                type="submit"
                className="name-form__submit"
                disabled={isSavingName}
              >
                {isSavingName ? "Сохраняем…" : "Изменить"}
              </button>
            </form>
            {nameError ? (
              <p className="auth-modal__error">{nameError}</p>
            ) : null}
            <button
              type="button"
              className="auth-modal__secondary"
              onClick={handleCloseNameModal}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
