import fs from 'node:fs/promises';

const token = process.env.FOOTBALL_DATA_TOKEN;
const competition = process.env.COMPETITION_CODE || 'WC';
const season = process.env.SEASON || '2026';

const config = JSON.parse(await fs.readFile('config.json', 'utf8'));

const fixedHistoricalMatchesRaw = [
  ['fixed-2026-06-11-mexico-south-africa', '2026-06-11T19:00:00Z', 'GROUP_STAGE', 'A', 'Mexico', 'South Africa', 2, 0],
  ['fixed-2026-06-11-south-korea-czechia', '2026-06-12T02:00:00Z', 'GROUP_STAGE', 'A', 'South Korea', 'Czechia', 2, 1],
  ['fixed-2026-06-12-canada-bosnia', '2026-06-12T19:00:00Z', 'GROUP_STAGE', 'B', 'Canada', 'Bosnia and Herzegovina', 1, 1],
  ['fixed-2026-06-12-usa-paraguay', '2026-06-13T01:00:00Z', 'GROUP_STAGE', 'D', 'United States', 'Paraguay', 4, 1],
  ['fixed-2026-06-13-qatar-switzerland', '2026-06-13T19:00:00Z', 'GROUP_STAGE', 'B', 'Qatar', 'Switzerland', 1, 1],
  ['fixed-2026-06-13-brazil-morocco', '2026-06-13T22:00:00Z', 'GROUP_STAGE', 'C', 'Brazil', 'Morocco', 1, 1],
  ['fixed-2026-06-14-haiti-scotland', '2026-06-14T01:00:00Z', 'GROUP_STAGE', 'C', 'Haiti', 'Scotland', 0, 1],
  ['fixed-2026-06-14-australia-turkey', '2026-06-14T04:00:00Z', 'GROUP_STAGE', 'D', 'Australia', 'Turkey', 2, 0],
  ['fixed-2026-06-14-germany-curacao', '2026-06-14T17:00:00Z', 'GROUP_STAGE', 'E', 'Germany', 'Curacao', 7, 1],
  ['fixed-2026-06-14-netherlands-japan', '2026-06-14T20:00:00Z', 'GROUP_STAGE', 'F', 'Netherlands', 'Japan', 2, 2],
  ['fixed-2026-06-14-ivory-coast-ecuador', '2026-06-14T23:00:00Z', 'GROUP_STAGE', 'E', 'Ivory Coast', 'Ecuador', 1, 0],
  ['fixed-2026-06-15-sweden-tunisia', '2026-06-15T02:00:00Z', 'GROUP_STAGE', 'F', 'Sweden', 'Tunisia', 5, 1],
  ['fixed-2026-06-15-spain-cape-verde', '2026-06-15T16:00:00Z', 'GROUP_STAGE', 'H', 'Spain', 'Cape Verde', 0, 0],
  ['fixed-2026-06-15-belgium-egypt', '2026-06-15T19:00:00Z', 'GROUP_STAGE', 'G', 'Belgium', 'Egypt', 1, 1],
  ['fixed-2026-06-15-saudi-arabia-uruguay', '2026-06-15T22:00:00Z', 'GROUP_STAGE', 'H', 'Saudi Arabia', 'Uruguay', 1, 1],
  ['fixed-2026-06-16-iran-new-zealand', '2026-06-16T01:00:00Z', 'GROUP_STAGE', 'G', 'Iran', 'New Zealand', 2, 2],
  ['fixed-2026-06-16-france-senegal', '2026-06-16T19:00:00Z', 'GROUP_STAGE', 'I', 'France', 'Senegal', 3, 1],
  ['fixed-2026-06-16-iraq-norway', '2026-06-16T22:00:00Z', 'GROUP_STAGE', 'I', 'Iraq', 'Norway', 1, 4],
  ['fixed-2026-06-17-argentina-algeria', '2026-06-17T01:00:00Z', 'GROUP_STAGE', 'J', 'Argentina', 'Algeria', 3, 0],
  ['fixed-2026-06-17-austria-jordan', '2026-06-17T04:00:00Z', 'GROUP_STAGE', 'J', 'Austria', 'Jordan', 3, 1],
  ['fixed-2026-06-17-portugal-dr-congo', '2026-06-17T17:00:00Z', 'GROUP_STAGE', 'K', 'Portugal', 'DR Congo', 1, 1],
  ['fixed-2026-06-17-england-croatia', '2026-06-17T20:00:00Z', 'GROUP_STAGE', 'L', 'England', 'Croatia', 4, 2],
  ['fixed-2026-06-17-ghana-panama', '2026-06-17T23:00:00Z', 'GROUP_STAGE', 'L', 'Ghana', 'Panama', 1, 0],
  ['fixed-2026-06-18-uzbekistan-colombia', '2026-06-18T02:00:00Z', 'GROUP_STAGE', 'K', 'Uzbekistan', 'Colombia', 1, 3]
];

