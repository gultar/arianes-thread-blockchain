const program = require('commander');
let Database = require('./modules/classes/database/db')
let http = require('http')
program
.command('try')
.option('-p, --port <port>', '')
.action(async ()=>{
    let httpServer = http.createServer()
    process.NETWORK = 'testnet'
    let db = new Database('blockchain')
    httpServer.listen(program.port)
    // console.log(db)
   console.log(await db.get('0'))
    
})
program.parse(process.argv)