const Webtorrent = require('webtorrent-hybrid')
const createTorrent = require('create-torrent')
const SocketIO = require('socket.io')
const express = require('express');
const http = require('http');
const fs = require('fs')
 


class Hosting{
    constructor(){
        this.web = new Webtorrent({
            announce:[ 'udp://explodie.org:6969',
            'udp://tracker.coppersurfer.tk:6969',
            'udp://tracker.empire-js.us:1337',
            'udp://tracker.leechers-paradise.org:6969',
            'udp://tracker.opentrackr.org:1337',
            'wss://tracker.btorrent.xyz',
            'wss://tracker.fastcast.nz',
            'wss://tracker.openwebtorrent.com' ],
        })
    }

    serveWebsite(pathToFolder){
        let app = express()
        let server = http.createServer(app)
        
        let ioServer = new SocketIO(server)
        app.use(express.static(__dirname+'/site/static'));
        server.listen(9000)
        console.log(`Serving the folder ${__dirname+'/static'} on port 9000`)
        var magnet = require('magnet-uri')
        var uri = `magnet:?xt=urn:btih:b7700a1f04f88b0e69abf4df38831023f58472cb`//`magnet:?xt=urn:btih:b9b5803d450abd7116447aea9b7662bda4c40494`
        var parsed = magnet(uri)
        
        this.web.add(parsed.infoHash, { path: './site' }, function (torrent) {
            
            // console.log(torrent)
            torrent.on('done', function () {
                console.log('Loaded site')
                // torrent.files.forEach(function(file){
                //     file.getBuffer(function (err, buffer) {
                //         if (err) throw err
                //     })
                // })
            })
        })
        
    }

    host(pathToFolder){
        fs.exists(pathToFolder, async (exists)=>{
            this.web.seed(pathToFolder, function (torrent, err) {
                if(err){
                    console.log(err)
                }
                console.log('Client is seeding:', torrent.infoHash)
            })
            this.web.on('error', err => console.log(err))
        })
    }
}

let h = new Hosting()

h.serveWebsite('/static/')