import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are an expert youth soccer coach assistant for a boys under-14 house league team.
Give practical, age-appropriate, encouraging advice. Be concise and specific.
Format recommendations as clear bullet points or numbered lists when listing drills or positions.
Keep responses under 400 words unless doing a full season review.`;

const prompts: Record<string, (data: unknown) => string> = {
  lineup: (d: unknown) => {
    const { players, formation, teamName, opponent, totalPlayers } = d as {
      players: {
        name: string;
        number: number;
        preferredPositions: string[];
        gamesAttended: number;
        totalGames: number;
        plusMinus: number;
        goals: number;
        assists: number;
        minutesPlayed: number;
      }[];
      formation: string;
      teamName: string;
      opponent: string;
      totalPlayers: number;
    };

    const playerLines = players
      .sort((a, b) => a.number - b.number)
      .map(p => {
        const attendPct = p.totalGames > 0
          ? Math.round((p.gamesAttended / p.totalGames) * 100)
          : 0;
        const pm = p.plusMinus >= 0 ? `+${p.plusMinus}` : `${p.plusMinus}`;
        const pos = p.preferredPositions.length > 0
          ? p.preferredPositions.join(', ')
          : 'no preference set';
        return `  #${p.number} ${p.name} | preferred: ${pos} | +/-: ${pm} | attendance: ${p.gamesAttended}/${p.totalGames} (${attendPct}%) | goals: ${p.goals} | assists: ${p.assists}`;
      })
      .join('\n');

    const positions = formation === '4-3-3'
      ? 'GK, RB, RCB, LCB, LB, RCM, CM, LCM, RW, ST, LW'
      : formation === '4-4-2'
      ? 'GK, RB, RCB, LCB, LB, RM, RCM, LCM, LM, ST, CF'
      : formation === '4-2-3-1'
      ? 'GK, RB, RCB, LCB, LB, RCM, LCM, RW, CAM, LW, ST'
      : formation === '3-5-2'
      ? 'GK, RCB, CB, LCB, RWB, RCM, CM, LCM, LWB, ST, CF'
      : 'GK, RB, RCB, LCB, LB, CDM, RM, RCM, LCM, LM, ST';

    return `You are setting the lineup for "${teamName}" vs ${opponent || 'their opponent'} using a ${formation} formation.

The ${formation} requires these 11 positions: ${positions}

${totalPlayers} players are available today:
${playerLines}

RANKING RULES — apply in this exact order when multiple players can fill the same position:
1. PREFERRED POSITION FIRST: A player listed as preferring a position must get priority for it.
2. THEN PLUS/MINUS: Among players who can play a position, pick the one with the highest +/- rating (they perform better when on the field).
3. THEN ATTENDANCE: If +/- is equal, pick the player who has attended a higher percentage of games (rewarding commitment).
4. EQUAL PLAYING TIME: All ${totalPlayers} players must be distributed fairly across 6 shifts (15 min each). No player should sit out more than 2 full shifts.

OUTPUT FORMAT — use exactly this structure:

## STARTING LINEUP (Shift 1, 0–15 min)
| Position | Player | Reason |
|---|---|---|
| GK | #X Name | preferred position |
| RB | #X Name | preferred position, +/- +3 |
... (all 11 positions)

## SHIFT 2 (15–30 min) — changes only
- Sub OUT: #X Name (Position)
- Sub IN: #X Name (Position) — reason

## SHIFT 3 (30–45 min) — changes only
...

## SHIFT 4 (45–60 min) — changes only
...

## SHIFT 5 (60–75 min) — changes only
...

## SHIFT 6 (75–90 min) — changes only
...

## BENCH for Shift 1 (${totalPlayers - 11} players)
List the players not starting and which shift they come on.

## TACTICAL NOTE
One sentence of advice for this lineup.`;
  },

  formation: (d: unknown) => {
    const { players, opponent, preferredFormation, teamName, seasonStats } = d as {
      players: { name: string; number: number; positions: string[] }[];
      opponent: string;
      preferredFormation: string;
      teamName: string;
      seasonStats: { playerId: string; goals: number; assists: number; minutesPlayed: number }[];
    };
    return `Coach for "${teamName}" needs formation and lineup advice vs ${opponent || 'upcoming opponent'}.

Roster (${players.length} players):
${players.map(p => `- #${p.number} ${p.name} | positions: ${p.positions.join(', ') || 'flexible'}`).join('\n')}

Preferred formation: ${preferredFormation}

Please provide:
1. Best formation recommendation with reasoning
2. Recommended starting 11 for this formation
3. How to rotate all players fairly across 6 shifts of 15 minutes each
4. Key tactical tips for U14 house league`;
  },

  practice: (d: unknown) => {
    const { duration, playerCount, teamName, notes } = d as {
      duration: number;
      playerCount: number;
      teamName: string;
      notes: string;
    };
    return `Create a ${duration}-minute soccer practice plan for "${teamName}", a U14 boys house league team with ${playerCount} players.
${notes ? `Coach notes: ${notes}` : ''}

Include:
1. Warm-up (with duration)
2. 3-4 skill drills (with duration, player count setup, and coaching points)
3. Small-sided game or scrimmage
4. Cool-down / team talk

Format each drill with: Name | Duration | Setup | Instructions | Coaching Points`;
  },

  player_tips: (d: unknown) => {
    const { playerName, positions, stats, avgEffort, surveyHighlights, surveyImprovements, teamName } = d as {
      playerName: string;
      positions: string[];
      stats: { goals: number; assists: number; minutesPlayed: number; gamesAttended: number; plusMinus: number };
      avgEffort: number;
      surveyHighlights: string[];
      surveyImprovements: string[];
      teamName: string;
    };
    return `Provide personalized development tips for ${playerName}, a U14 player on "${teamName}".

Position(s): ${positions.join(', ') || 'not specified'}
Season stats: ${stats.goals} goals, ${stats.assists} assists, ${stats.minutesPlayed} minutes played, ${stats.gamesAttended} games, +/- ${stats.plusMinus}
Average self-reported effort: ${avgEffort}/5
Recent highlights: ${surveyHighlights.join('; ') || 'none recorded'}
Areas they want to improve: ${surveyImprovements.join('; ') || 'none recorded'}

Provide:
1. 3 specific skills to work on based on their position and stats
2. 2-3 at-home exercises they can do independently
3. A brief encouraging message about their season progress
Keep it motivating and age-appropriate!`;
  },

  season_review: (d: unknown) => {
    const { teamName, record, stats, notes } = d as {
      teamName: string;
      record: { wins: number; draws: number; losses: number; gamesPlayed: number; gamesRemaining: number };
      stats: { name: string; goals: number; assists: number; minutesPlayed: number; plusMinus: number }[];
      notes: string;
    };
    const topScorer = [...stats].sort((a, b) => b.goals - a.goals)[0];
    const topAssists = [...stats].sort((a, b) => b.assists - a.assists)[0];
    return `Provide a season review and recommendations for "${teamName}" U14 boys house league.

Record: ${record.wins}W ${record.draws}D ${record.losses}L (${record.gamesPlayed} played, ${record.gamesRemaining} remaining)
Top scorer: ${topScorer?.name ?? '?'} (${topScorer?.goals ?? 0} goals)
Top assists: ${topAssists?.name ?? '?'} (${topAssists?.assists ?? 0} assists)
${notes ? `Coach notes: ${notes}` : ''}

Please provide:
1. Overall season assessment
2. Team strengths to build on
3. 3 key areas for improvement with remaining games
4. Recommended tactical adjustments
5. Motivational message for the team`;
  },

  substitution: (d: unknown) => {
    const { onField, bench, minute, score, formation } = d as {
      onField: { name: string; position: string; minutesThisGame: number }[];
      bench: { name: string; positions: string[]; minutesThisGame: number }[];
      minute: number;
      score: { home: number; away: number };
      formation: string;
    };
    return `Recommend substitutions for a U14 game at minute ${minute}.
Formation: ${formation}
Score: ${score.home}-${score.away} (us-them)

On field:
${onField.map(p => `- ${p.name} | ${p.position} | ${p.minutesThisGame}min played`).join('\n')}

Available bench:
${bench.map(p => `- ${p.name} | preferred: ${p.positions.join(', ')} | ${p.minutesThisGame}min played`).join('\n')}

Suggest 1-3 substitutions with positions, prioritizing equal play time. Explain each change briefly.`;
  }
};

async function handleLineupStructured(data: unknown, res: VercelResponse, anthropic: Anthropic) {
  const { players, formation, teamName, opponent, attendingCount } = data as {
    players: {
      id: string;
      name: string;
      number: number;
      preferredPositions: string[];
      positionStats: {
        position: string;
        minutesPlayed: number;
        goals: number;
        assists: number;
        plusMinus: number;
        goalsPerMinute: number;
        assistsPerMinute: number;
      }[];
      totalGamesAttended: number;
      totalMinutesPlayed: number;
      seasonAvgMinutesPerGame?: number;
      seasonGoals?: number;
      seasonPlusMinus?: number;
    }[];
    formation: string;
    teamName: string;
    opponent: string;
    attendingCount: number;
  };

  const positionMap: Record<string, string> = {
    '4-3-3': 'GK, RB, RCB, LCB, LB, RCM, CM, LCM, RW, ST, LW',
    '4-4-2': 'GK, RB, RCB, LCB, LB, RM, RCM, LCM, LM, ST, CF',
    '4-2-3-1': 'GK, RB, RCB, LCB, LB, RCM, LCM, RW, CAM, LW, ST',
    '3-5-2': 'GK, RCB, CB, LCB, RWB, RCM, CM, LCM, LWB, ST, CF',
    '4-1-4-1': 'GK, RB, RCB, LCB, LB, CDM, RM, RCM, LCM, LM, ST',
  };
  const formationPositions = positionMap[formation] ?? positionMap['4-3-3'];
  const slotsToFill = Math.min(attendingCount, 11);

  const seasonAvgs = players
    .map(p => p.seasonAvgMinutesPerGame ?? 0)
    .filter(v => v > 0);
  const teamAvgMin = seasonAvgs.length > 0
    ? (seasonAvgs.reduce((s, v) => s + v, 0) / seasonAvgs.length).toFixed(1)
    : 'n/a';

  const playerLines = players
    .sort((a, b) => a.number - b.number)
    .map(p => {
      const preferred = (p.preferredPositions ?? []).length > 0 ? p.preferredPositions.join(', ') : 'flexible';
      const statsLines = (p.positionStats ?? []).length > 0
        ? (p.positionStats ?? []).map(s =>
            `      ${s.position}: ${s.minutesPlayed}min | ${s.goals}G | ${s.assists}A | +/-${s.plusMinus} | ${(s.goalsPerMinute * 90).toFixed(2)}G/90 | ${(s.assistsPerMinute * 90).toFixed(2)}A/90`
          ).join('\n')
        : '      No match history yet';
      const avgMin = p.seasonAvgMinutesPerGame ?? 0;
      const seasonGoals = p.seasonGoals ?? 0;
      const seasonPm = p.seasonPlusMinus ?? 0;
      return `  id:${p.id} | #${p.number} ${p.name}
    preferred positions: ${preferred}
    season: ${p.totalGamesAttended} games | avg ${avgMin} outfield-min/game | ${seasonGoals}G | +/-${seasonPm}
    performance by position:\n${statsLines}`;
    })
    .join('\n\n');

  const prompt = `You are the coach of "${teamName}", a U14 boys house league team. Set the optimal starting lineup for your game vs ${opponent || 'your opponent'} using a ${formation} formation.

Formation positions available: ${formationPositions}
Players attending today: ${attendingCount}
Starting lineup should have: ${slotsToFill} players (fill the ${slotsToFill} most important positions for this formation)
Team season avg outfield minutes/game: ${teamAvgMin}

REMEMBER: this is only Shift 1 of a 6-shift game. The starting lineup will be rotated each shift by the in-game AI sub-recommendation. Use the starting lineup to set the team up for the FULL match — not to put every star on the field at once.

PLAYER DATA (${players.length} players):
${playerLines}

OPTIMIZATION RULES (apply in this order — each rule is balanced against the others, none is absolute on its own):

1. PREFERRED POSITION: Strongly prefer players whose preferred positions include the slot.

2. POSITION-SPECIFIC PERFORMANCE: Among candidates for a position, rank by their stats IN THAT POSITION:
   - Higher position plus/minus = better fit (they win minutes when on)
   - Higher goals/90 = better for attacking roles (ST, CF, LW, RW, CAM)
   - Higher assists/90 = better for creative roles (CAM, CM, LW, RW)
   - Defensive slots (GK, CB, LCB, RCB, LB, RB): prioritise positive position plus/minus
   - A player with NO history in their preferred position still beats a player with bad stats elsewhere.

3. SEASON PLAYING-TIME EQUALIZATION: Players whose season avg outfield-minutes/game is BELOW the team average (${teamAvgMin}) should be prioritised for the starting lineup — they need to catch up. A player who has been getting heavy minutes all season can comfortably start on the bench and come on in shifts 2-6.

4. SPREAD STRENGTH ACROSS SHIFTS: Do NOT put every top-performer (highest goals/+ -, highest historical plus/minus) into Shift 1. Bench at least one or two strong players so they can come on for shifts 2-6 and keep the team's level high across the WHOLE 90 minutes. Mix strong + average players in the starting 11; the bench should also contain at least one threat.

5. Don't stack attackers in defensive slots or vice versa.

Use the set_lineup tool to return exactly ${slotsToFill} player-position assignments plus a 2-4 sentence reasoning summary that explicitly references (a) how starting minutes were balanced against season averages and (b) which strong players you intentionally kept on the bench for later shifts.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM,
    tools: [
      {
        name: 'set_lineup',
        description: `Set the starting lineup (${slotsToFill} players) for the game`,
        input_schema: {
          type: 'object' as const,
          properties: {
            startingLineup: {
              type: 'array',
              description: `Array of ${slotsToFill} player-position assignments`,
              items: {
                type: 'object' as const,
                properties: {
                  playerId: { type: 'string' as const, description: 'The player id string' },
                  position: { type: 'string' as const, description: 'Formation position e.g. GK, RB, ST' }
                },
                required: ['playerId', 'position']
              }
            },
            reasoning: {
              type: 'string' as const,
              description: 'Brief explanation of key lineup decisions (2-4 sentences)'
            }
          },
          required: ['startingLineup', 'reasoning']
        }
      }
    ],
    tool_choice: { type: 'tool' as const, name: 'set_lineup' },
    messages: [{ role: 'user', content: prompt }]
  });

  const toolUse = message.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return res.status(500).json({ error: 'AI did not return a structured lineup' });
  }

  const result = toolUse.input as { startingLineup: { playerId: string; position: string }[]; reasoning: string };
  return res.status(200).json(result);
}

