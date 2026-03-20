'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { api, clearSession, getUser } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SCORE_MAX = 20;
const AUCTION_MAX = 1000;

function money(value) {
  return new Intl.NumberFormat('cs-CZ').format(value ?? 0);
}

function getCompetitionKey(team) {
  return team?.type === 'national' ? 'International' : `${team?.country} · ${team?.competition}`;
}

function getCompetitionChoices(teams) {
  const nationals = teams.some((team) => team.type === 'national')
    ? [{ key: 'International', label: 'International', sortLabel: '' }]
    : [];

  const leagues = Array.from(new Map(
    teams
      .filter((team) => team.type !== 'national')
      .map((team) => {
        const key = `${team.country} · ${team.competition}`;
        return [key, { key, label: key, sortLabel: key.toLocaleLowerCase('cs') }];
      })
  ).values()).sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'cs'));

  return [...nationals, ...leagues];
}

function isMatchClosed(matchLike) {
  const hasTeams = Boolean(matchLike.footballTeamAId) && Boolean(matchLike.footballTeamBId) && matchLike.footballTeamAId !== matchLike.footballTeamBId;
  const hasScore = String(matchLike.scoreA) !== '' && String(matchLike.scoreB) !== '';
  const draw = hasScore && Number(matchLike.scoreA) === Number(matchLike.scoreB);
  const hasOvertime = !draw || Boolean(matchLike.overtimeWinner);
  return hasTeams && hasScore && hasOvertime;
}

function scoreLabel(match) {
  if (match.scoreA == null || match.scoreB == null) return '—';
  return `${match.scoreA}:${match.scoreB}`;
}

function Stepper({ value, onChange, step, min = 0, max, disabled }) {
  const numberValue = Number(value || 0);
  const canDec = !disabled && numberValue > min;
  const canInc = !disabled && (max == null || numberValue < max);

  function update(next) {
    const bounded = Math.max(min, max == null ? next : Math.min(max, next));
    onChange(bounded);
  }

  return (
    <div className="stepperRow">
      <button type="button" className="stepperBtn" disabled={!canDec} onClick={() => update(numberValue - step)}>−</button>
      <div className="stepperValue">{numberValue}</div>
      <button type="button" className="stepperBtn" disabled={!canInc} onClick={() => update(numberValue + step)}>+</button>
    </div>
  );
}

