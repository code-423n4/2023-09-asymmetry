import { network, ethers, upgrades } from "hardhat";
import { VotiumErc20Strategy } from "../typechain-types";
import { expect } from "chai";
import {
  incrementVlcvxEpoch,
  readJSONFromFile,
  updateRewardsMerkleRoot,
} from "../Votium/VotiumTestHelpers";
import { BigNumber } from "ethers";

describe.only("Test VotiumErc20Strategy", async function () {
  let votiumStrategy: VotiumErc20Strategy;
  let accounts: any;
  const resetToBlock = async (blockNumber: number) => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_URL,
            blockNumber,
          },
        },
      ],
    });
    accounts = await ethers.getSigners();
    const votiumStrategyFactory = await ethers.getContractFactory(
      "VotiumErc20Strategy"
    );
    votiumStrategy = (await upgrades.deployProxy(
      votiumStrategyFactory,
      []
    )) as VotiumErc20Strategy;
    await votiumStrategy.deployed();

    // mint some to seed the system so totalSupply is never 0 (prevent price weirdness on withdraw)
    const tx = await votiumStrategy.connect(accounts[2]).mint({
      value: ethers.utils.parseEther("1"),
    });
    await tx.wait();
    const totalSupply0 = await votiumStrategy.totalSupply();
    const afEthBalance0 = await votiumStrategy.balanceOf(accounts[2].address);
  };

  before(
    async () => await resetToBlock(parseInt(process.env.BLOCK_NUMBER ?? "0"))
  );

  it("Should mint afEth tokens, burn tokens some tokens, apply rewards, pass time & process withdraw queue", async function () {
    const startingTotalSupply = await votiumStrategy.totalSupply();

    let tx = await votiumStrategy.mint({
      value: ethers.utils.parseEther("1"),
    });
    await tx.wait();

    const afEthBalance1 = await votiumStrategy.balanceOf(accounts[0].address);
    const totalSupply1 = await votiumStrategy.totalSupply();

    expect(totalSupply1).eq(
      BigNumber.from(afEthBalance1).add(startingTotalSupply)
    );

    const testData = await readJSONFromFile("./scripts/testData.json");

    await updateRewardsMerkleRoot(
      testData.merkleRoots,
      testData.swapsData.map((sd: any) => sd.sellToken)
    );

    const claimProofs = testData.claimProofs;
    const swapsData = testData.swapsData;

    const priceBeforeRewards = await votiumStrategy.price();
    tx = await votiumStrategy.applyRewards(claimProofs, swapsData);
    await tx.wait();

    const priceAfterRewards = await votiumStrategy.price();

    expect(priceAfterRewards).gt(priceBeforeRewards);
    // burn
    await votiumStrategy.requestWithdraw(
      await votiumStrategy.balanceOf(accounts[0].address)
    );

    // pass enough epochs so the burned position is fully unlocked
    for (let i = 0; i < 17; i++) {
      await incrementVlcvxEpoch();
    }

    const ethBalanceBefore = await ethers.provider.getBalance(
      accounts[0].address
    );

    tx = await votiumStrategy.processWithdrawQueue(10);
    await tx.wait();

    const ethBalanceAfter = await ethers.provider.getBalance(
      accounts[0].address
    );
    // balance after fully withdrawing is higher
    expect(ethBalanceAfter).gt(ethBalanceBefore);
  });

  it("Should show 2 accounts receive the same rewards if hodling the same amount for the same time", async function () {
    // TODO
  });
  it("Should show an account with twice as many tokens receive twice as many rewards as another", async function () {
    // TODO
  });
  it("Should show an account staked for twice as long receive twice as many rewards as another", async function () {
    // TODO
  });
  it("Should show an account staked for twice as long receive twice as many rewards as another", async function () {
    // TODO
  });
  it("Should increase price proportionally to how much rewards were added vs tvl", async function () {
    // TODO
  });
  it("Should increase price twice as much when depositing twice as much rewards", async function () {
    // TODO
  });
  it("Should allow owner to withdraw stuck tokens with withdrawStuckTokens()", async function () {
    // TODO
  });
  it("Should allow anyone apply rewards manually with depositRewards()", async function () {
    // TODO
  });
  it("Should allow a new minter to burn and immedietely withdraw from the queue if is cvx waiting to be unlocked", async function () {
    // TODO
  });
  it("Should never take more than 16 weeks to withdraw from the queue", async function () {
    // TODO
  });
  it("Should always receive greater than or equal to the original cvx deposit value, even if applyRewards() is never called", async function () {
    // TODO
  });
  it("Should alow a user to burn and fully withdraw from the queue without needing the owner to ever call anything", async function () {
    // TODO
  });
  it("Should withdraw from the queue in order of who burned their tokens first", async function () {
    // TODO
  });
  it("Should process multiple queue positions in a single call if there are enough unlockable cvx built up", async function () {
    // TODO
  });
  it("Should allow anyone to process the queue", async function () {
    // TODO
  });
  it("Should only allow the owner to applyRewards()", async function () {
    // TODO
  });
  it("Should not be able to burn more than a users balance", async function () {
    // TODO
  });
  it("Should be able to millions of dollars in rewards with minimal slippage", async function () {
    // TODO
  });
  it("Should test everything about the queue to be sure it works correctly", async function () {
    // TODO
  });
});
