import { HOUR_TOKEN_ADDRESS, HOUR_TOKEN_CHAIN } from './hourToken.js';

/** Build a reviewable support intent. Never sends, approves, signs or prices a transfer. */
export function createSocialFiSupportIntent({ eventId, workId, recipient, amountAtomic }) {
  if (typeof eventId !== 'string' || eventId.length < 16 || eventId.length > 300 ||
      typeof workId !== 'string' || !workId.startsWith('hour:work:') || workId.length <= 10 || workId.length > 300 ||
      typeof recipient !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(recipient) || /^0x0{40}$/i.test(recipient) ||
      typeof amountAtomic !== 'string' || !/^[1-9][0-9]{0,77}$/.test(amountAtomic) || BigInt(amountAtomic) >= 2n ** 256n) {
    throw new TypeError('A SocialFi event, registered work, recipient and positive uint256 amount are required');
  }
  return { kind: 'hour.socialfi-support-intent', version: 1, eventId, workId,
    chainId: HOUR_TOKEN_CHAIN.id, token: HOUR_TOKEN_ADDRESS, recipient, amountAtomic,
    state: 'intent-only', requiresVerifiedWalletBinding: true, requiresApproval: true,
    simulateFirst: true, transactionSubmitted: false };
}
