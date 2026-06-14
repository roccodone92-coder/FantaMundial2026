import fs from 'node:fs/promises';

const token = process.env.FOOTBALL_DATA_TOKEN;
const competition = process.env.COMPETITION_CODE || 'WC';
const season = process.env.SEASON || '2026';

const config = JSON.parse(await fs.readFile('config.json', 'utf8'));

const apiAliases = {
  Mexico: 'Messico',
  'South Africa': 'Sudafrica',
  'South Korea': 'Corea del Sud',
  Czechia: 'Repubblica Ceca',
  'Bosnia-Herzegovina': 'Bosnia ed Erzegovina',
  'Bosnia and Herzegovina': 'Bosnia ed Erzegovina',
  'United States': 'USA',
  USA: 'USA',
  Switzerland: 'Svizzera',
  Brazil: 'Brasile',
  Morocco: 'Marocco',
  Scotland: 'Scozia',
  Turkey: 'Turchia',
  Germany: 'Germania',
  Netherlands: 'Paesi Bassi',
  Japan: 'Giappone',
  'Ivory Coast': 'Costa d’Avorio',
  'Côte d’Ivoire': 'Costa d’Avorio',
  'Cote dIvoire': 'Costa d’Avorio',
  Sweden: 'Svezia',
  Spain: 'Spagna',
  'Cape Verde Islands': 'Capo Verde',
  'Cape Verde': 'Capo Verde',
  Belgium: 'Belgio',
  Egypt: 'Egitto',
  'Saudi Arabia': 'Arabia Saudita',
  'New Zealand': 'Nuova Zelanda',
  France: 'Francia',
  Norway: 'Norvegia',
  Algeria: 'Algeria',
  Jordan: 'Giordania',
  Portugal: 'Portogallo',
  'Congo DR': 'RD Congo',
  'DR Congo': 'RD Congo',
  England: 'Inghilterra',
  Croatia: 'Croazia',
  Canada: 'Canada',
  Paraguay: 'Paraguay',
  Qatar: 'Qatar',
  Haiti: 'Haiti',
  Australia: 'Australia',
  Ecuador: 'Ecuador',
  Tunisia: 'Tunisia',
  Uruguay: 'Uruguay',
  Iran: 'Iran',
  Argentina: 'Argentina',
  Austria: 'Austria',
  Ghana: 'Ghana',
  Panama: 'Panama',
  Uzbekistan: 'Uzbekistan',
  Colombia: 'Colombia',
  Iraq: 'Iraq',
  Curacao: 'Curaçao',
  Curaçao: 'Curaçao'
};

const norm = s => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const teamByNorm = new Map(config.teams.map(t => [norm(t.name), t]));
const aliases = new Map(Object.entries(config.aliases || {}).map(([k, v]) => [norm(k), v]));

function canonical(name) {
  if (!name) return name;
  if (apiAliases[name]) return apiAliases[name];

  const n = norm(name);
  return aliases.get(n) || teamByNorm.get(n)?.name || name;
}

