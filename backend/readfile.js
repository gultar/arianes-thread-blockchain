'use strict';

const fs = require('fs');

const readFile = (file) => {
  return new Promise((ok, notOk) => {
    fs.readFile(file, (err, data) => {
        if (err) {
          notOk(err)
        } else {
          ok(data)
        }
    })
  })
}



module.exports = readFile
