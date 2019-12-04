const ContractVM = require('./VM')

const code = `
let counter = 15;
for(var i=0; i<= 10000; i++){
    counter = counter * counter
}

console.log(Result: counter)

`

let VMCompile = new ContractVM({
    code:code,
    type:'NodeVM'
  })

const executeCompile = (vm) =>{
    for(var i=0; i <10; i++){
        let startTime = Date.now()
        let endTime = 0
        console.log('Start time:', new Date())
        vm.buildVM()
        vm.compileScript()
        vm.run()
        .then((result)=>{  
            endTime = Date.now()
            console.log('End time:', new Date())
            console.log('Time difference:', (endTime - startTime)/1000)

        })
        .catch((e)=>{
        process.send({error:e})
        })
    }
}

executeCompile(VMCompile)