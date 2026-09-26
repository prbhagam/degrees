// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type { Activity, GenerateActivityInput } from '@degrees/shared';
import { activitySchema } from '@degrees/shared';
import { env } from '../config/env.js';
import { activityFixture } from '../mocks/fixtures.js';
import { FLASH_MODEL, getAiClient } from './client.js';

export async function generateActivity(
  input: GenerateActivityInput,
): Promise<Activity> {
  if (env.mockMode) {
    return activityFixture;
  }

  const memberSummary = input.members
    .map((m) => `${m.displayName} (Interests: ${m.interests.join(', ')})`)
    .join('; ');

  const prompt = `You are an AI activity coordinator for Degrees, a social app creating hangout groups in ${input.constraints.city}.
Propose a real, specific group activity and venue based on member interests and constraints:
Members: ${memberSummary}
City: ${input.constraints.city}
Max Cost: $${(input.constraints.maxCostCents / 100).toFixed(2)} per person
Max Distance: ${input.constraints.maxTravelMi} miles from coordinates (${input.constraints.lat}, ${input.constraints.lng})

Return JSON adhering to the specified schema with a real venue title, address, coordinates, and clear reasoning.`;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      return activityFixture;
    }

    const parsed = JSON.parse(text);
    return activitySchema.parse({
      title: parsed.title ?? activityFixture.title,
      venue: parsed.venue ?? activityFixture.venue,
      address: parsed.address ?? activityFixture.address,
      lat: typeof parsed.lat === 'number' ? parsed.lat : input.constraints.lat,
      lng: typeof parsed.lng === 'number' ? parsed.lng : input.constraints.lng,
      priceCents: typeof parsed.priceCents === 'number' ? parsed.priceCents : null,
      startsAt: parsed.startsAt ?? null,
      source: parsed.source === 'ticketmaster' ? 'ticketmaster' : 'maps',
      sourceUrl: parsed.sourceUrl ?? null,
      reasoning: parsed.reasoning ?? 'Recommended based on shared interests.',
    });
  } catch (error) {
    console.error('generateActivity failed, falling back to fixture:', error);
    return activityFixture;
  }
}
