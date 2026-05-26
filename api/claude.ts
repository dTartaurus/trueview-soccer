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

  const playerLines = players
    .sort((a, b) => a.number - b.number)
    .map(p => {
      const preferred = p.preferredPositions.length > 0 ? p.preferredPositions.join(', ') : 'flexible';
      const statsLines = p.positionStats.length > 0
        ? p.positionStats.map(s =>
            `      ${s.position}: ${s.minutesPlayed}min | ${s.goals}G | ${s.assists}A | +/-${s.plusMinus} | ${(s.goalsPerMinute * 90).toFixed(2)}G/90 | ${(s.assistsPerMinute * 90).toFixed(2)}A/90`
          ).join('\n')
        : '      No match history yet';
      return `  id:${p.id} | #${p.number} ${p.name}
    preferred positions: ${preferred}
    total games: ${p.totalGamesAttended} | total minutes: ${p.totalMinutesPlayed}
    performance by position:\n${statsLines}`;
    })
    .join('\n\n');

  const prompt = `You are the coach of "${teamName}", a U14 boys house league team. Set the optimal starting lineup for your game vs ${opponent || 'your opponent'} using a ${formation} formation.

Formation positions available: ${formationPositions}
Players attending today: ${attendingCount}
Starting lineup should have: ${slotsToFill} players (fill the ${slotsToFill} most important positions for this formation)

PLAYER DATA (${players.length} players):
${playerLines}

OPTIMIZATION RULES (apply in this order for each position):
1. PREFERRED POSITION: Strongly prefer players who list this as a preferred position.
2. POSITION-SPECIFIC PERFORMANCE: Among candidates, rank by their actual stats IN THIS POSITION:
   - Higher plus/minus in this position = better fit
   - Higher goals/90 minutes = better for attacking roles (ST, CF, LW, RW, CAM)
   - Higher assists/90 minutes = better for creative roles (CAM, CM, LW, RW)
   - Defensive positions (GK, CB, LCB, RCB, LB, RB): prioritise positive plus/minus
3. If a player has NO history in a position but it's their preferred, they still get priority over someone with bad stats.
4. Distribute positions logically — don't stack attackers in defensive slots.

Use the set_lineup tool to return exactly ${slotsToFill} player-position assignments plus a 2-4 sentence reasoning summary explaining the key decisions.`;

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
    nextShiftNumber, formation, teamName, opponent, gameMinute,
    currentShiftPlayers, benchPlayers, allPlayers, activeGkId, isSecondHalf, slotsCount,
  } = data as {
    nextShiftNumber: number;
    formation: string;
    teamName: string;
    opponent: string;
    gameMinute: number;
    currentShiftPlayers: { playerId: string; name: string; number: number; position: string; minutesThisGame: number }[];
    benchPlayers: { playerId: string; name: string; number: number; minutesThisGame: number; mustPlayNext: boolean; joinedAtMinute?: number }[];
    allPlayers: {
      id: string; name: string; number: number; preferredPositions: string[]; minutesThisGame: number; joinedAtMinute?: number;
      currentGamePositionStats: { position: string; plusMinus: number }[];
      positionStats: { position: string; minutesPlayed: number; plusMinus: number; plusMinusPer90: number; goals: number; assists: number }[];
    }[];
    activeGkId: string;
    isSecondHalf: boolean;
    slotsCount: number;
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
    .map(p => `  ON   #${p.number} ${p.name} | ${p.position} | ${p.minutesThisGame}min`)
    .join('\n');

  const benchLines = benchPlayers.length > 0
    ? benchPlayers.sort((a, b) => a.number - b.number)
        .map(p => {
          const lateNote = p.joinedAtMinute ? ` [joined min ${p.joinedAtMinute}]` : '';
          return `  BENCH #${p.number} ${p.name} | ${p.minutesThisGame}min${lateNote}${p.mustPlayNext ? ' ★MUST PLAY' : ''}`;
        })
        .join('\n')
    : '  (none)';

  const allPlayerLines = allPlayers
    .sort((a, b) => a.number - b.number)
    .map(p => {
      const preferred = p.preferredPositions.length > 0 ? p.preferredPositions.join(', ') : 'flexible';
      const lateNote = p.joinedAtMinute ? ` | joined min ${p.joinedAtMinute} (max ~${90 - p.joinedAtMinute}min available)` : '';

      const currentLine = p.currentGamePositionStats.length > 0
        ? `    THIS GAME +/-: ${p.currentGamePositionStats.map(s => `${s.position}: ${s.plusMinus >= 0 ? '+' : ''}${s.plusMinus}`).join(', ')}`
        : '    THIS GAME: no goals yet';

      const historyLines = p.positionStats.length > 0
        ? p.positionStats.map(s =>
            `      ${s.position}: ${s.plusMinusPer90 >= 0 ? '+' : ''}${s.plusMinusPer90.toFixed(2)}/90 | ${s.goals}G ${s.assists}A | total +/-${s.plusMinus} in ${s.minutesPlayed}min`
          ).join('\n')
        : '      No prior match history';

      return `  id:${p.id} #${p.number} ${p.name} | ${p.minutesThisGame}min (projected at sub) | preferred: ${preferred}${lateNote}\n${currentLine}\n    HISTORICAL by position:\n${historyLines}`;
    })
    .join('\n\n');

  const mustPlayBlock = mustPlayList.length > 0
    ? mustPlayList.map((p, i) => `${i + 2}. id:${p.id} (#${p.number} ${p.name}) was benched last shift — MUST be on field.`).join('\n')
    : '2. No consecutive-bench violations to resolve.';

  const prompt = `You are coaching "${teamName}" vs ${opponent}. Recommend the Shift ${nextShiftNumber} lineup (minutes ${(nextShiftNumber - 1) * 15}–${nextShiftNumber * 15}) using a ${formation} formation.

Formation positions: ${formationPositions}
Game minute now: ${gameMinute} | Half: ${isSecondHalf ? '2nd' : '1st'}
GK locked: id:${activeGkId} (${activeGk?.name ?? ''}) — stays at GK, do not rotate.

CURRENT SHIFT ${nextShiftNumber - 1}:
${currentLines}

BENCH:
${benchLines}

HARD CONSTRAINTS (must be satisfied):
1. Keep id:${activeGkId} at GK.
${mustPlayBlock}

OPTIMIZATION (apply after constraints, in order):
1. EQUALIZE TIME: Minutes shown are projected to the moment the sub happens (next 15-min mark). Bring on players with fewer projected minutes first so everyone converges toward equal game time. For late arrivals, equalize relative to their available window.
2. MAXIMIZE +/-: Among players with similar projected minutes, prefer those with the higher combined plus/minus in the target position:
   - Weight THIS GAME +/- most heavily (small sample but most relevant to today's match-up).
   - Use HISTORICAL +/-/90min as a tiebreaker when current-game data is absent or equal.
3. PREFERRED POSITIONS: Place players in their preferred positions when possible.

FULL PLAYER DATA:
${allPlayerLines}

Return exactly ${slotsCount} assignments using set_lineup.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM,
    tools: [
      {
        name: 'set_lineup',
        description: `Shift ${nextShiftNumber} lineup recommendation`,
        input_schema: {
          type: 'object' as const,
          properties: {
            startingLineup: {
              type: 'array' as const,
              description: `${slotsCount} player-position assignments`,
              items: {
                type: 'object' as const,
                properties: {
                  playerId: { type: 'string' as const },
                  position: { type: 'string' as const },
                },
                required: ['playerId', 'position'],
              },
            },
            reasoning: {
              type: 'string' as const,
              description: 'Who changed, why, and how time is being equalised',
            },
          },
          required: ['startingLineup', 'reasoning'],
        },
      },
    ],
    tool_choice: { type: 'tool' as const, name: 'set_lineup' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = message.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return res.status(500).json({ error: 'AI did not return a structured lineup' });
  }
  const result = toolUse.input as { startingLineup: { playerId: string; position: string }[]; reasoning: string };
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
