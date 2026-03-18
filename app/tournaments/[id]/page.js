'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { api, getUser } from '@/lib/api';

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

function MatchCard({ match, teams, onSaved }) {
  const [form, setForm] = useState({
    scoreA: match.scoreA ?? '',
    scoreB: match.scoreB ?? '',
    auctionA: match.auctionA ?? 0,
    auctionB: match.auctionB ?? 0,
    footballTeamAId: match.footballTeamAId || '',
    footballTeamBId: match.footballTeamBId || '',
    overtimeWinner: match.overtimeWinner || ''
  });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(() => !isMatchReady({
    scoreA: match.scoreA ?? '',
    scoreB: match.scoreB ?? '',
    auctionA: match.auctionA ?? 0,
    auctionB: match.auctionB ?? 0,
    footballTeamAId: match.footballTeamAId || '',
    footballTeamBId: match.footballTeamBId || '',
    overtimeWinner: match.overtimeWinner || ''
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
      overtimeWinner: match.overtimeWinner || ''
    };
    setForm(nextForm);
    setExpanded(!isMatchReady(nextForm));
  }, [match]);

  async function save() {
    setBusy(true);
    try {
      const result = await api(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form)
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
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Ukládám…' : 'Uložit zápas'}</button>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="teamBlock">
          <div style={{fontWeight:800}}>Tým A</div>
          <div className="small">{activeA}</div>
          <select className="select" value={form.footballTeamAId} onChange={(e)=>setForm((x)=>({...x, footballTeamAId:e.target.value}))}>
            <option value="">Vyber FC tým</option>
            {teams.map((team)=><option key={team.id} value={team.id}>{team.name} · {team.country}</option>)}
          </select>
          <input className="input" type="number" value={form.auctionA} onChange={(e)=>setForm((x)=>({...x, auctionA:e.target.value}))} placeholder="Losovačka Tým A" />
        </div>

        <div className="teamBlock">
          <div style={{fontWeight:800}}>Tým B</div>
          <div className="small">{activeB}</div>
          <select className="select" value={form.footballTeamBId} onChange={(e)=>setForm((x)=>({...x, footballTeamBId:e.target.value}))}>
            <option value="">Vyber FC tým</option>
            {teams.map((team)=><option key={team.id} value={team.id}>{team.name} · {team.country}</option>)}
          </select>
          <input className="input" type="number" value={form.auctionB} onChange={(e)=>setForm((x)=>({...x, auctionB:e.target.value}))} placeholder="Losovačka Tým B" />
        </div>
      </div>

      <div className="teamBlock">
        <div style={{fontWeight:800}}>Výsledek</div>
        <div className="scoreRow">
          <div><div className="small">Skóre A</div><input className="input" type="number" value={form.scoreA} onChange={(e)=>setForm((x)=>({...x, scoreA:e.target.value}))} /></div>
          <div><div className="small">Skóre B</div><input className="input" type="number" value={form.scoreB} onChange={(e)=>setForm((x)=>({...x, scoreB:e.target.value}))} /></div>
        </div>
        {draw ? (
          <select className="select" value={form.overtimeWinner} onChange={(e)=>setForm((x)=>({...x, overtimeWinner:e.target.value}))}>
            <option value="">Vyber vítěze prodloužení</option>
            <option value="A">Tým A</option>
            <option value="B">Tým B</option>
          </select>
        ) : null}
      </div>
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

  return (
    <main className="page">
      <div className="shell col">
        <div className="row" style={{justifyContent:'space-between'}}>
          <Link href="/" className="btn ghost" style={{width:'auto',padding:'0 14px'}}>← Zpět</Link>
          <span className="badge">{syncLabel}</span>
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

        <div className="grid grid-3">
          {kpis.map((kpi) => <div key={kpi.label} className="kpi"><div className="label">{kpi.label}</div><div className="value">{kpi.value}</div></div>)}
        </div>

        {showParams ? (
          <div className="card pad collapsiblePanel">
            <div className="grid grid-2">
              <div>
                <div className="small">Název turnaje</div>
                <input className="input" value={tournament.name} onChange={(e)=>setTournament((t)=>({...t, name:e.target.value}))} />
              </div>
              <div>
                <div className="small">Buy-in na hráče</div>
                <input className="input" type="number" value={tournament.buyIn} onChange={(e)=>setTournament((t)=>({...t, buyIn:e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-3" style={{marginTop:12}}>
              {tournament.players.slice().sort((a,b)=>a.slot.localeCompare(b.slot)).map((p) => (
                <div key={p.id} className="teamBlock">
                  <div className="small">Slot {p.slot}</div>
                  <input className="input" value={p.name} onChange={(e)=>setTournament((t)=>({...t, players: t.players.map((x)=>x.id===p.id?{...x, name:e.target.value}:x)}))} />
                </div>
              ))}
            </div>
            <div className="footerBar"><button className="btn primary" onClick={saveHeader} disabled={saveBusy}>{saveBusy ? 'Ukládám…' : 'Uložit parametry turnaje'}</button></div>
          </div>
        ) : null}

        <div className="tabs topTabBar">
          <button className={`tab ${tab==='matches'?'active':''}`} onClick={()=>setTab('matches')}>Zápasy</button>
          <button className={`tab ${tab==='standings'?'active':''}`} onClick={()=>setTab('standings')}>Tabulka</button>
          <button className={`tab ${tab==='finance'?'active':''}`} onClick={()=>setTab('finance')}>Finance</button>
          {user.name === 'Nojby' ? <button className={`tab ${tab==='audit'?'active':''}`} onClick={()=>setTab('audit')}>Audit</button> : null}
          <a className="tab" href={`${API_URL}/api/tournaments/${params.id}/export?token=${Date.now()}`} onClick={async (e)=>{
            e.preventDefault();
            const token = localStorage.getItem('fifa_token');
            const response = await fetch(`${API_URL}/api/tournaments/${params.id}/export`, { headers: { Authorization: `Bearer ${token}` }});
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fifa-turnaj-${params.id}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
          }}>Excel export</a>
        </div>

        {tab === 'matches' ? (
          <div className="grid">
            {tournament.matches.map((match) => (
              <MatchCard key={match.id} match={match} teams={teams} onSaved={(data)=>setTournament(data)} />
            ))}
          </div>
        ) : null}

        {tab === 'standings' ? (
          <div className="tableWrap card">
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
          <div className="tableWrap card">
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
                    <td><strong className={row.net >= 0 ? 'top' : ''}>{money(row.net)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'audit' && user.name === 'Nojby' ? (
          <div className="grid">
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
