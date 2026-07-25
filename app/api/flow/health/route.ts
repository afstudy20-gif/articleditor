import { NextResponse } from 'next/server';
import { createFlowClient } from '@/lib/graphical-abstract/flow-client';
import { flowBaseUrlFromEnv, FlowUrlError } from '@/lib/graphical-abstract/flow-url';
import { SPEC_VERSION } from '@/lib/graphical-abstract/spec';

export const runtime = 'nodejs';

/**
 * Whether the AcademicFlow render server is reachable, so the panel can disable the render
 * button up front instead of after a 20-second hang. Deliberately outside the AI rate
 * limit: a health poll must not consume the shared 20-requests-per-minute AI budget.
 */
export async function GET() {
  let baseUrl: string | null;
  try {
    baseUrl = flowBaseUrlFromEnv(process.env);
  } catch (err) {
    // A misconfigured URL is a setup error the operator has to see, not a silent fallback.
    console.error('[flow/health]', err);
    return NextResponse.json(
      {
        up: false,
        configured: false,
        error: err instanceof FlowUrlError ? err.message : 'FLOW_SERVER_URL is invalid',
      },
      { status: 200 },
    );
  }

  if (!baseUrl) {
    return NextResponse.json({ up: false, configured: false });
  }

  const health = await createFlowClient({ baseUrl, apiKey: process.env.FLOW_API_KEY }).health();

  return NextResponse.json({
    ...health,
    configured: true,
    // A mismatch means flow-app's spec format has moved on and ARTED may be emitting
    // specs it no longer accepts.
    specVersionMatches: health.specVersion === undefined || health.specVersion === SPEC_VERSION,
    expectedSpecVersion: SPEC_VERSION,
  });
}
