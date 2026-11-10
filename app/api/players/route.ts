
const positions: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

const teams: Record<number, string> = {
  1: "Atlanta Falcons",
  2: "Buffalo Bills",
  3: "Chicago Bears",
  4: "Cincinnati Bengals",
  5: "Cleveland Browns",
  6: "Dallas Cowboys",
  7: "Denver Broncos",
  8: "Detroit Lions",
  9: "Green Bay Packers",
  10: "Tennessee Titans",
  11: "Indianapolis Colts",
  12: "Kansas City Chiefs",
  13: "Las Vegas Raiders",
  14: "Los Angeles Rams",
  15: "Miami Dolphins",
  16: "Minnesota Vikings",
  17: "New England Patriots",
  18: "New Orleans Saints",
  19: "New York Giants",
  20: "New York Jets",
  21: "Philadelphia Eagles",
  22: "Arizona Cardinals",
  23: "Pittsburgh Steelers",
  24: "Los Angeles Chargers",
  25: "San Francisco 49ers",
  26: "Seattle Seahawks",
  27: "Tampa Bay Buccaneers",
  28: "Washington Commanders",
  29: "Carolina Panthers",
  30: "Jacksonville Jaguars",
  33: "Baltimore Ravens",
  34: "Houston Texans",
};

export async function GET() {
  try {
    const year = new Date().getFullYear();

    const url =
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/players?scoringPeriodId=0&view=players_wl`;

    const response = await fetch(url, {
      headers: {
        "X-Fantasy-Filter": JSON.stringify({
          filterActive: { value: true },
        }),
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("ESPN returned status:", response.status);

      return Response.json(
        { error: `ESPN returned status ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    const rawPlayers = Array.isArray(data)
      ? data
      : data.players || [];

    const players = rawPlayers
      .filter((p: any) => p.id && p.fullName)
      .map((p: any) => ({
        id: String(p.id),
        name: p.fullName,
        position: positions[p.defaultPositionId] || "NFL Player",
        team: teams[p.proTeamId] || "Free Agent",
        imageUrl: `https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png`,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    if (players.length === 0) {
      throw new Error("ESPN returned no players.");
    }

    return Response.json(players, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Player API error:", error);

    return Response.json(
      { error: "Could not load ESPN players." },
      { status: 502 }
    );
  }
}
