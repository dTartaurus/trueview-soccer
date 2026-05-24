import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are an expert youth soccer coach assistant for a boys under-14 house league team.
Give practical, age-appropriate, encouraging advice. Be concise and specific.
Format recommendations as clear bullet points or numbered lists when listing drills or positions.
Keep responses under 400 words unless doing a full season review.`;

const prompts: Record<string, (data: unknown) => string> = {
  lineup: (d: unknown) => {
    const { players, formation, teamName, opponent } = d as {
      players: { name: string; number: number; positions: string[] }[];
      formation: string;
      teamName: string;
      opponent: string;
    };
    return `Team "${teamName}" is playing vs ${opponent || 'their next opponent'} using a ${formation} formation.

Available players (${players.length}):
${players.map(p => `- #${p.number} ${p.name} | preferred: ${p.positions.join(', ') || 'not set'}`).join('\n')}

Please recommend:
1. The starting 11 with positions in the ${formation} formation
2. Suggested rotation order for the 6 shifts (15-min each across two 45-min halves)
3. Any key tactical advice for this lineup`;
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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