const fixedHistoricalMatches = fixedHistoricalMatchesRaw.map(([id, utcDate, stage, group, home, away, hs, as]) => ({
  id,
  utcDate,
  status: 'FINISHED',
  stage,
  group,
  homeTeam: { name: home },
  awayTeam: { name: away },
  score: {
    winner: hs > as ? 'HOME_TEAM' : hs < as ? 'AWAY_TEAM' : 'DRAW',
    fullTime: { home: hs, away: as },
    regularTime: { home: hs, away: as }
  }
}));

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
  Senegal: 'Senegal',
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

function isKnockoutStage(stageValue) {
  const stage = String(stageValue || '').toUpperCase();

  return (
    stage.includes('LAST_32') ||
    stage.includes('ROUND_OF_32') ||
    stage.includes('ROUND OF 32') ||
    stage.includes('LAST_16') ||
    stage.includes('ROUND_OF_16') ||
    stage.includes('ROUND OF 16') ||
    stage.includes('QUARTER_FINAL') ||
    stage.includes('QUARTERFINAL') ||
    stage.includes('QUARTER-FINAL') ||
    stage.includes('SEMI_FINAL') ||
    stage.includes('SEMIFINAL') ||
    stage.includes('SEMI-FINAL') ||
    stage === 'FINAL'
  );
}

function matchKey(match) {
  const date = String(match?.utcDate || '').slice(0, 10);
  const home = canonical(match?.homeTeam?.name || '');
  const away = canonical(match?.awayTeam?.name || '');
  const stage = String(match?.stage || 'GROUP_STAGE').toUpperCase();

  return `${stage}:${date}:${norm(home)}:${norm(away)}`;
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

    /*
      IMPORTANTISSIMO:
      Per i punti BASE si usano prima i 90 minuti regolamentari.
      Quindi se una squadra pareggia nei 90' e passa ai rigori:
      base +1, bonus passaggio turno +5.
    */
    const homeGoals = match.score?.regularTime?.home ?? match.score?.fullTime?.home;
    const awayGoals = match.score?.regularTime?.away ?? match.score?.fullTime?.away;

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

function applyGroupBonuses(teamStats, standings, matches) {
  const knockoutTeams = new Set();

  for (const match of matches || []) {
    if (!isKnockoutStage(match.stage)) continue;

    const home = canonical(match.homeTeam?.name);
    const away = canonical(match.awayTeam?.name);

    if (home) knockoutTeams.add(home);
    if (away) knockoutTeams.add(away);
  }

  for (const group of standings || []) {
    const table = group.table || [];

    const groupFinished =
      table.length === 4 &&
      table.every(row => {
        const name = canonical(row.team?.name);
        return (teamStats[name]?.played || 0) >= 3;
      });

    if (!groupFinished) continue;

    for (const row of table) {
      const name = canonical(row.team?.name);

      if (!teamStats[name]) continue;

      const qualified = knockoutTeams.has(name);

      if (row.position <= 2) {
        teamStats[name].bonus += rules.groupQualificationBonus;
        teamStats[name].details.push(`Passaggio girone: +${rules.groupQualificationBonus}`);
      }

      if (row.position === 3) {
        if (qualified) {
          teamStats[name].bonus += rules.groupQualificationBonus;
          teamStats[name].details.push(`Terza qualificata: +${rules.groupQualificationBonus}`);
        } else {
          teamStats[name].bonus += rules.thirdPlaceBonus;
          teamStats[name].details.push(`Terza classificata eliminata: +${rules.thirdPlaceBonus}`);
        }
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

  const homePenalties = match.score?.penalties?.home;
  const awayPenalties = match.score?.penalties?.away;

  if (homePenalties != null && awayPenalties != null) {
    if (homePenalties > awayPenalties) return home;
    if (homePenalties < awayPenalties) return away;
  }

  const homeGoals = match.score?.fullTime?.home ?? match.score?.regularTime?.home;
  const awayGoals = match.score?.fullTime?.away ?? match.score?.regularTime?.away;

  if (homeGoals > awayGoals) return home;
  if (homeGoals < awayGoals) return away;

  return null;
}

function applyKnockoutBonuses(teamStats, matches) {
  for (const match of matches || []) {
    if (match.status !== 'FINISHED') continue;
    if (!isKnockoutStage(match.stage)) continue;

    const stage = String(match.stage || '').toUpperCase();
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

  const matches = mergeMatches(
    mergeMatches(fixedHistoricalMatches, oldMatches),
    newMatches
  );

  const teamStats = scoreMatches(matches);
  const standings = buildInternalStandings(teamStats);

  applyGroupBonuses(teamStats, standings, matches);
  applyKnockoutBonuses(teamStats, matches);
  computeWeighted(teamStats);

  output = {
    updatedAt: new Date().toISOString(),
    source: 'football-data.org + storico fisso + storico locale',
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