async function handleShiftRecommendation(data: unknown, res: VercelResponse, anthropic: Anthropic) {
  const {
    nextShiftNumber, formation, teamName, opponent, gameMinute, nextSubMinute,
    currentShiftPlayers, benchPlayers, allPlayers, activeGkId, h1GkId, h2GkId, isSecondHalf,
    unfilledPositions,
  } = data as {
    nextShiftNumber: number;
    formation: string;
    teamName: string;
    opponent: string;
    gameMinute: number;
    nextSubMinute: number;
    currentShiftPlayers: { playerId: string; name: string; number: number; position: string; minutesThisGame: number }[];
    benchPlayers: { playerId: string; name: string; number: number; minutesThisGame: number; mustPlayNext: boolean; joinedAtMinute?: number }[];
    allPlayers: {
      id: string; name: string; number: number; preferredPositions: string[]; minutesThisGame: number;
      outfieldMinutesH1: number; outfieldMinutesH2: number; isH1Gk: boolean; isH2Gk: boolean;
      joinedAtMinute?: number;
      seasonAvgMinutesPerGame?: number;
      seasonGamesAttended?: number;
      seasonGoals?: number;
      seasonPlusMinus?: number;
      currentGamePositionStats: { position: string; plusMinus: number }[];
      positionStats: { position: string; minutesPlayed: number; plusMinus: number; plusMinusPer90: number; goals: number; assists: number }[];
    }[];
    activeGkId: string;
    h1GkId: string;
    h2GkId: string;
    isSecondHalf: boolean;
    unfilledPositions?: string[];
  };

  const positionMap: Record<string, string> = {
    '4-3-3': 'GK, RB, RCB, LCB, LB, RCM, CM, LCM, RW, ST, LW',
    '4-4-2': 'GK, RB, RCB, LCB, LB, RM, RCM, LCM, LM, ST, CF',
    '4-2-3-1': 'GK, RB, RCB, LCB, LB, RCM, LCM, RW, CAM, LW, ST',
    '3-5-2': 'GK, RCB, CB, LCB, RWB, RCM, CM, LCM, LWB, ST, CF',
    '4-1-4-1': 'GK, RB, RCB, LCB, LB, CDM, RM, RCM, LCM, LM, ST',
  };
  const formationPositions = positionMap[formation] ?? positionMap['4-3-3'];
  const activeGk = allPlayers.find(p => p.id === activeGkId);
  const mustPlayList = benchPlayers.filter(p => p.mustPlayNext);

  const currentLines = currentShiftPlayers
    .sort((a, b) => a.number - b.number)
    .map(p => `  ON-FIELD  onFieldPlayerId:"${p.playerId}"  #${p.number} ${p.name}  position:${p.position}  ${p.minutesThisGame}min`)
    .join('\n');

  const benchLines = benchPlayers.length > 0
    ? benchPlayers.sort((a, b) => a.number - b.number)
        .map(p => {
          const lateNote = p.joinedAtMinute ? ` [joined min ${p.joinedAtMinute}]` : '';
          return `  BENCH     benchPlayerId:"${p.playerId}"  #${p.number} ${p.name}  ${p.minutesThisGame}min${lateNote}${p.mustPlayNext ? '  ★MUST PLAY' : ''}`;
        })
        .join('\n')
    : '  (none — no bench players available)';

  const allPlayerLines = allPlayers
    .sort((a, b) => a.number - b.number)
    .map(p => {
      const preferred = (p.preferredPositions ?? []).length > 0 ? p.preferredPositions.join(', ') : 'flexible';
      const lateNote = p.joinedAtMinute ? ` | joined min ${p.joinedAtMinute} (max ~${90 - p.joinedAtMinute}min available)` : '';
      const gkTag = p.isH1Gk && p.isH2Gk ? ' [GK both halves]' : p.isH1Gk ? ' [H1 GK]' : p.isH2Gk ? ' [H2 GK]' : '';

      const currentStats = p.currentGamePositionStats ?? [];
      const currentLine = currentStats.length > 0
        ? `    THIS GAME +/-: ${currentStats.map(s => `${s.position}: ${s.plusMinus >= 0 ? '+' : ''}${s.plusMinus}`).join(', ')}`
        : '    THIS GAME: no goals yet';

      const histStats = p.positionStats ?? [];
      const historyLines = histStats.length > 0
        ? histStats.map(s =>
            `      ${s.position}: ${s.plusMinusPer90 >= 0 ? '+' : ''}${s.plusMinusPer90.toFixed(2)}/90 | ${s.goals}G ${s.assists}A | total +/-${s.plusMinus} in ${s.minutesPlayed}min`
          ).join('\n')
        : '      No prior match history';

      const seasonAvg = p.seasonAvgMinutesPerGame ?? 0;
      const seasonGames = p.seasonGamesAttended ?? 0;
      const seasonG = p.seasonGoals ?? 0;
      const seasonPm = p.seasonPlusMinus ?? 0;
      const seasonLine = seasonGames > 0
        ? `    SEASON: ${seasonGames} games, avg ${seasonAvg} outfield-min/game, ${seasonG}G, +/-${seasonPm}`
        : `    SEASON: no prior games`;

      return `  id:${p.id} #${p.number} ${p.name}${gkTag} | ${p.minutesThisGame}min outfield (projected at sub) | H1 outfield ${p.outfieldMinutesH1}min, H2 outfield ${p.outfieldMinutesH2}min | preferred: ${preferred}${lateNote}\n${seasonLine}\n${currentLine}\n    HISTORICAL by position:\n${historyLines}`;
    })
    .join('\n\n');

  const seasonAvgs = allPlayers
    .map(p => p.seasonAvgMinutesPerGame ?? 0)
    .filter(v => v > 0);
  const teamAvgSeason = seasonAvgs.length > 0
    ? (seasonAvgs.reduce((s, v) => s + v, 0) / seasonAvgs.length).toFixed(1)
    : 'n/a';

  const offHalfGkId = isSecondHalf ? h1GkId : h2GkId;
  const offHalfGk = allPlayers.find(p => p.id === offHalfGkId && offHalfGkId !== activeGkId);
  const offHalfGkCurrentMins = offHalfGk
    ? (isSecondHalf ? offHalfGk.outfieldMinutesH2 : offHalfGk.outfieldMinutesH1)
    : 0;
  const halfEndMinute = isSecondHalf ? 90 : 45;
  const offHalfGkBlock = offHalfGk
    ? `3. id:${offHalfGk.id} (#${offHalfGk.number} ${offHalfGk.name}) plays GK in the OTHER half. They have ${offHalfGkCurrentMins} outfield minutes this half so far. They MUST reach ≥30 outfield minutes in this half (ends at minute ${halfEndMinute}). If they are still on the bench and this half is running out, they MUST be in your subs.`
    : '3. No off-half GK constraint applies (same GK both halves, or GK currently on field).';

  const mustPlayBlock = mustPlayList.length > 0
    ? mustPlayList.map((p, i) => `${i + 4}. id:${p.playerId} (#${p.number} ${p.name}) is currently on the bench — MUST be in your subs list (no player may sit two shifts in a row).`).join('\n')
    : `4. (no other must-play players; the bench is empty or already satisfied)`;

  const openSlots = Array.isArray(unfilledPositions) ? unfilledPositions.filter(Boolean) : [];
  const openSlotsBlock = openSlots.length > 0
    ? `OPEN POSITIONS — the active shift is short-handed. These formation slots are not currently filled by anyone on the field: ${openSlots.join(', ')}.
You SHOULD recommend bringing a bench player on at each open slot (use openPositionFills below). Filling an open slot does NOT require taking anyone off the field — pair benchPlayerId with the position only, no onFieldPlayerId needed. Prefer bench players whose preferred positions include the open slot.`
    : `OPEN POSITIONS: none — every formation slot is filled.`;

  const prompt = `You are coaching "${teamName}" vs ${opponent}. It is minute ${gameMinute} (${isSecondHalf ? '2nd' : '1st'} half), ${formation} formation.

Decide which substitutions to make at minute ${nextSubMinute} (Shift ${nextShiftNumber} starts).
GK is locked: id:${activeGkId} (${activeGk?.name ?? ''}) — never substitute.

ALL "minutes" below refer to OUTFIELD minutes only. Time spent at GK does NOT count toward a player's on-field total — goalkeeping is tracked separately so the off-half GK still needs outfield time in their non-GK half.

CURRENTLY ON FIELD (position | projected OUTFIELD minutes by the time of the sub at minute ${nextSubMinute}):
${currentLines}

BENCH (actual outfield minutes played so far — they don't change between now and the sub):
${benchLines}

${openSlotsBlock}

HARD CONSTRAINTS (must all be satisfied — these are non-negotiable):
1. Never substitute the GK (id:${activeGkId}).
2. NO TWO SHIFTS IN A ROW: Every player currently on the bench MUST appear in your substitutions list (as the benchPlayerId of some swap) OR in openPositionFills (filling an open slot). A player cannot sit two consecutive shifts.
${offHalfGkBlock}
${mustPlayBlock}

OPTIMIZATION — apply in this exact order (only AFTER all hard constraints are satisfied):
0. FILL OPEN POSITIONS FIRST: If OPEN POSITIONS exist, send bench players to those open slots before proposing any swap. A fill keeps everyone on the field; only swap when there are no open slots left.
1. EQUALIZE TIME — IN-GAME AND ACROSS THE SEASON:
   - PRIMARY: balance projected minutes for THIS game. On-field players with the MOST projected outfield minutes come off; bench players with the FEWEST outfield minutes come on.
   - SECONDARY (tiebreaker / weighting): also balance season avg outfield-minutes/game (team avg = ${teamAvgSeason}). A bench player whose SEASON avg is below the team average gets a bump up the priority list; a bench player whose season avg is well above the team average can wait another shift if their in-game minutes are similar to peers.
   - The goal across the 90 minutes is: every player's combined (this game + prior season) minutes converge.
2. SPREAD STRENGTH ACROSS THE GAME: Do NOT field every strongest player at once. If two or more high-impact players (high season goals or strong position plus/minus) are currently on the field together, prefer a swap that takes ONE of them off so a similar-impact bench player can come on — this keeps the team's level steady through all 6 shifts instead of spiking shift 1-2.
3. PLUS/MINUS + GOALS (position fit): Among players with similar minutes profiles, prefer the bench player with the better +/- in the target position AND a better goal record in that position when the target is an attacking slot. Weight THIS GAME +/- most heavily; use HISTORICAL /90 as tiebreaker.
4. PREFERRED POSITIONS: When multiple on-field players could come off, prefer the swap that puts the bench player into one of their preferred positions.

PLAYER DATA (all attendees):
${allPlayerLines}

Use set_substitutions to list every change. There are two kinds of changes:
  - SWAP: benchPlayerId comes on, onFieldPlayerId comes off, position is the swapped slot (must be a valid ${formation} slot).
  - FILL: openPositionFills entry — benchPlayerId comes on at position (one of the OPEN POSITIONS listed above). No on-field player leaves.

CRITICAL: copy the EXACT id strings shown above:
  - benchPlayerId MUST be one of the benchPlayerId values from the BENCH section
  - onFieldPlayerId (swaps only) MUST be one of the onFieldPlayerId values from the ON-FIELD section (never the GK's id)
  - position MUST be a valid ${formation} formation slot

A bench player should appear in EITHER substitutions OR openPositionFills, never both. Empty substitutions + empty openPositionFills is only acceptable if there are zero bench players AND zero open positions.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM,
    tools: [
      {
        name: 'set_substitutions',
        description: `Substitution recommendations for Shift ${nextShiftNumber}`,
        input_schema: {
          type: 'object' as const,
          properties: {
            substitutions: {
              type: 'array' as const,
              description: 'Two-way swaps: bench player ON, on-field player OFF. Empty array if no swaps recommended.',
              items: {
                type: 'object' as const,
                properties: {
                  benchPlayerId: { type: 'string' as const, description: 'id of bench player coming ON' },
                  onFieldPlayerId: { type: 'string' as const, description: 'id of on-field player going OFF' },
                  position: { type: 'string' as const, description: 'position slot being exchanged' },
                },
                required: ['benchPlayerId', 'onFieldPlayerId', 'position'],
              },
            },
            openPositionFills: {
              type: 'array' as const,
              description: 'Bench players sent into an OPEN POSITION (short-handed team). No on-field player leaves. Empty array if no open positions to fill.',
              items: {
                type: 'object' as const,
                properties: {
                  benchPlayerId: { type: 'string' as const, description: 'id of bench player coming ON' },
                  position: { type: 'string' as const, description: 'one of the OPEN POSITIONS listed in the prompt' },
                },
                required: ['benchPlayerId', 'position'],
              },
            },
            reasoning: {
              type: 'string' as const,
              description: 'Brief explanation: who changes, why, and how time is being equalised',
            },
          },
          required: ['substitutions', 'reasoning'],
        },
      },
    ],
    tool_choice: { type: 'tool' as const, name: 'set_substitutions' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = message.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return res.status(500).json({ error: 'AI did not return substitutions' });
  }
  const result = toolUse.input as {
    substitutions: { benchPlayerId: string; onFieldPlayerId: string; position: string }[];
    openPositionFills?: { benchPlayerId: string; position: string }[];
    reasoning: string;
  };
  return res.status(200).json(result);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables' });
  }

  const anthropic = new Anthropic({ apiKey });
  const { type, data } = req.body as { type: string; data: unknown };

  try {
    if (type === 'lineup_structured') {
      return await handleLineupStructured(data, res, anthropic);
    }
    if (type === 'shift_recommendation') {
      return await handleShiftRecommendation(data, res, anthropic);
    }

    const promptFn = prompts[type];
    if (!promptFn) {
      return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    const maxTokens = type === 'lineup' ? 2048 : 1024;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: promptFn(data) }]
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    return res.status(200).json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Claude API error:', msg);
    return res.status(500).json({ error: `AI request failed: ${msg}` });
  }
}
