let Webtorrent = require('webtorrent-hybrid')

class Download{
    constructor(){
        this.client = new Webtorrent() 
    }

    async bundleAndServe(){
        this.client.seed('./data/*', function (torrent, err) {
            if(err){
                console.log(err)
            }
            console.log('Client is seeding:', torrent.infoHash)
        })
        this.client.on('error', err => console.log(err))
    }

    async download(infoHash){
        this.client.add(infoHash, { path: './' }, function (torrent) {
            
            // console.log(torrent)
            torrent.on('done', function () {
                console.log('Loaded data')
                // torrent.files.forEach(function(file){
                //     file.getBuffer(function (err, buffer) {
                //         if (err) throw err
                //     })
                // })
            })
        })
    }
}

let d = new Download
//d.bundleAndServe()
 d.download('bf09fe8a93cc14dd9a8f821c0b9224612184f3a0')
