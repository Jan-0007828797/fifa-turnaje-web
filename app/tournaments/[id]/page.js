'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { api, clearSession, getUser } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function money(value) {
  return new Intl.NumberFormat('cs-CZ').format(value ?? 0);
}

function scoreLabel(match) {
  if (match.scoreA == null || match.scoreB == null) return 'Nevyplněno';
  const base = `${match.scoreA}:${match.scoreB}`;
  if (match.scoreA !== match.scoreB) return base;
  if (!match.overtimeWinner) return `${base} · čeká prodloužení`;
  return `${base} · prodloužení ${match.overtimeWinner === 'A' ? 'Tým A' : 'Tým B'}`;
}

function isMatchReady(form) {
  const hasTeams = Boolean(form.footballTeamAId) && Boolean(form.footballTeamBId) && form.footballTeamAId !== form.footballTeamBId;
  const hasScore = String(form.scoreA) !== '' && String(form.scoreB) !== '';
  const draw = hasScore && Number(form.scoreA) === Number(form.scoreB);
  const hasOvertime = !draw || Boolean(form.overtimeWinner);
  return hasTeams && hasScore && hasOvertime;
}

function getCompetitionKey(team) {
  return team?.type === 'national' ? 'International' : `${team?.country} · ${team?.competition}`;
}

function getCompetitionChoices(teams) {
  const nationals = teams
    .filter((team) => team.type === 'national')
    .map((team) => ({ key: 'International', label: 'International', sortLabel: '' }));

  const leagues = Array.from(new Map(
    teams
      .filter((team) => team.type !== 'national')
      .map((team) => {
        const key = `${team.country} · ${team.competition}`;
        return [key, { key, label: key, sortLabel: key.toLocaleLowerCase('cs') }];
      })
  ).values()).sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'cs'));

  return nationals.length ? [nationals[0], ...leagues] : leagues;
}

