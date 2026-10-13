// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract HourToken is ERC20, Ownable {
    error ZeroAddress();
    error FeesTooHigh();
    error InvalidWitchingHours();

    event TradingEnabled(uint256 launchBlock);
    event FeesUpdated(uint256 burnFee, uint256 liquidityFee, uint256 rewardFee);
    event WitchingHoursUpdated(uint256 start, uint256 end);
    event FeeExemptUpdated(address wallet, bool exempt);

    uint256 public burnFee = 2;
    uint256 public liquidityFee = 3;
    uint256 public rewardFee = 2;

    address public liquidityWallet;
    address public rewardWallet;

    mapping(address => bool) public isFeeExempt;

    bool public tradingEnabled = false;
    uint256 public launchBlock;

    uint256 public witchingStart = 0;
    uint256 public witchingEnd = 0;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    constructor(
        address _liquidityWallet,
        address _rewardWallet
    )
        ERC20("Witching Hour", "hOUR")
        Ownable(msg.sender)
    {
        if (_liquidityWallet == address(0) || _rewardWallet == address(0)) {
            revert ZeroAddress();
        }

        liquidityWallet = _liquidityWallet;
        rewardWallet = _rewardWallet;

        _mint(msg.sender, 21369777 * 10 ** decimals());

        isFeeExempt[msg.sender] = true;
        isFeeExempt[_liquidityWallet] = true;
        isFeeExempt[_rewardWallet] = true;
        isFeeExempt[address(this)] = true;
    }

    function enableTrading() external onlyOwner {
        if (tradingEnabled) {
            return;
        }

        tradingEnabled = true;
        launchBlock = block.number;
        emit TradingEnabled(launchBlock);
    }

    function setFees(
        uint256 _burn,
        uint256 _liq,
        uint256 _reward
    ) external onlyOwner {

        require(_burn + _liq + _reward <= 10, "Fees too high");

        burnFee = _burn;
        liquidityFee = _liq;
        rewardFee = _reward;
        emit FeesUpdated(_burn, _liq, _reward);
    }

    function setWitchingHours(uint256 start, uint256 end) external onlyOwner {
        if (start > end) {
            revert InvalidWitchingHours();
        }

        witchingStart = start;
        witchingEnd = end;
        emit WitchingHoursUpdated(start, end);
    }

    function setFeeExempt(address wallet, bool exempt) external onlyOwner {
        if (wallet == address(0)) {
            revert ZeroAddress();
        }

        isFeeExempt[wallet] = exempt;
        emit FeeExemptUpdated(wallet, exempt);
    }

    function _update(address from, address to, uint256 amount) internal override {

        if (
            from == address(0) ||
            to == address(0) ||
            isFeeExempt[from] ||
            isFeeExempt[to]
        ) {
            super._update(from, to, amount);
            return;
        }

        require(tradingEnabled, "Trading not live");

        uint256 burn = burnFee;
        uint256 liq = liquidityFee;
        uint256 reward = rewardFee;

        if(block.timestamp >= witchingStart && block.timestamp <= witchingEnd){
            burn = burn * 2;
        }

        uint256 burnAmount = amount * burn / 100;
        uint256 liquidityAmount = amount * liq / 100;
        uint256 rewardAmount = amount * reward / 100;

        uint256 sendAmount =
            amount -
            burnAmount -
            liquidityAmount -
            rewardAmount;

        super._update(from, DEAD, burnAmount);
        super._update(from, liquidityWallet, liquidityAmount);
        super._update(from, rewardWallet, rewardAmount);
        super._update(from, to, sendAmount);
    }
}
