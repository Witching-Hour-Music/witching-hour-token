import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("WrappedHour", function () {
  async function deployFixture() {
    const [owner, signer1, signer2, signer3, alice] = await ethers.getSigners();

    const wrapped = await ethers.deployContract("WrappedHour", [
      [signer1.address, signer2.address, signer3.address],
      2n,
    ]);

    return { wrapped, owner, signer1, signer2, signer3, alice };
  }

  it("rejects a threshold above the signer count", async function () {
    const [, signer1] = await ethers.getSigners();

    await expect(
      ethers.deployContract("WrappedHour", [[signer1.address], 2n]),
    ).to.revert(ethers);
  });

  it("mints only once threshold confirmations agree, and rejects mismatched params", async function () {
    const { wrapped, signer1, signer2, signer3, alice } = await deployFixture();

    const lockId = ethers.keccak256(ethers.toUtf8Bytes("lock-proof-1"));

    await wrapped.connect(signer1).confirmMint(lockId, alice.address, 1_000n);
    expect(await wrapped.balanceOf(alice.address)).to.equal(0n);

    await expect(
      wrapped.connect(signer2).confirmMint(lockId, alice.address, 999n),
    ).to.revert(ethers);

    await expect(
      wrapped.connect(signer1).confirmMint(lockId, alice.address, 1_000n),
    ).to.revert(ethers);

    await wrapped.connect(signer2).confirmMint(lockId, alice.address, 1_000n);
    expect(await wrapped.balanceOf(alice.address)).to.equal(1_000n);

    await expect(
      wrapped.connect(signer3).confirmMint(lockId, alice.address, 1_000n),
    ).to.revert(ethers);
  });

  it("rejects confirmMint from a non-signer", async function () {
    const { wrapped, alice } = await deployFixture();
    const lockId = ethers.keccak256(ethers.toUtf8Bytes("lock-proof-2"));

    await expect(
      wrapped.connect(alice).confirmMint(lockId, alice.address, 100n),
    ).to.revert(ethers);
  });

  it("burns wHOUR and emits a release request", async function () {
    const { wrapped, signer1, signer2, alice } = await deployFixture();
    const lockId = ethers.keccak256(ethers.toUtf8Bytes("lock-proof-3"));

    await wrapped.connect(signer1).confirmMint(lockId, alice.address, 1_000n);
    await wrapped.connect(signer2).confirmMint(lockId, alice.address, 1_000n);

    await expect(
      wrapped.connect(alice).burnForRelease(400n, "0xBaseDestAddr"),
    ).to.emit(wrapped, "BurnedForRelease");

    expect(await wrapped.balanceOf(alice.address)).to.equal(600n);
  });

  it("lets the owner add/remove signers and adjust threshold", async function () {
    const { wrapped, owner, alice } = await deployFixture();

    await wrapped.connect(owner).setSigner(alice.address, true);
    expect(await wrapped.isSigner(alice.address)).to.equal(true);

    await wrapped.connect(owner).setThreshold(4n);
    expect(await wrapped.threshold()).to.equal(4n);

    await expect(wrapped.connect(owner).setThreshold(5n)).to.revert(ethers);
  });
});
