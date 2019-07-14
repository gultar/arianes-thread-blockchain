/**
 * Most of the code here has been inspired by the VM built for
 * Iz3. A big thanks to them.
 * 
 * Check out their outstand work here: 
 *  iZ³ | Izzzio blockchain - https://izzz.io 
 * 
 */

const { extendContract } = require('../toolbox/contractTools')
let _ = require('private-parts').createKey();
const authenticateAccount = require('./authentication');
const Account = require('../../classes/account');
const Wallet = require('../../classes/wallet');
const { logger } = require('../../tools/utils');
const Transaction = require('../../classes/transaction')
const Action = require('../../classes/transaction')
let ivm = require('isolated-vm');

class ContractVM{
    constructor(options){
      if(!options) throw new Error('Missing required parameters to start Contract VM')
      this.ramLimit = (options.ramLimit ? options.ramLimit : 32 );
      this.ivm = ivm;
      this.isolate = new ivm.Isolate({memoryLimit: this.ramLimit});
      this.script = '';
      this.state = undefined; //Fetch from either storage or torrent
      this.timeout = (options.ramLimit ? options.timeLimit : 1000)
      this.cpuLimit = (options.cpuLimit ? options.cpuLimit : 500)
      this.busy = false;
      this.waitingForResponse = false;
      this.logging = (options.logging ? options.logging : true)
      this.logPrefix = (options.logPrefix ? options.logPrefix : '');
    }

    getCpuTime() {
        return (this.isolate.cpuTime[0] + this.isolate.cpuTime[1] / 1e9) * 1000;
    }

    _stopCPULimitTimer(timerId) {
        clearInterval(timerId.timer);
    }

    buildVM(){
        let that = this;
        let context = this.isolate.createContextSync();
        let jail = context.global;
        jail.setSync('_ivm', ivm);
        jail.setSync('global', jail.derefInto());
        jail.setSync('console', this.objToReference({
            log: function (...args) {
                if(that.logging) {
                    process.stdout.write(that.logPrefix);
                    console.log(...args);
                }
            }
        }));
        
        jail.setSync('sandbox', new ivm.Reference(function() {
          return {
            Wallet:function (){
              return new Wallet()
            },
            extendContract:function (contract){
              extendContract(contract)
            },
            Account:function (...args){
              return new Account(...args)
            },
            Transaction:function (...args){
              return new Transaction(...args)
            },
            Action:function (...args){
              return new Action(...args)
            },
          }
        }))

        jail.setSync('_sandbox', new ivm.Reference({
            Wallet:function (){
              return new Wallet()
            },
            extendContract:function (contract){
              extendContract(contract)
            },
            Account:function (...args){
              return new Account(...args)
            },
            Transaction:function (...args){
              return new Transaction(...args)
            },
            Action:function (...args){
              return new Action(...args)
            },
          }))
        
        jail.setSync('system', this.objToReference({
            processMessages: function () {
                return true;
            },
            getState: function () {
                return that.objToReference(that.state);
            }
        }));

        let bootstrap = this.isolate.compileScriptSync('new ' + function () {

          /**
             * Decode vm encoded format references
             * @param obj
             */
            function decodeReferences(obj) {
              if(obj.constructor.name === 'Reference') {
                  obj = obj.copySync();
              }
              let newObj = {};
              for (let a in obj) {
                  if(obj.hasOwnProperty(a)) {
                      if(obj[a]) {
                          if(obj[a]['ref_type'] === 'function') {
                              newObj[a] = function (...args) {
                                  return obj[a]['ref'].applySync(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto()));
                              }
                          } else {
                              if(obj[a]['ref_type'] === 'object') {
                                  newObj[a] = obj[a]['ref'].copySync();
                              } else {
                                  newObj[a] = obj[a];
                              }
                          }
                      }
                  }
              }
              return newObj;
          }

          global.decodeReferences = decodeReferences;
          //Initialize
          let ivm = _ivm;
          _ivm = undefined;
          let _state = global.state;
          let sandbox = _sandbox;
          /**
           * Safe state method
           * @return {state}
           */
          global.getState = function () {
              return  Object.assign({}, _state);
          };

          /**
           * Update state from global object
           */
          global.updateState = function () {
              _state = decodeReferences(system.getState());
          };

          /**
           * IO functions
           */
          global.console = decodeReferences(console);

          /**
           * VM interaction and system methods
           */
          global.system = decodeReferences(system);
          global.sandbox = decodeReferences(sandbox)
          /**
             * Decode and register external object
             * @param objName
             */
            global._registerGlobalObjFromExternal = function _registerGlobalObjFromExternal(objName) {
                global[objName] = decodeReferences(global[objName]);
                return true;
            };

        })
        bootstrap.runSync(context);

