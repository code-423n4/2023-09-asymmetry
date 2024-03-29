# AfEth Invitational audit details
- Total Prize Pool: $31,310 USDC 
  - HM awards: $18,252 USDC 
  - Analysis awards: $1,014 USDC 
  - QA awards: $507 USDC 
  - Bot Race awards: $0 USDC 
  - Gas awards: $507 USDC 
  - Judge awards: $3,380 USDC 
  - Lookout awards: $0 USDC 
  - Scout awards: $500 USDC 
  - Mitigation Review: $7,150 USDC (*Opportunity goes to top 3 certified wardens based on placement in this audit.*)
- Join [C4 Discord](https://discord.gg/code4rena) to register
- Submit findings [using the C4 form](https://code4rena.com/contests/2023-09-asymmetry-finance-afeth-invitational/submit)
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Starts September 20, 2023 20:00 UTC 
- Ends September 27, 2023 20:00 UTC 

## Automated Findings / Publicly Known Issues

Automated findings output for the audit can be found [here](https://gist.github.com/romeroadrian/a2045e828aa87418a66e9ab47d811292) within 24 hours of audit opening.

*Note for C4 wardens: Anything included in the automated findings output is considered a publicly known issue and is ineligible for awards.*


# Overview

## About

AfEth is an ERC20 token collateralized by 2 underlying "strategy" tokens in an adjustable ratio. AfEth can be thought of as a "manager" that collateralizes the 2 tokens into a new token. (see [AbstractErc20Strategy.sol](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/AbstractErc20Strategy.sol))

### Token 1, safEth:

- [safeth](https://etherscan.io/token/0x6732efaf6f39926346bef8b821a04b6361c4f3e5) is our flagship liquid staking token consisting of 6 underling lsds ([Lido](https://lido.fi/), [rocketpool](https://rocketpool.net/), [staked frax](https://docs.frax.finance/frax-ether/overview), etc...). It is a simple "price go up" token with immediate liquidity via its "stake" and "unstake" functions. 

### Token 2, votium strategy:

- The votium strategy utilizes [votium](https://votium.app/) incentives in the [convex finance](https://www.convexfinance.com/) ecosystem in order to make a token whos price only goes up in relation to [convex token](https://etherscan.io/token/0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b)'s price (in eth).

- To mint votium strategy tokens, convex tokens are purchased, locked in the [vote locked cvx contract](https://etherscan.io/address/0x72a19342e8F1838460eBFCCEf09F6585e32db86E), and [delegated to votium](https://docs.votium.app/explainers/voter-manual), and strategy tokens are minted at the current strategy token price in votium  [cvxPerVotium()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20StrategyCore.sol#L145C14-L145C26).

- Votium rewards are claimed with [claimRewards()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20StrategyCore.sol#L192) using merkle proofs [published by votium](https://github.com/oo-00/Votium/tree/main/merkle) every 2 weeks. [applyRewards()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20StrategyCore.sol#L272) sells rewards on 0x and deposits them back into afEth (and ultimately back into the safEth & votium strategies), making the afEth price go up.

- There is an unlock period to withdraw (up to 16 weeks) because votium strategy tokens are collateralized by many different vote locked convex positions. [requestWithdraw()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20Strategy.sol#L54) burns the strategy tokens, calculates how much cvx they is owed based on cvxPerVotium() price, marks this amount to be unlocked on subsequent calls to [processExpiredLocks()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20Strategy.sol#L145C39-L145C48), calculates unlock time and returns withdrawId to later be used in [withdraw()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/strategies/votiumErc20/VotiumErc20Strategy.sol#L108).

### AfEth

- When minting, afEth purchases each underlying strategy token (safEth & votium strategy) according to [ratio](https://github.com/asymmetryfinance/afeth/blob/main/contracts/AfEth.sol#L12).

- [depositRewards()](https://github.com/asymmetryfinance/afeth/blob/main/contracts/AfEth.sol#L306C14-L306C23) is called by the votium strategy upon claiming rewards to make the afEth price go up by distributing funds into both strategies according to ratio.

- `requestWithdraw()` is called to calculate how much time is required to unlock all underlying vote locked convex before the user can call `withdraw()`.

### A note about varying unlock times

- When a user calls requestWithdraw() the contract
looks at who has requested to withdraw before them, calculates the date at which enough vlcvx can be unlocked to close their position along with everyone in front of them, and marks that amount of convex to be unlocked asap.

- Because of this, the withdraw time will be contantly changing for users that havent called requestWithdraw(). This could cause users to "race" to enter the unlock queue under certain unqiue market conditions.

- While this isnt ideal, we do not believe it to be exploitable in a harmful way because the maximum unlock time is 16 weeks regardless of state of the unlock queue.


## Local Development

To use the correct node version run

```
nvm use
```

To install dependencies and compile run

```
yarn && yarn compile
```

## Testing

`yarn test` to run test suite.

## Architecture Diagrams

Coming soon

## Links

- **Previous audits:** https://github.com/code-423n4/2023-03-asymmetry
- **Website:** https://www.asymmetry.finance/
- **Twitter:** https://twitter.com/asymmetryfin
- **Discord:** https://discord.gg/9USExBeD


# Scope

  - [ ] In the table format shown below, provide the name of each contract and:
  - [ ] source lines of code (excluding blank lines and comments) in each *For line of code counts, we recommend running prettier with a 100-character line length, and using [cloc](https://github.com/AlDanial/cloc).* 
  - [ ] external contracts called in each
  - [ ] libraries used in each

*List all files in scope in the table below (along with hyperlinks) -- and feel free to add notes here to emphasize areas of focus.*

| Contract | SLOC | Purpose | Libraries used |  
| ----------- | ----------- | ----------- | ----------- |
| [contracts/AfEth.sol](https://github.com/code-423n4/2023-09-asymmetry/blob/main/contracts/AfEth.sol) | 260 | This contract is the main point of entry into the protocol| [`@openzeppelin/*`](https://openzeppelin.com/contracts/) |
| [contracts/strategies/AbstractStrategy.sol](https://github.com/code-423n4/2023-09-asymmetry/blob/main/contracts/strategies/AbstractStrategy.sol) | 31 | This is an abstract contract for strategies (there's only one strategy for now)| [`@openzeppelin/*`](https://openzeppelin.com/contracts/) |
| [contracts/strategies/votium/VotiumStrategyCore.sol](https://github.com/code-423n4/2023-09-asymmetry/blob/main/contracts/strategies/votium/VotiumStrategyCore.sol) | 308 | This is the base contract for the votium strategy | [`@openzeppelin/*`](https://openzeppelin.com/contracts/) |
| [contracts/strategies/votium/VotiumStrategy.sol](https://github.com/code-423n4/2023-09-asymmetry/blob/main/contracts/strategies/votium/VotiumStrategy.sol) | 174 | This is the main contract for the votium strategy that inherits AbstractStrategy | [`@openzeppelin/*`](https://openzeppelin.com/contracts/) |

## Out of scope

Anything that is not in the **scope** table

# Additional Context

  This contract uses two ERC20's.  SafEth + vETH (created by VotiumStrategy.sol).
  For rewards there could be theoretically any ERC20's that come in as rewards from Votium

  This will only be deployed to Ethereum Mainnet, with the chance of being deployed on L2's on a future date

  There are a few roles for the VotiumStrategy.sol contract
  - Manager - The AfEth.sol contract
  - Owner - The DAO's multisig
  - Rewarder - Address of wallet that will handle calling the reward functions and swapping the tokens out

  The owner role of AfEth.sol will be the DAO's multisig


## Attack ideas (Where to look for bugs)
*List specific areas to address - see [this blog post](https://medium.com/code4rena/the-security-council-elections-within-the-arbitrum-dao-a-comprehensive-guide-aa6d001aae60#9adb) for an example*
### Access Control
AfEth is the main point of entry, but people could directly deposit to votium, the problem would be their rewards get spread into the manager.  We want to mak sure there's no vulnerabilities here.

### Votium Contract
We are heavily integrated with votium and want to make sure there's no potential for funds being locked inside the votium business logic

### Full Lifecycle Analysis
This is the first audit for this protocol so it needs to be heavily audited

## Main invariants
Users will not lose money (outside of normal gas/slippage costs)
Users will gain rewards 
Funds cannot be permanently locked

## Scoping Details 

```
- If you have a public code repo, please share it here:  
- How many contracts are in scope?: 5
- Total SLoC for these contracts?: 693
- How many external imports are there?: 11
- How many separate interfaces and struct definitions are there for the contracts within scope?: 13
- Does most of your code generally use composition or inheritance?: Inheritance
- How many external calls?: 6
- What is the overall line coverage percentage provided by your tests?: 90%
- Is this an upgrade of an existing system?: False
- Check all that apply (e.g. timelock, NFT, AMM, ERC20, rollups, etc.): Timelock function, ERC-20 Token
- Is there a need to understand a separate part of the codebase / get context in order to audit this part of the protocol?:   False
- Please describe required context:   N/A
- Does it use an oracle?:  Chainlink
- Describe any novel or unique curve logic or mathematical models your code uses: We have a manager contract that interacts with strategies.  We are launching with two strategies and one is SafEth and another is interacting with Votium
- Is this either a fork of or an alternate implementation of another project?:   False
- Does it use a side-chain?: False
- Describe any specific areas you would like addressed: We want to make sure the rewards received through each of the strategies are evenly distributed to each user.  The votium strategy is the one that probably needs the most focus as the safEth strategy is fairly simple.  This is fresh code so everything needs to be audited
```

# Tests

- Copy .env.sample to .env file
- Run `yarn && yarn compile`
- Run `yarn test`
