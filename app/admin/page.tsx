
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  imageUrl: string;
};

type Submission = {
  id: string;
  created_at: string;
  submission_number?: number;
  tiktok_username: string;
  submission_type: "trade" | "start_sit";
  give_players: Player[];
  get_players: Player[];
  players: Player[];
  status: "pending" | "accepted" | "declined";
  processed_at: string | null;
};

type DecisionPopup = {
  status: "accepted" | "declined";
  submissionType: "trade" | "start_sit";
  username: string;
  number?: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const gold = "#e8c77d";

let decisionAudioContext: AudioContext | null = null;

function queueName(username: string) {
  return username.length > 8 ? `${username.slice(0, 8)}...` : username;
}

function PlayerBar({ player }: { player: Player }) {
  return (
    <div className="player-bar">
      {player.imageUrl ? (
        <img
          src={player.imageUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="player-placeholder">?</div>
      )}

      <div className="player-info">
        <strong>{player.name}</strong>
        <span>{player.position} · {player.team}</span>
      </div>
    </div>
  );
}

function SubmissionChip({ number }: { number?: number }) {
  return (
    <div className="chip-wrap">
      <div className="chip">
        <div className="chip-inner">
          <div className="chip-label">SUBMISSION</div>
          <div className="chip-number">#{number ?? "—"}</div>
          <div className="chip-bottom">ASK XO</div>
        </div>
      </div>
    </div>
  );
}

function playDecisionSound(
  context: AudioContext,
  type: "accepted" | "declined",
  volume: number
) {
  if (volume <= 0) return;

  const now = context.currentTime;
  const master = context.createGain();

  master.gain.setValueAtTime(volume / 100, now);
  master.connect(context.destination);

  function tone(
    frequency: number,
    start: number,
    duration: number,
    wave: OscillatorType,
    loudness: number
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(loudness, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(gain);
    gain.connect(master);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  if (type === "accepted") {
    // Cash-register-style cha-ching
    tone(880, now, 0.18, "sine", 0.45);
    tone(1175, now + 0.13, 0.22, "sine", 0.45);
    tone(1568, now + 0.29, 0.35, "triangle", 0.35);
    tone(2200, now + 0.31, 0.16, "sine", 0.16);
  } else {
    // Separate lower-pitched decline sound
    tone(330, now, 0.24, "triangle", 0.35);
    tone(220, now + 0.2, 0.38, "sine", 0.3);
  }
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [resetting, setResetting] = useState(false);
  const [view, setView] = useState<"pending" | "history">("pending");

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  // Animation states
  const [incomingAnimationId, setIncomingAnimationId] = useState("");
  const [exitingId, setExitingId] = useState("");
  const [exitDecision, setExitDecision] = useState<
    "accepted" | "declined" | ""
  >("");
  const [decisionPopup, setDecisionPopup] =
    useState<DecisionPopup | null>(null);

  // Track previous submissions so initial page load does not animate everything.
  const submissionsRef = useRef<Submission[]>([]);
  const hasLoadedSubmissions = useRef(false);

  const pageStyle: CSSProperties = {
    height: "100dvh",
    minHeight: 0,
    width: "100%",
    padding: 10,
    boxSizing: "border-box",
    overflow: "hidden",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
    background:
      "radial-gradient(ellipse at center, #173c2c 0%, #0c241b 70%, #080e0b 100%)",
  };

  const triggerIncomingAnimation = useCallback((id: string) => {
    if (!id) return;

    setIncomingAnimationId(id);

    window.setTimeout(() => {
      setIncomingAnimationId((current) => (current === id ? "" : current));
    }, 1100);
  }, []);

  const loadSubmissions = useCallback(async () => {
    if (!supabase) return;

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Loading submissions failed:", error);
      setLoadError(`Couldn't load submissions: ${error.message}`);
      setLoading(false);
      return;
    }

    const nextRows = (data || []) as Submission[];

    // Animate a newly arrived pending submission, but not the first page load.
    if (hasLoadedSubmissions.current) {
      const previousIds = new Set(
        submissionsRef.current.map((item) => item.id)
      );

      const newlyArrived = nextRows
        .filter(
          (item) =>
            item.status === "pending" && !previousIds.has(item.id)
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

      if (newlyArrived.length > 0) {
        triggerIncomingAnimation(newlyArrived[0].id);
      }
    }

    submissionsRef.current = nextRows;
    hasLoadedSubmissions.current = true;

    setSubmissions(nextRows);
    setLoading(false);
  }, [triggerIncomingAnimation]);

  useEffect(() => {
    if (!supabase) {
      setCheckingLogin(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingLogin(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setSubmissions([]);
      submissionsRef.current = [];
      hasLoadedSubmissions.current = false;
      return;
    }

    loadSubmissions();

    const channel = supabase
      .channel("askxo-submissions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
        },
        () => {
          loadSubmissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, loadSubmissions]);

  // Automatically dismiss the decision popup after a few seconds.
  useEffect(() => {
    if (!decisionPopup) return;

    const timeout = window.setTimeout(() => {
      setDecisionPopup(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [decisionPopup]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;

    setLoggingIn(true);
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
    }

    setLoggingIn(false);
  }

  async function handleLogout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setSubmissions([]);
    submissionsRef.current = [];
    hasLoadedSubmissions.current = false;
    setPassword("");
  }

  async function endStream() {
    if (!supabase || resetting || processingId) return;

    const confirmed = window.confirm(
      "END STREAM?\n\nThis permanently deletes every submission in Pending and History and restarts numbering at #1.\n\nThis cannot be undone."
    );

    if (!confirmed) return;

    setResetting(true);
    setLoadError("");
    setDecisionPopup(null);
    setIncomingAnimationId("");
    setExitingId("");

    try {
      const { error } = await supabase.rpc("reset_askxo_submissions");

      if (error) {
        console.error("Stream reset failed:", error);

        const message = `End Stream failed: ${error.message}`;

        setLoadError(message);
        alert(`${message}\n\nYour submissions have not been cleared.`);
        return;
      }

      setSubmissions([]);
      submissionsRef.current = [];
      hasLoadedSubmissions.current = true;
      setView("pending");

      alert(
        "STREAM ENDED!\n\nPending and History are empty. Your next submission will be #1."
      );

      await loadSubmissions();
    } catch (error) {
      console.error("Unexpected stream reset error:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      setLoadError(`End Stream failed: ${message}`);
      alert(`End Stream failed: ${message}`);
    } finally {
      setResetting(false);
    }
  }

  async function processSubmission(
    item: Submission,
    status: "accepted" | "declined"
  ) {
    if (!supabase || processingId || resetting) return;

    setProcessingId(item.id);
    setLoadError("");

    // Animate the current submission away before updating the database.
    setExitingId(item.id);
    setExitDecision(status);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 580));

      // Start or resume audio during the button interaction.
      if (typeof window !== "undefined" && "AudioContext" in window) {
        if (!decisionAudioContext) {
          decisionAudioContext = new AudioContext();
        }

        if (decisionAudioContext.state === "suspended") {
          await decisionAudioContext.resume();
        }
      }

      const { error } = await supabase
        .from("submissions")
        .update({
          status,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) {
        console.error("Submission update failed:", error);
        setLoadError(`Couldn't update submission: ${error.message}`);
        alert(`Couldn't update this submission: ${error.message}`);
        return;
      }

      if (!muted && volume > 0 && decisionAudioContext) {
        playDecisionSound(decisionAudioContext, status, volume);
      }

      // Show the confirmation popup.
      setDecisionPopup({
        status,
        submissionType: item.submission_type,
        username: item.tiktok_username,
        number: item.submission_number,
      });

      // The next pending item becomes current. Animate it into place.
      const nextSubmission = pending[1] ?? null;

      await loadSubmissions();

      if (nextSubmission) {
        triggerIncomingAnimation(nextSubmission.id);
      }
    } catch (error) {
      console.error("Could not process submission:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      setLoadError(`Something went wrong: ${message}`);
      alert(`Something went wrong: ${message}`);
    } finally {
      setExitingId("");
      setExitDecision("");
      setProcessingId("");
    }
  }

  const pending = submissions
    .filter((item) => item.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    );

  const history = submissions
    .filter((item) => item.status !== "pending")
    .sort(
      (a, b) =>
        new Date(b.processed_at || b.created_at).getTime() -
        new Date(a.processed_at || a.created_at).getTime()
    );

  const currentSubmission = pending[0] ?? null;
  const nextUp = pending.slice(1, 5);

  if (!supabase) {
    return (
      <main style={pageStyle}>
        <h1>ASK <span style={{ color: gold }}>XO</span></h1>
        <p>Supabase environment variables are missing. Check Vercel settings.</p>
      </main>
    );
  }

  if (checkingLogin) {
    return (
      <main style={pageStyle}>
        <h1>ASK <span style={{ color: gold }}>XO</span></h1>
        <p>Checking secure login...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="login-page" style={pageStyle}>
        <section className="login-panel">
          <h1 className="brand">
            ASK <span>XO</span>
          </h1>
          <p className="eyebrow">PRIVATE STREAMER DASHBOARD</p>
          <h2>Streamer Login</h2>

          <form onSubmit={handleLogin}>
            <label>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your Supabase login email"
              required
            />

            <label>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />

            {loginError && <p className="error">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="gold-button login-button"
            >
              {loggingIn ? "SIGNING IN..." : "ENTER DASHBOARD"}
            </button>
          </form>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div className="casino-table">
        <header className="top-bar">
          <div>
            <h1 className="brand">
              ASK <span>XO</span>
            </h1>
            <p className="eyebrow">THE WEEKEND XO TABLE</p>
          </div>

          <div className="top-controls">
            <div className="sound-control">
              <button
                type="button"
                className="small-control"
                onClick={() => setMuted(!muted)}
                title={muted ? "Unmute sound" : "Mute sound"}
              >
                {muted ? "🔇 MUTED" : "🔊 SOUND"}
              </button>

              <input
                aria-label="Sound volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />

              <span className="volume-number">{volume}%</span>
            </div>

            <button
              type="button"
              className="end-stream-button"
              onClick={endStream}
              disabled={resetting || loading || !!processingId}
            >
              {resetting ? "ENDING..." : "END STREAM"}
            </button>

            <button
              type="button"
              className="small-control"
              onClick={handleLogout}
            >
              LOG OUT
            </button>
          </div>
        </header>

        <div className="table-status">
          <span className="status-dot" />
          STREAM CONTROL CENTER
          <span className="status-divider">|</span>
          {pending.length} WAITING
          <span className="status-divider">|</span>
          {history.length} COMPLETED
        </div>

        <nav className="view-tabs">
          <button
            className={view === "pending" ? "tab active-tab" : "tab"}
            onClick={() => setView("pending")}
          >
            LIVE TABLE ({pending.length})
          </button>

          <button
            className={view === "history" ? "tab active-tab" : "tab"}
            onClick={() => setView("history")}
          >
            HISTORY ({history.length})
          </button>

          <button
            className="tab refresh-tab"
            onClick={loadSubmissions}
            disabled={loading || resetting}
          >
            {loading ? "LOADING..." : "↻ REFRESH"}
          </button>
        </nav>

        {loadError && <div className="error-banner">{loadError}</div>}

        {view === "pending" ? (
          <>
            <section className="main-table-area">
              {loading && !currentSubmission ? (
                <div className="empty-table">Loading submissions...</div>
              ) : currentSubmission ? (
                <>
                  <div className="current-heading">
                    <span className="gold-line" />
                    CURRENT SUBMISSION
                    <span className="gold-line" />
                  </div>

                  <div
                    className={[
                      "current-submission",
                      incomingAnimationId === currentSubmission.id
                        ? "submission-enter"
                        : "",
                      exitingId === currentSubmission.id
                        ? `submission-exit-${exitDecision}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="submission-content">
                      <div className="submission-topline">
                        <div>
                          <div className="username">
                            {currentSubmission.tiktok_username}
                          </div>
                          <div className="submission-time">
                            {new Date(
                              currentSubmission.created_at
                            ).toLocaleString()}
                          </div>
                        </div>

                        <span className="pending-badge">PENDING</span>
                      </div>

                      <h2 className="question-title">
                        {currentSubmission.submission_type === "trade"
                          ? "TRADE QUESTION"
                          : "START / SIT QUESTION"}
                      </h2>

                      {currentSubmission.submission_type === "trade" ? (
                        <div className="trade-grid">
                          <div className="trade-side give-side">
                            <h3>THEY GIVE</h3>

                            {currentSubmission.give_players?.length ? (
                              currentSubmission.give_players.map(
                                (player, index) => (
                                  <PlayerBar
                                    key={player.id || index}
                                    player={player}
                                  />
                                )
                              )
                            ) : (
                              <p className="no-players">No players listed</p>
                            )}
                          </div>

                          <div className="trade-side get-side">
                            <h3>THEY GET</h3>

                            {currentSubmission.get_players?.length ? (
                              currentSubmission.get_players.map(
                                (player, index) => (
                                  <PlayerBar
                                    key={player.id || index}
                                    player={player}
                                  />
                                )
                              )
                            ) : (
                              <p className="no-players">No players listed</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="start-sit-area">
                          <h3>PLAYERS TO COMPARE</h3>

                          {currentSubmission.players?.map(
                            (player, index) => (
                              <PlayerBar
                                key={player.id || index}
                                player={player}
                              />
                            )
                          )}
                        </div>
                      )}

                      <div className="decision-buttons">
                        <button
                          type="button"
                          disabled={!!processingId || resetting}
                          onClick={() =>
                            processSubmission(currentSubmission, "accepted")
                          }
                          className="accept-button"
                        >
                          {processingId === currentSubmission.id
                            ? "PROCESSING..."
                            : "✓ ACCEPT"}
                        </button>

                        <button
                          type="button"
                          disabled={!!processingId || resetting}
                          onClick={() =>
                            processSubmission(currentSubmission, "declined")
                          }
                          className="decline-button"
                        >
                          {processingId === currentSubmission.id
                            ? "PROCESSING..."
                            : "✕ DECLINE"}
                        </button>
                      </div>
                    </div>

                    <SubmissionChip
                      number={currentSubmission.submission_number}
                    />
                  </div>
                </>
              ) : (
                <div className="empty-table">
                  <div className="empty-chip">XO</div>
                  <h2>THE TABLE IS WAITING</h2>
                  <p>No pending submissions right now.</p>
                  <span>New questions will appear here automatically.</span>
                </div>
              )}
            </section>

            <section className="queue-section">
              <div className="queue-label">NEXT UP</div>

              {Array.from({ length: 4 }).map((_, index) => {
                const item = nextUp[index];

                return (
                  <div
                    className={[
                      item ? "queue-name" : "queue-name queue-empty",
                      item && incomingAnimationId === item.id
                        ? "queue-entry"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={item?.id || `empty-${index}`}
                    title={item?.tiktok_username || "Waiting for submission"}
                  >
                    {item ? queueName(item.tiktok_username) : "WAITING..."}
                  </div>
                );
              })}
            </section>

            <p className="queue-note">
              NEXT FOUR SUBMISSIONS · FIRST IN, FIRST UP
            </p>
          </>
        ) : (
          <section className="history-area">
            <div className="current-heading">
              <span className="gold-line" />
              COMPLETED SUBMISSIONS
              <span className="gold-line" />
            </div>

            {history.length === 0 ? (
              <div className="empty-table">
                <h2>NO HISTORY YET</h2>
                <p>Accepted and declined submissions will appear here.</p>
              </div>
            ) : (
              history.map((item) => (
                <article className="history-item" key={item.id}>
                  <div className="history-top">
                    <div>
                      <strong className="username">
                        {item.tiktok_username}
                      </strong>
                      <p className="submission-time">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="history-right">
                      <span className="history-number">
                        #{item.submission_number ?? "—"}
                      </span>

                      <span
                        className={
                          item.status === "accepted"
                            ? "accepted-badge"
                            : "declined-badge"
                        }
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="history-type">
                    {item.submission_type === "trade"
                      ? "TRADE QUESTION"
                      : "START / SIT QUESTION"}
                  </h3>

                  {item.submission_type === "trade" ? (
                    <div className="trade-grid">
                      <div className="trade-side give-side">
                        <h3>THEY GIVE</h3>
                        {item.give_players?.map((player, index) => (
                          <PlayerBar
                            key={player.id || index}
                            player={player}
                          />
                        ))}
                      </div>

                      <div className="trade-side get-side">
                        <h3>THEY GET</h3>
                        {item.get_players?.map((player, index) => (
                          <PlayerBar
                            key={player.id || index}
                            player={player}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="start-sit-area">
                      {item.players?.map((player, index) => (
                        <PlayerBar
                          key={player.id || index}
                          player={player}
                        />
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        <footer className="table-footer">
          ASK XO <span>·</span> PRIVATE STREAMER CONTROL
        </footer>
      </div>

      {decisionPopup && (
        <div
          className={`decision-popup-backdrop ${decisionPopup.status}`}
          onClick={() => setDecisionPopup(null)}
        >
          <div
            className={`decision-popup ${decisionPopup.status}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popup-icon">
              {decisionPopup.status === "accepted" ? "✓" : "✕"}
            </div>

            <p className="popup-eyebrow">
              ASK XO · SUBMISSION #{decisionPopup.number ?? "—"}
            </p>

            <h2>
              {decisionPopup.submissionType === "trade" ? "TRADE" : "QUESTION"}{" "}
              {decisionPopup.status.toUpperCase()}!
            </h2>

            <p className="popup-username">
              @{decisionPopup.username}
            </p>

            <button
              type="button"
              onClick={() => setDecisionPopup(null)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  .casino-table {
    width: 100%;
    height: calc(100dvh - 20px);
    min-height: 0;
    max-width: 1800px;
    margin: 0 auto;
    padding: 18px 24px 12px;
    border: 5px solid #9d7a3d;
    border-radius: 34px;
    outline: 2px solid #d6b76e;
    outline-offset: -12px;
    background:
      radial-gradient(ellipse at 50% 42%, rgba(50,112,75,.48), transparent 65%),
      repeating-linear-gradient(115deg, rgba(255,255,255,.012) 0px, rgba(255,255,255,.012) 1px, transparent 2px, transparent 5px),
      radial-gradient(ellipse at center, #20543b 0%, #123b2b 62%, #0b2a1e 100%);
    box-shadow:
      inset 0 0 0 5px #192019,
      inset 0 0 70px rgba(0,0,0,.6),
      0 20px 70px rgba(0,0,0,.65);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    flex-shrink: 0;
    padding: 4px 12px 12px;
    border-bottom: 1px solid rgba(232,199,125,.38);
  }

  .brand {
    color: #f3f1eb;
    font-size: clamp(26px, 3vw, 43px);
    font-weight: 900;
    letter-spacing: 3px;
    margin: 0;
    text-shadow: 0 2px 8px rgba(0,0,0,.5);
  }

  .brand span {
    color: ${gold};
  }

  .eyebrow {
    color: #c9b98f;
    font-size: 10px;
    letter-spacing: 4px;
    margin: 7px 0 0;
  }

  .top-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sound-control {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    background: rgba(0,0,0,.24);
    border: 1px solid rgba(232,199,125,.42);
    border-radius: 9px;
  }

  .sound-control input {
    width: 85px;
    accent-color: ${gold};
    cursor: pointer;
  }

  .volume-number {
    min-width: 34px;
    color: #e5d5ad;
    font-size: 10px;
  }

  .small-control,
  .end-stream-button {
    padding: 10px 12px;
    border-radius: 8px;
    background: linear-gradient(#343a35, #171d19);
    color: #f4ead2;
    border: 1px solid #92794d;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
    white-space: nowrap;
  }

  .end-stream-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 10px 16px;
    background: linear-gradient(#853c32, #4e211d);
    border: 1px solid #c17b62;
    color: #fff2e8;
    box-shadow: 0 0 12px rgba(193,123,98,.18);
  }

  button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .table-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
    padding: 10px 8px 5px;
    color: #e3d2a9;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #78d28d;
    box-shadow: 0 0 10px #78d28d;
  }

  .status-divider {
    color: #8d7950;
  }

  .view-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    flex-shrink: 0;
    gap: 9px;
    margin: 5px 0 8px;
  }

  .tab {
    padding: 9px 15px;
    border-radius: 7px;
    border: 1px solid rgba(232,199,125,.45);
    background: rgba(0,0,0,.22);
    color: #e8d8b5;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .active-tab {
    color: #17140e;
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    border-color: #f5dda1;
    box-shadow: 0 0 13px rgba(232,199,125,.2);
  }

  .refresh-tab {
    margin-left: 10px;
  }

  .main-table-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 4px 0;
  }

  .current-heading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-shrink: 0;
    color: #f0dba8;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 4px;
    text-align: center;
    margin: 5px 0 10px;
  }

  .gold-line {
    width: min(15vw, 130px);
    height: 1px;
    background: linear-gradient(90deg, transparent, #d4b46d);
  }

  .gold-line:last-child {
    transform: rotate(180deg);
  }

  .current-submission {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 190px;
    align-items: center;
    gap: 20px;
    width: 100%;
    max-width: 1250px;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    margin: 0 auto;
    padding: clamp(10px, 1.5vh, 20px);
    border: 1px solid rgba(226,195,128,.55);
    border-radius: 20px;
    background: linear-gradient(145deg, rgba(8,26,18,.82), rgba(15,48,33,.82));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.07),
      0 12px 30px rgba(0,0,0,.24);
    transform-origin: center;
    will-change: transform, opacity;
  }

  /* Incoming submission animation */
  .submission-enter {
    animation: submissionEnter .75s cubic-bezier(.2,.8,.2,1) both;
  }

  /* Accepted submissions swipe out to the right */
  .submission-exit-accepted {
    animation: submissionSwipeOutRight .58s ease-in forwards;
    pointer-events: none;
  }

  /* Declined submissions swipe out to the left */
  .submission-exit-declined {
    animation: submissionSwipeOutLeft .58s ease-in forwards;
    pointer-events: none;
  }

  @keyframes submissionEnter {
    0% {
      opacity: 0;
      transform: translateY(35px) scale(.94);
      filter: blur(4px);
    }
    70% {
      opacity: 1;
      transform: translateY(-3px) scale(1.01);
      filter: blur(0);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  @keyframes submissionSwipeOutRight {
    0% {
      opacity: 1;
      transform: translateX(0) rotate(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(115%) rotate(5deg) scale(.9);
      filter: blur(3px);
    }
  }

  @keyframes submissionSwipeOutLeft {
    0% {
      opacity: 1;
      transform: translateX(0) rotate(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-115%) rotate(-5deg) scale(.9);
      filter: blur(3px);
    }
  }

  /* A new name briefly highlights in the Next Up queue */
  .queue-entry {
    animation: queueEntry .9s ease-out both;
  }

  @keyframes queueEntry {
    0% {
      opacity: 0;
      transform: translateY(12px) scale(.94);
      background: rgba(232,199,125,.55);
      color: #17140e;
    }
    55% {
      opacity: 1;
      transform: translateY(-2px) scale(1.02);
      background: rgba(232,199,125,.28);
      color: #fff3d7;
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .submission-content {
    min-width: 0;
  }

  .submission-topline,
  .history-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .username {
    color: #f1d38e;
    font-size: 21px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  .submission-time {
    color: #b5b7ad;
    font-size: 11px;
    margin: 5px 0;
  }

  .pending-badge,
  .accepted-badge,
  .declined-badge {
    padding: 7px 12px;
    border: 1px solid #d3b16b;
    border-radius: 30px;
    color: #f0d89f;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .question-title {
    color: #f2e9d5;
    font-size: 14px;
    letter-spacing: 3px;
    margin: 13px 0 9px;
  }

  .trade-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    min-width: 0;
  }

  .trade-side {
    min-width: 0;
    padding: 9px;
    border-radius: 12px;
  }

  .trade-side h3,
  .start-sit-area h3 {
    font-size: 12px;
    letter-spacing: 2px;
    margin: 0 0 7px;
  }

  .give-side {
    background: rgba(75,35,32,.48);
    border: 1px solid rgba(187,105,89,.55);
  }

  .give-side h3 {
    color: #e7a49a;
  }

  .get-side {
    background: rgba(24,67,43,.55);
    border: 1px solid rgba(113,175,123,.55);
  }

  .get-side h3 {
    color: #a4e1ad;
  }

  .player-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px;
    margin-bottom: 4px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    background: rgba(0,0,0,.28);
    min-width: 0;
  }

  .player-bar img,
  .player-placeholder {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 50%;
    object-fit: cover;
    background: #38483e;
    border: 1px solid rgba(232,199,125,.4);
  }

  .player-placeholder {
    display: grid;
    place-items: center;
    color: #e8c77d;
    font-weight: 900;
  }

  .player-info {
    min-width: 0;
  }

  .player-info strong {
    display: block;
    color: #fff;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .player-info span {
    display: block;
    color: #c3c5bd;
    font-size: 10px;
    margin-top: 3px;
  }

  .no-players {
    color: #c5bda9;
    font-size: 12px;
  }

  .start-sit-area {
    max-width: 700px;
    max-height: 100%;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid rgba(232,199,125,.35);
    border-radius: 12px;
    background: rgba(0,0,0,.2);
  }

  .start-sit-area h3 {
    color: #e8c77d;
  }

  .decision-buttons {
    display: flex;
    gap: 12px;
    margin-top: 9px;
  }

  .decision-buttons button {
    flex: 1;
    padding: 11px;
    border-radius: 9px;
    color: white;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 2px;
    cursor: pointer;
  }

  .accept-button {
    border: 1px solid #8ac69b;
    background: linear-gradient(135deg, #28764a, #16452e);
    box-shadow: 0 4px 14px rgba(0,0,0,.2);
  }

  .decline-button {
    border: 1px solid #c98275;
    background: linear-gradient(135deg, #8b4038, #542622);
    box-shadow: 0 4px 14px rgba(0,0,0,.2);
  }

  .chip-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .chip {
    width: clamp(115px, 16vh, 175px);
    height: clamp(115px, 16vh, 175px);
    display: grid;
    place-items: center;
    border-radius: 50%;
    padding: 13px;
    background:
      repeating-conic-gradient(
        from 0deg,
        #e7d29d 0deg 9deg,
        #76572c 9deg 13deg,
        #e7d29d 13deg 22deg
      );
    box-shadow:
      0 12px 28px rgba(0,0,0,.6),
      inset 0 0 0 3px #f4dfaa,
      inset 0 0 0 7px #6b512e;
  }

  .chip-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 3px double #d9bd7c;
    background: radial-gradient(circle at 35% 28%, #3b4540, #141a17 70%);
    box-shadow: inset 0 0 20px rgba(0,0,0,.8);
  }

  .chip-label,
  .chip-bottom {
    color: #d9c18b;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 3px;
  }

  .chip-number {
    color: #f6dfaa;
    font-size: clamp(28px, 4vh, 40px);
    font-weight: 900;
    text-shadow: 0 2px 10px rgba(0,0,0,.8);
    margin: 5px 0;
  }

  .empty-table {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #d9cba9;
    border: 1px dashed rgba(232,199,125,.35);
    border-radius: 16px;
    background: rgba(0,0,0,.12);
    padding: 20px;
  }

  .empty-table h2 {
    color: #f0d89f;
    letter-spacing: 3px;
    font-size: 16px;
  }

  .empty-table p,
  .empty-table span {
    color: #c0c5bc;
    font-size: 12px;
  }

  .empty-chip {
    display: grid;
    place-items: center;
    width: 75px;
    height: 75px;
    border-radius: 50%;
    border: 5px dashed #c9a762;
    color: #f0d89f;
    font-size: 22px;
    font-weight: 900;
  }

  .queue-section {
    display: grid;
    grid-template-columns: 120px repeat(4, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
    flex-shrink: 0;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid #b18b50;
    border-radius: 12px;
    background: linear-gradient(90deg, rgba(8,19,13,.88), rgba(19,54,37,.85));
    box-shadow: inset 0 0 15px rgba(0,0,0,.3);
  }

  .queue-label,
  .queue-name {
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 9px;
    border-radius: 7px;
    text-align: center;
    overflow: hidden;
  }

  .queue-label {
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    color: #211b10;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .queue-name {
    border: 1px solid rgba(232,199,125,.48);
    background: rgba(37,78,54,.8);
    color: #fff3d7;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .queue-empty {
    color: #a8b4a8;
    border-style: dashed;
    background: rgba(0,0,0,.14);
    font-size: 10px;
    letter-spacing: 1px;
  }

  .queue-note {
    flex-shrink: 0;
    color: #bca77c;
    font-size: 9px;
    text-align: center;
    letter-spacing: 2px;
    margin: 6px 0 0;
  }

  .history-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    max-width: 1250px;
    width: 100%;
    margin: 0 auto;
    padding: 8px 5px 15px;
  }

  .history-item {
    margin-bottom: 14px;
    padding: 18px;
    border: 1px solid rgba(232,199,125,.3);
    border-radius: 12px;
    background: rgba(4,19,12,.65);
  }

  .history-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .history-number {
    color: #e8c77d;
    font-weight: 900;
  }

  .accepted-badge {
    color: #a4e1ad;
    border-color: #5d9c6d;
  }

  .declined-badge {
    color: #e7a49a;
    border-color: #a65e53;
  }

  .history-type {
    color: #e8c77d;
    font-size: 11px;
    letter-spacing: 2px;
    margin: 12px 0 8px;
  }

  .table-footer {
    flex-shrink: 0;
    padding: 10px 0 0;
    text-align: center;
    color: #bba77d;
    font-size: 9px;
    letter-spacing: 3px;
  }

  .table-footer span {
    color: #f0d89f;
    padding: 0 5px;
  }

  .error-banner {
    flex-shrink: 0;
    margin: 5px 0;
    padding: 8px 12px;
    border: 1px solid #b45c50;
    border-radius: 8px;
    color: #ffd0c8;
    background: rgba(100,25,20,.5);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  /* Accept / decline confirmation popup */
  .decision-popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0,0,0,.72);
    backdrop-filter: blur(5px);
    animation: popupFadeIn .2s ease-out both;
  }

  .decision-popup {
    width: min(460px, 100%);
    padding: 34px 28px;
    text-align: center;
    border-radius: 22px;
    background: linear-gradient(145deg, #17271e, #09140e);
    border: 2px solid #e8c77d;
    box-shadow:
      0 25px 80px rgba(0,0,0,.7),
      0 0 30px rgba(232,199,125,.2);
    animation: popupPop .32s cubic-bezier(.2,.8,.2,1) both;
  }

  .decision-popup.accepted {
    border-color: #8ac69b;
    box-shadow:
      0 25px 80px rgba(0,0,0,.7),
      0 0 32px rgba(100,205,130,.2);
  }

  .decision-popup.declined {
    border-color: #c98275;
    box-shadow:
      0 25px 80px rgba(0,0,0,.7),
      0 0 32px rgba(205,100,90,.2);
  }

  .popup-icon {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    margin: 0 auto 18px;
    border: 2px solid #e8c77d;
    border-radius: 50%;
    color: #f0d89f;
    font-size: 38px;
    font-weight: 900;
    background: rgba(232,199,125,.1);
  }

  .accepted .popup-icon {
    border-color: #8ac69b;
    color: #a4e1ad;
    background: rgba(100,205,130,.1);
  }

  .declined .popup-icon {
    border-color: #c98275;
    color: #e7a49a;
    background: rgba(205,100,90,.1);
  }

  .popup-eyebrow {
    color: #c9b98f;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .decision-popup h2 {
    color: #f0d89f;
    font-size: clamp(24px, 4vw, 34px);
    letter-spacing: 2px;
    margin: 13px 0;
  }

  .decision-popup.accepted h2 {
    color: #a4e1ad;
  }

  .decision-popup.declined h2 {
    color: #e7a49a;
  }

  .popup-username {
    color: #eee5d2;
    font-size: 15px;
    margin-bottom: 24px;
  }

  .decision-popup button {
    min-width: 130px;
    padding: 11px 22px;
    border: 1px solid #d3b16b;
    border-radius: 8px;
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    color: #211b10;
    font-weight: 900;
    letter-spacing: 2px;
    cursor: pointer;
  }

  @keyframes popupFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes popupPop {
    0% {
      opacity: 0;
      transform: translateY(20px) scale(.88);
    }
    75% {
      opacity: 1;
      transform: translateY(-3px) scale(1.02);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-panel {
    width: 100%;
    max-width: 420px;
    padding: 30px;
    border: 2px solid #a8874c;
    border-radius: 18px;
    background: linear-gradient(145deg, #172a20, #101713);
    box-shadow: 0 15px 50px rgba(0,0,0,.5);
  }

  .login-panel .brand {
    text-align: center;
    font-size: 42px;
  }

  .login-panel .eyebrow {
    text-align: center;
    margin-bottom: 28px;
  }

  .login-panel h2 {
    text-align: center;
    color: #f1dfb8;
    margin-bottom: 24px;
  }

  .login-panel label {
    display: block;
    color: #e5d4ad;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
    margin: 15px 0 7px;
  }

  .login-panel input {
    width: 100%;
    padding: 14px;
    border: 1px solid #6d715e;
    border-radius: 8px;
    background: #101a14;
    color: white;
    outline: none;
  }

  .login-button {
    width: 100%;
    margin-top: 20px;
    padding: 14px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    color: #20190e;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .error {
    color: #ff9999;
    font-size: 12px;
  }

  @media (max-height: 800px) {
    .casino-table {
      padding-top: 12px;
      padding-bottom: 8px;
    }

    .brand {
      font-size: 30px;
    }

    .top-bar {
      padding-bottom: 8px;
    }

    .table-status {
      padding-top: 6px;
    }

    .view-tabs {
      margin-bottom: 5px;
    }

    .current-heading {
      margin: 3px 0 7px;
    }

    .username {
      font-size: 18px;
    }

    .question-title {
      margin: 9px 0 7px;
    }

    .queue-section {
      margin-top: 6px;
      padding: 7px;
    }

    .queue-name,
    .queue-label {
      min-height: 38px;
    }

    .queue-note {
      margin-top: 4px;
    }

    .table-footer {
      padding-top: 6px;
    }
  }

  @media (max-width: 800px) {
    .casino-table {
      padding: 12px;
      border-width: 3px;
      border-radius: 22px;
    }

    .top-bar {
      gap: 10px;
    }

    .top-controls {
      justify-content: flex-start;
      width: 100%;
    }

    .current-submission {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }

    .chip-wrap {
      grid-row: 1;
    }

    .chip {
      width: 100px;
      height: 100px;
    }

    .chip-number {
      font-size: 25px;
    }

    .trade-grid {
      grid-template-columns: 1fr;
    }

    .main-table-area {
      overflow-y: auto;
    }
  }

  @media (max-width: 560px) {
    .top-controls {
      gap: 6px;
    }

    .sound-control {
      flex-wrap: wrap;
    }

    .queue-section {
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .queue-label {
      grid-column: 1 / -1;
    }

    .queue-name {
      min-height: 36px;
    }

    .decision-buttons {
      flex-direction: column;
    }

    .current-submission {
      padding: 10px;
    }

    .table-status {
      font-size: 9px;
      letter-spacing: 1px;
    }

    .refresh-tab {
      margin-left: 0;
    }

    .brand {
      font-size: 25px;
    }

    .eyebrow {
      letter-spacing: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .submission-enter,
    .submission-exit-accepted,
    .submission-exit-declined,
    .queue-entry,
    .decision-popup-backdrop,
    .decision-popup {
      animation-duration: .01ms !important;
    }
  }
`;
