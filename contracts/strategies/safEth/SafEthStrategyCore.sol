// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";

/// For private internal functions and anything not exposed via the interface
contract SafEthStrategyCore is
    Initializable,
    OwnableUpgradeable,
    ERC20Upgradeable
{
    address public constant safEthAddress =
        0x6732Efaf6f39926346BeF8b821a04B6361C4F3e5;

    struct SafEthPosition {
        uint256 safEthAmount; // amount of safEth in this position
    }

    mapping(uint256 => SafEthPosition) public safEthPositions;

    // used to add storage variables in the future
    uint256[20] private __gap;

    // As recommended by https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
        @notice - Function to initialize values for the contracts
        @dev - This replaces the constructor for upgradeable contracts
        @param _owner - Address of the owner contract
    */
    function initialize(address _owner) external initializer {
        _transferOwnership(_owner);
    }

    receive() external payable {}
}
