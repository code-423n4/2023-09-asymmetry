import { network, ethers, upgrades } from "hardhat";
import { VotiumErc20Strategy } from "../../../typechain-types";
import { expect } from "chai";
import {
  incrementVlcvxEpoch,
  readJSONFromFile,
  updateRewardsMerkleRoot,
} from "./VotiumTestHelpers";
import { BigNumber } from "ethers";
import {
  votiumClaimRewards,
  votiumSellRewards,
} from "../../../scripts/applyVotiumRewardsHelpers";
import { within1Percent } from "../../helpers/helpers";

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
    const tx = await votiumStrategy.connect(accounts[11]).mint({
      value: ethers.utils.parseEther("1"),
    });
    await tx.wait();
  };

  beforeEach(
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

    const priceBeforeRewards = await votiumStrategy.price();

    await votiumClaimRewards(votiumStrategy.address, testData.claimProofs);
    await votiumSellRewards(votiumStrategy.address, [], testData.swapsData);

    const priceAfterRewards = await votiumStrategy.price();

    expect(priceAfterRewards).gt(priceBeforeRewards);
    // burn

    tx = await votiumStrategy.requestWithdraw(
      await votiumStrategy.balanceOf(accounts[0].address)
    );
    const mined = await tx.wait();

    const event = mined.events.find((e) => e?.event === "WithdrawRequest");

    const unlockEpoch = event.args.unlockEpoch;

    console.log("unlockEpoch is", unlockEpoch);

    // pass enough epochs so the burned position is fully unlocked
    for (let i = 0; i < 17; i++) {
      await incrementVlcvxEpoch();
    }

    const ethBalanceBefore = await ethers.provider.getBalance(
      accounts[0].address
    );
    console.log("about to withdraw", unlockEpoch);
    tx = await votiumStrategy.withdraw(unlockEpoch);
    await tx.wait();

    const ethBalanceAfter = await ethers.provider.getBalance(
      accounts[0].address
    );
    // balance after fully withdrawing is higher
    expect(ethBalanceAfter).gt(ethBalanceBefore);
  });
  it.skip("Should show 2 accounts receive the same rewards during different epochs", async function () {
    const startingTotalSupply = await votiumStrategy.totalSupply();
    const stakerAmounts = 2;

    let tx;
    let runningBalance = BigNumber.from(startingTotalSupply);

    // second account gets slightly less due to unarbed cvx pool
    for (let i = 0; i < stakerAmounts; i++) {
      const stakerVotiumStrategy = votiumStrategy.connect(accounts[i]);
      tx = await stakerVotiumStrategy.mint({
        value: ethers.utils.parseEther("1"),
      });
      await tx.wait();
      const afEthBalance = await votiumStrategy.balanceOf(accounts[i].address);
      runningBalance = runningBalance.add(afEthBalance);
    }

    const totalSupply1 = await votiumStrategy.totalSupply();

    console.log({ runningBalance, totalSupply1, startingTotalSupply });
    expect(totalSupply1).eq(runningBalance);

    const testData = await readJSONFromFile("./scripts/testData.json");

    await updateRewardsMerkleRoot(
      testData.merkleRoots,
      testData.swapsData.map((sd: any) => sd.sellToken)
    );

    const priceBeforeRewards = await votiumStrategy.price();

    await votiumClaimRewards(votiumStrategy.address, testData.claimProofs);
    await votiumSellRewards(votiumStrategy.address, [], testData.swapsData);

    const priceAfterRewards = await votiumStrategy.price();

    expect(priceAfterRewards).gt(priceBeforeRewards);
    console.log("1", await votiumStrategy.balanceOf(accounts[0].address));
    console.log("2", await votiumStrategy.balanceOf(accounts[1].address));

    // request withdraw
    for (let i = 0; i < stakerAmounts; i++) {
      const stakerVotiumStrategy = votiumStrategy.connect(accounts[0]);
      tx = await stakerVotiumStrategy.requestWithdraw(
        await stakerVotiumStrategy.balanceOf(accounts[0].address)
      );
      const mined = await tx.wait();

      const event = mined.events.find((e) => e?.event === "WithdrawRequest");
      console.log({ mined: mined.events });
      const unlockEpoch = event.args.unlockEpoch;

      console.log("unlockEpoch is", unlockEpoch);

      // // pass enough epochs so the burned position is fully unlocked
      // for (let i = 0; i < 17; i++) {
      //   await incrementVlcvxEpoch();
      // }

      // const ethBalanceBefore = await ethers.provider.getBalance(
      //   accounts[0].address
      // );
      // console.log("about to withdraw", unlockEpoch);
      // tx = await votiumStrategy.withdraw(unlockEpoch);
      // await tx.wait();

      // const ethBalanceAfter = await ethers.provider.getBalance(
      //   accounts[0].address
      // );
      // // balance after fully withdrawing is higher
      // expect(ethBalanceAfter).gt(ethBalanceBefore);
      // setTimeout(() => {}, 1000);
    }
  });
  it.only("Should show 2 accounts receive the same rewards if hodling the same amount for the same time", async function () {
    const startingTotalSupply = await votiumStrategy.totalSupply();
    const stakerAmounts = 2;

    let tx;
    let runningBalance = BigNumber.from(startingTotalSupply);
    for (let i = 0; i < stakerAmounts; i++) {
      const stakerVotiumStrategy = votiumStrategy.connect(accounts[i]);
      tx = await stakerVotiumStrategy.mint({
        value: ethers.utils.parseEther("1"),
      });
      await tx.wait();
      const afEthBalance = await votiumStrategy.balanceOf(accounts[i].address);
      runningBalance = runningBalance.add(afEthBalance);
    }

    const totalSupply1 = await votiumStrategy.totalSupply();

    console.log({ runningBalance, totalSupply1, startingTotalSupply });
    expect(totalSupply1).eq(runningBalance);

    const testData = await readJSONFromFile("./scripts/testData.json");

    await updateRewardsMerkleRoot(
      testData.merkleRoots,
      testData.swapsData.map((sd: any) => sd.sellToken)
    );

    const priceBeforeRewards = await votiumStrategy.price();

    await votiumClaimRewards(votiumStrategy.address, testData.claimProofs);
    await votiumSellRewards(votiumStrategy.address, [], testData.swapsData);

    const priceAfterRewards = await votiumStrategy.price();

    expect(priceAfterRewards).gt(priceBeforeRewards);
    expect(
      within1Percent(
        await votiumStrategy.balanceOf(accounts[0].address),
        await votiumStrategy.balanceOf(accounts[1].address)
      )
    ).eq(true);

    // request withdraw
    let unlockEpoch;
    for (let i = 0; i < stakerAmounts; i++) {
      const stakerVotiumStrategy = votiumStrategy.connect(accounts[0]);
      tx = await stakerVotiumStrategy.requestWithdraw(
        await stakerVotiumStrategy.balanceOf(accounts[0].address)
      );
      const mined = await tx.wait();
      console.log("requested withdraw", mined.events);
      const event = mined.events.find((e) => e?.event === "WithdrawRequest");
      unlockEpoch = event.args.unlockEpoch;
    }
    console.log("TRY");
    const unlock0 = await votiumStrategy.unlockQueues(
      accounts[0].address,
      BigNumber.from(0)
    );
    // const unlock1 = await votiumStrategy.unlockQueues(1, 91);

    console.log({ unlock0 });

    for (let i = 0; i < 17; i++) {
      await incrementVlcvxEpoch();
    }

    const ethBalanceBefore1 = await ethers.provider.getBalance(
      accounts[0].address
    );
    console.log({ ethBalanceBefore1 });
    for (let i = 0; i < stakerAmounts; i++) {
      // pass enough epochs so the burned position is fully unlocked
      const ethBalanceBefore = await ethers.provider.getBalance(
        accounts[0].address
      );
      console.log({ ethBalanceBefore });

      tx = await votiumStrategy.withdraw(unlockEpoch);
      await tx.wait();

      const ethBalanceAfter = await ethers.provider.getBalance(
        accounts[0].address
      );
      console.log({ ethBalanceAfter });

      // balance after fully withdrawing is higher
      expect(ethBalanceAfter).gt(ethBalanceBefore);
    }
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
  it("Should allow a user to burn and fully withdraw from the queue without needing the owner to ever call anything", async function () {
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
  it("Should allow owner to manually deposit eth rewards and price goes up", async function () {
    // TODO
  });
  it("Should not change the price when minting, burning or withdrawing", async function () {
    // TODO
  });
  it("Should allow owner to overide sell data and only sell some of the rewards instead of everything from the claim proof", async function () {
    // TODO
  });
});
