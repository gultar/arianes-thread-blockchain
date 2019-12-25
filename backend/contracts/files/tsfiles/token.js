var makeExternal = require('makeExternal');
var Permissions = require('Permissions');
var Token = /** @class */ (function () {
    function Token(params) {
        var symbol = params.symbol, name = params.name, maxSupply = params.maxSupply, creator = params.creator, supply = params.supply, permissions = params.permissions;
        this.symbol = symbol;
        this.name = name;
        this.maxSupply = maxSupply;
        this.creator = creator;
        this.supply = maxSupply;
        this.permissions = permissions;
    }
    return Token;
}());
var Tokens = /** @class */ (function () {
    function Tokens(init) {
        var contractAccount = init.contractAccount;
        this.name = 'Token';
        this.contractAccount = contractAccount;
    }
    Tokens.prototype.setState = function (state) {
        this.state = state;
    };
    Tokens.prototype.createToken = function (params, account) {
        var symbol = params.symbol, name = params.name, maxSupply = params.maxSupply;
        if (!symbol)
            throw new Error('Symbol is required');
        if (!name)
            throw new Error('Token name is required');
        if (!maxSupply || maxSupply <= 0)
            throw new Error('Max token supply greater than 0 is required');
        if (!account)
            throw new Error('Creator account is required');
        if (typeof maxSupply == 'string') {
            throw new Error('Invalid max supply value');
        }
        var creator = account.name;
        if (this.state.tokens) {
            if (!this.state.tokens[symbol]) {
                this.state.tokens[symbol] = new Token({
                    symbol: symbol,
                    name: name,
                    maxSupply: maxSupply,
                    creator: creator,
                    supply: maxSupply,
                    permissions: new Permissions(account)
                });
                return { success: "Token " + symbol + " has been created with max supply of " + maxSupply };
            }
            else {
                throw new Error('Token already exists');
            }
        }
        else {
            throw new Error('State is not properly set');
        }
    };
    return Tokens;
}());