function TeamSelect({ value, teams, competitionKey, onCompetitionChange, onChange, disabled }) {
  const competitionChoices = getCompetitionChoices(teams);
  const activeCompetition = competitionKey || competitionChoices[0]?.key || '';
  const filteredTeams = teams
    .filter((team) => activeCompetition === 'International' ? team.type === 'national' : `${team.country} · ${team.competition}` === activeCompetition)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  return (
    <div className="col" style={{gap:10, marginTop:8}}>
      <div>
        <div className="fieldLabel">Soutěž / výběr</div>
        <select disabled={disabled} className="select" value={activeCompetition} onChange={(e)=>onCompetitionChange(e.target.value)}>
          {competitionChoices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </div>
      <div>
        <div className="fieldLabel">Tým</div>
        <select disabled={disabled} className="select" value={value} onChange={(e)=>onChange(e.target.value)}>
          <option value="">{activeCompetition === 'International' ? 'Vyber národní tým' : 'Vyber tým z dané soutěže'}</option>
          {filteredTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div>
    </div>
  );
}

function MatchCard({ match, teams, onSaved, readOnly }) {
  const [form, setForm] = useState({
    scoreA: match.scoreA ?? '',
    scoreB: match.scoreB ?? '',
    auctionA: match.auctionA ?? 0,
    auctionB: match.auctionB ?? 0,
    footballTeamAId: match.footballTeamAId || '',
    footballTeamBId: match.footballTeamBId || '',
    overtimeWinner: match.overtimeWinner || '',
    competitionKeyA: getCompetitionKey(match.footballTeamA),
    competitionKeyB: getCompetitionKey(match.footballTeamB)
  });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(() => !isMatchReady({
    scoreA: match.scoreA ?? '',
    scoreB: match.scoreB ?? '',
    auctionA: match.auctionA ?? 0,
    auctionB: match.auctionB ?? 0,
    footballTeamAId: match.footballTeamAId || '',
    footballTeamBId: match.footballTeamBId || '',
    overtimeWinner: match.overtimeWinner || '',
    competitionKeyA: getCompetitionKey(match.footballTeamA),
    competitionKeyB: getCompetitionKey(match.footballTeamB)
  }));
  const activeA = `${match.teamAPlayer1.name} + ${match.teamAPlayer2.name}`;
  const activeB = `${match.teamBPlayer1.name} + ${match.teamBPlayer2.name}`;
  const bench = `${match.benchPlayer1.name} + ${match.benchPlayer2.name}`;

  useEffect(() => {
    const nextForm = {
      scoreA: match.scoreA ?? '',
      scoreB: match.scoreB ?? '',
      auctionA: match.auctionA ?? 0,
      auctionB: match.auctionB ?? 0,
      footballTeamAId: match.footballTeamAId || '',
      footballTeamBId: match.footballTeamBId || '',
      overtimeWinner: match.overtimeWinner || '',
      competitionKeyA: getCompetitionKey(match.footballTeamA),
      competitionKeyB: getCompetitionKey(match.footballTeamB)
    };
    setForm(nextForm);
    setExpanded(!isMatchReady(nextForm));
  }, [match]);

  async function save() {
    setBusy(true);
    try {
      const payload = { ...form };
      delete payload.competitionKeyA;
      delete payload.competitionKeyB;
      const result = await api(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      onSaved(result);
      if (isMatchReady(form)) setExpanded(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const draw = String(form.scoreA) !== '' && String(form.scoreB) !== '' && Number(form.scoreA) === Number(form.scoreB);
  const readyToCollapse = isMatchReady(form);
  const teamAName = teams.find((team) => team.id === form.footballTeamAId)?.name || 'Nevybráno';
  const teamBName = teams.find((team) => team.id === form.footballTeamBId)?.name || 'Nevybráno';

  if (!expanded && readyToCollapse) {
    return (
      <div className="matchCard compactMatchCard">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div className="col" style={{gap:8}}>
            <div className="badge">Detaily zápasu č. {match.order}</div>
            <div style={{fontSize:22,fontWeight:800}}>{activeA} vs {activeB}</div>
            <div className="small">Skóre: {scoreLabel(match)} • FC týmy: {teamAName} vs {teamBName}</div>
            <div className="small">Pauza: {bench}</div>
          </div>
          <button className="btn ghost compactAction" onClick={() => setExpanded(true)}>Otevřít detail</button>
        </div>
      </div>
    );
  }

  return (
    <div className="matchCard">
      <div className="matchHeading">
        <div>
          <div className="badge">Zápas {match.order}</div>
          <div style={{fontSize:24,fontWeight:800, marginTop:8}}>{activeA} vs {activeB}</div>
          <div className="small">Pauza: {bench}</div>
        </div>
        <div className="row matchActions">
          {readyToCollapse ? <button className="btn ghost compactAction" onClick={() => setExpanded(false)}>Skrýt detail</button> : null}
          {!readOnly ? <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Ukládám…' : 'Uložit zápas'}</button> : null}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="teamBlock">
          <div style={{fontWeight:800}}>Tým A</div>
          <div className="small">{activeA}</div>
          <TeamSelect
            disabled={readOnly}
            value={form.footballTeamAId}
            teams={teams}
            competitionKey={form.competitionKeyA}
            onCompetitionChange={(value)=>setForm((x)=>({...x, competitionKeyA: value, footballTeamAId: ''}))}
            onChange={(value)=>setForm((x)=>({...x, footballTeamAId:value}))}
          />
          <div>
            <div className="fieldLabel">Losovačka</div>
            <input disabled={readOnly} className="input" type="number" value={form.auctionA} onChange={(e)=>setForm((x)=>({...x, auctionA:e.target.value}))} />
          </div>
        </div>

        <div className="teamBlock">
          <div style={{fontWeight:800}}>Tým B</div>
          <div className="small">{activeB}</div>
          <TeamSelect
            disabled={readOnly}
            value={form.footballTeamBId}
            teams={teams}
            competitionKey={form.competitionKeyB}
            onCompetitionChange={(value)=>setForm((x)=>({...x, competitionKeyB: value, footballTeamBId: ''}))}
            onChange={(value)=>setForm((x)=>({...x, footballTeamBId:value}))}
          />
          <div>
            <div className="fieldLabel">Losovačka</div>
            <input disabled={readOnly} className="input" type="number" value={form.auctionB} onChange={(e)=>setForm((x)=>({...x, auctionB:e.target.value}))} />
          </div>
        </div>
      </div>

      <div className="teamBlock">
        <div style={{fontWeight:800}}>Výsledek</div>
        <div className="scoreRow">
          <div><div className="small">Skóre A</div><input disabled={readOnly} className="input" type="number" value={form.scoreA} onChange={(e)=>setForm((x)=>({...x, scoreA:e.target.value}))} /></div>
          <div><div className="small">Skóre B</div><input disabled={readOnly} className="input" type="number" value={form.scoreB} onChange={(e)=>setForm((x)=>({...x, scoreB:e.target.value}))} /></div>
        </div>
        {draw ? (
          <select disabled={readOnly} className="select" value={form.overtimeWinner} onChange={(e)=>setForm((x)=>({...x, overtimeWinner:e.target.value}))}>
            <option value="">Vyber vítěze prodloužení</option>
            <option value="A">Tým A</option>
            <option value="B">Tým B</option>
          </select>
        ) : null}
      </div>
    </div>
  );
}


function LockedMatchCard({ match, previousOrder }) {
  const activeA = `${match.teamAPlayer1.name} + ${match.teamAPlayer2.name}`;
  const activeB = `${match.teamBPlayer1.name} + ${match.teamBPlayer2.name}`;
  const bench = `${match.benchPlayer1.name} + ${match.benchPlayer2.name}`;

  return (
    <div className="matchCard lockedMatchCard">
      <div className="matchHeading">
        <div>
          <div className="badge">Zápas {match.order}</div>
          <div style={{fontSize:22,fontWeight:800, marginTop:8}}>{activeA} vs {activeB}</div>
          <div className="small">Pauza: {bench}</div>
        </div>
      </div>
      <div className="notice">Tento zápas se odemkne až po uzavření zápasu č. {previousOrder}. Vždy se doplňuje jen jeden následující zápas, aby byl průběh turnaje přehledný.</div>
    </div>
  );
}

function AdminActions({ tournament, onStatusChange, onDeleted, busy }) {
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);

  async function closeTournament() {
    if (!confirm('Uzavřít turnaj? Po uzavření se propíše do Stats FC2026 a nebude ho možné dále upravovat.')) return;
    try {
      const result = await api(`/api/tournaments/${tournament.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' })
      });
      onStatusChange(result);
      alert('Turnaj byl uzavřen a propsal se do statistik.');
    } catch (err) {
      alert(err.message);
    }
  }

  async function archiveTournament() {
    if (!confirm('Archivovat turnaj? Zmizí ze seznamu aktivních turnajů a nepropíše se do statistik.')) return;
    try {
      await api(`/api/tournaments/${tournament.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' })
      });
      onDeleted();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteTournament() {
    if (!confirm('Smazat turnaj natrvalo? Tuto akci nelze vrátit.')) return;
    try {
      await api(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="adminPanel card pad">
      <div style={{fontSize:20, fontWeight:800}}>Správa turnaje</div>
      <div className="small" style={{marginTop:4}}>Tyto akce může provést pouze Nojby.</div>
      <div className="adminActionRow" style={{marginTop:12}}>
        <button className="btn primary" disabled={busy || tournament.status === 'closed'} onClick={closeTournament}>Uzavřít turnaj</button>
        <button className="btn danger" disabled={busy} onClick={() => setDeleteChoiceOpen((s) => !s)}>{deleteChoiceOpen ? 'Skrýt volby delete' : 'Delete / archivace'}</button>
      </div>
      {deleteChoiceOpen ? (
        <div className="grid grid-2" style={{marginTop:12}}>
          <button className="btn ghost" onClick={archiveTournament}>Archivovat turnaj</button>
          <button className="btn danger" onClick={deleteTournament}>Smazat natrvalo</button>
        </div>
      ) : null}
    </div>
  );
}

export default function TournamentDetail({ params }) {
  const [user, setUser] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [tab, setTab] = useState('matches');
  const [saveBusy, setSaveBusy] = useState(false);
  const [audit, setAudit] = useState([]);
  const [syncLabel, setSyncLabel] = useState('Synchronizováno');
  const [showParams, setShowParams] = useState(false);

  async function loadTournament() {
    const data = await api(`/api/tournaments/${params.id}`);
    setTournament(data);
  }
  async function loadTeams() {
    const data = await api('/api/teams');
    setTeams(data);
  }
  async function loadAudit() {
    if (user?.name === 'Nojby') {
      const data = await api(`/api/tournaments/${params.id}/audit`);
      setAudit(data);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u) {
      location.href = '/';
      return;
    }
    setUser(u);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTournament();
    loadTeams();
    loadAudit();
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      socket.emit('join-tournament', params.id);
      setSyncLabel('Online');
    });
    socket.on('tournament-updated', async () => {
      setSyncLabel('Aktualizuji…');
      await loadTournament();
      await loadAudit();
      setTimeout(() => setSyncLabel('Synchronizováno'), 400);
    });
    socket.on('disconnect', () => setSyncLabel('Offline'));
    return () => {
      socket.emit('leave-tournament', params.id);
      socket.disconnect();
    };
  }, [user, params.id]);

  async function saveHeader() {
    setSaveBusy(true);
    try {
      const result = await api(`/api/tournaments/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: tournament.name,
          buyIn: tournament.buyIn,
          players: tournament.players.map((p) => ({ id: p.id, name: p.name }))
        })
      });
      setTournament(result);
      await loadAudit();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaveBusy(false);
    }
  }

  const kpis = useMemo(() => tournament ? [
    { label: 'Bank', value: money(tournament.totalBank) },
    { label: 'Top střelci', value: tournament.topScorers.join(', ') || '-' },
    { label: 'Top obrana', value: tournament.topDefenses.join(', ') || '-' },
  ] : [], [tournament]);

  if (!tournament || !user) {
    return <main className="page"><div className="shell"><div className="notice">Načítám turnaj…</div></div></main>;
  }

  const tabs = [
    { key: 'matches', label: 'Zápasy' },
    { key: 'standings', label: 'Tabulka' },
    { key: 'finance', label: 'Finance' },
    ...(user.name === 'Nojby' ? [{ key: 'audit', label: 'Audit' }] : [])
  ];
  const readOnly = tournament.status === 'closed';

  return (
    <main className="page">
      <button className="btn ghost logoutFloating" onClick={() => { clearSession(); location.href = '/'; }}>Odhlásit</button>

      <div className="shell col">
        <div className="row" style={{justifyContent:'space-between', paddingRight:'110px'}}>
          <Link href="/" className="btn ghost" style={{width:'auto',padding:'0 14px'}}>← Zpět</Link>
          <span className={`badge statusBadge status-${tournament.status}`}>{syncLabel} • {tournament.status}</span>
        </div>

        <div className="card pad">
          <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div className="badge">Turnaj</div>
              <div className="title" style={{marginTop:8, fontSize:'clamp(24px, 4vw, 38px)'}}>{tournament.name}</div>
              <div className="subtitle">V horní liště máš rychlý přístup k zápasům, tabulce, financím a auditu. Parametry turnaje jsou schované níže.</div>
            </div>
            <button className="btn ghost" style={{width:'auto', padding:'0 16px'}} onClick={() => setShowParams((s) => !s)}>
              {showParams ? 'Skrýt parametry turnaje' : 'Parametry turnaje'}
            </button>
          </div>
        </div>

        <div className="topTabBar card">
          {tabs.map((item) => (
            <button key={item.key} className={`tab ${tab === item.key ? 'active' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>
          ))}
        </div>

        <div className="grid grid-3">
          {kpis.map((kpi) => <div key={kpi.label} className="kpi"><div className="label">{kpi.label}</div><div className="value">{kpi.value}</div></div>)}
        </div>

        {readOnly ? <div className="notice">Turnaj je uzavřený. Výsledky jsou propsané do Stats FC2026 a údaje už nelze upravovat.</div> : null}

        {user.name === 'Nojby' ? (
          <AdminActions
            tournament={tournament}
            busy={saveBusy}
            onStatusChange={(updated) => setTournament(updated)}
            onDeleted={() => { location.href = '/'; }}
          />
        ) : null}

        {showParams ? (
          <div className="card pad collapsiblePanel">
            <div className="grid grid-2">
              <div>
                <div className="small">Název turnaje</div>
                <input disabled={readOnly} className="input" value={tournament.name} onChange={(e)=>setTournament((t)=>({...t, name:e.target.value}))} />
              </div>
              <div>
                <div className="small">Buy-in na hráče</div>
                <input disabled={readOnly} className="input" type="number" value={tournament.buyIn} onChange={(e)=>setTournament((t)=>({...t, buyIn:e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-3" style={{marginTop:12}}>
              {tournament.players.slice().sort((a,b)=>a.slot.localeCompare(b.slot)).map((p) => (
                <div key={p.id} className="teamBlock">
                  <div className="small">Slot {p.slot}</div>
                  <input disabled={readOnly} className="input" value={p.name} onChange={(e)=>setTournament((t)=>({...t, players: t.players.map((x)=>x.id===p.id?{...x, name:e.target.value}:x)}))} />
                </div>
              ))}
            </div>
            {!readOnly ? <div className="footerBar"><button className="btn primary" onClick={saveHeader} disabled={saveBusy}>{saveBusy ? 'Ukládám…' : 'Uložit parametry turnaje'}</button></div> : null}
          </div>
        ) : null}

        {tab === 'matches' ? (
          <>
            <div className="card pad">
              <div style={{fontWeight:800, fontSize:20}}>Zápasy</div>
              <div className="small" style={{marginTop:6}}>Na obrazovce je vždy otevřený jen nejbližší následující zápas. Jakmile ho vyplníš a uložíš, odemkne se další. Hotové zápasy se automaticky sbalí do stručného řádku.</div>
            </div>
            <div className="grid pageSectionBottomSpace">
              {(() => {
                const firstOpenIndex = tournament.matches.findIndex((match) => !isMatchReady({
                  scoreA: match.scoreA ?? '',
                  scoreB: match.scoreB ?? '',
                  auctionA: match.auctionA ?? 0,
                  auctionB: match.auctionB ?? 0,
                  footballTeamAId: match.footballTeamAId || '',
                  footballTeamBId: match.footballTeamBId || '',
                  overtimeWinner: match.overtimeWinner || ''
                }));
                return tournament.matches.map((match, index) => {
                  const isLocked = !readOnly && firstOpenIndex !== -1 && index > firstOpenIndex;
                  if (isLocked) return <LockedMatchCard key={match.id} match={match} previousOrder={tournament.matches[index - 1]?.order || match.order - 1} />;
                  return <MatchCard key={match.id} match={match} teams={teams} readOnly={readOnly} onSaved={(data)=>setTournament(data)} />;
                });
              })()}
            </div>
          </>
        ) : null}

        {tab === 'standings' ? (
          <div className="tableWrap card pageSectionBottomSpace">
            <table>
              <thead><tr><th>Poř.</th><th>Hráč</th><th>Slot</th><th>Z</th><th>V</th><th>VP</th><th>PP</th><th>P</th><th>GF</th><th>GA</th><th>GD</th><th>Body</th></tr></thead>
              <tbody>
                {tournament.standings.map((row, idx) => (
                  <tr key={row.playerId}>
                    <td>{row.position}{row.sharedPosition ? '*' : ''}</td>
                    <td>{idx < 3 ? <strong className="top">{row.name}</strong> : row.name}</td>
                    <td>{row.slot}</td>
                    <td>{row.played}</td>
                    <td>{row.winsRegular}</td>
                    <td>{row.winsOT}</td>
                    <td>{row.lossesOT}</td>
                    <td>{row.lossesRegular}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td>{row.goalDiff}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'finance' ? (
          <div className="tableWrap card pageSectionBottomSpace">
            <table>
              <thead><tr><th>Hráč</th><th>Buy-in</th><th>Losovačky</th><th>Náklady</th><th>Umístění</th><th>Top střelec</th><th>Top obrana</th><th>Tržby</th><th>Netto</th></tr></thead>
              <tbody>
                {tournament.finance.map((row) => (
                  <tr key={row.playerId}>
                    <td>{row.name}</td>
                    <td>{money(row.buyIn)}</td>
                    <td>{money(row.auctionCost)}</td>
                    <td>{money(row.totalCosts)}</td>
                    <td>{money(row.placementPrize)}</td>
                    <td>{money(row.topScorerPrize)}</td>
                    <td>{money(row.topDefensePrize)}</td>
                    <td>{money(row.totalRevenue)}</td>
                    <td><strong className={row.net >= 0 ? 'top' : ''}>{row.net >= 0 ? '+' : '-'}{money(Math.abs(row.net))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'audit' && user.name === 'Nojby' ? (
          <div className="grid pageSectionBottomSpace">
            {audit.map((row) => (
              <div key={row.id} className="card pad">
                <div className="row" style={{justifyContent:'space-between'}}>
                  <div style={{fontWeight:800}}>{row.action} · {row.entityType}</div>
                  <div className="small">{new Date(row.createdAt).toLocaleString('cs-CZ')}</div>
                </div>
                <div className="small">Upravil: {row.changedBy}</div>
              </div>
            ))}
            {audit.length === 0 ? <div className="notice">Audit zatím neobsahuje žádné změny.</div> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
