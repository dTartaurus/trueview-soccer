import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, data } = req.body as { type: string; data: unknown };
  const promptFn = prompts[type];

  if (!promptFn) {
    return res.status(400).json({ error: `Unknown type: ${type}` });
  }

  try {
    // Lineup responses need more tokens to cover all 6 shifts
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
    console.error('Claude API error:', err);
    return res.status(500).json({ error: 'AI request failed' });
  }
}
