import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("HourBridgeVault", function () {
  async function deployFixture() {
    const [owner, liquidityWallet, rewardWallet, signer1, signer2, signer3, alice] =
      await ethers.getSigners();

    const token = await ethers.deployContract("HourToken", [
      liquidityWallet.address,
      rewardWallet.address,
    ]);

    const vault = await ethers.deployContract("HourBridgeVault", [
      await token.getAddress(),
      [signer1.address, signer2.address, signer3.address],
      2n,
    ]);

    // Pre-launch token only allows exempt wallets to move funds; the vault
    // needs to receive deposits and send releases.
    await token.setFeeExempt(await vault.getAddress(), true);
    await token.setFeeExempt(alice.address, true);
    await token.transfer(alice.address, 10_000n);

    return { token, vault, owner, signer1, signer2, signer3, alice };
  }

  it("rejects a threshold above the signer count", async function () {
    const [, liquidityWallet, rewardWallet, signer1] = await ethers.getSigners();
    const token = await ethers.deployContract("HourToken", [
      liquidityWallet.address,
      rewardWallet.address,
    ]);

    await expect(
      ethers.deployContract("HourBridgeVault", [
        await token.getAddress(),
        [signer1.address],
        2n,
      ]),
    ).to.revert(ethers);
  });

  it("locks tokens and emits a lock id", async function () {
    const { token, vault, alice } = await deployFixture();

    await token.connect(alice).approve(await vault.getAddress(), 1_000n);
    await expect(vault.connect(alice).lock(1_000n, "hbc1deadbeef")).to.emit(
      vault,
      "Locked",
    );

    expect(await token.balanceOf(await vault.getAddress())).to.equal(1_000n);
    expect(await token.balanceOf(alice.address)).to.equal(9_000n);
  });

  it("requires threshold confirmations before releasing, and rejects mismatched params", async function () {
    const { token, vault, signer1, signer2, signer3, alice } = await deployFixture();

    await token.connect(alice).approve(await vault.getAddress(), 1_000n);
    await vault.connect(alice).lock(1_000n, "hbc1deadbeef");

    const releaseId = ethers.keccak256(ethers.toUtf8Bytes("burn-proof-1"));

    await vault.connect(signer1).confirmRelease(releaseId, alice.address, 500n);
    expect(await token.balanceOf(alice.address)).to.equal(9_000n);

    await expect(
      vault.connect(signer2).confirmRelease(releaseId, alice.address, 999n),
    ).to.revert(ethers);

    await expect(
      vault.connect(signer1).confirmRelease(releaseId, alice.address, 500n),
    ).to.revert(ethers);

    await vault.connect(signer2).confirmRelease(releaseId, alice.address, 500n);

    expect(await token.balanceOf(alice.address)).to.equal(9_500n);

    await expect(
      vault.connect(signer3).confirmRelease(releaseId, alice.address, 500n),
    ).to.revert(ethers);
  });

  it("rejects confirmRelease from a non-signer", async function () {
    const { vault, alice } = await deployFixture();
    const releaseId = ethers.keccak256(ethers.toUtf8Bytes("burn-proof-2"));

    await expect(
      vault.connect(alice).confirmRelease(releaseId, alice.address, 100n),
    ).to.revert(ethers);
  });

  it("lets the owner add/remove signers and adjust threshold", async function () {
    const { vault, owner, alice } = await deployFixture();

    await vault.connect(owner).setSigner(alice.address, true);
    expect(await vault.isSigner(alice.address)).to.equal(true);

    await vault.connect(owner).setThreshold(4n);
    expect(await vault.threshold()).to.equal(4n);

    await expect(vault.connect(owner).setThreshold(5n)).to.revert(ethers);
  });
});
