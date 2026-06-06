import { NextResponse, type NextRequest } from 'next/server'

// DISABLED. This route previously accepted unauthenticated, client-supplied
// email/deviceId/walletAddress and minted a trusted `get_word_session` for the
// resolved account. With Reown removed and Supabase as the identity verifier,
// leaving it live would be a direct auth bypass (anyone who knows an email
// could obtain a session for that account).
//
// Wallet linking will return as a separate, additive feature gated behind a
// signed wallet-ownership challenge (for the future stake/payment layer). Until
// then this endpoint is intentionally gone.
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error:
        'Wallet linking is disabled. Sign in with email or Google. Wallet support will return with signed ownership verification.',
    },
    { status: 410 }
  )
}
