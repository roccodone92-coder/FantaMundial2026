import fs from 'node:fs/promises';

const token = process.env.FOOTBALL_DATA_TOKEN;
const competition = process.env.COMPETITION_CODE || 'WC';
const season = process.env.SEASON || '2026';

const config = JSON.parse(await fs.readFile('config.json', 'utf8'));

const rules = {
  win: config.rules?.win ?? 3,
  draw: config.rules?.draw ?? 1,
  loss: config.rules?.loss ?? 0,
  groupQualificationBonus: config.rules?.groupQualificationBonus ?? 5,
  thirdPlaceBonus: config.rules?.thirdPlaceBonus ?? 2,
  tier1LastInGroupPenalty: config.rules?.tier1LastInGroupPenalty ?? -10,
  nextRoundBonus: config.rules?.nextRoundBonus ?? config.rules?.roundProgressionBonus ?? 5,
  finalWinBonus: config.rules?.finalWinBonus ?? config.rules?.winnerBonus ?? 10,
  multipliers: config.rules?.multipliers ?? { "1": 1, "2": 2, "3": 3, "4": 4 }
};

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
  "Côte d'Ivoire": 'Costa d’Avorio',
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
  Curaçao: 'Curaçao',
  Curacao: 'Curaçao'
};

const norm = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const teamByNorm = new Map((config.teams || []).map(team => [norm(team.name), team]));
const configAliases = new Map(Object.entries(config.aliases || {}).map(([key, value]) => [norm(key), value]));

function canonical(name) {
  if (!name) return name;

  if (apiAliases[name]) return apiAliases[name];

  const normalized = norm(name);

  if (configAliases.has(normalized)) return configAliases.get(normalized);
  if (teamByNorm.has(normalized)) return teamByNorm.get(normalized).name;

  const aliasKey = Object.keys(apiAliases).find(key => norm(key) === normalized);
  if (aliasKey) return apiAliases[aliasKey];

  return name;
}

function matchKey(match) {
  if (match?.id) return `id:${match.id}`;

  const date = match?.utcDate || '';
  const home = canonical(match?.homeTeam?.name || '');
  const away = canonical(match?.awayTeam?.name || '');

  return `fallback:${date}:${home}:${away}`;
}

