import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialFiSupportIntent } from '../src/integration/socialfi.js';

test('SocialFi support stays an unsubmitted intent for the existing Base asset', () => {
  const input = { eventId:'socialfi-event-123456', workId:'hour:work:test', recipient:'0x'+'1'.repeat(40), amountAtomic:'1000000000000000000' };
  const intent = createSocialFiSupportIntent(input);
  assert.equal(intent.chainId,8453); assert.equal(intent.token,'0xFC1c0FFF99845676A588CE21c28C4859F3035866');
  assert.equal(intent.transactionSubmitted,false);assert.equal(intent.requiresVerifiedWalletBinding,true);
  for(const amountAtomic of ['0','-1','1.2',String(2n**256n)]) assert.throws(()=>createSocialFiSupportIntent({...input,amountAtomic}));
  assert.throws(()=>createSocialFiSupportIntent({...input,recipient:'0x'+'0'.repeat(40)}));
});
