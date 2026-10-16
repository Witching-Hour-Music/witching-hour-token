import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("RoyaltySettlement", function () {
  const splitGraphRef = ethers.keccak256(ethers.toUtf8Bytes("split-graph-v1"));
  const eventId = ethers.keccak256(ethers.toUtf8Bytes("royalty-event-1"));

  async function deployFixture() {
    const [owner, liquidityWallet, rewardWallet, signer1, signer2, signer3, payeeA, payeeB] =
      await ethers.getSigners();

    const token = await ethers.deployContract("HourToken", [
      liquidityWallet.address,
      rewardWallet.address,
    ]);

    const settlement = await ethers.deployContract("RoyaltySettlement", [
      [signer1.address, signer2.address, signer3.address],
      2n,
    ]);

    // Pre-launch token only allows exempt wallets to move funds; the
    // settlement contract needs to hold funds for payees to claim.
    await token.setFeeExempt(await settlement.getAddress(), true);
    await token.transfer(await settlement.getAddress(), 10_000n);

    await settlement.connect(owner).setSplitGraphValid(splitGraphRef, true);

    const instructions = [
      { payee: payeeA.address, amount: 600n, asset: await token.getAddress() },
      { payee: payeeB.address, amount: 400n, asset: await token.getAddress() },
    ];

    return { token, settlement, owner, signer1, signer2, signer3, payeeA, payeeB, instructions };
  }

  it("rejects a threshold above the signer count", async function () {
    const [, signer1] = await ethers.getSigners();

    await expect(
      ethers.deployContract("RoyaltySettlement", [[signer1.address], 2n]),
    ).to.revert(ethers);
  });

  it("rejects settlement against an unregistered split graph", async function () {
    const { settlement, signer1, instructions } = await deployFixture();
    const unknownRef = ethers.keccak256(ethers.toUtf8Bytes("split-graph-v2"));

    await expect(
      settlement.connect(signer1).settleRoyaltyInstructions(eventId, unknownRef, instructions),
    ).to.revert(ethers);
  });

  it("rejects settleRoyaltyInstructions from a non-signer", async function () {
    const { settlement, payeeA, instructions } = await deployFixture();

    await expect(
      settlement.connect(payeeA).settleRoyaltyInstructions(eventId, splitGraphRef, instructions),
    ).to.revert(ethers);
  });

  it("requires threshold confirmations, credits claimable on the Nth, and rejects a mismatched resubmit", async function () {
    const { token, settlement, signer1, signer2, signer3, payeeA, payeeB, instructions } =
      await deployFixture();

    await settlement.connect(signer1).settleRoyaltyInstructions(eventId, splitGraphRef, instructions);
    expect(await settlement.claimable(payeeA.address, await token.getAddress())).to.equal(0n);

    const tamperedInstructions = [
      { payee: payeeA.address, amount: 999n, asset: await token.getAddress() },
    ];
    await expect(
      settlement.connect(signer2).settleRoyaltyInstructions(eventId, splitGraphRef, tamperedInstructions),
    ).to.revert(ethers);

    await expect(
      settlement.connect(signer1).settleRoyaltyInstructions(eventId, splitGraphRef, instructions),
    ).to.revert(ethers);

    await expect(
      settlement.connect(signer2).settleRoyaltyInstructions(eventId, splitGraphRef, instructions),
    )
      .to.emit(settlement, "SettlementExecuted")
      .withArgs(eventId, splitGraphRef, 2n);

    expect(await settlement.claimable(payeeA.address, await token.getAddress())).to.equal(600n);
    expect(await settlement.claimable(payeeB.address, await token.getAddress())).to.equal(400n);

    // Already processed -- a 3rd confirmation (even with correct params) is rejected.
    await expect(
      settlement.connect(signer3).settleRoyaltyInstructions(eventId, splitGraphRef, instructions),
    ).to.revert(ethers);
  });

  it("lets a payee claim their credited balance, and only once", async function () {
    const { token, settlement, signer1, signer2, payeeA, instructions } = await deployFixture();

    await settlement.connect(signer1).settleRoyaltyInstructions(eventId, splitGraphRef, instructions);
    await settlement.connect(signer2).settleRoyaltyInstructions(eventId, splitGraphRef, instructions);

    await expect(
      settlement.connect(payeeA).claim(await token.getAddress()),
    ).to.emit(settlement, "Claimed");

    expect(await token.balanceOf(payeeA.address)).to.equal(600n);
    expect(await settlement.claimable(payeeA.address, await token.getAddress())).to.equal(0n);

    await expect(settlement.connect(payeeA).claim(await token.getAddress())).to.revert(ethers);
  });

  it("blocks new confirmations while paused, but still allows claims", async function () {
    const { token, settlement, owner, signer1, signer2, payeeA, instructions } =
      await deployFixture();

    await settlement.connect(signer1).settleRoyaltyInstructions(eventId, splitGraphRef, instructions);
    await settlement.connect(signer2).settleRoyaltyInstructions(eventId, splitGraphRef, instructions);

    await settlement.connect(owner).pause();

    const otherEventId = ethers.keccak256(ethers.toUtf8Bytes("royalty-event-2"));
    await expect(
      settlement.connect(signer1).settleRoyaltyInstructions(otherEventId, splitGraphRef, instructions),
    ).to.revert(ethers);

    // Already-credited claims still work while paused.
    await expect(settlement.connect(payeeA).claim(await token.getAddress())).to.emit(
      settlement,
      "Claimed",
    );
    expect(await token.balanceOf(payeeA.address)).to.equal(600n);
  });

  it("lets the owner add/remove signers and adjust threshold", async function () {
    const { settlement, owner, payeeA } = await deployFixture();

    await settlement.connect(owner).setSigner(payeeA.address, true);
    expect(await settlement.isSigner(payeeA.address)).to.equal(true);

    await settlement.connect(owner).setThreshold(4n);
    expect(await settlement.threshold()).to.equal(4n);

    await expect(settlement.connect(owner).setThreshold(5n)).to.revert(ethers);
  });
});
