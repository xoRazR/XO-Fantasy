
"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  imageUrl: string;
};

type Submission = {
  id: string;
  username: string;
  type: "Trade" | "Start/Sit";
  giving: Player[];
  receiving: Player[];
  players: Player[];
  createdAt: string;
};

const STORAGE_KEY = "xo-trades";

function PlayerPicker({
  label,
  selected,
  onSelect,
  onRemove,
  players,
  excludedIds,
  max,
}: {
  label: string;
  selected: Player[];
  onSelect: (player: Player) => void;
  onRemove: (id: string) => void;
  players: Player[];
  excludedIds: string[];
  max: number;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return [];

    return players
      .filter(
        (player) =>
          player.name.toLowerCase().includes(term) &&
          !excludedIds.includes(player.id)
      )
      .slice(0, 8);
  }, [search, players, excludedIds]);

  return (
    <section className="picker">
      <div className="picker-heading">
        <h3>{label}</h3>
        <span>{selected.length}/{max}</span>
      </div>

      {selected.map((player) => (
        <div className="selected-player" key={player.id}>
          <img
            src={player.imageUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
          <div className="player-details">
            <strong>{player.name}</strong>
            <span>{player.position} · {player.team}</span>
          </div>
          <button
            type="button"
            className="remove-button"
            onClick={() => onRemove(player.id)}
            aria-label={`Remove ${player.name}`}
          >
            ×
          </button>
        </div>
      ))}

      {selected.length < max && (
        <div className="search-wrap">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search NFL players..."
            autoComplete="off"
          />

          {open && search.trim() && (
            <div className="search-results">
              {results.length > 0 ? (
                results.map((player) => (
                  <button
                    type="button"
                    className="search-result"
                    key={player.id}
                    onClick={() => {
                      onSelect(player);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <img
                      src={player.imageUrl}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    <span>
                      <strong>{player.name}</strong>
                      <small>{player.position} · {player.team}</small>
                    </span>
                    <b>+</b>
                  </button>
                ))
              ) : (
                <p className="no-results">No matching players found.</p>
              )}
            </div>
          )}
        </div>
      )}

      {selected.length >= max && (
        <p className="helper-text">Maximum of {max} players selected.</p>
      )}
    </section>
  );
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [questionType, setQuestionType] = useState<"Trade" | "Start/Sit">(
    "Trade"
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [giving, setGiving] = useState<Player[]>([]);
  const [receiving, setReceiving] = useState<Player[]>([]);
  const [startSit, setStartSit] = useState<Player[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSubmissions(JSON.parse(saved));
    } catch {
      console.error("Could not load saved submissions.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/players");

        if (!response.ok) {
          throw new Error(`Player list request failed (${response.status}).`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error(data?.error || "The player list was not returned.");
        }

        if (!cancelled) {
          setPlayers(data);
          if (data.length === 0) {
            setError("No players were returned. Please try again.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the player list."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, []);

  const allSelectedIds = [
    ...giving.map((p) => p.id),
    ...receiving.map((p) => p.id),
    ...startSit.map((p) => p.id),
  ];

  function saveSubmission() {
    const cleanUsername = username.trim().replace(/^@/, "");

    if (!cleanUsername) {
      alert("Please enter your TikTok username.");
      return;
    }

    if (questionType === "Trade" && (!giving.length || !receiving.length)) {
      alert("Please select at least one player on both sides of the trade.");
      return;
    }

    if (questionType === "Start/Sit" && startSit.length < 2) {
      alert("Please select at least two players.");
      return;
    }

    const submission: Submission = {
      id: crypto.randomUUID(),
      username: cleanUsername,
      type: questionType,
      giving: questionType === "Trade" ? giving : [],
      receiving: questionType === "Trade" ? receiving : [],
      players: questionType === "Start/Sit" ? startSit : [],
      createdAt: new Date().toISOString(),
    };

    const updated = [submission, ...submissions];

    setSubmissions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    setGiving([]);
    setReceiving([]);
    setStartSit([]);
    setUsername("");
    setSuccess(true);

    window.setTimeout(() => setSuccess(false), 5000);
  }

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="/">
          ASK<span>XO</span>
        </a>
        <span className="live-label">
          <i /> FANTASY QUESTION CENTER
        </span>
      </header>

      <section className="hero">
        <p className="eyebrow">YOUR FANTASY. YOUR CALL.</p>
        <h1>
          ASK <span>XO.</span>
        </h1>
        <p className="hero-copy">
          Got a trade? Need a start or sit decision?
          <br />
          Send it in and get your question on the stream.
        </p>
      </section>

      <section className="form-card">
        <div className="section-top">
          <div>
            <p className="eyebrow">SUBMIT YOUR QUESTION</p>
            <h2>Let&apos;s hear it.</h2>
          </div>
          <span className="step-label">ASKXO</span>
        </div>

        <label className="field-label" htmlFor="username">
          YOUR TIKTOK USERNAME
        </label>
        <div className="username-input">
          <span>@</span>
          <input
            id="username"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.replace(/^@/, ""))
            }
            placeholder="yourusername"
            maxLength={30}
          />
        </div>

        <label className="field-label">WHAT ARE WE LOOKING AT?</label>
        <div className="type-buttons">
          <button
            type="button"
            className={questionType === "Trade" ? "type-button active" : "type-button"}
            onClick={() => setQuestionType("Trade")}
          >
            <span>⇄</span>
            <strong>TRADE</strong>
            <small>Who wins the deal?</small>
          </button>

          <button
            type="button"
            className={questionType === "Start/Sit" ? "type-button active" : "type-button"}
            onClick={() => setQuestionType("Start/Sit")}
          >
            <span>⚡</span>
            <strong>START / SIT</strong>
            <small>Who should I play?</small>
          </button>
        </div>

        <div className="player-area">
          {loading ? (
            <div className="status-message">
              <div className="spinner" />
              Loading NFL player list...
            </div>
          ) : error ? (
            <div className="error-message">
              <strong>Players could not load.</strong>
              <p>{error}</p>
              <button
                type="button"
                className="retry-button"
                onClick={() => window.location.reload()}
              >
                TRY AGAIN
              </button>
            </div>
          ) : questionType === "Trade" ? (
            <>
              <div className="trade-heading">
                <span>YOUR TRADE</span>
                <span>UP TO 4 PLAYERS PER SIDE</span>
              </div>

              <div className="trade-grid">
                <PlayerPicker
                  label="YOU GIVE"
                  selected={giving}
                  players={players}
                  max={4}
                  excludedIds={allSelectedIds.filter(
                    (id) => !giving.some((p) => p.id === id)
                  )}
                  onSelect={(player) =>
                    setGiving((old) => [...old, player])
                  }
                  onRemove={(id) =>
                    setGiving((old) => old.filter((p) => p.id !== id))
                  }
                />

                <div className="trade-arrow">⇄</div>

                <PlayerPicker
                  label="YOU GET"
                  selected={receiving}
                  players={players}
                  max={4}
                  excludedIds={allSelectedIds.filter(
                    (id) => !receiving.some((p) => p.id === id)
                  )}
                  onSelect={(player) =>
                    setReceiving((old) => [...old, player])
                  }
                  onRemove={(id) =>
                    setReceiving((old) => old.filter((p) => p.id !== id))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="trade-heading">
                <span>START / SIT COMPARISON</span>
                <span>SELECT 2 OR 3 PLAYERS</span>
              </div>

              <PlayerPicker
                label="CHOOSE YOUR PLAYERS"
                selected={startSit}
                players={players}
                max={3}
                excludedIds={allSelectedIds.filter(
                  (id) => !startSit.some((p) => p.id === id)
                )}
                onSelect={(player) =>
                  setStartSit((old) => [...old, player])
                }
                onRemove={(id) =>
                  setStartSit((old) => old.filter((p) => p.id !== id))
                }
              />
            </>
          )}
        </div>

        <button
          type="button"
          className="submit-button"
          onClick={saveSubmission}
          disabled={loading || !!error}
        >
          SUBMIT TO ASKXO <span>→</span>
        </button>

        {success && (
          <div className="success-message">
            Your question has been saved. You&apos;re in!
          </div>
        )}

        <p className="privacy-note">
          Make sure your TikTok username is correct so XO can find you.
        </p>
      </section>

      <footer className="footer">
        <strong>ASK<span>XO</span></strong>
        <p>FANTASY FOOTBALL. REAL TALK.</p>
      </footer>
    </main>
  );
}
