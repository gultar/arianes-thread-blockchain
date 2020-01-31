var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var makeExternal = require('makeExternal');
var getContract = require('getContract');
var getState = require('getState');
var getAccount = require('getAccount');
var Stake = /** @class */ (function () {
    function Stake(_a) {
        var fromAccount = _a.fromAccount, symbol = _a.symbol, amount = _a.amount, retrievableBy = _a.retrievableBy, stakingAction = _a.stakingAction;
        this.fromAccount = fromAccount;
        this.symbol = symbol;
        this.amount = amount;
        this.retrievableBy = retrievableBy;
        this.stakingAction = stakingAction;
    }
    return Stake;
}());
var Vault = /** @class */ (function () {
    function Vault(initParams) {
        this.contractAccount = initParams.contractAccount;
        this.state = {
            stakes: {}
        };
    }
    Vault.prototype.stakeAmount = function (params, callingAccount) {
        return __awaiter(this, void 0, void 0, function () {
            var symbol, amount, retrievableBy, callingAction, hash, accountName, accountVault, alreadyExists;
            return __generator(this, function (_a) {
                symbol = params.symbol, amount = params.amount, retrievableBy = params.retrievableBy, callingAction = params.callingAction;
                hash = callingAction.hash;
                if (!symbol)
                    throw new Error('ERROR: Symbol of currency to stake is required');
                if (!amount || typeof amount !== 'number')
                    throw new Error('ERROR: Amount to stake needs to be a numerical value');
                accountName = callingAccount.name;
                if (!retrievableBy) {
                    retrievableBy = [accountName];
                }
                accountVault = this.state.stakes[accountName];
                if (!accountVault) {
                    accountVault = {};
                    accountVault[hash] = new Stake({
                        fromAccount: accountName,
                        symbol: symbol,
                        amount: amount,
                        retrievableBy: retrievableBy,
                        stakingAction: callingAction
                    });
                }
                else {
                    alreadyExists = accountVault[hash];
                    if (!alreadyExists) {
                        this.state.stakes[accountName][hash] = new Stake({
                            fromAccount: accountName,
                            symbol: symbol,
                            amount: amount,
                            retrievableBy: retrievableBy,
                            stakingAction: callingAction
                        });
                    }
                    else {
                        throw new Error("ERROR: Stake hash " + hash.substr(0, 10) + "... already exists");
                    }
                }
                return [2 /*return*/, {
                        success: accountName + " has staked " + amount + " " + symbol + ". It may be retrieved by " + (Array.isArray(retrievableBy) ? JSON.stringify(retrievableBy) : retrievableBy)
                    }];
            });
        });
    };
    Vault.prototype.retrieveAmount = function (params, callingAccount) {
        return __awaiter(this, void 0, void 0, function () {
            var ofAccount, hash, amount, callingAction, vaultExists, stake, isAuthorized;
            return __generator(this, function (_a) {
                ofAccount = params.ofAccount, hash = params.hash, amount = params.amount, callingAction = params.callingAction;
                if (!ofAccount)
                    throw new Error('ERROR: Need name of staking account to retrieve stake');
                if (!hash)
                    throw new Error('ERROR: Need hash of action that created stake');
                if (!amount)
                    throw new Error('ERROR: Need amount to retrieve');
                vaultExists = this.state.stakes[ofAccount];
                if (!vaultExists)
                    throw new Error("ERROR: Account " + ofAccount + " does not have any stakes");
                stake = this.state.stakes[ofAccount][hash];
                if (!stake)
                    throw new Error("ERROR: Stake " + hash.substr(0, 10) + "... does not exist");
                isAuthorized = stake.retrievableBy.includes(callingAccount.name);
                if (!isAuthorized)
                    throw new Error("ERROR: Account " + callingAccount.name + " is not authorized to retrieve stake");
                return [2 /*return*/];
            });
        });
    };
    Vault.prototype.setState = function () { };
    Vault.prototype.getInterface = function () {
        var api = makeExternal({
            stakeAmount: {
                type: 'set',
                args: [
                    "symbol: number",
                    "amount: string",
                    "startingPrice: number",
                    "timeLimit: Date"
                ],
                description: 'Create a new auction'
            },
            retrieveAmount: {
                type: 'set',
                args: [
                    "id: string",
                ],
                description: "Close an auction and select a winner. May only be invoked by the auction's creator"
            },
            getStakesOfAccount: {
                type: 'set',
                args: ['id: string', 'price: number'],
                description: 'Place a bid on a given auction'
            }
        });
        return api;
    };
    return Vault;
}());
