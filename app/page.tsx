
"use client";

import { useEffect, useState } from "react";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  imageUrl: string;
};

type QuestionType = "Trade" | "Start/Sit";

type Submission = {
  id: string;
  tiktok: string;
  type: QuestionType;
  sending: string[];
  receiving: string[];
  players: string[];
  createdAt: string;
};

type PlayerPickerProps = {
  label: string;
  players: Player[];
  value: string;
  excludedIds: string[];
  onChange: (id: string) => void;
};

function PlayerPicker({
  label,
  players,
  value,
  excludedIds,
  onChange
}: PlayerPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = players.find((p) => p.id === value);

  const matches = query.trim()
    ? players.filter((player) =>
        player.name.toLowerCase().includes(query.toLowerCase()) &&
        (!excludedIds.includes(player.id) || player.id === value)
      ).slice(0, 8)
    : [];

  return (
    <div style={{ marginBottom: 18, position: "relative" }}>
      <label>{label}</label>

      {selected && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 10,
          background: "#252525",
          border: "1px solid #e8b84d",
          borderRadius: 10,
          marginBottom: 8
        }}>
          <img
            src={selected.imageUrl}
            alt=""
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              background: "#444"
            }}
          />

          <div style={{ flex: 1 }}>
            <strong>{selected.name}</strong>
            <div style={{ color: "#aaa", fontSize: 12 }}>
              {selected.position} · {selected.team}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            style={{
              width: "auto",
              padding: 8,
              background: "#444",
              color: "white"
            }}
          >
            Remove
          </button>
        </div>
      )}

      <input
        type="search"
        value={query}
        placeholder="Type a player's name..."
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && query.trim() !== "" && (
        <div style={{
          background: "#202020",
          border: "1px solid #444",
          borderRadius: 10,
          maxHeight: 320,
          overflowY: "auto",
          marginTop: -8,
          marginBottom: 12,
          position: "relative",
          zIndex: 10
        }}>
          {matches.length > 0 ? (
            matches.map((player) => (
              <button
                type="button"
                key={player.id}
                onClick={() => {
                  onChange(player.id);
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: 10,
                  background: "transparent",
                  color: "white",
                  borderBottom: "1px solid #383838",
                  borderRadius: 0,
                  textAlign: "left",
                  letterSpacing: 0
                }}
              >
                <img
                  src={player.imageUrl}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  style={{
                    width: 45,
                    height: 45,
                    borderRadius: "50%",
                    objectFit: "cover",
                    background: "#444"
                  }}
                />

                <span style={{ flex: 1 }}>
                  <strong>{player.name}</strong>
                  <span style={{
                    display: "block",
                    fontSize: 11,
                    color: "#aaa",
                    marginTop: 3
                  }}>
                    {player.position} · {player.team}
                  </span>
                </span>

                <span style={{ color: "#e8b84d" }}>+</span>
              </button>
            ))
          ) : (
            <p style={{
              padding: 15,
              color: "#aaa",
              fontSize: 13
            }}>
              No matching players found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [tiktok, setTiktok] = useState("");
  const [type, setType] = useState<QuestionType | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [playerError, setPlayerError] = useState("");
  const [retry, setRetry] = useState(0);

  const [sending, setSending] = useState<string[]>([""]);
  const [receiving, setReceiving] = useState<string[]>([""]);
  const [startSit, setStartSit] = useState<string[]>(["", ""]);

  const [queue, setQueue] = useState<Submission[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setPlayerError("");

      try {
        const response = await fetch("/api/players");

        if (!response.ok) {
          throw new Error("Player database could not load.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Invalid player data.");
        }

        if (!cancelled) {
          setPlayers(data);
        }
      } catch {
        if (!cancelled) {
          setPlayerError(
            "We couldn't load the ESPN player list. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("xo-trades") || "[]"
      );

      setQueue(
        saved.map((item: any) => ({
          id: item.id,
          tiktok: item.tiktok || item.team || "@unknown",
          type: item.type || "Trade",
          sending: item.sending || [],
          receiving: item.receiving || [],
          players: item.players || [],
          createdAt: item.createdAt || ""
        }))
      );
    } catch {
      setQueue([]);
    }
  }, []);

  function saveQueue(updated: Submission[]) {
    setQueue(updated);
    localStorage.setItem("xo-trades", JSON.stringify(updated));
  }

  function addPlayer(
    list: string[],
    setter: (value: string[]) => void,
    max: number
  ) {
    if (list.length < max) {
      setter([...list, ""]);
    }
  }

  function updatePlayer(
    list: string[],
    setter: (value: string[]) => void,
    index: number,
    value: string
  ) {
    setter(list.map((p, i) => i === index ? value : p));
  }

  function removePlayer(
    list: string[],
    setter: (value: string[]) => void,
    index: number
  ) {
    if (list.length > 1) {
      setter(list.filter((_, i) => i !== index));
    }
  }

  function chooseQuestion(question: QuestionType) {
    if (!tiktok.trim()) {
      alert("Please enter your TikTok username first.");
      return;
    }

    setType(question);
    setStep(2);
  }

  function submitQuestion() {
    if (!tiktok.trim()) {
      alert("Please enter your TikTok username.");
      return;
    }

    const username = tiktok.trim().startsWith("@")
      ? tiktok.trim()
      : "@" + tiktok.trim();

    if (type === "Trade") {
      const send = sending.filter(Boolean);
      const receive = receiving.filter(Boolean);

      if (!send.length || !receive.length) {
        alert("Choose at least one player on each side.");
        return;
      }

      const submission: Submission = {
        id: crypto.randomUUID(),
        tiktok: username,
        type: "Trade",
        sending: send.map(id =>
          players.find(p => p.id === id)?.name || id
        ),
        receiving: receive.map(id =>
          players.find(p => p.id === id)?.name || id
        ),
        players: [],
        createdAt: new Date().toLocaleTimeString()
      };

      saveQueue([submission, ...queue]);
    } else if (type === "Start/Sit") {
      const selected = startSit.filter(Boolean);

      if (selected.length < 2) {
        alert("Choose at least two players.");
        return;
      }

      const submission: Submission = {
        id: crypto.randomUUID(),
        tiktok: username,
        type: "Start/Sit",
        sending: [],
        receiving: [],
        players: selected.map(id =>
          players.find(p => p.id === id)?.name || id
        ),
        createdAt: new Date().toLocaleTimeString()
      };

      saveQueue([submission, ...queue]);
    }

    alert("Your question has been submitted!");

    setStep(1);
    setTiktok("");
    setType(null);
    setSending([""]);
    setReceiving([""]);
    setStartSit(["", ""]);
  }

  function removeTrade(id: string) {
    saveQueue(queue.filter(item => item.id !== id));
  }

  const allSelected = [...sending, ...receiving];

  const addButtonStyle = {
    background: "#292929",
    color: "#e8b84d",
    border: "1px solid #555",
    padding: 11,
    marginTop: 5
  };

  const backButtonStyle = {
    background: "#292929",
    color: "white",
    marginBottom: 20
  };

  return (
    <main>
      <header>
        <h1>ASK<span>XO</span></h1>
        <p>THE FANTASY QUESTION CENTER</p>
      </header>

      {step === 1 && (
        <section className="panel">
          <h2>Welcome to ASKXO</h2>

          <label>YOUR EXACT TIKTOK @</label>
          <input
            value={tiktok}
            onChange={e => setTiktok(e.target.value)}
            placeholder="@yourtiktokusername"
          />

          <h3>WHAT ARE YOU ASKING?</h3>

          <button
            onClick={() => chooseQuestion("Trade")}
            style={{ marginBottom: 14 }}
          >
            ↔ TRADE QUESTION
          </button>

          <button
            onClick={() => chooseQuestion("Start/Sit")}
          >
            ★ START / SIT QUESTION
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="panel">
          <button
            style={backButtonStyle}
            onClick={() => setStep(1)}
          >
            ← BACK
          </button>

          {loadingPlayers && (
            <p className="empty">Loading ESPN players...</p>
          )}

          {playerError && (
            <div>
              <p style={{ color: "#ff9999" }}>{playerError}</p>
              <button onClick={() => setRetry(r => r + 1)}>
                TRY AGAIN
              </button>
            </div>
          )}

          {!loadingPlayers && !playerError && players.length > 0 && (
            <>
              {type === "Trade" && (
                <>
                  <h2>Submit Your Trade</h2>
                  <p>Search and select up to 4 players on each side.</p>

                  <h3>YOU SEND</h3>

                  {sending.map((id, index) => (
                    <div key={`send-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={allSelected}
                        onChange={value =>
                          updatePlayer(sending, setSending, index, value)
                        }
                      />

                      {sending.length > 1 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(sending, setSending, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {sending.length < 4 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(sending, setSending, 4)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  <h3>YOU RECEIVE</h3>

                  {receiving.map((id, index) => (
                    <div key={`receive-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={allSelected}
                        onChange={value =>
                          updatePlayer(receiving, setReceiving, index, value)
                        }
                      />

                      {receiving.length > 1 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(receiving, setReceiving, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {receiving.length < 4 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(receiving, setReceiving, 4)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  <button
                    style={{ marginTop: 22 }}
                    onClick={submitQuestion}
                  >
                    SUBMIT TRADE QUESTION
                  </button>
                </>
              )}

              {type === "Start/Sit" && (
                <>
                  <h2>Start / Sit Question</h2>
                  <p>Choose 2 or 3 players to compare.</p>

                  {startSit.map((id, index) => (
                    <div key={`start-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={startSit}
                        onChange={value =>
                          updatePlayer(startSit, setStartSit, index, value)
                        }
                      />

                      {startSit.length > 2 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(startSit, setStartSit, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {startSit.length < 3 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(startSit, setStartSit, 3)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  <button
                    style={{ marginTop: 22 }}
                    onClick={submitQuestion}
                  >
                    SUBMIT START / SIT QUESTION
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="panel">
        <h2>
          Submission Queue{" "}
          <span className="count">{queue.length}</span>
        </h2>

        {queue.length === 0 && (
          <p className="empty">No questions submitted yet.</p>
        )}

        {queue.map(item => (
          <article className="trade" key={item.id}>
            <strong>{item.tiktok}</strong>
            <small>{item.createdAt}</small>

            <h3>{item.type.toUpperCase()}</h3>

            {item.type === "Trade" ? (
              <>
                <p><b>SENDS:</b> {item.sending.join(", ")}</p>
                <p><b>RECEIVES:</b> {item.receiving.join(", ")}</p>
              </>
            ) : (
              <p><b>PLAYERS:</b> {item.players.join(", ")}</p>
            )}

            <button
              className="remove"
              onClick={() => removeTrade(item.id)}
            >
              REMOVE
            </button>
          </article>
        ))}
      </section>

      <footer>ASKXO · YOUR FANTASY QUESTIONS ANSWERED</footer>
    </main>
  );
}
