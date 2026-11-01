# SocialFi support and the Base hOUR asset

SocialFi is the creator-community surface across hOUR Chain: profiles, updates,
collaboration, real creative time and support intents. The existing Base hOUR
token remains a distinct asset from recorded hours, agreed rights and Cosmos ahbc.

`src/integration/socialfi.js` exports `createSocialFiSupportIntent`. It validates
the source event/work reference, recipient and positive uint256 amount, then binds
the request to the existing Base chain/token configuration. The result is explicitly
intent-only and requires verified wallet binding, approval and simulation. It does
not sign/send a transaction, create an allowance, price a token, mint rewards,
change trading settings or prove a royalty payment.

Social posts, follows and contribution minutes do not define payout shares. The
SocialFi app's wallet connection is a balance read, not identity verification or
access control. Public creator identity, wallet binding, paid gates, signer custody,
live settlement receipts and cross-chain acceptance remain implementation gates.

Run the dependency-free intent check with `node --test test/socialfi-intent.test.mjs`.
The existing token/bridge contract tests and deployment policies remain authoritative.
