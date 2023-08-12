// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../../external_interfaces/IWETH.sol";
import "../../external_interfaces/ISwapRouter.sol";
import "../../external_interfaces/IVotiumMerkleStash.sol";
import "../../external_interfaces/ISnapshotDelegationRegistry.sol";
import "../../external_interfaces/ILockedCvx.sol";
import "../../external_interfaces/IClaimZap.sol";
import "../../external_interfaces/ICrvEthPool.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// For private internal functions and anything not exposed via the interface
contract VotiumErc20StrategyCore is Initializable, OwnableUpgradeable, ERC20Upgradeable {
    address public constant SNAPSHOT_DELEGATE_REGISTRY =
        0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446;
    address constant CVX_ADDRESS = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
    address constant VLCVX_ADDRESS = 0x72a19342e8F1838460eBFCCEf09F6585e32db86E;

    // last epoch in which expired locks were processed with vlcvx.processExpiredLocks()
    uint256 public lastEpochLocksProcessed;

    // what is the last epoch for which rewards have been fully claimed
    uint256 public lastRewardEpochFullyClaimed;

    error SwapFailed(uint256 index);

    struct SwapData {
        address sellToken;
        address spender;
        address swapTarget;
        bytes swapCallData;
    }

    uint256 rebaseNumerator;
    uint256 rebaseDenominator;

    struct UnlockQueuePosition {
        address owner; // address of who owns the position
        uint256 afEthToBurn; // how much afEth was burned (entering unlock queue)
        uint256 afEthBurned; // how much has been fully burned (withdrawn as eth)
    }

    uint256 public queueSize;
    mapping(uint => UnlockQueuePosition) public unlockQueue;

    uint256 public cvxToLeaveUnlocked;

    // As recommended by https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function totalSupply() public view override returns (uint256) {
            uint256 rebasedTotalSupply = (super.totalSupply() * rebaseNumerator) / rebaseDenominator;
            return rebasedTotalSupply;
    }

    function balanceOf(address _account) public view override returns (uint256) {
            uint256 rebasedBalance = (super.balanceOf(_account) * rebaseNumerator) / rebaseDenominator;
            return rebasedBalance;
    }
    /**
        @notice - Mints afEth to everyone using any eth in the contract (from rewards)
    */
    function applyRebaseRewards() public {
        uint256 cvxAmount = buyCvx(address(this).balance); // TODO track eth balance from rewards separately
        IERC20(CVX_ADDRESS).approve(VLCVX_ADDRESS, cvxAmount);
        ILockedCvx(VLCVX_ADDRESS).lock(address(this), cvxAmount, 0);
        uint256 currentAfEthSupply = this.totalSupply();
        uint256 afEthToMintToEveryone = cvxAmount;
        uint256 increaseAmountNumerator = currentAfEthSupply + afEthToMintToEveryone;
        rebaseNumerator = (increaseAmountNumerator * rebaseNumerator) / rebaseDenominator;
        rebaseDenominator = currentAfEthSupply;
    }

    /**
        @notice - Function to initialize values for the contracts
        @dev - This replaces the constructor for upgradeable contracts
        @param _manager - Address of the manager contract
    */
    function initialize(address _manager) external initializer {
        _transferOwnership(_manager);

        bytes32 VotiumVoteDelegationId = 0x6376782e65746800000000000000000000000000000000000000000000000000;
        address DelegationRegistry = 0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446;
        address votiumVoteProxyAddress = 0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49;
        ISnapshotDelegationRegistry(DelegationRegistry).setDelegate(
            VotiumVoteDelegationId,
            votiumVoteProxyAddress
        );
        uint256 currentEpoch = ILockedCvx(VLCVX_ADDRESS).findEpochId(block.timestamp);
        lastEpochLocksProcessed = currentEpoch;
        lastRewardEpochFullyClaimed = currentEpoch - 1;
    }

    /// this should be called around the same time every other epoch
    /// because vlCvx rewards are constant it would be unfair/inconsistent to claim at different times the way it distributes rewards into epochs
    /// but its also not a huge deal because vlCvx is a much smaller part of the overall rewards
    function oracleClaimAndSellRewards(
        IVotiumMerkleStash.ClaimParam[] calldata _claimProofs,
        SwapData[] calldata _swapsData
    ) public {
        uint256 currentEpoch = ILockedCvx(VLCVX_ADDRESS).findEpochId(
            block.timestamp
        );
        uint256 unclaimedEpochCount = currentEpoch - lastRewardEpochFullyClaimed - 1;
        require(unclaimedEpochCount > 0, "no unclaimed epochs");
        claimVotiumRewards(_claimProofs);
        claimvlCvxRewards();
        sellRewards(_swapsData);
        lastRewardEpochFullyClaimed = currentEpoch - 1;
    }


    /// Called by our oracle at the beginning of each new epoch
    /// Leaves cvx unlocked for any that have requested to close their position
    /// Relocks any unlocked cvx from positions that have not requested to close
    function oracleRelockCvx() public {
        uint256 currentEpoch = ILockedCvx(VLCVX_ADDRESS).findEpochId(block.timestamp);
        if (lastEpochLocksProcessed == currentEpoch) return;

        (, uint256 unlockable, , ) = ILockedCvx(VLCVX_ADDRESS).lockedBalances(
            address(this)
        );

        if (unlockable == 0) return;
        // unlock all (theres no way to unlock individual locks)
        ILockedCvx(VLCVX_ADDRESS).processExpiredLocks(false);

        uint256 unlockedCvxBalance = IERC20(CVX_ADDRESS).balanceOf(
            address(this)
        );

        // nothing to relock
        if (unlockedCvxBalance == 0) return;

        // relock everything minus unlock queue obligations
        uint256 cvxAmountToRelock = cvxToLeaveUnlocked > unlockedCvxBalance ? 0 : unlockedCvxBalance - cvxToLeaveUnlocked;

        IERC20(CVX_ADDRESS).approve(VLCVX_ADDRESS, cvxAmountToRelock);
        ILockedCvx(VLCVX_ADDRESS).lock(address(this), cvxAmountToRelock, 0);
    }

    function buyCvx(
        uint256 _ethAmountIn
    ) internal returns (uint256 cvxAmountOut) {
        address CVX_ETH_CRV_POOL_ADDRESS = 0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4;
        // eth -> cvx
        uint256 cvxBalanceBefore = IERC20(CVX_ADDRESS).balanceOf(address(this));
        ICrvEthPool(CVX_ETH_CRV_POOL_ADDRESS).exchange_underlying{
            value: _ethAmountIn
        }(
            0,
            1,
            _ethAmountIn,
            0 // TODO minout to something
        );
        uint256 cvxBalanceAfter = IERC20(CVX_ADDRESS).balanceOf(address(this));
        cvxAmountOut = cvxBalanceAfter - cvxBalanceBefore;
    }

    function sellCvx(
        uint256 _cvxAmountIn
    ) internal returns (uint256 ethAmountOut) {
        address CVX_ETH_CRV_POOL_ADDRESS = 0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4;
        // cvx -> eth
        uint256 ethBalanceBefore = address(this).balance;
        IERC20(CVX_ADDRESS).approve(CVX_ETH_CRV_POOL_ADDRESS, _cvxAmountIn);
        ICrvEthPool(CVX_ETH_CRV_POOL_ADDRESS).exchange_underlying(
            1,
            0,
            _cvxAmountIn,
            0 // TODO minout to something
        );
        ethAmountOut = address(this).balance - ethBalanceBefore;
    }

    /// sell any number of erc20's via 0x in a single tx
    function sellRewards(
        SwapData[] calldata _swapsData
    ) private returns (uint256 ethReceived) {
        uint256 ethBalanceBefore = address(this).balance;
        for (uint256 i = 0; i < _swapsData.length; i++) {
            IERC20(_swapsData[i].sellToken).approve(
                address(_swapsData[i].spender),
                type(uint256).max
            );
            (bool success, ) = _swapsData[i].swapTarget.call(
                _swapsData[i].swapCallData
            );
            if (!success) {
                // TODO emit an event or something?
                // this causes unsold tokens to build up in the contract, see:
                // https://app.zenhub.com/workspaces/af-engineering-636020e6fe7394001d996825/issues/gh/asymmetryfinance/safeth/478
            }
        }
        uint256 ethBalanceAfter = address(this).balance;
        ethReceived = ethBalanceAfter - ethBalanceBefore;
    }

    function claimVotiumRewards(
        IVotiumMerkleStash.ClaimParam[] calldata _claimProofs
    ) private {
        IVotiumMerkleStash(0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A)
            .claimMulti(address(this), _claimProofs);
    }

    function claimvlCvxRewards() private {
        address[] memory emptyArray;
        IClaimZap(0x3f29cB4111CbdA8081642DA1f75B3c12DECf2516).claimRewards(
            emptyArray,
            emptyArray,
            emptyArray,
            emptyArray,
            0,
            0,
            0,
            0,
            8
        );
    }

    receive() external payable {}
}