        return context;
    }

    setState(state) {
        this.state = state;
        this.setObjectGlobal('state', state);
    }

    _startCPULimitTimer() {
      let that = this;
      let lastCPU = this.getCpuTime();
      let _cpuTimer = {
          timer: setInterval(function () {
              if(that.isolate.isDisposed) {
                  clearInterval(_cpuTimer.timer);
                  return;
              }
              let cpuTime = that.getCpuTime() - lastCPU;
              if(cpuTime > that.cpuLimit) { //What we wanna do with time limit?
                  clearInterval(_cpuTimer.timer);
                  _cpuTimer.falled = true;
                  _cpuTimer.reason = `CPU time limit exceed ${cpuTime}/${that.cpuLimit}`;
                  that.isolate.dispose();

                  that.busy = false;
                  that.waitingForResponse = false;
              }
          }, 4), falled: false
      };


      return _cpuTimer;
   }

    setTimingLimits(limit) {
        this.timeout = limit;
    }

    setCpuLimit(limit) {
        this.cpuLimit = limit;
    }

    injectScript(code) {
        this.isolate.compileScriptSync(code).runSync(this.context);
    }

    getContextProperty(context) {
        let vmContext = this.context.global;
        let prevContext = vmContext;
        context = context.split('.');
        for (let a in context) {
            if(context.hasOwnProperty(a)) {
                prevContext = vmContext;
                vmContext = vmContext.getSync(context[a]);
            }
        }

        return vmContext.copySync()
    }

    compileScript(script, state) {

        let contractInit = '';
        /*if(typeof  state.contractClass !== 'undefined') {
            state.contractClass = state.contractClass.trim();
            contractInit = "\n" + `global.contract = new ${state.contractClass}();`
        }*/

        this.script = script;
        this.state = state;
        this.context = this.buildVM();
        this.compiledScript = this.isolate.compileScriptSync(script + contractInit);

        return this.compiledScript;
    }

    /**
     * Encode object references to virtual machine format
     * @param obj
     * @return {ivm.Reference}
     */
    objToReference(obj) {
        let newObj = {};
        for (let a in obj) {
            if(obj.hasOwnProperty(a)) {
                if(typeof obj[a] === 'function') {
                    newObj[a] = {
                        ref: new ivm.Reference(function (...args) {
                            return obj[a](...args)
                        }), ref_type: 'function'
                    };
                } else {
                    if(typeof obj[a] === 'object') {
                        newObj[a] = {ref: this.objToReference(obj[a]), ref_type: 'object'};
                    } else {
                        newObj[a] = obj[a];
                    }
                }
            }
        }

        return new ivm.Reference(newObj);
    }

    execute() {
        this.busy = true;
        let result = this.compiledScript.runSync(this.context, {timeout: this.timeout});
        this.busy = false;
        return result;
    }
    
    runContextMethod(context, ...args) {
        let cpuLimiter = this._startCPULimitTimer();
        let result = this._runContextMethodUnlimited(context, args);
        this._stopCPULimitTimer(cpuLimiter);
        return result;
    }

    _runContextMethodUnlimited(context, ...args) {
        this.busy = true;
        let vmContext = this.context.global;
        let prevContext = vmContext;
        context = context.split('.');
        for (let a in context) {
            if(context.hasOwnProperty(a)) {
                prevContext = vmContext;
                vmContext = vmContext.getSync(context[a]);

            }
        }
        let result = vmContext.applySync(prevContext.derefInto(), args.map(arg => new ivm.ExternalCopy(arg).copyInto()), {timeout: this.timeout});

        this.busy = false;
        return result;
    }

    runContextMethodAsync(context, cb, ...args) {
        let that = this;
        this.busy = true;
        let vmContext = this.context.global;
        let prevContext = vmContext;
        context = context.split('.');
        for (let a in context) {
            if(context.hasOwnProperty(a)) {
                prevContext = vmContext;
                vmContext = vmContext.getSync(context[a]);
            }
        }
        let cpuLimiter = this._startCPULimitTimer();
        vmContext.apply(prevContext.derefInto(), args.map(arg => new ivm.ExternalCopy(arg).copyInto()), {timeout: this.timeout}).then(function (result) {
            that._stopCPULimitTimer(cpuLimiter);
            that.busy = false;
            cb(null, result);
        }).catch(function (reason) {
            that.busy = false;
            if(cpuLimiter.falled) {
                reason = new Error(cpuLimiter.reason);
            }
            that._stopCPULimitTimer(cpuLimiter);
            cb(reason);
        });
    }

    runContextMethodAsyncPromise(context, cb, ...args) {
        let that = this;
        return new Promise((resolve, reject) => {
            that.runContextMethod(context, function (err, result) {
                if(err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            }, args)
        });
    }

    setObjectGlobal(name, object) {
        if(name === 'state') {
            //console.log('Set OBJ global', name, new Error().stack);
            //console.trace()
        }
        this.context.global.setSync(name, this.objToReference(object));
        return this._runContextMethodUnlimited("_registerGlobalObjFromExternal", name);
    }

    setObjectGlobalSecret(name, object) {
        this.context.global.setSync(name, this.objToReference(object));
    }

    waitForReady(cb) {
        let that = this;

        if(!that.busy && !that.waitingForResponse) {
            cb();
            return;
        }

        let interval = setInterval(function () {
            if(!that.busy && !that.waitingForResponse) {
                clearInterval(interval);
                cb();
            }
        }, 1);
    }

    isBusy() {
        return this.busy || this.waitingForResponse
    }

    destroy() {
        this.compiledScript.release();
        this.isolate.dispose();
        delete this.compiledScript;
        delete this.context;
        delete this;
    }

    // initVM(){
    //     if(process){
    //         process.on('message', async(message)=>{
    //             try{
    //               let type = typeof message
    //               switch(type){
    //                 case 'object':
    //                   if(message.contract){
    //                       if(message.contract.name && message.contract.code){
                            
    //                         // process.send({data:result})
    //                       }else{
    //                           console.log('ERROR: Need to provide a name and the smart contract code')
    //                           process.send({error:'ERROR: Need to provide a name and the smart contract code'})
    //                       }
                        
    //                   }else if(message.error){
    //                       console.log(error);
    //                       process.exit()
    //                   }else{
    //                     process.send({error:'ERROR: Invalid data format provided'})
    //                   }
    //                   break;
    //                 case 'string':
    //                   // console.log(message)
    //                   process.send('pong')
    //                   break
                    
    //               }
    //             }catch(e){
    //               process.send({error:e})
    //             }
                
    //           })
    //     }else{
    //         console.log('ERROR: Need to run as a child process')
    //     }
       
    // }

}

module.exports = ContractVM




