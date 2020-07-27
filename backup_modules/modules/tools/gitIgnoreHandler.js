const { writeToFile, readFile } = require('./utils')

const createGitIgnore = async (path)=>{
    let content = "*\n*/\n!.gitignore"
`
*
*/
!.gitignore
`

    let written = await writeToFile(content, path+'.gitignore')
    if(written){
        return content
    }else{
        return { error:'ERROR: Could not write git ignore file' }
    }
}

const readGitIgnoreFile = (path) =>{
    return new Promise(async (resolve)=>{
        let fs = require('fs')
        fs.exists(path+'.gitignore', async (exists)=>{
            if(exists){
                let file = await readFile(path+'.gitignore')
                if(!file) resolve({ error:'ERROR: git ignore file on path '+path+' missing' })

                resolve(file)
            }else{
                let created = await createGitIgnore(path)
                if(created.error) resolve({ error:created.error })
                resolve(created)
            }
        })
    })
}

const addLineToGitIgnore = async (path, line)=>{
    let file = await readFile(path+'.gitignore')
    file = file + '\n' +line
    return file
}

module.exports = { createGitIgnore, addLineToGitIgnore, readGitIgnoreFile }


