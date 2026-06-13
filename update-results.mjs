function computeParticipants(teamStats){
  return config.participants.map(p=>{
    const rows = p.teams.map(team=>{
      const realTeam = canonical(team);

      const meta = config.teams.find(t=>t.name===realTeam) || {tier:1, credits:0, group:'?'};
      const s = teamStats[realTeam] || {base:0,bonus:0,weighted:0,played:0,w:0,d:0,l:0,details:[]};

      const raw = s.base + s.bonus;
      const mult = config.rules.multipliers[String(meta.tier)] || 1;

      return {
        team: realTeam,
        originalName: team,
        group: meta.group,
        tier: meta.tier,
        credits: meta.credits,
        base: s.base,
        bonus: s.bonus,
        multiplier: mult,
        total: raw * mult,
        record: `${s.w}-${s.d}-${s.l}`,
        details: s.details
      };
    });

    const total = rows.reduce((a,b)=>a+b.total,0);
    const credits = rows.reduce((a,b)=>a+b.credits,0);
    const alive = rows.filter(r => true).length;

    return {name:p.name,total,credits,alive,teams:rows};
  }).sort((a,b)=>b.total-a.total);
}