function cleanMatch(match) {
  return {
    ...match,
    homeTeam: match.homeTeam || {},
    awayTeam: match.awayTeam || {},
    score: match.score || {}
  };
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

async function api(path) {
  const response = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: {
      'X-Auth-Token': token
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return response.json();
}

function mergeMatches(oldMatches = [], newMatches = []) {
  const map = new Map();

  for (const match of oldMatches || []) {
    if (!match) continue;
    map.set(matchKey(match), cleanMatch(match));
  }

  for (const match of newMatches || []) {
    if (!match) continue;

    const key = matchKey(match);
    const previous = map.get(key);

    map.set(key, {
      ...(previous || {}),
      ...cleanMatch(match)
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(a.utcDate || 0) - new Date(b.utcDate || 0);
  });
}

function createEmptyTeamStats() {
  return Object.fromEntries(
    (config.teams || []).map(team => [
      team.name,
      {
        base: 0,
        bonus: 0,
        weighted: 0,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        details: []
      }
    ])
  );
}

function scoreMatches(matches) {
  const teamStats = createEmptyTeamStats();

  for (const match of matches || []) {
    if (match.status !== 'FINISHED') continue;

    const home = canonical(match.homeTeam?.name);
    const away = canonical(match.awayTeam?.name);

    if (!teamStats[home] || !teamStats[away]) {
      console.warn(
        'Squadra non riconosciuta:',
        match.homeTeam?.name,
        '=>',
        home,
        '|',
        match.awayTeam?.name,
        '=>',
        away
      );
      continue;
    }

    const homeGoals = match.score?.fullTime?.home ?? match.score?.regularTime?.home;
    const awayGoals = match.score?.fullTime?.away ?? match.score?.regularTime?.away;

    if (homeGoals == null || awayGoals == null) continue;

    const addResult = (team, points, result, gf, ga) => {
      const stat = teamStats[team];

      stat.base += points;
      stat.played += 1;
      stat[result] += 1;
      stat.goalsFor += gf;
      stat.goalsAgainst += ga;
      stat.goalDifference = stat.goalsFor - stat.goalsAgainst;

      stat.details.push(`${home} ${homeGoals}-${awayGoals} ${away}: +${points}`);
    };

    if (homeGoals > awayGoals) {
      addResult(home, rules.win, 'w', homeGoals, awayGoals);
      addResult(away, rules.loss, 'l', awayGoals, homeGoals);
    } else if (homeGoals < awayGoals) {
      addResult(home, rules.loss, 'l', homeGoals, awayGoals);
      addResult(away, rules.win, 'w', awayGoals, homeGoals);
    } else {
      addResult(home, rules.draw, 'd', homeGoals, awayGoals);
      addResult(away, rules.draw, 'd', awayGoals, homeGoals);
    }
  }

  return teamStats;
}

function buildInternalStandings(teamStats) {
  const groups = {};

  for (const team of config.teams || []) {
    const group = team.group || '?';
    const stat = teamStats[team.name] || {};

    if (!groups[group]) groups[group] = [];

    groups[group].push({
      position: 0,
      team: {
        name: team.name
      },
      playedGames: stat.played || 0,
      won: stat.w || 0,
      draw: stat.d || 0,
      lost: stat.l || 0,
      goalsFor: stat.goalsFor || 0,
      goalsAgainst: stat.goalsAgainst || 0,
      goalDifference: stat.goalDifference || 0,
      points: stat.base || 0,
      tier: team.tier,
      credits: team.credits
    });
  }

  return Object.entries(groups)
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'it', { numeric: true }))
    .map(([group, rows]) => {
      const table = rows
        .sort((a, b) =>
          b.points - a.points ||
          b.goalDifference - a.goalDifference ||
          b.goalsFor - a.goalsFor ||
          a.team.name.localeCompare(b.team.name)
        )
        .map((row, index) => ({
          ...row,
          position: index + 1
        }));

      return {
        stage: 'GROUP_STAGE',
        type: 'TOTAL',
        group,
        table
      };
    });
}

function applyGroupBonuses(teamStats, standings) {
  for (const group of standings || []) {
    for (const row of group.table || []) {
      const name = canonical(row.team?.name);

      if (!teamStats[name]) continue;

      const playedGames = row.playedGames ?? teamStats[name].played ?? 0;

      // Bonus girone solo quando la squadra ha giocato 3 partite.
      if (playedGames < 3) continue;

      if (row.position <= 2) {
        teamStats[name].bonus += rules.groupQualificationBonus;
        teamStats[name].details.push(`Passaggio girone: +${rules.groupQualificationBonus}`);
      }

      if (row.position === 3) {
        teamStats[name].bonus += rules.thirdPlaceBonus;
        teamStats[name].details.push(`Terza classificata girone: +${rules.thirdPlaceBonus}`);
      }

      const meta = (config.teams || []).find(team => team.name === name);

      if (meta?.tier === 1 && row.position === 4) {
        teamStats[name].bonus += rules.tier1LastInGroupPenalty;
        teamStats[name].details.push(`Prima fascia ultima nel girone: ${rules.tier1LastInGroupPenalty}`);
      }
    }
  }
}

function getKnockoutWinner(match) {
  const home = canonical(match.homeTeam?.name);
  const away = canonical(match.awayTeam?.name);

  if (match.score?.winner === 'HOME_TEAM') return home;
  if (match.score?.winner === 'AWAY_TEAM') return away;

  const homeGoals = match.score?.fullTime?.home ?? match.score?.regularTime?.home;
  const awayGoals = match.score?.fullTime?.away ?? match.score?.regularTime?.away;

  if (homeGoals > awayGoals) return home;
  if (homeGoals < awayGoals) return away;

  const homePenalties = match.score?.penalties?.home;
  const awayPenalties = match.score?.penalties?.away;

  if (homePenalties > awayPenalties) return home;
  if (homePenalties < awayPenalties) return away;

  return null;
}

function applyKnockoutBonuses(teamStats, matches) {
  for (const match of matches || []) {
    if (match.status !== 'FINISHED') continue;

    const stage = String(match.stage || '');

    const isKnockout =
      stage.includes('LAST_16') ||
      stage.includes('ROUND_OF_16') ||
      stage.includes('QUARTER_FINAL') ||
      stage.includes('SEMI_FINAL') ||
      stage === 'FINAL';

    if (!isKnockout) continue;

    const winner = getKnockoutWinner(match);

    if (!winner || !teamStats[winner]) continue;

    if (stage === 'FINAL') {
      teamStats[winner].bonus += rules.finalWinBonus;
      teamStats[winner].details.push(`Vittoria finale: +${rules.finalWinBonus}`);
    } else {
      teamStats[winner].bonus += rules.nextRoundBonus;
      teamStats[winner].details.push(`Passaggio turno successivo: +${rules.nextRoundBonus}`);
    }
  }
}

function computeWeighted(teamStats) {
  for (const [teamName, stat] of Object.entries(teamStats)) {
    const meta = (config.teams || []).find(team => team.name === teamName);
    const multiplier = rules.multipliers[String(meta?.tier || 1)] || 1;

    stat.weighted = (stat.base + stat.bonus) * multiplier;
  }
}

function computeParticipants(teamStats) {
  return (config.participants || []).map(participant => {
    const rows = (participant.teams || []).map(teamName => {
      const realTeam = canonical(teamName);

      const meta = (config.teams || []).find(team => team.name === realTeam) || {
        tier: 1,
        credits: 0,
        group: '?'
      };

      const stat = teamStats[realTeam] || {
        base: 0,
        bonus: 0,
        weighted: 0,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        details: []
      };

      const raw = stat.base + stat.bonus;
      const multiplier = rules.multipliers[String(meta.tier)] || 1;

      return {
        team: realTeam,
        originalName: teamName,
        group: meta.group,
        tier: meta.tier,
        credits: meta.credits,
        played: stat.played,
        base: stat.base,
        bonus: stat.bonus,
        multiplier,
        total: raw * multiplier,
        record: `${stat.w}-${stat.d}-${stat.l}`,
        goalsFor: stat.goalsFor,
        goalsAgainst: stat.goalsAgainst,
        goalDifference: stat.goalDifference,
        details: stat.details
      };
    });

    const total = rows.reduce((sum, team) => sum + team.total, 0);
    const credits = rows.reduce((sum, team) => sum + (team.credits || 0), 0);
    const played = rows.reduce((sum, team) => sum + (team.played || 0), 0);

    return {
      name: participant.name,
      total,
      credits,
      played,
      alive: rows.length,
      teams: rows
    };
  }).sort((a, b) => b.total - a.total);
}

let output;

try {
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN mancante');

  const oldResults = await readOldResults();

  const matchesData = await api(`/competitions/${competition}/matches?season=${season}`);

  const oldMatches = Array.isArray(oldResults.matches) ? oldResults.matches : [];
  const newMatches = Array.isArray(matchesData.matches) ? matchesData.matches : [];

  const matches = mergeMatches(oldMatches, newMatches);

  const teamStats = scoreMatches(matches);
  const standings = buildInternalStandings(teamStats);

  applyGroupBonuses(teamStats, standings);
  applyKnockoutBonuses(teamStats, matches);
  computeWeighted(teamStats);

  output = {
    updatedAt: new Date().toISOString(),
    source: 'football-data.org + storico locale persistente',
    matches,
    standings,
    teamStats,
    computed: computeParticipants(teamStats)
  };

} catch (error) {
  const oldResults = await readOldResults();

  output = {
    ...oldResults,
    updatedAt: new Date().toISOString(),
    source: `fallback: ${error.message}`,
    matches: oldResults.matches || [],
    standings: oldResults.standings || [],
    teamStats: oldResults.teamStats || {},
    computed: oldResults.computed || []
  };
}

await fs.writeFile('results.json', JSON.stringify(output, null, 2));
