// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

abstract contract AbstractErc20Strategy is Initializable, ReentrancyGuardUpgradeable {
    /// mint afEth
    function mint() external payable virtual;

    /// burn afEth (enter unlock queue)
    function burn(uint256 _amount) external virtual;

    /// withdraw any unlocked vlcvx
    function processWithdrawQueue() external virtual;
}