function TeamPicker({ teams, competitionKey, selectedTeamId, onCompetitionChange, onTeamChange, disabled }) {
  const competitionChoices = getCompetitionChoices(teams);
  const activeCompetition = competitionKey || competitionChoices[0]?.key || '';
  const filteredTeams = teams
    .filter((team) => activeCompetition === 'International'
      ? team.type === 'national'
      : `${team.country} · ${team.competition}` === activeCompetition)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  return (
    <div className="col" style={{ gap: 10 }}>
      <select disabled={disabled} className="select" value={activeCompetition} onChange={(e) => onCompetitionChange(e.target.value)}>
        {competitionChoices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
      </select>
      <select disabled={disabled} className="select" value={selectedTeamId} onChange={(e) => onTeamChange(e.target.value)}>
        <option value="">Vyber tým</option>
        {filteredTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
    </div>
  );
}

function MatchListRow({ label, status, disabled, active, onClick }) {
  return (
    <button type="button" className={`matchListRow ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick}>
      <span className={`matchDot ${status}`} />
      <span className="matchListLabel">{label}</span>
    </button>
  );
}

async function fileToOptimizedDataUrl(file) {
  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Fotku se nepodařilo načíst'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

  if (typeof window === 'undefined') return originalDataUrl;

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Fotku se nepodařilo otevřít'));
      img.src = originalDataUrl;
    });

    const maxEdge = 1600;
    const ratio = Math.min(1, maxEdge / Math.max(image.width || 1, image.height || 1));
    const width = Math.max(1, Math.round((image.width || 1) * ratio));
    const height = Math.max(1, Math.round((image.height || 1) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return originalDataUrl;
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.82;
    let compressed = canvas.toDataURL('image/jpeg', quality);
    const targetLength = 2_400_000;
    while (compressed.length > targetLength && quality > 0.45) {
      quality -= 0.1;
      compressed = canvas.toDataURL('image/jpeg', quality);
    }
    return compressed;
  } catch {
    return originalDataUrl;
  }
}

function MatchDetail({ match, teams, canEdit, onSaved }) {
  const inputRef = useRef(null);
  const [mode, setMode] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [form, setForm] = useState({
    footballTeamAId: match.footballTeamAId || '',
    footballTeamBId: match.footballTeamBId || '',
    competitionKeyA: getCompetitionKey(match.footballTeamA),
    competitionKeyB: getCompetitionKey(match.footballTeamB),
    auctionA: Number(match.auctionA || 0),
    auctionB: Number(match.auctionB || 0),
    scoreA: Number(match.scoreA || 0),
    scoreB: Number(match.scoreB || 0)
  });
  const [photoResult, setPhotoResult] = useState(null);
  const [photoMessage, setPhotoMessage] = useState(null);

  useEffect(() => {
    setForm({
      footballTeamAId: match.footballTeamAId || '',
      footballTeamBId: match.footballTeamBId || '',
      competitionKeyA: getCompetitionKey(match.footballTeamA),
      competitionKeyB: getCompetitionKey(match.footballTeamB),
      auctionA: Number(match.auctionA || 0),
      auctionB: Number(match.auctionB || 0),
      scoreA: Number(match.scoreA || 0),
      scoreB: Number(match.scoreB || 0),
      overtimeWinner: match.overtimeWinner || ''
    });
    setPhotoResult(null);
    setPhotoMessage(null);
    setMode('manual');
  }, [match]);

  const teamAPlayerNames = `${match.teamAPlayer1.name} + ${match.teamAPlayer2.name}`;
  const teamBPlayerNames = `${match.teamBPlayer1.name} + ${match.teamBPlayer2.name}`;
  const selectedTeamA = teams.find((team) => team.id === form.footballTeamAId);
  const selectedTeamB = teams.find((team) => team.id === form.footballTeamBId);

  function applyDetectedTeams(payload) {
    const homeTeam = teams.find((team) => team.id === payload.homeTeamId);
    const awayTeam = teams.find((team) => team.id === payload.awayTeamId);
    setForm((current) => ({
      ...current,
      footballTeamAId: payload.homeTeamId || current.footballTeamAId,
      footballTeamBId: payload.awayTeamId || current.footballTeamBId,
      competitionKeyA: getCompetitionKey(homeTeam) || current.competitionKeyA,
      competitionKeyB: getCompetitionKey(awayTeam) || current.competitionKeyB
    }));
    setPhotoResult(null);
    setPhotoMessage({
      type: 'success',
      text: `Týmy z fotky byly doplněny: ${homeTeam?.name || payload.rawHomeTeam || 'Domácí'} vs ${awayTeam?.name || payload.rawAwayTeam || 'Hosté'}.`
    });
    setMode('manual');
  }


  async function saveMatch() {
    setBusy(true);
    try {
      const result = await api(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          footballTeamAId: form.footballTeamAId,
          footballTeamBId: form.footballTeamBId,
          auctionA: Number(form.auctionA || 0),
          auctionB: Number(form.auctionB || 0),
          scoreA: Number(form.scoreA || 0),
          scoreB: Number(form.scoreB || 0),
          overtimeWinner: Number(form.scoreA || 0) === Number(form.scoreB || 0) ? (form.overtimeWinner || null) : null
        })
      });
      onSaved(result, match.order);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setExtractBusy(true);
      setMode('photo');
      const imageDataUrl = await fileToOptimizedDataUrl(file);
      const payload = await api(`/api/matches/${match.id}/extract-teams`, {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl })
      });
      setPhotoResult(payload);
      setPhotoMessage(payload.warning ? { type: 'warning', text: payload.warning } : { type: 'info', text: 'Zkontroluj vytěžené týmy a potvrď je.' });
      if (payload.warning) {
        console.warn('photo-extract-warning', payload.warning);
      }
    } catch (err) {
      const message = String(err?.message || 'Čtení týmů z fotky selhalo');
      setPhotoResult(null);
      setPhotoMessage({ type: 'error', text: message });
    } finally {
      setExtractBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="card pad pageSectionBottomSpace matchDetailCard">
      <div className="matchDetailHeader">
        <div>
          <div className="badge">Zápas {match.order}</div>
          <div className="matchTitle">{teamAPlayerNames} vs {teamBPlayerNames}</div>
        </div>
        {canEdit ? (
          <button className="btn primary" disabled={busy} onClick={saveMatch}>{busy ? 'Ukládám…' : 'Uložit zápas'}</button>
        ) : (
          <div className="badge">Jen pro čtení</div>
        )}
      </div>

      <div className="matchDualGrid">
        <div className="teamBlock modernBlock">
          <div className="matchSideLabel">Domácí</div>
          <div className="matchSidePlayers">{teamAPlayerNames}</div>
          <div className="modeActionRow">
            <button type="button" className={`segmentedBtn ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')} disabled={!canEdit}>Ručně</button>
            <button type="button" className={`segmentedBtn ${mode === 'photo' ? 'active' : ''}`} onClick={() => { setMode('photo'); setPhotoResult(null); inputRef.current?.click(); }} disabled={!canEdit}>Foto</button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelection} />
          <TeamPicker
            teams={teams}
            competitionKey={form.competitionKeyA}
            selectedTeamId={form.footballTeamAId}
            onCompetitionChange={(value) => setForm((current) => ({ ...current, competitionKeyA: value, footballTeamAId: '' }))}
            onTeamChange={(value) => setForm((current) => ({ ...current, footballTeamAId: value }))}
            disabled={!canEdit}
          />
          <div>
            <div className="fieldLabel">Losovačka</div>
            <Stepper value={form.auctionA} onChange={(value) => setForm((current) => ({ ...current, auctionA: value }))} step={10} min={0} max={AUCTION_MAX} disabled={!canEdit} />
          </div>
          <div className="selectedMeta">{selectedTeamA?.name || 'Nevybráno'}</div>
        </div>

        <div className="teamBlock modernBlock">
          <div className="matchSideLabel">Hosté</div>
          <div className="matchSidePlayers">{teamBPlayerNames}</div>
          <div className="modeActionRow modeActionSpacer" />
          <TeamPicker
            teams={teams}
            competitionKey={form.competitionKeyB}
            selectedTeamId={form.footballTeamBId}
            onCompetitionChange={(value) => setForm((current) => ({ ...current, competitionKeyB: value, footballTeamBId: '' }))}
            onTeamChange={(value) => setForm((current) => ({ ...current, footballTeamBId: value }))}
            disabled={!canEdit}
          />
          <div>
            <div className="fieldLabel">Losovačka</div>
            <Stepper value={form.auctionB} onChange={(value) => setForm((current) => ({ ...current, auctionB: value }))} step={10} min={0} max={AUCTION_MAX} disabled={!canEdit} />
          </div>
          <div className="selectedMeta">{selectedTeamB?.name || 'Nevybráno'}</div>
        </div>
      </div>

      {photoMessage ? <div className={`notice notice-${photoMessage.type}`}>{photoMessage.text}</div> : null}
      {extractBusy ? <div className="notice">Čtu fotku…</div> : null}
      {photoResult ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="card photoConfirmModal">
            <div className="photoConfirmHeader">
              <div>
                <div style={{ fontWeight: 800, fontSize: 20 }}>Potvrdit týmy z fotky</div>
                <div className="small">Zdroj: {photoResult.source === 'ai' ? 'AI + katalog' : 'Lokální OCR + katalog'}</div>
              </div>
              <button type="button" className="btn ghost compactAction" onClick={() => setPhotoResult(null)}>Zavřít</button>
            </div>

            <div className="notice notice-info">
              Zkontroluj rozpoznané týmy. Po potvrzení se propíšou přímo do tohoto zápasu.
            </div>
            {photoResult.warning ? <div className="notice notice-warning">{photoResult.warning}</div> : null}

            <div className="grid grid-2">
              <div>
                <div className="fieldLabel">Domácí</div>
                <div className="small" style={{ marginBottom: 6 }}>Rozpoznáno: {photoResult.rawHomeTeam || '—'}</div>
                <select className="select" value={photoResult.homeTeamId || ''} onChange={(e) => setPhotoResult((current) => ({ ...current, homeTeamId: e.target.value }))}>
                  <option value="">Vyber tým</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div>
                <div className="fieldLabel">Hosté</div>
                <div className="small" style={{ marginBottom: 6 }}>Rozpoznáno: {photoResult.rawAwayTeam || '—'}</div>
                <select className="select" value={photoResult.awayTeamId || ''} onChange={(e) => setPhotoResult((current) => ({ ...current, awayTeamId: e.target.value }))}>
                  <option value="">Vyber tým</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
            </div>

            <div className="modalActionRow">
              <button type="button" className="btn ghost" onClick={() => setPhotoResult(null)}>Upravit ručně</button>
              <button type="button" className="btn primary" disabled={!photoResult.homeTeamId || !photoResult.awayTeamId} onClick={() => applyDetectedTeams(photoResult)}>Potvrdit a propsat</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="scoreBoardCard">
        <div className="fieldLabel">Výsledek</div>
        <div className="scoreBoardGrid">
          <div>
            <div className="scoreSideName">{match.teamAPlayer1.name} + {match.teamAPlayer2.name}</div>
            <Stepper value={form.scoreA} onChange={(value) => setForm((current) => ({ ...current, scoreA: value }))} step={1} min={0} max={SCORE_MAX} disabled={!canEdit} />
          </div>
          <div>
            <div className="scoreSideName">{match.teamBPlayer1.name} + {match.teamBPlayer2.name}</div>
            <Stepper value={form.scoreB} onChange={(value) => setForm((current) => ({ ...current, scoreB: value }))} step={1} min={0} max={SCORE_MAX} disabled={!canEdit} />
          </div>
        </div>
        {Number(form.scoreA) === Number(form.scoreB) ? (
          <div>
            <div className="fieldLabel">Prodloužení</div>
            <div className="modeActionRow">
              <button type="button" className={`segmentedBtn ${form.overtimeWinner === 'A' ? 'active' : ''}`} onClick={() => setForm((current) => ({ ...current, overtimeWinner: 'A' }))} disabled={!canEdit}>Domácí</button>
              <button type="button" className={`segmentedBtn ${form.overtimeWinner === 'B' ? 'active' : ''}`} onClick={() => setForm((current) => ({ ...current, overtimeWinner: 'B' }))} disabled={!canEdit}>Hosté</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdminActions({ tournament, onStatusChange, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);

  async function closeTournament() {
    if (!confirm('Uzavřít turnaj?')) return;
    setBusy(true);
    try {
      const updated = await api(`/api/tournaments/${tournament.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' })
      });
      onStatusChange(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveTournament() {
    if (!confirm('Archivovat turnaj?')) return;
    setBusy(true);
    try {
      const updated = await api(`/api/tournaments/${tournament.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' })
      });
      onStatusChange(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTournament() {
    if (!confirm('Smazat turnaj natrvalo?')) return;
    setBusy(true);
    try {
      await api(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad adminPanel">
      <div className="adminActionRow">
        <button className="btn primary" disabled={busy || tournament.status === 'closed'} onClick={closeTournament}>Uzavřít turnaj</button>
        <button className="btn danger" disabled={busy} onClick={() => setDeleteChoiceOpen((value) => !value)}>{deleteChoiceOpen ? 'Skrýt delete' : 'Delete / archivace'}</button>
      </div>
      {deleteChoiceOpen ? (
        <div className="grid grid-2" style={{ marginTop: 12 }}>
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
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState('matches');
  const [showParams, setShowParams] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [syncLabel, setSyncLabel] = useState('Synchronizováno');

  async function loadTournament() {
    const data = await api(`/api/tournaments/${params.id}`);
    setTournament(data);
    const firstOpen = data.matches.find((match) => !isMatchClosed(match));
    setSelectedMatchId((current) => current || firstOpen?.id || data.matches[0]?.id || null);
  }

  async function loadTeams() {
    const data = await api('/api/teams');
    setTeams(data);
  }

  async function loadAudit() {
    if (user?.name !== 'Nojby') return;
    const data = await api(`/api/tournaments/${params.id}/audit`);
    setAudit(data);
  }

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser) {
      location.href = '/';
      return;
    }
    setUser(currentUser);
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
      const updated = await api(`/api/tournaments/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: tournament.name,
          buyIn: tournament.buyIn,
          players: tournament.players.map((player) => ({ id: player.id, name: player.name }))
        })
      });
      setTournament(updated);
      await loadAudit();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaveBusy(false);
    }
  }

  const tabs = useMemo(() => ([
    { key: 'matches', label: 'Zápasy' },
    { key: 'standings', label: 'Tabulka' },
    { key: 'finance', label: 'Finance' },
    ...(user?.name === 'Nojby' ? [{ key: 'audit', label: 'Audit' }] : [])
  ]), [user]);

  if (!user || !tournament) {
    return <main className="page"><div className="shell"><div className="notice">Načítám turnaj…</div></div></main>;
  }

  const firstOpenIndex = tournament.matches.findIndex((match) => !isMatchClosed(match));
  const currentEditableIndex = firstOpenIndex === -1 ? tournament.matches.length - 1 : firstOpenIndex;
  const selectedMatch = tournament.matches.find((match) => match.id === selectedMatchId) || tournament.matches[0];
  const canEditSelected = Boolean(
    selectedMatch && (
      (tournament.status !== 'closed' && tournament.matches.findIndex((match) => match.id === selectedMatch.id) === currentEditableIndex) ||
      (tournament.status === 'closed' && user.name === 'Nojby')
    )
  );

  return (
    <main className="page">
      <button className="btn ghost logoutFloating" onClick={() => { clearSession(); location.href = '/'; }}>Odhlásit</button>
      <div className="shell col tournamentShellCompact">
        <div className="row" style={{ justifyContent: 'space-between', paddingRight: '110px' }}>
          <Link href="/" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }}>← Zpět</Link>
          <span className={`badge statusBadge status-${tournament.status}`}>{syncLabel} • {tournament.status}</span>
        </div>

        <div className="card pad heroCompactCard">
          <div className="heroCompactHeader">
            <div className="title" style={{ fontSize: 'clamp(24px, 4vw, 38px)' }}>{tournament.name}</div>
            <button className="btn ghost compactAction" onClick={() => setShowParams((value) => !value)}>
              {showParams ? 'Skrýt parametry turnaje' : 'Parametry turnaje'}
            </button>
          </div>
        </div>

        <div className="topTabBar card">
          {tabs.map((item) => (
            <button key={item.key} className={`tab ${tab === item.key ? 'active' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>
          ))}
        </div>

        {showParams ? (
          <div className="card pad collapsiblePanel pageSectionBottomSpace">
            <div className="grid grid-2">
              <div>
                <div className="small">Název turnaje</div>
                <input disabled={tournament.status === 'closed'} className="input" value={tournament.name} onChange={(e) => setTournament((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div>
                <div className="small">Buy-in na hráče</div>
                <input disabled={tournament.status === 'closed'} className="input" type="number" value={tournament.buyIn} onChange={(e) => setTournament((current) => ({ ...current, buyIn: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-3" style={{ marginTop: 12 }}>
              {tournament.players.slice().sort((a, b) => a.slot.localeCompare(b.slot)).map((player) => (
                <div key={player.id} className="teamBlock">
                  <div className="small">Slot {player.slot}</div>
                  <input disabled={tournament.status === 'closed'} className="input" value={player.name} onChange={(e) => setTournament((current) => ({ ...current, players: current.players.map((row) => row.id === player.id ? { ...row, name: e.target.value } : row) }))} />
                </div>
              ))}
            </div>
            {user.name === 'Nojby' ? (
              <div style={{ marginTop: 12 }}>
                <AdminActions tournament={tournament} onStatusChange={setTournament} onDeleted={() => { location.href = '/'; }} />
              </div>
            ) : null}
            {tournament.status !== 'closed' ? (
              <div className="footerBar"><button className="btn primary" onClick={saveHeader} disabled={saveBusy}>{saveBusy ? 'Ukládám…' : 'Uložit parametry turnaje'}</button></div>
            ) : null}
          </div>
        ) : null}

        {tab === 'matches' ? (
          <>
            <div className="card pad matchListCard">
              <div className="matchListGrid">
                {tournament.matches.map((match, index) => {
                  const closed = isMatchClosed(match);
                  const isCurrent = !closed && index === currentEditableIndex;
                  const isLocked = !closed && index > currentEditableIndex && tournament.status !== 'closed';
                  const status = closed ? 'done' : isCurrent ? 'open' : 'locked';
                  return (
                    <MatchListRow
                      key={match.id}
                      label={`Zápas ${match.order}`}
                      status={status}
                      disabled={isLocked}
                      active={selectedMatch?.id === match.id}
                      onClick={() => setSelectedMatchId(match.id)}
                    />
                  );
                })}
              </div>
            </div>
            {selectedMatch ? <MatchDetail match={selectedMatch} teams={teams} canEdit={canEditSelected} onSaved={(updated, order) => {
              setTournament(updated);
              const nextMatch = updated.matches.find((match) => match.order === order + 1) || updated.matches.find((match) => match.order === order) || updated.matches[0];
              setSelectedMatchId(nextMatch?.id || null);
            }} /> : null}
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
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 800 }}>{row.action} · {row.entityType}</div>
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
