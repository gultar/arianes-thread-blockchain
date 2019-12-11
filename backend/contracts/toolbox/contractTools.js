const ContractAction = require('../../classes/contractAction')

const sendContractAction = async ({ fromAccount, toAccount, task, data, actionRef }) =>{
    //Need to implement various validation measures for params
    if(!fromAccount) return { error:'ERROR: Need to provide valid sending account' }
    if(!toAccount) return { error:'ERROR: Need to provide valid receiving account' }
    if(!type) return { error:'ERROR: Need to provide valid action type' }
    if(!task) return { error:'ERROR: Need to provide valid action task' }
    if(!data) return { error:'ERROR: Need to provide valid action data payload' }
    if(!actionRef) return { error:'ERROR: Need to provide valid action reference' }

    let contractAction = new ContractAction({
        fromAccount:fromAccount,
        toAccount:toAccount,
        task:task,
        actionReference:actionReference
    })

    
}