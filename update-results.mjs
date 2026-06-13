import fs from 'node:fs/promises';

const token = process.env.FOOTBALL_DATA_TOKEN;
const competition = process.env.COMPETITION_CODE || 'WC';
const season = process.env.SEASON || '2026';
const config = JSON.parse(await fs.readFile('data/config.json','utf8'));
const norm = s => (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const teamByNorm = new Map(config.teams.map(t=>[norm(t.name),t]));
const aliases = new Map(Object.entries(config.aliases||{}).map(([k,v])=>[norm(k),v]));
function canonical(name){ const n=norm(name); return aliases.get(n)||teamByNorm.get(n)?.name||name; }
async function api(path){
  const res = await fetch(`https://api.football-data.org/v4${path}`, {headers:{'X-Auth-Token':token}});
  if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
function scoreMatches(matches){
  const teamStats = Object.fromEntries(config.teams.map(t=>[t.name,{base:0,bonus:0,weighted:0,played:0,w:0,d:0,l:0,details:[]}]));
  for (const m of matches){
    if(m.status !== 'FINISHED') continue;
    const home = canonical(m.homeTeam?.name); const away = canonical(m.awayTeam?.name);
    if(!teamStats[home] || !teamStats[away]) continue;
    const hs = m.score?.fullTime?.home ?? m.score?.regularTime?.home;
    const as = m.score?.fullTime?.away ?? m.score?.regularTime?.away;
    if(hs == null || as == null) continue;
    const add = (team, pts, res) => { const s=teamStats[team]; s.base += pts; s.played++; s[res]++; s.details.push(`${home} ${hs}-${as} ${away}: +${pts}`); };
    if(hs>as){ add(home,3,'w'); add(away,0,'l'); }
    else if(hs<as){ add(home,0,'l'); add(away,3,'w'); }
    else { add(home,1,'d'); add(away,1,'d'); }
  }
  return teamStats;
}
function applyStandings(teamStats, standings){
  for(const table of standings||[]){
    for(const row of table.table||[]){
      const name = canonical(row.team?.name); if(!teamStats[name]) continue;
      if(row.position <= 2){ teamStats[name].bonus += config.rules.groupQualificationBonus; teamStats[name].details.push(`Passaggio girone: +${config.rules.groupQualificationBonus}`); }
      if(row.position === 3){ teamStats[name].bonus += config.rules.thirdPlaceBonus; teamStats[name].details.push(`Terza classificata girone: +${config.rules.thirdPlaceBonus}`); }
      const meta = config.teams.find(t=>t.name===name);
      if(meta?.tier===1 && row.position===4){ teamStats[name].bonus += config.rules.tier1LastInGroupPenalty; teamStats[name].details.push(`Prima fascia ultima nel girone: ${config.rules.tier1LastInGroupPenalty}`); }
    }
  }
}
function computeParticipants(teamStats){
  return config.participants.map(p=>{
    const rows = p.teams.map(team=>{
      const meta = config.teams.find(t=>t.name===team) || {tier:1, credits:0, group:'?'};
      const s = teamStats[team] || {base:0,bonus:0,played:0,w:0,d:0,l:0,details:[]};
      const raw = s.base + s.bonus;
      const mult = config.rules.multipliers[String(meta.tier)] || 1;
      return {team, group:meta.group, tier:meta.tier, credits:meta.credits, base:s.base, bonus:s.bonus, multiplier:mult, total:raw*mult, record:`${s.w}-${s.d}-${s.l}`, details:s.details};
    });
    const total = rows.reduce((a,b)=>a+b.total,0);
    const credits = rows.reduce((a,b)=>a+b.credits,0);
    const alive = rows.filter(r => true).length;
    return {name:p.name,total,credits,alive,teams:rows};
  }).sort((a,b)=>b.total-a.total);
}
let out;
try{
  if(!token) throw new Error('FOOTBALL_DATA_TOKEN mancante');
  const matchesData = await api(`/competitions/${competition}/matches?season=${season}`);
  let standingsData = {standings:[]};
  try { standingsData = await api(`/competitions/${competition}/standings?season=${season}`); } catch(e) { console.warn('Standings non disponibili:', e.message); }
  const matches = matchesData.matches || [];
  const teamStats = scoreMatches(matches);
  applyStandings(teamStats, standingsData.standings || []);
  for(const [team,s] of Object.entries(teamStats)){
    const meta = config.teams.find(t=>t.name===team); s.weighted = (s.base+s.bonus)*(config.rules.multipliers[String(meta?.tier||1)]||1);
  }
  out = {updatedAt:new Date().toISOString(), source:'football-data.org', matches, standings:standingsData.standings||[], teamStats, computed:computeParticipants(teamStats)};
}catch(err){
  const old = JSON.parse(await fs.readFile('data/results.json','utf8').catch(()=>'{"matches":[],"standings":[]}'));
  out = {...old, updatedAt:new Date().toISOString(), source:`fallback: ${err.message}`, computed: old.computed || []};
}
await fs.writeFile('results.json', JSON.stringify(Fuori,null,2));