async function api(path) {
  const res = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: {
      'X-Auth-Token': token
    }
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function readOldResults() {
  try {
    return JSON.parse(await fs.readFile('results.json', 'utf8'));
  } catch {
    return {
      updatedAt: null,
      source: 'empty',
      matches: [],
      standings: [],
      teamStats: {},
      computed: []
    };
  }
}

function mergeMatches(oldMatches = [], newMatches = []) {
  const map = new Map();

  for (const match of oldMatches) {
    if (match?.id) {
      map.set(String(match.id), match);
    }
  }

  for (const match of newMatches) {
    if (match?.id) {
      map.set(String(match.id), match);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(a.utcDate || 0) - new Date(b.utcDate || 0);
  });
}

function mergeStandings(oldStandings = [], newStandings = []) {
  if (Array.isArray(newStandings) && newStandings.length > 0) {
    return newStandings;
  }

  return Array.isArray(oldStandings) ? oldStandings : [];
}

function scoreMatches(matches) {
  const teamStats = Object.fromEntries(
    config.teams.map(t => [
      t.name,
      {
        base: 0,
        bonus: 0,
        weighted: 0,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        details: []
      }
    ])
  );

  for (const m of matches || []) {
    if (m.status !== 'FINISHED') continue;

    const home = canonical(m.homeTeam?.name);
    const away = canonical(m.awayTeam?.name);

    if (!teamStats[home] || !teamStats[away]) continue;

    const hs = m.score?.fullTime?.home ?? m.score?.regularTime?.home;
    const as = m.score?.fullTime?.away ?? m.score?.regularTime?.away;

    if (hs == null || as == null) continue;

    const add = (team, pts, result) => {
      const s = teamStats[team];

      s.base += pts;
      s.played += 1;
      s[result] += 1;

      s.details.push(`${home} ${hs}-${as} ${away}: +${pts}`);
    };

    if (hs > as) {
      add(home, 3, 'w');
      add(away, 0, 'l');
    } else if (hs < as) {
      add(home, 0, 'l');
      add(away, 3, 'w');
    } else {
      add(home, 1, 'd');
      add(away, 1, 'd');
    }
  }

  return teamStats;
}

function applyStandings(teamStats, standings) {
  for (const table of standings || []) {
    for (const row of table.table || []) {
      const name = canonical(row.team?.name);

      if (!teamStats[name]) continue;

      const playedGames = row.playedGames ?? teamStats[name].played ?? 0;

      // Bonus/malus girone SOLO a girone terminato.
      if (playedGames < 3) continue;

      if (row.position <= 2) {
        teamStats[name].bonus += config.rules.groupQualificationBonus;
        teamStats[name].details.push(`Passaggio girone: +${config.rules.groupQualificationBonus}`);
      }

      if (row.position === 3) {
        teamStats[name].bonus += config.rules.thirdPlaceBonus;
        teamStats[name].details.push(`Terza classificata girone: +${config.rules.thirdPlaceBonus}`);
      }

      const meta = config.teams.find(t => t.name === name);

      if (meta?.tier === 1 && row.position === 4) {
        teamStats[name].bonus += config.rules.tier1LastInGroupPenalty;
        teamStats[name].details.push(`Prima fascia ultima nel girone: ${config.rules.tier1LastInGroupPenalty}`);
      }
    }
  }
}

function applyKnockoutBonuses(teamStats, matches) {
  for (const m of matches || []) {
    if (m.status !== 'FINISHED') continue;

    const stage = m.stage || '';
    const home = canonical(m.homeTeam?.name);
    const away = canonical(m.awayTeam?.name);

    if (!teamStats[home] || !teamStats[away]) continue;

    const hs = m.score?.fullTime?.home ?? m.score?.regularTime?.home;
    const as = m.score?.fullTime?.away ?? m.score?.regularTime?.away;

    if (hs == null || as == null) continue;

    let winner = null;

    if (hs > as) winner = home;
    if (hs < as) winner = away;

    if (!winner && m.score?.penalties) {
      const hp = m.score.penalties.home;
      const ap = m.score.penalties.away;

      if (hp > ap) winner = home;
      if (hp < ap) winner = away;
    }

    if (!winner) continue;

    const isKnockout =
      stage.includes('LAST_16') ||
      stage.includes('ROUND_OF_16') ||
      stage.includes('QUARTER_FINAL') ||
      stage.includes('SEMI_FINAL') ||
      stage.includes('FINAL');

    if (!isKnockout) continue;

    if (stage.includes('FINAL')) {
      teamStats[winner].bonus += config.rules.finalWinBonus ?? 10;
      teamStats[winner].details.push(`Vittoria finale: +${config.rules.finalWinBonus ?? 10}`);
    } else {
      teamStats[winner].bonus += config.rules.nextRoundBonus ?? 5;
      teamStats[winner].details.push(`Passaggio turno successivo: +${config.rules.nextRoundBonus ?? 5}`);
    }
  }
}

function computeWeighted(teamStats) {
  for (const [team, s] of Object.entries(teamStats)) {
    const meta = config.teams.find(t => t.name === team);
    const mult = config.rules.multipliers[String(meta?.tier || 1)] || 1;

    s.weighted = (s.base + s.bonus) * mult;
  }
}

function computeParticipants(teamStats) {
  return config.participants.map(p => {
    const rows = p.teams.map(team => {
      const realTeam = canonical(team);

      const meta = config.teams.find(t => t.name === realTeam) || {
        tier: 1,
        credits: 0,
        group: '?'
      };

      const s = teamStats[realTeam] || {
        base: 0,
        bonus: 0,
        weighted: 0,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        details: []
      };

      const raw = s.base + s.bonus;
      const mult = config.rules.multipliers[String(meta.tier)] || 1;

      return {
        team: realTeam,
        originalName: team,
        group: meta.group,
        tier: meta.tier,
        credits: meta.credits,
        played: s.played,
        base: s.base,
        bonus: s.bonus,
        groupBonusReady: s.played >= 3,
        multiplier: mult,
        total: raw * mult,
        record: `${s.w}-${s.d}-${s.l}`,
        details: s.details
      };
    });

    const total = rows.reduce((a, b) => a + b.total, 0);
    const credits = rows.reduce((a, b) => a + b.credits, 0);
    const alive = rows.length;

    return {
      name: p.name,
      total,
      credits,
      alive,
      teams: rows
    };
  }).sort((a, b) => b.total - a.total);
}

let out;

try {
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN mancante');

  const old = await readOldResults();

  const matchesData = await api(`/competitions/${competition}/matches?season=${season}`);

  let standingsData = { standings: [] };

  try {
    standingsData = await api(`/competitions/${competition}/standings?season=${season}`);
  } catch (e) {
    console.warn('Standings non disponibili:', e.message);
  }

  const oldMatches = Array.isArray(old.matches) ? old.matches : [];
  const newMatches = Array.isArray(matchesData.matches) ? matchesData.matches : [];
  const matches = mergeMatches(oldMatches, newMatches);

  const standings = mergeStandings(old.standings, standingsData.standings);

  const teamStats = scoreMatches(matches);

  applyStandings(teamStats, standings);
  applyKnockoutBonuses(teamStats, matches);
  computeWeighted(teamStats);

  out = {
    updatedAt: new Date().toISOString(),
    source: 'football-data.org + storico locale',
    matches,
    standings,
    teamStats,
    computed: computeParticipants(teamStats)
  };

} catch (err) {
  const old = await readOldResults();

  out = {
    ...old,
    updatedAt: new Date().toISOString(),
    source: `fallback: ${err.message}`,
    computed: old.computed || []
  };
}

await fs.writeFile('results.json', JSON.stringify(out, null, 2));
