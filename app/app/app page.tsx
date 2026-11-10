
"use client";

import { useEffect, useState } from "react";

type Trade = {
  id: string;
  team: string;
  sending: string[];
  receiving: string[];
  createdAt: string;
};

const players = [
  "Josh Allen", "Lamar Jackson", "Jalen Hurts", "Patrick Mahomes",
  "Joe Burrow", "Jayden Daniels", "Saquon Barkley", "Derrick Henry",
  "Bijan Robinson", "Jahmyr Gibbs", "Christian McCaffrey",
  "Justin Jefferson", "Ja'Marr Chase", "CeeDee Lamb",
  "Tyreek Hill", "Amon-Ra St. Brown", "Puka Nacua",
  "Travis Kelce", "Sam LaPorta", "George Kittle"
];

export default function Home() {
  const [team, setTeam] = useState("");
  const [sending, setSending] = useState(["", ""]);
  const [receiving, setReceiving] = useState(["", ""]);
  const [queue, setQueue] = useState<Trade[]>([]);

  useEffect(() => {
    try {
      setQueue(JSON.parse(localStorage.getItem("xo-trades") || "[]"));
    } catch {
      setQueue([]);
    }
  }, []);

  function submitTrade() {
    if (!team.trim() || !sending[0] || !receiving[0]) {
      alert("Enter your team name and select at least one player on each side.");
      return;
    }

    const trade: Trade = {
      id: crypto.randomUUID(),
      team: team.trim(),
      sending: sending.filter(Boolean),
      receiving: receiving.filter(Boolean),
      createdAt: new Date().toLocaleTimeString()
    };

    const updated = [trade, ...queue];
    setQueue(updated);
    localStorage.setItem("xo-trades", JSON.stringify(updated));
    setTeam("");
    setSending(["", ""]);
    setReceiving(["", ""]);
    alert("Trade submitted!");
  }

  function removeTrade(id: string) {
    const updated = queue.filter((trade) => trade.id !== id);
    setQueue(updated);
    localStorage.setItem("xo-trades", JSON.stringify(updated));
  }

  function playerSelect(value: string, onChange: (value: string) => void) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a player</option>
        {players.map((player) => (
          <option key={player} value={player}>{player}</option>
        ))}
      </select>
    );
  }

  return (
    <main>
      <header>
        <h1>XO <span>FANTASY</span></h1>
        <p>THE TRADE CENTER</p>
      </header>

      <section className="panel">
        <h2>Submit Your Trade</h2>
        <label>Your team name</label>
        <input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="Enter your team name"
        />

        <div className="trade-grid">
          <div>
            <h3>YOU SEND</h3>
            {playerSelect(sending[0], (v) => setSending([v, sending[1]]))}
            {playerSelect(sending[1], (v) => setSending([sending[0], v]))}
          </div>
          <div>
            <h3>YOU RECEIVE</h3>
            {playerSelect(receiving[0], (v) => setReceiving([v, receiving[1]]))}
            {playerSelect(receiving[1], (v) => setReceiving([receiving[0], v]))}
          </div>
        </div>

        <button onClick={submitTrade}>SUBMIT TRADE</button>
      </section>

      <section className="panel">
        <h2>Trade Queue <span className="count">{queue.length}</span></h2>
        {queue.length === 0 && <p className="empty">No trades submitted yet.</p>}
        {queue.map((trade) => (
          <article className="trade" key={trade.id}>
            <strong>{trade.team}</strong>
            <small>{trade.createdAt}</small>
            <p><b>SENDS:</b> {trade.sending.join(", ")}</p>
            <p><b>RECEIVES:</b> {trade.receiving.join(", ")}</p>
            <button className="remove" onClick={() => removeTrade(trade.id)}>
              Remove
            </button>
          </article>
        ))}
      </section>
      <footer>XO FANTASY · TRADE SMART</footer>
    </main>
  );
}
